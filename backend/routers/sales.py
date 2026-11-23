"""Site inspections, quotations (with revisions + approval limits), orders/installations."""
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response

from lib.auth import MGMT, current_user, is_mgmt, require
from lib.common import ORDER_STAGES, audit, clean, get_settings, iso_now, new_id, next_ref, norm_iso, notify
from lib.dates import today_iso
from lib.db import db
from lib.pdf import inspection_pdf, quotation_pdf
from lib.quote_defaults import DEFAULT_QUOTE_DEFAULTS, PER_QUOTE_KEYS, get_quote_defaults
from models.schemas import QuotationIn, QuoteAction, QuoteResponseIn, Quotation
from routers.leads import get_scoped_lead, set_status

router = APIRouter()

# ---------------- Site inspections ----------------
INSPECTION_FIELDS = ["address", "scheduled_at", "status", "building_type", "floors", "stops", "shaft_width_mm",
					 "shaft_depth_mm", "pit_depth_mm", "overhead_mm", "floor_heights", "machine_room", "power_supply",
					 "proposed_capacity", "door_config", "observations", "recommendations", "extra_fields", "assigned_to"]


@router.get("/inspections")
async def list_inspections(user: dict = Depends(current_user)):
	flt = {} if is_mgmt(user) else {"assigned_to": user["id"]}
	return await db.inspections.find(flt, {"_id": 0}).sort("scheduled_at", -1).to_list(500)


@router.post("/inspections")
async def create_inspection(body: dict, user: dict = Depends(require(*MGMT))):
	lead = await get_scoped_lead(body.get("lead_id", ""), user)
	assignee = await db.users.find_one({"id": body.get("assigned_to") or user["id"]}, {"_id": 0})
	if not assignee:
		raise HTTPException(400, "Select an inspector")
	try:
		when = norm_iso(body.get("scheduled_at"))
	except ValueError:
		raise HTTPException(400, "Invalid inspection date/time")
	doc = {"id": new_id(), "ref": await next_ref("INS"), "lead_id": lead["id"], "lead_ref": lead["ref"],
		   "customer_id": lead["customer_id"], "customer_name": lead["name"], "customer_mobile": lead["mobile"],
		   "address": body.get("address") or lead.get("address") or f"{lead.get('area') or ''} {lead.get('city') or ''}".strip(),
		   "scheduled_at": when, "status": "Scheduled" if when else "Pending", "assigned_to": assignee["id"],
		   "assigned_name": assignee["name"], "building_type": lead.get("building_type"), "floors": lead.get("floors"),
		   "extra_fields": [], "attachments": [], "created_by": user["name"], "created_at": iso_now(), "updated_at": iso_now()}
	await db.inspections.insert_one(dict(doc))
	if when:
		await set_status(lead, "Site Inspection Scheduled", user, f"Inspection {doc['ref']} scheduled")
	await audit(user, "inspection_scheduled", "inspections", record_ref=doc["ref"], record_id=doc["id"],
				new={"scheduled_at": when, "inspector": assignee["name"]}, customer_id=lead["customer_id"], lead_id=lead["id"])
	await notify("inspection_scheduled", f"Site inspection: {lead['name']}", f"{doc['ref']} on {when or 'TBD'}",
				 "/staff/inspections", user_ids=[assignee["id"]])
	return clean(doc)


@router.patch("/inspections/{iid}")
async def update_inspection(iid: str, body: dict, user: dict = Depends(current_user)):
	ins = await db.inspections.find_one({"id": iid}, {"_id": 0})
	if not ins:
		raise HTTPException(404, "Inspection not found")
	if not is_mgmt(user) and ins["assigned_to"] != user["id"]:
		raise HTTPException(403, "Not your inspection")
	changes = {k: v for k, v in body.items() if k in INSPECTION_FIELDS and ins.get(k) != v}
	if "assigned_to" in changes:
		if not is_mgmt(user):
			raise HTTPException(403, "Only managers can reassign inspections")
		a = await db.users.find_one({"id": changes["assigned_to"]}, {"_id": 0})
		changes["assigned_name"] = a["name"] if a else None
	if "scheduled_at" in changes and changes["scheduled_at"]:
		changes["scheduled_at"] = norm_iso(changes["scheduled_at"])
	if changes.get("status") and changes["status"] not in ("Pending", "Scheduled", "Completed", "Rescheduled"):
		raise HTTPException(400, "Invalid inspection status")
	if changes:
		changes["updated_at"] = iso_now()
		await db.inspections.update_one({"id": iid}, {"$set": changes})
		await audit(user, "inspection_updated", "inspections", record_ref=ins["ref"], record_id=iid,
					old={k: ins.get(k) for k in changes if k != "updated_at"}, new=changes,
					customer_id=ins["customer_id"], lead_id=ins["lead_id"])
		if changes.get("status") == "Completed":
			lead = await db.leads.find_one({"id": ins["lead_id"]}, {"_id": 0})
			if lead:
				await set_status(lead, "Site Inspection Completed", user, f"Inspection {ins['ref']} completed")
	return await db.inspections.find_one({"id": iid}, {"_id": 0})


@router.get("/inspections/{iid}/pdf")
async def inspection_report(iid: str, user: dict = Depends(current_user)):
	ins = await db.inspections.find_one({"id": iid}, {"_id": 0})
	if not ins:
		raise HTTPException(404, "Inspection not found")
	pdf = inspection_pdf(ins, await get_settings())
	return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{ins["ref"]}.pdf"'})


# ---------------- Quotations ----------------
def compute_totals(d: dict) -> dict:
	items = sum(float(i["qty"]) * float(i["unit_price"]) for i in d.get("items", []))
	subtotal = items + float(d.get("installation_charges") or 0) + float(d.get("transport_charges") or 0) + float(d.get("additional_charges") or 0)
	discount = round(subtotal * float(d.get("discount_pct") or 0) / 100, 2)
	taxable = subtotal - discount
	tax = round(taxable * float(d.get("tax_pct") or 0) / 100, 2)
	return {"items_total": round(items, 2), "subtotal": round(subtotal, 2), "discount": discount,
			"taxable": round(taxable, 2), "tax": tax, "total": round(taxable + tax, 2)}


def with_expiry(q: dict) -> dict:
	today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
	if q.get("valid_until") and q["valid_until"] < today and q["status"] in ("Approved", "Sent to Customer", "Under Negotiation"):
		q["status"] = "Expired"
	return q


EDITABLE = {"Draft", "Pending Approval", "Rejected"}
ISSUED = {"Approved", "Sent to Customer", "Under Negotiation", "Expired"}


def _spec(d: dict, key: str) -> str:
	return next((str(s.get("value") or "") for s in d.get("tech_specs") or [] if s.get("key") == key), "")


def _first_int(text: str) -> int | None:
	m = re.search(r"\d+", text or "")
	return int(m.group()) if m else None


def derive_summary(d: dict) -> None:
	"""Keep the short summary fields (used in lists, reports and orders) in step with the technical specs."""
	d["capacity"] = _spec(d, "capacity") or d.get("capacity")
	d["lifts_count"] = _first_int(_spec(d, "elevator_count")) or d.get("lifts_count")
	d["stops"] = _first_int(_spec(d, "stops")) or d.get("stops")
	d["floors"] = d.get("stops") or d.get("floors")
	if d.get("payment_schedule"):
		d["payment_terms"] = "; ".join(f"{p['pct']:g}% {p['description']}".strip() for p in d["payment_schedule"])


async def with_quote_defaults(q: dict) -> dict:
	"""Fill fields missing on quotations created before the multi-page format."""
	defaults = await get_quote_defaults()
	return {**q, **{k: defaults[k] for k in PER_QUOTE_KEYS if q.get(k) is None}}


async def snapshot(q: dict):
	snap = {k: v for k, v in q.items() if k not in ("_id", "approval_history", "negotiation_notes", "share", "view_count",
													 "first_viewed_at", "last_viewed_at", "customer_responses")}
	await db.quotation_revisions.update_one({"quotation_id": q["id"], "revision": q["revision"]},
											{"$set": {**snap, "quotation_id": q["id"], "snapshot_at": iso_now()}}, upsert=True)


@router.get("/quotations", response_model=list[Quotation])
async def list_quotations(status: str | None = None, user: dict = Depends(current_user)):
	flt: dict = {}
	if user["role"] == "telecaller":
		lead_ids = [d["id"] async for d in db.leads.find({"assigned_to": user["id"]}, {"id": 1})]
		flt["lead_id"] = {"$in": lead_ids}
	docs = [with_expiry(d) for d in await db.quotations.find(flt, {"_id": 0}).sort("updated_at", -1).to_list(1000)]
	return [Quotation(**d) for d in docs if not status or d["status"] == status]


@router.post("/quotations", response_model=Quotation)
async def create_quotation(body: QuotationIn, user: dict = Depends(require(*MGMT))):
	lead = await get_scoped_lead(body.lead_id or "", user)
	s = await get_settings()
	defaults = await get_quote_defaults()
	data = body.model_dump(exclude={"change_note"})
	data["items"] = [i for i in data["items"] if i["description"].strip()]
	for k in PER_QUOTE_KEYS:
		if data.get(k) is None:
			data[k] = defaults[k]
	for k in ("payment_terms", "terms"):
		data[k] = data.get(k) or s.get(k)
	data["valid_until"] = data.get("valid_until") or (datetime.now(timezone.utc) + timedelta(days=int(s["quote_validity_days"]))).strftime("%Y-%m-%d")
	lead_address = "\n".join(x for x in (lead.get("address"), lead.get("area"), lead.get("city")) if x)
	data["project_address"] = data.get("project_address") or lead_address
	data["customer_name"] = data.get("customer_name") or lead["name"]
	data["customer_mobile"] = data.get("customer_mobile") or lead["mobile"]
	data["customer_email"] = data.get("customer_email") or lead.get("email")
	data["customer_address"] = data.get("customer_address") or lead_address
	data["quote_date"] = data.get("quote_date") or today_iso()
	derive_summary(data)
	now = iso_now()
	q = {"id": new_id(), "number": await next_ref("QTN"), "revision": 1, "status": "Draft", "lead_ref": lead["ref"],
		 "customer_id": lead["customer_id"], **data,
		 "totals": compute_totals(data), "approval_history": [], "negotiation_notes": [], "created_by": user["id"],
		 "created_by_name": user["name"], "order_id": None, "created_at": now, "updated_at": now}
	await db.quotations.insert_one(dict(q))
	await snapshot(q)
	await audit(user, "quotation_created", "quotations", record_ref=q["number"], record_id=q["id"],
				new={"total": q["totals"]["total"]}, customer_id=q["customer_id"], lead_id=lead["id"])
	if lead["status"] in ("Approved", "Site Inspection Completed", "Quotation Required", "Interested"):
		await set_status(lead, "Quotation Required", user, f"Quotation {q['number']} drafted")
	return Quotation(**q)


@router.get("/quotations/{qid}")
async def get_quotation(qid: str, user: dict = Depends(current_user)):
	q = await db.quotations.find_one({"id": qid}, {"_id": 0})
	if not q:
		raise HTTPException(404, "Quotation not found")
	if user["role"] == "telecaller":
		await get_scoped_lead(q["lead_id"], user)
	revs = await db.quotation_revisions.find({"quotation_id": qid}, {"_id": 0}).sort("revision", -1).to_list(100)
	views = await db.quotation_views.find({"quotation_id": qid}, {"_id": 0, "ip": 0}).sort("at", -1).to_list(20)
	return {"quotation": Quotation(**with_expiry(q)).model_dump(), "revisions": revs, "views": views}


@router.put("/quotations/{qid}", response_model=Quotation)
async def edit_quotation(qid: str, body: QuotationIn, user: dict = Depends(require(*MGMT))):
	q = await db.quotations.find_one({"id": qid}, {"_id": 0})
	if not q:
		raise HTTPException(404, "Quotation not found")
	q = with_expiry(q)
	if q["status"] in ("Accepted",):
		raise HTTPException(400, "Accepted quotations cannot be changed")
	sent = body.model_dump(exclude={"lead_id", "inspection_id", "change_note"}, exclude_unset=True)
	keep = {k: q.get(k) for k in QuotationIn.model_fields if k not in ("lead_id", "inspection_id", "change_note")}
	data = {**keep, **{k: v for k, v in sent.items() if v is not None or k not in keep}}
	data["items"] = [i for i in data.get("items") or [] if i["description"].strip()]
	derive_summary(data)
	data["totals"] = compute_totals(data)
	now = iso_now()
	old_total = q["totals"].get("total")
	if q["status"] in ISSUED:
		await snapshot(q)  # freeze the issued version exactly as issued
		data.update({"revision": q["revision"] + 1, "status": "Draft"})
		action = "quotation_revised"
	else:
		data["status"] = "Draft" if q["status"] == "Rejected" else q["status"]
		action = "quotation_edited"
	data["updated_at"] = now
	data["last_change_note"] = body.change_note
	await db.quotations.update_one({"id": qid}, {"$set": data})
	new = await db.quotations.find_one({"id": qid}, {"_id": 0})
	await snapshot(new)
	await audit(user, action, "quotations", record_ref=f"{q['number']} R{new['revision']}", record_id=qid,
				old={"total": old_total, "revision": q["revision"]}, new={"total": new["totals"]["total"], "revision": new["revision"]},
				comment=body.change_note, customer_id=q["customer_id"], lead_id=q.get("lead_id"))
	return Quotation(**new)


async def _can_approve(user: dict, q: dict):
	if user["role"] == "admin":
		return
	s = await get_settings()
	if q["totals"]["total"] > float(s["manager_max_quote_amount"]):
		raise HTTPException(403, f"Amount exceeds your approval limit (₹{s['manager_max_quote_amount']:,.0f}). Admin approval required.")
	if float(q.get("discount_pct") or 0) > float(s["manager_max_discount_pct"]):
		raise HTTPException(403, f"Discount exceeds your limit ({s['manager_max_discount_pct']}%). Admin approval required.")


@router.post("/quotations/{qid}/action", response_model=Quotation)
async def quotation_action(qid: str, body: QuoteAction, user: dict = Depends(require(*MGMT))):
	q = await db.quotations.find_one({"id": qid}, {"_id": 0})
	if not q:
		raise HTTPException(404, "Quotation not found")
	q = with_expiry(q)
	s = await get_settings()
	st, a = q["status"], body.action
	allowed = {
		"submit": {"Draft"}, "approve": {"Pending Approval", "Draft"}, "reject": {"Pending Approval"},
		"send": {"Approved"} if s["require_quote_approval"] else {"Approved", "Draft"},
		"negotiation": {"Sent to Customer"}, "accept": {"Sent to Customer", "Under Negotiation"},
		"customer_reject": {"Sent to Customer", "Under Negotiation"},
	}[a]
	if st not in allowed:
		raise HTTPException(400, f"Cannot '{a}' a quotation in status '{st}'")
	if a == "approve":
		await _can_approve(user, q)
	if a in ("reject", "customer_reject", "negotiation") and not (body.comment or "").strip():
		raise HTTPException(400, "Please add a comment")
	new_status = {"submit": "Pending Approval", "approve": "Approved", "reject": "Rejected", "send": "Sent to Customer",
				  "negotiation": "Under Negotiation", "accept": "Accepted", "customer_reject": "Rejected"}[a]
	now = iso_now()
	push = {"approval_history": {"action": a, "from": st, "to": new_status, "by": user["name"], "by_role": user["role"],
								 "at": now, "comment": body.comment, "revision": q["revision"]}}
	if a == "negotiation":
		push["negotiation_notes"] = {"by": user["name"], "at": now, "note": body.comment}
	await db.quotations.update_one({"id": qid}, {"$set": {"status": new_status, "updated_at": now}, "$push": push})
	q["status"] = new_status
	if a in ("approve", "send"):
		await snapshot(q)
	await audit(user, f"quotation_{a}", "quotations", record_ref=f"{q['number']} R{q['revision']}", record_id=qid,
				old={"status": st}, new={"status": new_status}, comment=body.comment, customer_id=q["customer_id"], lead_id=q.get("lead_id"))
	lead = await db.leads.find_one({"id": q.get("lead_id")}, {"_id": 0})
	if a == "submit":
		await notify("quote_approval", f"Quotation needs approval: {q['number']}", f"{q['customer_name']} · ₹{q['totals']['total']:,.0f}",
					 f"/staff/quotations/{qid}", roles=["admin", "manager"])
	if a in ("approve", "reject"):
		await notify("quote_decision", f"Quotation {new_status.lower()}: {q['number']}", body.comment or "",
					 f"/staff/quotations/{qid}", user_ids=[q["created_by"]])
	if lead and a == "send":
		await set_status(lead, "Quotation Sent", user, f"{q['number']} R{q['revision']} sent")
	if lead and a == "negotiation":
		await set_status(lead, "Negotiation", user, body.comment)
	if a == "accept":
		order = await create_order(q, user)
		await db.quotations.update_one({"id": qid}, {"$set": {"order_id": order["id"]}})
		if lead:
			await set_status(lead, "Won", user, f"Quotation accepted → order {order['ref']}")
	return Quotation(**await db.quotations.find_one({"id": qid}, {"_id": 0}))


@router.get("/quotations/{qid}/pdf")
async def quotation_pdf_route(qid: str, revision: int | None = None, inline: bool = False, user: dict = Depends(current_user)):
	q = await db.quotations.find_one({"id": qid}, {"_id": 0})
	if not q:
		raise HTTPException(404, "Quotation not found")
	if user["role"] == "telecaller":
		await get_scoped_lead(q["lead_id"], user)
	if revision and revision != q["revision"]:
		q = await db.quotation_revisions.find_one({"quotation_id": qid, "revision": revision}, {"_id": 0})
		if not q:
			raise HTTPException(404, "Revision not found")
	pdf = quotation_pdf(await with_quote_defaults(with_expiry(q)), await get_settings())
	disposition = "inline" if inline else "attachment"
	return Response(pdf, media_type="application/pdf",
					headers={"Content-Disposition": f'{disposition}; filename="{q["number"]}-R{q["revision"]}.pdf"'})


@router.get("/quote-defaults")
async def quote_defaults_get(user: dict = Depends(require(*MGMT))):
	return await get_quote_defaults()


@router.put("/quote-defaults")
async def quote_defaults_put(body: dict, user: dict = Depends(require(*MGMT))):
	changes = {k: v for k, v in body.items() if k in DEFAULT_QUOTE_DEFAULTS and isinstance(v, type(DEFAULT_QUOTE_DEFAULTS[k]))}
	if "material_catalog" in changes:
		cat = changes["material_catalog"]
		if not all(isinstance(k, str) and k.strip() and isinstance(v, list) for k, v in cat.items()):
			raise HTTPException(400, "Each material category needs a name and a list of options")
	if "payment_schedule" in changes and abs(sum(float(p.get("pct") or 0) for p in changes["payment_schedule"]) - 100) > 0.01:
		raise HTTPException(400, "Default payment schedule must add up to 100%")
	if changes:
		await db.settings.update_one({"id": "quote_defaults"}, {"$set": changes}, upsert=True)
		await audit(user, "quotation_defaults_changed", "settings", new={"fields": sorted(changes)})
	return await get_quote_defaults()


# ---------------- Customer share link (public, token-based) ----------------
SHAREABLE = {"Approved", "Sent to Customer", "Under Negotiation"}
PUBLIC_QUOTE_FIELDS = ["number", "revision", "customer_name", "project_address", "lift_category", "capacity", "floors", "stops",
					   "lifts_count", "technical_config", "product_description", "items", "installation_charges",
					   "transport_charges", "additional_charges", "discount_pct", "tax_pct", "totals", "payment_terms",
					   "delivery_timeline", "installation_timeline", "warranty", "amc_info", "terms", "valid_until"]


@router.post("/quotations/{qid}/share", response_model=Quotation)
async def create_share(qid: str, user: dict = Depends(require(*MGMT))):
	q = await db.quotations.find_one({"id": qid}, {"_id": 0})
	if not q:
		raise HTTPException(404, "Quotation not found")
	q = with_expiry(q)
	s = await get_settings()
	if q["status"] not in SHAREABLE and not (q["status"] == "Draft" and not s["require_quote_approval"]):
		raise HTTPException(400, f"Only approved/sent quotations can be shared (current: {q['status']})")
	await snapshot(q)  # freeze exactly what the customer will see
	share = {"token": secrets.token_urlsafe(24), "revision": q["revision"], "created_at": iso_now(), "created_by": user["name"], "revoked": False}
	await db.quotations.update_one({"id": qid}, {"$set": {"share": share, "view_count": 0, "first_viewed_at": None, "last_viewed_at": None}})
	await audit(user, "quotation_share_link_created", "quotations", record_ref=f"{q['number']} R{q['revision']}", record_id=qid,
				customer_id=q["customer_id"], lead_id=q.get("lead_id"))
	return Quotation(**await db.quotations.find_one({"id": qid}, {"_id": 0}))


@router.post("/quotations/{qid}/share/revoke", response_model=Quotation)
async def revoke_share(qid: str, user: dict = Depends(require(*MGMT))):
	q = await db.quotations.find_one({"id": qid}, {"_id": 0})
	if not q or not q.get("share"):
		raise HTTPException(404, "No share link for this quotation")
	await db.quotations.update_one({"id": qid}, {"$set": {"share.revoked": True}})
	await audit(user, "quotation_share_link_revoked", "quotations", record_ref=q["number"], record_id=qid,
				customer_id=q["customer_id"], lead_id=q.get("lead_id"))
	return Quotation(**await db.quotations.find_one({"id": qid}, {"_id": 0}))


async def _shared(token: str) -> tuple[dict, dict]:
	q = await db.quotations.find_one({"share.token": token}, {"_id": 0})
	if not q or q["share"].get("revoked"):
		raise HTTPException(404, "This quotation link is not valid. Please contact V Tech Elevators.")
	snap = await db.quotation_revisions.find_one({"quotation_id": q["id"], "revision": q["share"]["revision"]}, {"_id": 0})
	if not snap:
		raise HTTPException(404, "Quotation not available")
	today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
	if snap.get("valid_until") and snap["valid_until"] < today:
		raise HTTPException(410, "This quotation has expired. Please contact us for an updated quotation.")
	if q["revision"] != q["share"]["revision"]:
		raise HTTPException(410, "This quotation has been updated. Please ask us for the latest link.")
	return q, snap


async def _is_staff(request: Request) -> bool:
	tok = request.cookies.get("vt_session")
	return bool(tok and await db.sessions.find_one({"token": tok}))


@router.get("/public/quotes/{token}")
async def public_quote(token: str, request: Request):
	q, snap = await _shared(token)
	if not await _is_staff(request):
		now = iso_now()
		await db.quotations.update_one({"id": q["id"]}, {"$inc": {"view_count": 1}, "$set": {"last_viewed_at": now,
										**({} if q.get("first_viewed_at") else {"first_viewed_at": now})}})
		await db.quotation_views.insert_one({"id": new_id(), "quotation_id": q["id"], "revision": snap["revision"], "at": now,
											 "ip": request.client.host if request.client else None,
											 "ua": (request.headers.get("user-agent") or "")[:200]})
		if not q.get("first_viewed_at"):
			await audit(None, "quotation_viewed_by_customer", "quotations", record_ref=f"{q['number']} R{snap['revision']}",
						record_id=q["id"], customer_id=q["customer_id"], lead_id=q.get("lead_id"))
			await notify("quote_viewed", f"Customer opened quotation {q['number']}", q["customer_name"], f"/staff/quotations/{q['id']}",
						 user_ids=[q.get("created_by")])
	s = await get_settings()
	status = with_expiry(dict(q))["status"]
	last = (q.get("customer_responses") or [None])[-1]
	return {"quotation": {k: snap.get(k) for k in PUBLIC_QUOTE_FIELDS}, "status": status,
			"company": {k: s.get(k) for k in ("company_name", "phone", "email", "whatsapp", "address", "signatory")},
			"last_response": last, "can_respond": status in ("Approved", "Sent to Customer", "Under Negotiation")}


@router.get("/public/quotes/{token}/pdf")
async def public_quote_pdf(token: str):
	q, snap = await _shared(token)
	pdf = quotation_pdf(await with_quote_defaults(snap), await get_settings())
	return Response(pdf, media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{snap["number"]}-R{snap["revision"]}.pdf"'})


@router.post("/public/quotes/{token}/respond")
async def public_quote_respond(token: str, body: QuoteResponseIn):
	q, snap = await _shared(token)
	if with_expiry(dict(q))["status"] not in ("Approved", "Sent to Customer", "Under Negotiation"):
		raise HTTPException(400, "This quotation can no longer be responded to online. Please call us.")
	if body.response == "changes" and not (body.comment or "").strip():
		raise HTTPException(400, "Please tell us what you would like changed")
	if len(q.get("customer_responses") or []) >= 20:
		raise HTTPException(429, "Too many responses. Please call us.")
	now = iso_now()
	entry = {"response": body.response, "name": body.name.strip(), "comment": body.comment, "revision": snap["revision"], "at": now}
	await db.quotations.update_one({"id": q["id"]}, {"$push": {"customer_responses": entry}})
	label = "accepted online" if body.response == "accept" else "requested changes"
	await audit(None, f"quotation_customer_{body.response}", "quotations", record_ref=f"{q['number']} R{snap['revision']}",
				record_id=q["id"], new={"by": body.name}, comment=body.comment, customer_id=q["customer_id"], lead_id=q.get("lead_id"))
	await notify("quote_response", f"Customer {label}: {q['number']}",
				 f"{body.name}{' — ' + body.comment if body.comment else ''}" + (" · Please confirm the order" if body.response == "accept" else ""),
				 f"/staff/quotations/{q['id']}", user_ids=[q.get("created_by")], roles=list(MGMT))
	msg = ("Thank you! Your acceptance has been received. Our team will contact you to confirm the order."
		   if body.response == "accept" else "Thank you! We have received your request and will send a revised quotation.")
	return {"ok": True, "message": msg}


# ---------------- Orders / installations ----------------
async def create_order(q: dict, user: dict) -> dict:
	total = q["totals"]["total"]
	now = iso_now()
	order = {"id": new_id(), "ref": await next_ref("ORD"), "quotation_id": q["id"], "quotation_number": f"{q['number']} R{q['revision']}",
			 "lead_id": q.get("lead_id"), "customer_id": q["customer_id"], "customer_name": q["customer_name"],
			 "customer_mobile": q.get("customer_mobile"), "location": q.get("project_address"),
			 "specs": f"{q.get('lift_category') or ''} · {q.get('capacity') or ''} · {q.get('floors') or '-'} floors · {q.get('lifts_count') or 1} lift(s)",
			 "amount": total, "payment_milestones": [
				 {"label": "Advance (40%)", "amount": round(total * 0.4, 2), "status": "Pending", "paid_on": None},
				 {"label": "On material delivery (50%)", "amount": round(total * 0.5, 2), "status": "Pending", "paid_on": None},
				 {"label": "On handover (10%)", "amount": round(total * 0.1, 2), "status": "Pending", "paid_on": None}],
			 "expected_delivery": None, "start_date": None, "expected_completion": None,
			 "project_manager_id": user["id"], "project_manager_name": user["name"], "stage": ORDER_STAGES[0],
			 "stage_history": [{"stage": ORDER_STAGES[0], "by": user["name"], "at": now, "note": "Order created from accepted quotation"}],
			 "issues": [], "pending_activities": "", "completion": None, "compliance_docs": "", "created_at": now, "updated_at": now}
	await db.orders.insert_one(dict(order))
	await audit(user, "order_confirmed", "orders", record_ref=order["ref"], record_id=order["id"], new={"amount": total},
				customer_id=q["customer_id"], lead_id=q.get("lead_id"))
	await notify("order_confirmed", f"Order confirmed: {order['customer_name']}", f"{order['ref']} · ₹{total:,.0f}",
				 f"/staff/orders", roles=["admin", "manager"])
	return order


ORDER_FIELDS = ["expected_delivery", "start_date", "expected_completion", "payment_milestones", "pending_activities",
				"issues", "completion", "compliance_docs", "location", "project_manager_id"]


@router.get("/orders")
async def list_orders(user: dict = Depends(current_user)):
	return await db.orders.find({}, {"_id": 0}).sort("updated_at", -1).to_list(1000)


@router.patch("/orders/{oid}")
async def update_order(oid: str, body: dict, user: dict = Depends(require(*MGMT))):
	o = await db.orders.find_one({"id": oid}, {"_id": 0})
	if not o:
		raise HTTPException(404, "Order not found")
	changes = {k: v for k, v in body.items() if k in ORDER_FIELDS and o.get(k) != v}
	if "project_manager_id" in changes:
		pm = await db.users.find_one({"id": changes["project_manager_id"]}, {"_id": 0})
		changes["project_manager_name"] = pm["name"] if pm else None
	push = {}
	stage = body.get("stage")
	if stage and stage != o["stage"]:
		if stage not in ORDER_STAGES:
			raise HTTPException(400, "Invalid stage")
		changes["stage"] = stage
		push["stage_history"] = {"stage": stage, "by": user["name"], "at": iso_now(), "note": body.get("stage_note")}
	if not changes:
		return o
	changes["updated_at"] = iso_now()
	upd: dict = {"$set": changes}
	if push:
		upd["$push"] = push
	await db.orders.update_one({"id": oid}, upd)
	await audit(user, "installation_progress_updated" if stage else "order_updated", "orders", record_ref=o["ref"], record_id=oid,
				old={k: o.get(k) for k in changes if k not in ("updated_at", "project_manager_name")},
				new={k: v for k, v in changes.items() if k != "updated_at"}, comment=body.get("stage_note"),
				customer_id=o["customer_id"], lead_id=o.get("lead_id"))
	return await db.orders.find_one({"id": oid}, {"_id": 0})