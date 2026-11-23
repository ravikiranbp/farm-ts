"""Admin: settings, website CMS, audit log, backup/restore, dashboards, reports and exports."""
import csv
import io
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response

from lib.auth import MGMT, current_user, require
from lib.common import CLOSED_STATUSES, DEFAULT_SETTINGS, POSITIVE, audit, get_settings, iso_now, new_id
from lib.db import client, db, ensure_indexes
from lib.files import delete_file, store_file

router = APIRouter()
CMS = {"products": "name", "projects": "name", "testimonials": "name", "faqs": "question", "brochures": "title", "services": "title"}
BACKUP_COLLECTIONS = ["users", "customers", "leads", "interactions", "followups", "brochure_downloads", "products", "projects",
					  "testimonials", "faqs", "brochures", "services", "settings", "inspections", "quotations",
					  "quotation_revisions", "quotation_views", "orders", "service_requests", "amc", "files", "audit_logs", "notifications",
					  "login_history", "counters"]


# ---------------- Settings ----------------
@router.get("/settings")
async def read_settings(user: dict = Depends(current_user)):
	s = await get_settings()
	if user["role"] != "admin":
		return {k: s[k] for k in ("company_name", "tax_pct", "manager_max_quote_amount", "manager_max_discount_pct",
								  "require_quote_approval", "session_timeout_minutes", "payment_terms", "warranty", "terms",
								  "call_checklist")}
	return s


@router.put("/settings")
async def write_settings(body: dict, user: dict = Depends(require("admin"))):
	old = await get_settings()
	changes = {k: v for k, v in body.items() if k in DEFAULT_SETTINGS and k != "id" and old.get(k) != v}
	if "call_checklist" in changes:
		cl = changes["call_checklist"]
		if not isinstance(cl, list) or not all(isinstance(q, dict) and str(q.get("question", "")).strip() and q.get("id") for q in cl):
			raise HTTPException(400, "Each checklist item needs an id and a question")
		if len({q["id"] for q in cl}) != len(cl):
			raise HTTPException(400, "Checklist item ids must be unique")
		for q in cl:
			if q.get("type") not in ("text", "choice"):
				raise HTTPException(400, "Checklist type must be 'text' or 'choice'")
			if q["type"] == "choice" and not [o for o in q.get("options", []) if str(o).strip()]:
				raise HTTPException(400, f"Add options for '{q['question']}'")
	if "session_timeout_minutes" in changes and not (5 <= int(changes["session_timeout_minutes"]) <= 480):
		raise HTTPException(400, "Session timeout must be 5–480 minutes")
	if changes:
		await db.settings.update_one({"id": "settings"}, {"$set": changes}, upsert=True)
		await audit(user, "settings_changed", "settings", old={k: old.get(k) for k in changes}, new=changes)
	return await get_settings()


# ---------------- CMS ----------------
def _cms(name: str):
	if name not in CMS:
		raise HTTPException(404, "Unknown content type")
	return db[name]


@router.get("/cms/{kind}")
async def cms_list(kind: str, user: dict = Depends(require(*MGMT))):
	return await _cms(kind).find({}, {"_id": 0}).sort("order", 1).to_list(500)


@router.post("/cms/{kind}")
async def cms_create(kind: str, body: dict, user: dict = Depends(require("admin"))):
	coll = _cms(kind)
	if not str(body.get(CMS[kind]) or "").strip():
		raise HTTPException(400, f"'{CMS[kind]}' is required")
	doc = {**{k: v for k, v in body.items() if k not in ("_id", "id")}, "id": new_id(), "created_at": iso_now(), "updated_at": iso_now()}
	doc.setdefault("published", False)
	if kind == "products":
		doc["slug"] = doc.get("slug") or re.sub(r"[^a-z0-9]+", "-", doc["name"].lower()).strip("-")
	await coll.insert_one(dict(doc))
	await audit(user, "website_content_created", f"cms:{kind}", record_id=doc["id"], new={CMS[kind]: doc[CMS[kind]]})
	return doc


@router.put("/cms/{kind}/{iid}")
async def cms_update(kind: str, iid: str, body: dict, user: dict = Depends(require("admin"))):
	coll = _cms(kind)
	old = await coll.find_one({"id": iid}, {"_id": 0})
	if not old:
		raise HTTPException(404, "Item not found")
	changes = {k: v for k, v in body.items() if k not in ("_id", "id", "created_at") and old.get(k) != v}
	if changes:
		changes["updated_at"] = iso_now()
		await coll.update_one({"id": iid}, {"$set": changes})
		await audit(user, "website_content_updated", f"cms:{kind}", record_id=iid,
					old={k: old.get(k) for k in changes if k != "updated_at"}, new=changes)
		if kind == "projects" and "photos" in changes:
			await _drop_removed_photos(old.get("photos") or [], changes["photos"] or [])
	return await coll.find_one({"id": iid}, {"_id": 0})


async def _drop_removed_photos(before: list[str], after: list[str]) -> None:
	for url in set(before) - set(after):
		if url.startswith("/api/public/files/"):
			f = await db.files.find_one({"id": url.rsplit("/", 1)[-1], "entity_type": "project"})
			if f:
				await delete_file(f)


@router.post("/cms/{kind}/{iid}/remove")
async def cms_remove(kind: str, iid: str, user: dict = Depends(require("admin"))):
	"""Removal from public display = unpublish + archive flag (recoverable), never a hard delete."""
	coll = _cms(kind)
	old = await coll.find_one({"id": iid}, {"_id": 0})
	if not old:
		raise HTTPException(404, "Item not found")
	await coll.update_one({"id": iid}, {"$set": {"published": False, "archived": True, "updated_at": iso_now()}})
	await audit(user, "record_archived", f"cms:{kind}", record_id=iid, comment="Removed from public display")
	return {"ok": True}


# ---------------- Home-page offer overlay ----------------
OFFER_TYPES = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}
OFFER_MAX_BYTES = 5 * 1024 * 1024


async def _offer() -> dict:
	return await db.settings.find_one({"id": "offer_overlay"}, {"_id": 0}) or {"id": "offer_overlay", "enabled": False}


async def _drop_offer_image(file_id: str | None) -> None:
	f = await db.files.find_one({"id": file_id}) if file_id else None
	if f:
		await delete_file(f)


@router.get("/admin/offer")
async def offer_get(user: dict = Depends(require("admin"))):
	o = await _offer()
	return {**o, "image_url": f"/api/public/files/{o['file_id']}" if o.get("file_id") else None}


@router.post("/admin/offer")
async def offer_post(file: UploadFile = File(...), user: dict = Depends(require("admin"))):
	ext = Path(file.filename or "").suffix.lower()
	if ext not in OFFER_TYPES:
		raise HTTPException(400, "Use a JPG, PNG or WEBP image")
	data = await file.read()
	if len(data) > OFFER_MAX_BYTES:
		raise HTTPException(400, "Image too large (max 5 MB)")
	fid = new_id()
	await store_file(fid, data, OFFER_TYPES[ext])
	await db.files.insert_one({"id": fid, "name": Path(file.filename).name, "content_type": OFFER_TYPES[ext], "size": len(data),
							   "entity_type": "offer", "entity_id": "offer_overlay", "public": True, "uploaded_by": user["name"], "at": iso_now()})
	old = await _offer()
	await db.settings.update_one({"id": "offer_overlay"}, {"$set": {"enabled": True, "file_id": fid, "posted_at": iso_now(),
																	 "posted_by": user["name"]}}, upsert=True)
	await _drop_offer_image(old.get("file_id"))
	await audit(user, "offer_overlay_posted", "settings", new={"image": Path(file.filename).name})
	return await offer_get(user)


@router.post("/admin/offer/remove")
async def offer_remove(user: dict = Depends(require("admin"))):
	old = await _offer()
	await db.settings.update_one({"id": "offer_overlay"}, {"$set": {"enabled": False, "file_id": None}}, upsert=True)
	await _drop_offer_image(old.get("file_id"))
	await audit(user, "offer_overlay_removed", "settings")
	return await offer_get(user)


# ---------------- Audit ----------------
@router.get("/audit")
async def audit_list(user_id: str | None = None, action: str | None = None, module: str | None = None,
					 ref: str | None = None, date_from: str | None = None, date_to: str | None = None, page: int = 1,
					 user: dict = Depends(current_user)):
	flt: dict = {}
	if user["role"] == "telecaller":
		flt["user_id"] = user["id"]
	elif user["role"] == "manager":
		team = [u["id"] async for u in db.users.find({"role": {"$in": ["manager", "telecaller"]}}, {"id": 1})]
		flt["user_id"] = {"$in": team}
	if user_id:
		if user["role"] == "telecaller" and user_id != user["id"]:
			raise HTTPException(403, "You can only view your own activity")
		flt["user_id"] = user_id if user["role"] != "manager" else {"$in": [user_id] if user_id in flt["user_id"]["$in"] else []}
	if action:
		flt["action"] = action
	if module:
		flt["module"] = module
	if ref:
		rx = {"$regex": re.escape(ref), "$options": "i"}
		flt["$or"] = [{"record_ref": rx}, {"lead_id": ref}, {"customer_id": ref}]
	if date_from or date_to:
		flt["at"] = {**({"$gte": date_from} if date_from else {}), **({"$lte": date_to + "T23:59:59Z"} if date_to else {})}
	total = await db.audit_logs.count_documents(flt)
	items = await db.audit_logs.find(flt, {"_id": 0}).sort("at", -1).skip((page - 1) * 50).limit(50).to_list(50)
	return {"items": items, "total": total}


# ---------------- Backup / restore ----------------
@router.get("/admin/backup")
async def backup(user: dict = Depends(require("admin"))):
	data = {"created_at": iso_now(), "format": "vtech-backup-v1", "collections": {}}
	for c in BACKUP_COLLECTIONS:
		data["collections"][c] = await db[c].find({}, {"_id": 0} if c != "counters" else {}).to_list(None)
	await audit(user, "data_exported", "backup", comment="Full database backup downloaded")
	body = json.dumps(data, default=str).encode()
	name = f"vtech-backup-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M')}.json"
	return Response(body, media_type="application/json", headers={"Content-Disposition": f'attachment; filename="{name}"'})


async def _load_backup(file: UploadFile) -> dict:
	try:
		data = json.loads(await file.read())
		assert data.get("format") == "vtech-backup-v1"
		return data
	except Exception:
		raise HTTPException(400, "Not a valid V Tech backup file")


@router.post("/admin/backup/verify")
async def verify_backup(file: UploadFile = File(...), user: dict = Depends(require("admin"))):
	"""Restore into a scratch database, count records, then drop it — proves the backup is restorable."""
	data = await _load_backup(file)
	scratch = client[db.name + "_restore_test"]
	counts = {}
	try:
		for c, docs in data["collections"].items():
			if docs:
				await scratch[c].insert_many(docs)
			counts[c] = await scratch[c].count_documents({})
		ok = all(counts[c] == len(data["collections"][c]) for c in counts)
	finally:
		await client.drop_database(scratch.name)
	await audit(user, "backup_verified", "backup", new={"ok": ok, "collections": len(counts)})
	return {"ok": ok, "counts": counts, "backup_created_at": data.get("created_at")}


@router.post("/admin/backup/restore")
async def restore_backup(file: UploadFile = File(...), user: dict = Depends(require("admin"))):
	data = await _load_backup(file)
	counts = {}
	for c, docs in data["collections"].items():
		if c not in BACKUP_COLLECTIONS:
			continue
		await db[c].delete_many({})
		if docs:
			await db[c].insert_many(docs)
		counts[c] = len(docs)
	await ensure_indexes()
	await audit(user, "backup_restored", "backup", new=counts, comment=f"Restored backup from {data.get('created_at')}")
	return {"ok": True, "counts": counts}


# ---------------- Dashboard & reports ----------------
def _in_range(d: dict, key: str, f: str | None, t: str | None) -> bool:
	v = d.get(key) or ""
	return (not f or v >= f) and (not t or v <= t + "T23:59:59Z")


@router.get("/dashboard")
async def dashboard(user: dict = Depends(current_user)):
	now = iso_now()
	today = now[:10]
	lf = {"archived": False}
	if user["role"] == "telecaller":
		lf["assigned_to"] = user["id"]
	leads = await db.leads.find(lf, {"_id": 0, "status": 1, "assigned_to": 1, "assigned_name": 1, "approval": 1, "source": 1,
									 "created_at": 1, "updated_at": 1, "name": 1, "ref": 1, "id": 1, "next_followup_at": 1}).to_list(None)
	st = Counter(lead["status"] for lead in leads)
	ff = {"done": False, **({"assigned_to": user["id"]} if user["role"] == "telecaller" else {})}
	fups = await db.followups.find(ff, {"_id": 0}).to_list(None)
	lead_ids = {lead["id"] for lead in leads}
	quotes = [q for q in await db.quotations.find({}, {"_id": 0, "status": 1, "totals": 1, "lead_id": 1}).to_list(None)
			  if user["role"] != "telecaller" or q.get("lead_id") in lead_ids]
	qs = Counter(q["status"] for q in quotes)
	out = {
		"role": user["role"],
		"total_leads": len(leads), "new_leads": st["New"] + st["Assigned"],
		"pending_calls": st["New"] + st["Assigned"] + st["First Call Pending"],
		"today_followups": sum(1 for f in fups if f["due_at"][:10] == today and f["due_at"] >= now),
		"overdue_followups": sum(1 for f in fups if f["due_at"] < now),
		"contacted": sum(1 for lead in leads if lead["status"] not in ("New", "Assigned", "First Call Pending")),
		"interested": st["Interested"], "awaiting_approval": st[POSITIVE],
		"approved": sum(1 for lead in leads if (lead.get("approval") or {}).get("state") == "approved"),
		"rejected": sum(1 for lead in leads if (lead.get("approval") or {}).get("state") == "rejected"),
		"not_interested": st["Not Interested"] + st["Lost"], "won": st["Won"], "lost": st["Lost"],
		"converted_to_quotation": st["Quotation Required"] + st["Quotation Sent"] + st["Negotiation"] + st["Won"],
		"status_counts": dict(st),
		"recent": sorted(leads, key=lambda x: x["updated_at"], reverse=True)[:8],
		"quotations_pending": qs["Pending Approval"] + qs["Draft"], "quotations_approved": qs["Approved"],
		"quotations_sent": qs["Sent to Customer"] + qs["Under Negotiation"],
	}
	if user["role"] in MGMT:
		closed = st["Won"] + st["Lost"] + st["Not Interested"]
		out["conversion_rate"] = round(100 * st["Won"] / closed, 1) if closed else 0
		out["unassigned"] = sum(1 for lead in leads if not lead.get("assigned_to"))
		per = defaultdict(lambda: {"name": "", "assigned": 0, "won": 0, "positive": 0})
		for lead in leads:
			if lead.get("assigned_to"):
				p = per[lead["assigned_to"]]
				p["name"] = lead["assigned_name"]
				p["assigned"] += 1
				p["won"] += lead["status"] == "Won"
				p["positive"] += lead["status"] == POSITIVE or (lead.get("approval") or {}).get("state") == "approved"
		out["per_employee"] = list(per.values())
		out["inspections_upcoming"] = await db.inspections.count_documents({"status": {"$in": ["Scheduled", "Rescheduled"]}, "scheduled_at": {"$gte": now}})
		out["total_customers"] = await db.customers.count_documents({})
		out["quote_value"] = round(sum(q["totals"].get("total", 0) for q in quotes), 2)
		orders = await db.orders.find({}, {"_id": 0, "amount": 1, "stage": 1}).to_list(None)
		out["order_value"] = round(sum(o["amount"] for o in orders), 2)
		out["active_installations"] = sum(1 for o in orders if o["stage"] != "Completed")
		out["pending_service"] = await db.service_requests.count_documents({"status": {"$nin": ["Resolved", "Closed"]}})
		out["active_amc"] = await db.amc.count_documents({"status": "Active"})
		soon = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
		out["amc_expiring"] = await db.amc.find({"status": "Active", "end_date": {"$lte": soon}}, {"_id": 0}).to_list(20)
		out["by_source"] = dict(Counter(lead.get("source") or "Other" for lead in leads))
		out["recent_activity"] = await db.audit_logs.find({}, {"_id": 0}).sort("at", -1).limit(10).to_list(10) if user["role"] == "admin" else []
	return out


async def build_report(date_from: str | None, date_to: str | None, employee: str | None, status: str | None) -> dict:
	leads = [lead for lead in await db.leads.find({"archived": False}, {"_id": 0}).to_list(None)
			 if _in_range(lead, "created_at", date_from, date_to) and (not employee or lead.get("assigned_to") == employee)
			 and (not status or lead["status"] == status)]
	ids = {lead["id"] for lead in leads}
	quotes = [q for q in await db.quotations.find({}, {"_id": 0}).to_list(None) if q.get("lead_id") in ids]
	orders = [o for o in await db.orders.find({}, {"_id": 0}).to_list(None) if o.get("lead_id") in ids]
	by_lead_q = {q["lead_id"] for q in quotes}
	by_lead_o = {o["lead_id"] for o in orders}

	def group(key):
		g = defaultdict(lambda: {"leads": 0, "quotations": 0, "won": 0, "order_value": 0.0})
		for lead in leads:
			k = lead.get(key) or "—"
			g[k]["leads"] += 1
			g[k]["quotations"] += lead["id"] in by_lead_q
			g[k]["won"] += lead["id"] in by_lead_o or lead["status"] == "Won"
		for o in orders:
			lead = next((x for x in leads if x["id"] == o.get("lead_id")), None)
			if lead:
				g[lead.get(key) or "—"]["order_value"] += o["amount"]
		return [{"key": k, **v, "conversion": round(100 * v["won"] / v["leads"], 1) if v["leads"] else 0} for k, v in g.items()]

	fups = await db.followups.find({}, {"_id": 0}).to_list(None)
	users = {u["id"]: u for u in await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(None)}
	perf = []
	now = iso_now()
	for uid, u in users.items():
		if u["role"] == "admin":
			continue
		mine = [lead for lead in leads if lead.get("assigned_to") == uid]
		mf = [f for f in fups if f["assigned_to"] == uid and _in_range(f, "created_at", date_from, date_to)]
		submitted = [lead for lead in mine if lead.get("approval")]
		perf.append({"name": u["name"], "role": u["role"], "active": u["active"], "assigned": len(mine),
					 "contacted": sum(1 for lead in mine if lead.get("last_contacted_at")),
					 "followups_done": sum(1 for f in mf if f["done"]),
					 "followups_overdue": sum(1 for f in mf if not f["done"] and f["due_at"] < now),
					 "positive_submitted": len(submitted),
					 "positive_approved": sum(1 for lead in submitted if lead["approval"].get("state") == "approved"),
					 "quotations": sum(1 for q in quotes if q.get("created_by") == uid),
					 "won": sum(1 for lead in mine if lead["status"] == "Won"),
					 "conversion": round(100 * sum(1 for lead in mine if lead["status"] == "Won") / len(mine), 1) if mine else 0})
	daily = Counter(lead["created_at"][:10] for lead in leads)
	srs = await db.service_requests.find({}, {"_id": 0, "status": 1, "issue_type": 1}).to_list(None)
	return {
		"totals": {"leads": len(leads), "quotations": len(quotes), "quote_value": round(sum(q["totals"]["total"] for q in quotes), 2),
				   "orders": len(orders), "order_value": round(sum(o["amount"] for o in orders), 2),
				   "won": sum(1 for lead in leads if lead["status"] == "Won"), "lost": sum(1 for lead in leads if lead["status"] in ("Lost", "Not Interested"))},
		"daily": [{"date": d, "leads": n} for d, n in sorted(daily.items())],
		"pipeline": [{"status": s, "count": n} for s, n in Counter(lead["status"] for lead in leads).items()],
		"by_source": group("source"), "by_city": group("city"), "by_lift_type": group("lift_type"),
		"by_employee": group("assigned_name"), "performance": perf,
		"quotations_by_status": [{"status": s, "count": n} for s, n in Counter(q["status"] for q in quotes).items()],
		"service_by_status": [{"status": s, "count": n} for s, n in Counter(x["status"] for x in srs).items()],
		"installations": [{"stage": s, "count": n} for s, n in Counter(o["stage"] for o in orders).items()],
	}


@router.get("/reports")
async def reports(date_from: str | None = None, date_to: str | None = None, employee: str | None = None,
				  status: str | None = None, user: dict = Depends(require(*MGMT))):
	return await build_report(date_from, date_to, employee, status)


@router.get("/reports/export/{kind}")
async def export(kind: str, date_from: str | None = None, date_to: str | None = None, employee: str | None = None,
				 status: str | None = None, user: dict = Depends(require(*MGMT))):
	buf = io.StringIO()
	w = csv.writer(buf)
	if kind == "leads":
		rows = [lead for lead in await db.leads.find({"archived": False}, {"_id": 0}).sort("created_at", -1).to_list(None)
				if _in_range(lead, "created_at", date_from, date_to) and (not employee or lead.get("assigned_to") == employee)
				and (not status or lead["status"] == status)]
		cols = ["ref", "created_at", "name", "mobile", "email", "city", "area", "building_type", "requirement", "lift_type",
				"floors", "source", "status", "assigned_name", "possible_duplicate", "is_sample"]
		w.writerow(cols)
		for r in rows:
			w.writerow([r.get(c) for c in cols])
	elif kind in ("performance", "by_source", "by_city", "by_lift_type"):
		data = (await build_report(date_from, date_to, employee, status))[kind]
		if data:
			w.writerow(list(data[0].keys()))
			for r in data:
				w.writerow(list(r.values()))
	else:
		raise HTTPException(404, "Unknown export")
	await audit(user, "data_exported", "reports", comment=f"Exported {kind} CSV")
	return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": f'attachment; filename="vtech-{kind}.csv"'})