"""Leads, interactions, follow-ups, positive-lead approval workflow."""
import re

from fastapi import APIRouter, Depends, HTTPException

from lib.auth import MGMT, STAFF, current_user, is_mgmt, require
from lib.common import (CLOSED_STATUSES, LEAD_STATUSES, POSITIVE, audit, clean, get_settings, iso_now, new_id,
						next_ref, norm_iso, norm_mobile, notify)
from lib.db import db
from models.schemas import (AssignIn, BulkReassignIn, ChecklistIn, CommentIn, DecisionIn, DuplicateIn, FollowupDone, FollowupIn,
							InteractionIn, Lead, LeadCreate, LeadPage, LeadUpdate, PositiveIn, StatusIn)

router = APIRouter()
TELECALLER_BLOCKED = {"Approved", "Quotation Sent", "Negotiation", "Won", "Site Inspection Scheduled",
					  "Site Inspection Completed", POSITIVE}


async def upsert_customer(data: dict, actor: dict | None) -> dict:
	"""Match on normalised mobile so repeat enquiries attach to one customer record."""
	mobile = norm_mobile(data["mobile"])
	cust = await db.customers.find_one({"mobile": mobile}, {"_id": 0})
	if cust:
		fill = {k: data.get(k) for k in ("email", "city", "area", "address") if data.get(k) and not cust.get(k)}
		if fill:
			fill["updated_at"] = iso_now()
			await db.customers.update_one({"id": cust["id"]}, {"$set": fill})
			cust.update(fill)
		return cust
	now = iso_now()
	cust = {"id": new_id(), "ref": await next_ref("CUS"), "name": data["name"].strip(), "mobile": mobile,
			"email": data.get("email"), "city": data.get("city"), "area": data.get("area"),
			"address": data.get("address"), "buildings": [], "is_sample": data.get("is_sample", False),
			"created_at": now, "updated_at": now}
	await db.customers.insert_one(dict(cust))
	await audit(actor, "customer_created", "customers", record_ref=cust["ref"], record_id=cust["id"],
				customer_id=cust["id"])
	return cust


async def pick_telecaller() -> dict | None:
	tcs = await db.users.find({"role": "telecaller", "active": True}, {"_id": 0}).sort("created_at", 1).to_list(100)
	if not tcs:
		return None
	c = await db.counters.find_one_and_update({"_id": "round_robin"}, {"$inc": {"n": 1}}, upsert=True,
											  return_document=True)
	return tcs[(c["n"] - 1) % len(tcs)]


async def create_lead(data: dict, *, enquiry_type: str, actor: dict | None) -> dict:
	cust = await upsert_customer(data, actor)
	dup = await db.leads.find_one({"customer_id": cust["id"], "archived": False,
								   "status": {"$nin": list(CLOSED_STATUSES)}}, {"ref": 1})
	assignee = None
	if data.get("assigned_to"):
		assignee = await db.users.find_one({"id": data["assigned_to"], "active": True}, {"_id": 0})
	elif actor and actor["role"] == "telecaller":
		assignee = actor
	elif (await get_settings())["auto_assign"]:
		assignee = await pick_telecaller()
	now = iso_now()
	fields = ["name", "email", "city", "area", "address", "building_type", "requirement", "floors", "lifts_count",
			  "construction_status", "lift_type", "additional_requirements", "preferred_callback_time", "campaign"]
	lead = {"id": new_id(), "ref": await next_ref("ENQ"), "customer_id": cust["id"],
			"mobile": cust["mobile"], **{k: data.get(k) for k in fields},
			"source": data.get("source") or "Company website", "enquiry_type": enquiry_type,
			"status": "Assigned" if assignee else "New",
			"assigned_to": assignee["id"] if assignee else None, "assigned_name": assignee["name"] if assignee else None,
			"created_by": actor["id"] if actor else None, "created_by_name": actor["name"] if actor else "Website",
			"approval": None, "approval_history": [], "status_history": [],
			"assignment_history": ([{"to": assignee["id"], "to_name": assignee["name"], "by": actor["name"] if actor else "Auto-assign",
									 "at": now, "reason": "Initial assignment"}] if assignee else []),
			"possible_duplicate": bool(dup), "duplicate_of": dup["ref"] if dup else None, "archived": False,
			"next_followup_at": None, "last_contacted_at": None, "is_sample": data.get("is_sample", False),
			"attachments": [], "created_at": now, "updated_at": now}
	await db.leads.insert_one(dict(lead))
	await audit(actor, "lead_created", "leads", record_ref=lead["ref"], record_id=lead["id"],
				new={"source": lead["source"], "type": enquiry_type, "assigned_to": lead["assigned_name"]},
				customer_id=cust["id"], lead_id=lead["id"])
	await notify("new_enquiry", f"New {enquiry_type}: {lead['name']}", f"{lead['ref']} · {lead.get('city') or ''}",
				 f"/staff/leads/{lead['id']}", roles=list(MGMT))
	if assignee:
		await notify("lead_assigned", f"Lead assigned: {lead['name']}", lead["ref"], f"/staff/leads/{lead['id']}",
					 user_ids=[assignee["id"]])
	return lead


async def get_scoped_lead(lead_id: str, user: dict) -> dict:
	lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
	if not lead:
		raise HTTPException(404, "Lead not found")
	if user["role"] == "telecaller" and lead.get("assigned_to") != user["id"]:
		raise HTTPException(403, "This lead is not assigned to you")
	return lead


async def set_status(lead: dict, status: str, user: dict, comment: str | None = None, extra: dict | None = None):
	now = iso_now()
	upd = {"status": status, "updated_at": now, **(extra or {})}
	entry = {"from": lead["status"], "to": status, "by": user["name"], "at": now, "comment": comment}
	await db.leads.update_one({"id": lead["id"]}, {"$set": upd, "$push": {"status_history": entry}})
	await audit(user, "lead_status_changed", "leads", record_ref=lead["ref"], record_id=lead["id"],
				old={"status": lead["status"]}, new={"status": status}, comment=comment,
				customer_id=lead["customer_id"], lead_id=lead["id"])


@router.get("/leads", response_model=LeadPage)
async def list_leads(q: str | None = None, status: str | None = None, assigned_to: str | None = None,
					 source: str | None = None, followup: str | None = None, archived: bool = False,
					 approval: str | None = None, page: int = 1, page_size: int = 20,
					 user: dict = Depends(current_user)):
	flt: dict = {"archived": archived}
	if archived and user["role"] != "admin":
		raise HTTPException(403, "Only administrators can view archived leads")
	if user["role"] == "telecaller":
		flt["assigned_to"] = user["id"]
	elif assigned_to:
		flt["assigned_to"] = None if assigned_to == "unassigned" else assigned_to
	if status:
		flt["status"] = status
	if source:
		flt["source"] = source
	if approval:
		flt["approval.state"] = approval
	if q:
		rx = {"$regex": re.escape(q.strip()), "$options": "i"}
		flt["$or"] = [{"name": rx}, {"mobile": rx}, {"ref": rx}, {"city": rx}, {"area": rx}]
	now = iso_now()
	if followup == "overdue":
		flt["next_followup_at"] = {"$ne": None, "$lt": now}
	elif followup == "today":
		flt["next_followup_at"] = {"$gte": now[:10], "$lt": now[:10] + "T23:59:59Z"}
	page_size = max(1, min(page_size, 100))
	total = await db.leads.count_documents(flt)
	docs = await db.leads.find(flt, {"_id": 0}).sort("updated_at", -1).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
	return LeadPage(items=[Lead(**d) for d in docs], total=total)


@router.post("/leads", response_model=Lead)
async def add_lead(body: LeadCreate, user: dict = Depends(require(*STAFF))):
	data = body.model_dump()
	if user["role"] == "telecaller":
		data["assigned_to"] = None
	lead = await create_lead(data, enquiry_type="manual", actor=user)
	return Lead(**lead)


@router.get("/leads/{lead_id}")
async def lead_detail(lead_id: str, user: dict = Depends(current_user)):
	lead = await get_scoped_lead(lead_id, user)
	lid = {"lead_id": lead_id}
	return {
		"lead": Lead(**lead).model_dump(),
		"customer": await db.customers.find_one({"id": lead["customer_id"]}, {"_id": 0}),
		"interactions": await db.interactions.find(lid, {"_id": 0}).sort("at", -1).to_list(500),
		"followups": await db.followups.find(lid, {"_id": 0}).sort("due_at", -1).to_list(200),
		"inspections": await db.inspections.find(lid, {"_id": 0}).sort("created_at", -1).to_list(50),
		"quotations": await db.quotations.find(lid, {"_id": 0, "number": 1, "id": 1, "revision": 1, "status": 1,
													 "totals": 1, "updated_at": 1}).to_list(50),
		"files": await db.files.find({"entity_type": "lead", "entity_id": lead_id}, {"_id": 0, "path": 0}).to_list(100),
		"history": await db.audit_logs.find(lid, {"_id": 0}).sort("at", -1).to_list(300),
	}


@router.patch("/leads/{lead_id}", response_model=Lead)
async def update_lead(lead_id: str, body: LeadUpdate, user: dict = Depends(current_user)):
	lead = await get_scoped_lead(lead_id, user)
	changes = {k: v for k, v in body.model_dump(exclude_unset=True).items() if lead.get(k) != v}
	if changes:
		changes["updated_at"] = iso_now()
		await db.leads.update_one({"id": lead_id}, {"$set": changes})
		await audit(user, "lead_edited", "leads", record_ref=lead["ref"], record_id=lead_id,
					old={k: lead.get(k) for k in changes if k != "updated_at"},
					new={k: v for k, v in changes.items() if k != "updated_at"},
					customer_id=lead["customer_id"], lead_id=lead_id)
	return Lead(**await db.leads.find_one({"id": lead_id}, {"_id": 0}))


@router.post("/leads/{lead_id}/status", response_model=Lead)
async def change_status(lead_id: str, body: StatusIn, user: dict = Depends(current_user)):
	lead = await get_scoped_lead(lead_id, user)
	if body.status not in LEAD_STATUSES:
		raise HTTPException(400, "Unknown status")
	if body.status == POSITIVE:
		raise HTTPException(400, "Use 'Submit positive lead' to send a lead for approval")
	if body.status == "Approved" and user["role"] != "admin":
		raise HTTPException(403, "Leads are approved through the manager approval queue")
	if user["role"] == "telecaller" and body.status in TELECALLER_BLOCKED:
		raise HTTPException(403, f"Telecallers cannot set status '{body.status}'")
	if body.status in ("Lost", "Not Interested", "Invalid / Duplicate") and not body.comment:
		raise HTTPException(400, "Please add a reason when closing a lead")
	await set_status(lead, body.status, user, body.comment)
	return Lead(**await db.leads.find_one({"id": lead_id}, {"_id": 0}))


@router.post("/leads/{lead_id}/assign", response_model=Lead)
async def assign_lead(lead_id: str, body: AssignIn, user: dict = Depends(require(*MGMT))):
	lead = await get_scoped_lead(lead_id, user)
	to = await db.users.find_one({"id": body.user_id, "active": True}, {"_id": 0})
	if not to:
		raise HTTPException(400, "Select an active employee")
	now = iso_now()
	entry = {"from": lead.get("assigned_name"), "to": to["id"], "to_name": to["name"], "by": user["name"], "at": now,
			 "reason": body.reason}
	upd = {"assigned_to": to["id"], "assigned_name": to["name"], "updated_at": now}
	if lead["status"] == "New":
		upd["status"] = "Assigned"
	await db.leads.update_one({"id": lead_id}, {"$set": upd, "$push": {"assignment_history": entry}})
	await db.followups.update_many({"lead_id": lead_id, "done": False}, {"$set": {"assigned_to": to["id"], "assigned_name": to["name"]}})
	await audit(user, "lead_reassigned" if lead.get("assigned_to") else "lead_assigned", "leads", record_ref=lead["ref"],
				record_id=lead_id, old={"assigned_to": lead.get("assigned_name")}, new={"assigned_to": to["name"]},
				comment=body.reason, customer_id=lead["customer_id"], lead_id=lead_id)
	await notify("lead_assigned", f"Lead assigned: {lead['name']}", lead["ref"], f"/staff/leads/{lead_id}", user_ids=[to["id"]])
	return Lead(**await db.leads.find_one({"id": lead_id}, {"_id": 0}))


@router.post("/leads/bulk-reassign")
async def bulk_reassign(body: BulkReassignIn, user: dict = Depends(require(*MGMT))):
	to = await db.users.find_one({"id": body.to_user, "active": True}, {"_id": 0})
	if not to:
		raise HTTPException(400, "Select an active employee")
	leads = await db.leads.find({"assigned_to": body.from_user, "status": {"$nin": list(CLOSED_STATUSES)}}, {"_id": 0}).to_list(5000)
	for lead in leads:
		await assign_lead(lead["id"], AssignIn(user_id=to["id"], reason=body.reason or "Bulk reassignment"), user)
	return {"moved": len(leads)}


@router.post("/leads/{lead_id}/interactions")
async def add_interaction(lead_id: str, body: InteractionIn, user: dict = Depends(current_user)):
	lead = await get_scoped_lead(lead_id, user)
	now = iso_now()
	doc = {"id": new_id(), "lead_id": lead_id, "customer_id": lead["customer_id"], **body.model_dump(),
		   "by": user["id"], "by_name": user["name"], "at": now}
	await db.interactions.insert_one(dict(doc))
	upd = {"updated_at": now}
	if body.kind != "note":
		upd["last_contacted_at"] = now
	await db.leads.update_one({"id": lead_id}, {"$set": upd})
	await audit(user, "interaction_added", "leads", record_ref=lead["ref"], record_id=lead_id,
				new={"kind": body.kind, "answered": body.answered, "outcome": body.outcome},
				customer_id=lead["customer_id"], lead_id=lead_id)
	if body.kind != "note" and body.answered and lead["status"] in ("New", "Assigned", "First Call Pending"):
		await set_status(lead, "Contacted", user, "Auto: customer answered call")
	elif body.kind == "call" and body.answered is False and lead["status"] in ("New", "Assigned"):
		await set_status(lead, "First Call Pending", user, "Auto: call not answered")
	return clean(doc)


async def _refresh_next_followup(lead_id: str):
	nxt = await db.followups.find({"lead_id": lead_id, "done": False}).sort("due_at", 1).to_list(1)
	await db.leads.update_one({"id": lead_id}, {"$set": {"next_followup_at": nxt[0]["due_at"] if nxt else None}})


@router.post("/leads/{lead_id}/followups")
async def add_followup(lead_id: str, body: FollowupIn, user: dict = Depends(current_user)):
	lead = await get_scoped_lead(lead_id, user)
	try:
		due = norm_iso(body.due_at)
	except ValueError:
		raise HTTPException(400, "Invalid follow-up date/time")
	owner_id = body.assigned_to if (body.assigned_to and is_mgmt(user)) else (lead.get("assigned_to") or user["id"])
	owner = await db.users.find_one({"id": owner_id}, {"_id": 0, "name": 1})
	doc = {"id": new_id(), "lead_id": lead_id, "lead_ref": lead["ref"], "lead_name": lead["name"],
		   "customer_id": lead["customer_id"], "due_at": due, "kind": body.kind, "notes": body.notes,
		   "assigned_to": owner_id, "assigned_name": owner["name"] if owner else None, "done": False,
		   "outcome": None, "notified": False, "created_by": user["name"], "created_at": iso_now()}
	await db.followups.insert_one(dict(doc))
	await _refresh_next_followup(lead_id)
	await audit(user, "followup_created", "followups", record_ref=lead["ref"], record_id=doc["id"],
				new={"due_at": due, "kind": body.kind}, customer_id=lead["customer_id"], lead_id=lead_id)
	return clean(doc)


@router.post("/followups/{fid}/complete")
async def complete_followup(fid: str, body: FollowupDone, user: dict = Depends(current_user)):
	f = await db.followups.find_one({"id": fid}, {"_id": 0})
	if not f:
		raise HTTPException(404, "Follow-up not found")
	await get_scoped_lead(f["lead_id"], user)
	if f["done"]:
		raise HTTPException(400, "Follow-up already completed")
	await db.followups.update_one({"id": fid}, {"$set": {"done": True, "outcome": body.outcome, "done_at": iso_now(),
														 "done_by": user["name"]}})
	await _refresh_next_followup(f["lead_id"])
	await audit(user, "followup_completed", "followups", record_ref=f["lead_ref"], record_id=fid,
				comment=body.outcome, customer_id=f["customer_id"], lead_id=f["lead_id"])
	return {"ok": True}


@router.get("/followups")
async def list_followups(state: str = "pending", user: dict = Depends(current_user)):
	flt: dict = {}
	if user["role"] == "telecaller":
		flt["assigned_to"] = user["id"]
	now = iso_now()
	if state == "done":
		flt["done"] = True
	else:
		flt["done"] = False
		if state == "overdue":
			flt["due_at"] = {"$lt": now}
		elif state == "today":
			flt["due_at"] = {"$gte": now[:10], "$lte": now[:10] + "T23:59:59Z"}
	docs = await db.followups.find(flt, {"_id": 0}).sort("due_at", 1 if state != "done" else -1).to_list(500)
	for d in docs:
		d["overdue"] = (not d["done"]) and d["due_at"] < now
	return docs


@router.post("/leads/{lead_id}/submit-positive", response_model=Lead)
async def submit_positive(lead_id: str, body: PositiveIn, user: dict = Depends(current_user)):
	lead = await get_scoped_lead(lead_id, user)
	if lead.get("approval") and lead["approval"].get("state") == "pending":
		raise HTTPException(400, "This lead is already awaiting approval")
	now = iso_now()
	approval = {"state": "pending", "submitted_by": user["id"], "submitted_by_name": user["name"], "submitted_at": now,
				"summary": body.requirement_summary, "notes": body.notes}
	await db.interactions.insert_one({"id": new_id(), "lead_id": lead_id, "customer_id": lead["customer_id"], "kind": "note",
									  "answered": None, "outcome": "Positive lead submitted", "notes": body.notes,
									  "by": user["id"], "by_name": user["name"], "at": now})
	await db.leads.update_one({"id": lead_id}, {"$set": {"lift_type": body.lift_type, "floors": body.floors,
														 "lifts_count": body.lifts_count, "requirement": body.requirement_summary,
														 "approval": approval},
												"$push": {"approval_history": {**approval, "event": "submitted"}}})
	await set_status(lead, POSITIVE, user, "Submitted for manager approval")
	await audit(user, "positive_lead_submitted", "approvals", record_ref=lead["ref"], record_id=lead_id,
				new={"lift_type": body.lift_type, "floors": body.floors}, customer_id=lead["customer_id"], lead_id=lead_id)
	await notify("positive_submitted", f"Positive lead awaiting approval: {lead['name']}", f"{lead['ref']} by {user['name']}",
				 f"/staff/leads/{lead_id}", roles=list(MGMT))
	return Lead(**await db.leads.find_one({"id": lead_id}, {"_id": 0}))


@router.post("/leads/{lead_id}/decision", response_model=Lead)
async def decide(lead_id: str, body: DecisionIn, user: dict = Depends(require(*MGMT))):
	lead = await get_scoped_lead(lead_id, user)
	ap = lead.get("approval") or {}
	if ap.get("state") != "pending":
		raise HTTPException(400, "This lead is not awaiting approval")
	if ap.get("submitted_by") == user["id"] and user["role"] != "admin":
		raise HTTPException(403, "You cannot approve a lead you submitted. Another manager or admin must decide.")
	if body.decision in ("reject", "request_info") and not (body.comment or "").strip():
		raise HTTPException(400, "A comment is required for rejection or information requests")
	state = {"approve": "approved", "reject": "rejected", "request_info": "info_requested"}[body.decision]
	now = iso_now()
	new_ap = {**ap, "state": state, "decided_by": user["id"], "decided_by_name": user["name"], "decided_at": now,
			  "comment": body.comment}
	await db.leads.update_one({"id": lead_id}, {"$set": {"approval": new_ap},
												"$push": {"approval_history": {"event": state, "by": user["name"], "at": now,
																			   "comment": body.comment}}})
	nxt = {"approve": "Approved", "reject": "Follow-up Required", "request_info": "Interested"}[body.decision]
	await set_status(lead, nxt, user, f"Manager decision: {state}. {body.comment or ''}".strip())
	await audit(user, f"lead_{state}", "approvals", record_ref=lead["ref"], record_id=lead_id, old={"approval": "pending"},
				new={"approval": state}, comment=body.comment, customer_id=lead["customer_id"], lead_id=lead_id)
	await notify("lead_decision", f"Lead {state.replace('_', ' ')}: {lead['name']}", body.comment or "",
				 f"/staff/leads/{lead_id}", user_ids=[ap.get("submitted_by")])
	return Lead(**await db.leads.find_one({"id": lead_id}, {"_id": 0}))


@router.put("/leads/{lead_id}/checklist", response_model=Lead)
async def save_checklist(lead_id: str, body: ChecklistIn, user: dict = Depends(current_user)):
	lead = await get_scoped_lead(lead_id, user)
	valid = {q["id"] for q in (await get_settings())["call_checklist"]}
	answers = {k: v.strip()[:1000] for k, v in body.answers.items() if k in valid and isinstance(v, str)}
	old = lead.get("checklist_answers") or {}
	changed = {k: v for k, v in answers.items() if old.get(k, "") != v}
	if changed:
		now = iso_now()
		await db.leads.update_one({"id": lead_id}, {"$set": {"checklist_answers": {**old, **answers}, "checklist_updated_at": now,
															 "checklist_updated_by": user["name"], "updated_at": now}})
		await audit(user, "call_checklist_updated", "leads", record_ref=lead["ref"], record_id=lead_id,
					old={k: old.get(k) for k in changed}, new=changed, customer_id=lead["customer_id"], lead_id=lead_id)
	return Lead(**await db.leads.find_one({"id": lead_id}, {"_id": 0}))


@router.post("/leads/{lead_id}/mark-duplicate", response_model=Lead)
async def mark_duplicate(lead_id: str, body: DuplicateIn, user: dict = Depends(require(*MGMT))):
	lead = await get_scoped_lead(lead_id, user)
	orig = await db.leads.find_one({"ref": body.duplicate_of.strip().upper()})
	if not orig or orig["id"] == lead_id:
		raise HTTPException(400, "Original lead reference not found")
	await db.leads.update_one({"id": lead_id}, {"$set": {"duplicate_of": orig["ref"], "possible_duplicate": True}})
	await set_status(lead, "Invalid / Duplicate", user, f"Duplicate of {orig['ref']}. {body.comment or ''}")
	return Lead(**await db.leads.find_one({"id": lead_id}, {"_id": 0}))


@router.post("/leads/{lead_id}/archive", response_model=Lead)
async def archive_lead(lead_id: str, body: CommentIn, user: dict = Depends(require("admin"))):
	return await _archive(lead_id, True, body.comment, user)


@router.post("/leads/{lead_id}/restore", response_model=Lead)
async def restore_lead(lead_id: str, body: CommentIn, user: dict = Depends(require("admin"))):
	return await _archive(lead_id, False, body.comment, user)


async def _archive(lead_id: str, archived: bool, comment: str | None, user: dict):
	lead = await db.leads.find_one({"id": lead_id}, {"_id": 0})
	if not lead:
		raise HTTPException(404, "Lead not found")
	await db.leads.update_one({"id": lead_id}, {"$set": {"archived": archived, "updated_at": iso_now()}})
	await audit(user, "record_archived" if archived else "record_restored", "leads", record_ref=lead["ref"], record_id=lead_id,
				old={"archived": lead.get("archived")}, new={"archived": archived}, comment=comment,
				customer_id=lead["customer_id"], lead_id=lead_id)
	return Lead(**await db.leads.find_one({"id": lead_id}, {"_id": 0}))