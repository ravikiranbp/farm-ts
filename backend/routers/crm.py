"""Customers (unified profile + timeline), service requests, AMC, files, notifications."""
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from lib.auth import MGMT, current_user, is_mgmt, require
from lib.common import audit, iso_now, new_id, next_ref, notify
from lib.db import db
from lib.files import file_response, store_file
from routers.leads import get_scoped_lead
from routers.public import create_service_request

router = APIRouter()
ALLOWED = {".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
		   ".pdf": "application/pdf", ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		   ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"}
MAX_BYTES = 5 * 1024 * 1024
MAX_BROCHURE_BYTES = 10 * 1024 * 1024
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


# ---------------- Customers ----------------
async def _telecaller_customer_ids(user: dict) -> list[str]:
	return list({d["customer_id"] async for d in db.leads.find({"assigned_to": user["id"]}, {"customer_id": 1})})


@router.get("/customers")
async def list_customers(q: str | None = None, page: int = 1, user: dict = Depends(current_user)):
	flt: dict = {}
	if user["role"] == "telecaller":
		flt["id"] = {"$in": await _telecaller_customer_ids(user)}
	if q:
		rx = {"$regex": re.escape(q.strip()), "$options": "i"}
		ids = set()
		for coll, field in (("leads", "ref"), ("quotations", "number"), ("orders", "ref"), ("service_requests", "ref")):
			async for d in db[coll].find({field: rx}, {"customer_id": 1}):
				ids.add(d["customer_id"])
		flt["$or"] = [{"name": rx}, {"mobile": rx}, {"city": rx}, {"area": rx}, {"ref": rx}, {"id": {"$in": list(ids)}}]
	total = await db.customers.count_documents(flt)
	items = await db.customers.find(flt, {"_id": 0}).sort("updated_at", -1).skip((page - 1) * 25).limit(25).to_list(25)
	return {"items": items, "total": total}


@router.get("/customers/{cid}")
async def customer_profile(cid: str, user: dict = Depends(current_user)):
	c = await db.customers.find_one({"id": cid}, {"_id": 0})
	if not c:
		raise HTTPException(404, "Customer not found")
	if user["role"] == "telecaller" and cid not in await _telecaller_customer_ids(user):
		raise HTTPException(403, "This customer is not linked to your leads")
	f = {"customer_id": cid}
	p = {"_id": 0}
	data = {
		"customer": c,
		"leads": await db.leads.find(f, p).sort("created_at", -1).to_list(200),
		"interactions": await db.interactions.find(f, p).sort("at", -1).to_list(500),
		"followups": await db.followups.find(f, p).sort("due_at", -1).to_list(300),
		"brochures": await db.brochure_downloads.find(f, p).sort("at", -1).to_list(100),
		"inspections": await db.inspections.find(f, p).to_list(100),
		"quotations": await db.quotations.find(f, p).to_list(100),
		"orders": await db.orders.find(f, p).to_list(100),
		"service_requests": await db.service_requests.find(f, p).to_list(200),
		"amc": await db.amc.find(f, p).to_list(100),
	}
	tl = [{"at": x["created_at"], "kind": "enquiry", "title": f"Enquiry {x['ref']} ({x['source']})", "detail": x.get("requirement")} for x in data["leads"]]
	tl += [{"at": x["at"], "kind": "interaction", "title": f"{x['kind'].title()} by {x['by_name']}", "detail": x.get("outcome") or x.get("notes")} for x in data["interactions"]]
	tl += [{"at": x["at"], "kind": "brochure", "title": f"Brochure downloaded: {x['brochure_title']}", "detail": None} for x in data["brochures"]]
	tl += [{"at": x["created_at"], "kind": "inspection", "title": f"Site inspection {x['ref']} — {x['status']}", "detail": x.get("recommendations")} for x in data["inspections"]]
	tl += [{"at": x["created_at"], "kind": "quotation", "title": f"Quotation {x['number']} R{x['revision']} — {x['status']}", "detail": f"₹{x['totals'].get('total', 0):,.0f}"} for x in data["quotations"]]
	tl += [{"at": x["created_at"], "kind": "order", "title": f"Order {x['ref']} — {x['stage']}", "detail": x.get("specs")} for x in data["orders"]]
	tl += [{"at": x["created_at"], "kind": "service", "title": f"Service {x['ref']} — {x['status']}", "detail": x.get("issue_type")} for x in data["service_requests"]]
	tl += [{"at": x["created_at"], "kind": "amc", "title": f"AMC {x['ref']} ({x['start_date']} → {x['end_date']})", "detail": x.get("status")} for x in data["amc"]]
	for lead in data["leads"]:
		for h in lead.get("approval_history", []):
			if h.get("event") in ("approved", "rejected", "info_requested"):
				tl.append({"at": h["at"], "kind": "approval", "title": f"Lead {h['event'].replace('_', ' ')} by {h.get('by')}", "detail": h.get("comment")})
	data["timeline"] = sorted(tl, key=lambda x: x["at"] or "", reverse=True)
	return data


@router.patch("/customers/{cid}")
async def update_customer(cid: str, body: dict, user: dict = Depends(current_user)):
	c = await db.customers.find_one({"id": cid}, {"_id": 0})
	if not c:
		raise HTTPException(404, "Customer not found")
	if user["role"] == "telecaller" and cid not in await _telecaller_customer_ids(user):
		raise HTTPException(403, "This customer is not linked to your leads")
	allowed = ["name", "email", "city", "area", "address", "alt_phone", "buildings", "notes"]
	changes = {k: v for k, v in body.items() if k in allowed and c.get(k) != v}
	if changes:
		changes["updated_at"] = iso_now()
		await db.customers.update_one({"id": cid}, {"$set": changes})
		await audit(user, "customer_updated", "customers", record_ref=c["ref"], record_id=cid,
					old={k: c.get(k) for k in changes if k != "updated_at"}, new=changes, customer_id=cid)
	return await db.customers.find_one({"id": cid}, {"_id": 0})


# ---------------- Service requests ----------------
SR_FIELDS = ["status", "assigned_to", "visit_at", "work_done", "parts_replaced", "customer_confirmed", "priority"]
SR_STATUSES = ["Open", "Assigned", "Scheduled", "In Progress", "Resolved", "Closed"]


@router.get("/service-requests")
async def list_srs(user: dict = Depends(current_user)):
	return await db.service_requests.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.post("/service-requests")
async def staff_sr(body: dict, user: dict = Depends(current_user)):
	for k in ("name", "mobile", "address", "issue_type", "description"):
		if not str(body.get(k) or "").strip():
			raise HTTPException(400, f"'{k}' is required")
	return await create_service_request(body, user)


@router.patch("/service-requests/{sid}")
async def update_sr(sid: str, body: dict, user: dict = Depends(current_user)):
	sr = await db.service_requests.find_one({"id": sid}, {"_id": 0})
	if not sr:
		raise HTTPException(404, "Service request not found")
	changes = {k: v for k, v in body.items() if k in SR_FIELDS and sr.get(k) != v}
	if not is_mgmt(user) and ({"assigned_to", "status"} & changes.keys()) and changes.get("status") != "In Progress":
		raise HTTPException(403, "Only managers can assign or close service requests")
	if "status" in changes and changes["status"] not in SR_STATUSES:
		raise HTTPException(400, "Invalid status")
	if "assigned_to" in changes:
		a = await db.users.find_one({"id": changes["assigned_to"]}, {"_id": 0})
		changes["assigned_name"] = a["name"] if a else None
		if sr["status"] == "Open":
			changes.setdefault("status", "Assigned")
	upd: dict = {}
	if body.get("note"):
		upd["$push"] = {"notes": {"by": user["name"], "at": iso_now(), "note": body["note"]}}
	if changes:
		changes["updated_at"] = iso_now()
		upd["$set"] = changes
	if upd:
		await db.service_requests.update_one({"id": sid}, upd)
		await audit(user, "service_request_updated", "service", record_ref=sr["ref"], record_id=sid,
					old={k: sr.get(k) for k in changes if k not in ("updated_at", "assigned_name")},
					new={k: v for k, v in changes.items() if k != "updated_at"}, comment=body.get("note"), customer_id=sr["customer_id"])
	return await db.service_requests.find_one({"id": sid}, {"_id": 0})


# ---------------- AMC ----------------
AMC_FIELDS = ["customer_id", "order_id", "lift_details", "start_date", "end_date", "amount", "payment_status", "coverage",
			  "frequency", "next_visit", "status", "visits"]


@router.get("/amc")
async def list_amc(user: dict = Depends(current_user)):
	docs = await db.amc.find({}, {"_id": 0}).sort("end_date", 1).to_list(1000)
	soon = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
	for d in docs:
		d["expiring_soon"] = d.get("status") == "Active" and (d.get("end_date") or "9999") <= soon
	return docs


@router.post("/amc")
async def create_amc(body: dict, user: dict = Depends(require(*MGMT))):
	c = await db.customers.find_one({"id": body.get("customer_id")}, {"_id": 0})
	if not c or not body.get("start_date") or not body.get("end_date"):
		raise HTTPException(400, "Customer, start date and end date are required")
	if body["end_date"] <= body["start_date"]:
		raise HTTPException(400, "End date must be after start date")
	doc = {"id": new_id(), "ref": await next_ref("AMC"), **{k: body.get(k) for k in AMC_FIELDS},
		   "customer_name": c["name"], "status": body.get("status") or "Active", "visits": [], "created_at": iso_now(), "updated_at": iso_now()}
	await db.amc.insert_one(dict(doc))
	await audit(user, "amc_created", "amc", record_ref=doc["ref"], record_id=doc["id"], new={"amount": doc.get("amount")}, customer_id=c["id"])
	doc.pop("_id", None)
	return doc


@router.patch("/amc/{aid}")
async def update_amc(aid: str, body: dict, user: dict = Depends(require(*MGMT))):
	a = await db.amc.find_one({"id": aid}, {"_id": 0})
	if not a:
		raise HTTPException(404, "AMC not found")
	changes = {k: v for k, v in body.items() if k in AMC_FIELDS and k != "customer_id" and a.get(k) != v}
	if changes:
		changes["updated_at"] = iso_now()
		await db.amc.update_one({"id": aid}, {"$set": changes})
		await audit(user, "amc_updated", "amc", record_ref=a["ref"], record_id=aid,
					old={k: a.get(k) for k in changes if k != "updated_at"}, new=changes, customer_id=a["customer_id"])
	return await db.amc.find_one({"id": aid}, {"_id": 0})


# ---------------- Files ----------------
@router.post("/files")
async def upload(file: UploadFile = File(...), entity_type: str = Form(...), entity_id: str = Form(...),
				 public: bool = Form(False), user: dict = Depends(current_user)):
	ext = Path(file.filename or "").suffix.lower()
	if ext not in ALLOWED:
		raise HTTPException(400, "Allowed file types: JPG, PNG, WEBP, PDF, DOCX, XLSX")
	data = await file.read()
	limit = MAX_BROCHURE_BYTES if entity_type == "brochure" else MAX_BYTES
	if len(data) > limit:
		raise HTTPException(400, f"File too large (max {limit // (1024 * 1024)} MB)")
	if entity_type == "lead":
		await get_scoped_lead(entity_id, user)
	if entity_type == "project":
		if user["role"] != "admin":
			raise HTTPException(403, "Only admins can add project photos")
		if ext not in IMAGE_EXTS:
			raise HTTPException(400, "Project photos must be JPG, PNG or WEBP")
		public = True
	if public and user["role"] != "admin":
		raise HTTPException(403, "Only admins can publish public files")
	fid = new_id()
	await store_file(fid, data, ALLOWED[ext])
	doc = {"id": fid, "name": Path(file.filename).name, "content_type": ALLOWED[ext], "size": len(data),
		   "entity_type": entity_type, "entity_id": entity_id, "public": public, "uploaded_by": user["name"], "at": iso_now()}
	await db.files.insert_one(dict(doc))
	await audit(user, "file_uploaded", entity_type, record_id=entity_id, new={"file": doc["name"]},
				lead_id=entity_id if entity_type == "lead" else None)
	return doc


@router.get("/files")
async def list_files(entity_type: str, entity_id: str, user: dict = Depends(current_user)):
	if entity_type == "lead":
		await get_scoped_lead(entity_id, user)
	return await db.files.find({"entity_type": entity_type, "entity_id": entity_id}, {"_id": 0, "path": 0}).to_list(200)


@router.get("/files/{fid}")
async def get_file(fid: str, user: dict = Depends(current_user)):
	f = await db.files.find_one({"id": fid})
	if not f:
		raise HTTPException(404, "File not found")
	if f["entity_type"] == "lead":
		await get_scoped_lead(f["entity_id"], user)
	return await file_response(f)


# ---------------- Notifications (+ lightweight reminder sweep, no cron infra needed) ----------------
async def reminder_sweep():
	now = iso_now()
	async for f in db.followups.find({"done": False, "notified": False, "due_at": {"$lte": now}}):
		await notify("followup_due", f"Follow-up due: {f['lead_name']}", f"{f['lead_ref']} · {f['due_at'][:16]}",
					 f"/staff/leads/{f['lead_id']}", user_ids=[f["assigned_to"]])
		await db.followups.update_one({"id": f["id"]}, {"$set": {"notified": True}})
	soon = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
	async for a in db.amc.find({"status": "Active", "end_date": {"$lte": soon}, "expiry_notified": {"$ne": True}}):
		await notify("amc_expiry", f"AMC expiring: {a['customer_name']}", f"{a['ref']} ends {a['end_date']}", "/staff/service", roles=list(MGMT))
		await db.amc.update_one({"id": a["id"]}, {"$set": {"expiry_notified": True}})
	await unopened_quote_sweep()


UNOPENED_AFTER_DAYS = 2


async def unopened_quote_sweep():
	"""Shared quotation links not opened within 2 days -> follow-up task for the lead owner + in-app alert."""
	cutoff = (datetime.now(timezone.utc) - timedelta(days=UNOPENED_AFTER_DAYS)).strftime("%Y-%m-%dT%H:%M:%SZ")
	flt = {"share.revoked": False, "share.created_at": {"$lte": cutoff}, "share.unopened_reminded": {"$ne": True},
		   "view_count": {"$in": [0, None]}, "status": {"$in": ["Approved", "Sent to Customer", "Under Negotiation"]}}
	async for q in db.quotations.find(flt, {"_id": 0}):
		# claim first so concurrent polls never create duplicate follow-ups
		claimed = await db.quotations.update_one({"id": q["id"], "share.unopened_reminded": {"$ne": True}},
												 {"$set": {"share.unopened_reminded": True}})
		if not claimed.modified_count or q["revision"] != q["share"].get("revision"):
			continue
		lead = await db.leads.find_one({"id": q.get("lead_id")}, {"_id": 0}) if q.get("lead_id") else None
		owner_id = (lead or {}).get("assigned_to") or q.get("created_by")
		owner = await db.users.find_one({"id": owner_id}, {"_id": 0, "name": 1}) if owner_id else None
		title = f"Quotation not opened: {q['customer_name']}"
		body = f"{q['number']} R{q['revision']} shared {q['share']['created_at'][:10]} — still unopened. Call the customer."
		if lead:
			doc = {"id": new_id(), "lead_id": lead["id"], "lead_ref": lead["ref"], "lead_name": lead["name"],
				   "customer_id": lead["customer_id"], "due_at": iso_now(), "kind": "Call",
				   "notes": f"Auto: quotation {q['number']} R{q['revision']} not opened within {UNOPENED_AFTER_DAYS} days of sharing. "
							"Confirm the customer received the link.",
				   "assigned_to": owner_id, "assigned_name": owner["name"] if owner else None, "done": False,
				   "outcome": None, "notified": True, "auto": "quote_unopened", "created_by": "System",
				   "created_at": iso_now()}
			await db.followups.insert_one(dict(doc))
			nxt = await db.followups.find({"lead_id": lead["id"], "done": False}).sort("due_at", 1).to_list(1)
			await db.leads.update_one({"id": lead["id"]}, {"$set": {"next_followup_at": nxt[0]["due_at"] if nxt else None}})
		link = f"/staff/leads/{lead['id']}" if lead else "/staff/quotations"
		await notify("quote_unopened", title, body, link, user_ids=[owner_id], roles=list(MGMT))
		await audit(None, "quotation_unopened_reminder", "quotations", record_ref=f"{q['number']} R{q['revision']}",
					record_id=q["id"], comment=f"Follow-up created for {owner['name'] if owner else 'owner'}",
					customer_id=q.get("customer_id"), lead_id=q.get("lead_id"))


@router.get("/notifications")
async def my_notifications(user: dict = Depends(current_user)):
	await reminder_sweep()
	items = await db.notifications.find({"user_id": user["id"]}, {"_id": 0}).sort("at", -1).to_list(100)
	unread = await db.notifications.count_documents({"user_id": user["id"], "read": False})
	return {"items": items, "unread": unread}


@router.post("/notifications/read")
async def mark_read(body: dict, user: dict = Depends(current_user)):
	flt: dict = {"user_id": user["id"]}
	if body.get("id"):
		flt["id"] = body["id"]
	await db.notifications.update_many(flt, {"$set": {"read": True}})
	return {"ok": True}