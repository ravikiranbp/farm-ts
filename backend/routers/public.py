"""Public website: content, enquiries (enquiry/callback/inspection/brochure), service requests."""
from fastapi import APIRouter, HTTPException

from lib.common import audit, get_settings, iso_now, new_id, next_ref, notify
from lib.db import db
from lib.files import file_response
from models.schemas import EnquiryIn, EnquiryResult, ServiceRequestIn
from routers.leads import create_lead, upsert_customer

router = APIRouter(prefix="/public")
PUBLIC_SETTINGS = ["company_name", "tagline", "city", "address", "phone", "whatsapp", "email", "about"]
PUB = {"published": True}


@router.get("/content")
async def content():
	s = await get_settings()
	proj = {"_id": 0}
	return {
		"company": {k: s.get(k) for k in PUBLIC_SETTINGS},
		"products": await db.products.find(PUB, proj).sort("order", 1).to_list(200),
		"projects": await db.projects.find({**PUB, "permission_to_publish": True}, proj).sort("completion_date", -1).to_list(200),
		"testimonials": await db.testimonials.find(PUB, proj).to_list(100),
		"faqs": await db.faqs.find(PUB, proj).sort("order", 1).to_list(200),
		"brochures": await db.brochures.find(PUB, {"_id": 0, "file_id": 0}).to_list(100),
		"services": await db.services.find(PUB, proj).sort("order", 1).to_list(50),
	}


@router.get("/products/{slug}")
async def product(slug: str):
	p = await db.products.find_one({"slug": slug, "published": True}, {"_id": 0})
	if not p:
		raise HTTPException(404, "Product not found")
	related = await db.projects.find({"lift_category": p["category"], "published": True, "permission_to_publish": True},
									 {"_id": 0}).to_list(6)
	return {"product": p, "related_projects": related}


@router.post("/enquiries", response_model=EnquiryResult)
async def submit_enquiry(body: EnquiryIn):
	data = body.model_dump()
	brochure = None
	if body.enquiry_type == "brochure":
		brochure = await db.brochures.find_one({"id": body.brochure_id, "published": True}, {"_id": 0})
		if not brochure:
			raise HTTPException(400, "Please choose a valid brochure")
		data["source"] = data.get("source") or "Brochure download"
		data["additional_requirements"] = f"Requested brochure: {brochure['title']}"
	if body.enquiry_type == "inspection" and body.preferred_date:
		data["additional_requirements"] = f"Free site inspection requested for {body.preferred_date}. " + (data.get("additional_requirements") or "")
	if body.enquiry_type == "callback":
		data["requirement"] = data.get("requirement") or "Callback request"
	data["source"] = data.get("source") or "Company website"
	lead = await create_lead(data, enquiry_type=body.enquiry_type, actor=None)
	url = None
	if brochure:
		dl = {"id": new_id(), "brochure_id": brochure["id"], "brochure_title": brochure["title"], "lead_id": lead["id"],
			  "lead_ref": lead["ref"], "customer_id": lead["customer_id"], "name": lead["name"], "mobile": lead["mobile"],
			  "at": iso_now()}
		await db.brochure_downloads.insert_one(dict(dl))
		url = f"/api/public/brochures/download/{dl['id']}"
	msg = {"enquiry": "Thank you! Our team will contact you shortly.",
		   "callback": "Callback requested. We will call you at your preferred time.",
		   "inspection": "Site inspection request received. We will confirm the visit by phone.",
		   "brochure": "Thank you! Your brochure download is ready."}[body.enquiry_type]
	return EnquiryResult(reference=lead["ref"], message=msg, download_url=url)


@router.get("/brochures/download/{dl_id}")
async def download_brochure(dl_id: str):
	dl = await db.brochure_downloads.find_one({"id": dl_id})
	if not dl:
		raise HTTPException(404, "Download link not found. Please submit your details again.")
	b = await db.brochures.find_one({"id": dl["brochure_id"]})
	f = await db.files.find_one({"id": b.get("file_id")}) if b else None
	if not f:
		raise HTTPException(404, "Brochure file is not available yet")
	await db.brochure_downloads.update_one({"id": dl_id}, {"$inc": {"downloads": 1}})
	return await file_response(f)


@router.get("/files/{fid}")
async def public_file(fid: str):
	f = await db.files.find_one({"id": fid, "public": True})
	if not f:
		raise HTTPException(404, "File not found")
	return await file_response(f, download=False)


@router.post("/service-requests", response_model=EnquiryResult)
async def public_service_request(body: ServiceRequestIn):
	sr = await create_service_request(body.model_dump(), None)
	return EnquiryResult(reference=sr["ref"], message="Service request registered. Our service team will contact you.")


async def create_service_request(data: dict, actor: dict | None) -> dict:
	cust = await upsert_customer({"name": data["name"], "mobile": data["mobile"], "email": data.get("email"),
								  "address": data.get("address")}, actor)
	now = iso_now()
	sr = {"id": new_id(), "ref": await next_ref("SRV"), "customer_id": cust["id"], "name": data["name"],
		  "mobile": cust["mobile"], "address": data.get("address"), "lift_ref": data.get("lift_ref"),
		  "issue_type": data.get("issue_type"), "description": data.get("description"),
		  "priority": data.get("priority", "Normal"), "preferred_time": data.get("preferred_time"),
		  "status": "Open", "assigned_to": None, "assigned_name": None, "visit_at": None, "work_done": None,
		  "parts_replaced": None, "customer_confirmed": False, "notes": [], "source": "Website" if not actor else "Staff",
		  "created_at": now, "updated_at": now}
	await db.service_requests.insert_one(dict(sr))
	await audit(actor, "service_request_created", "service", record_ref=sr["ref"], record_id=sr["id"], customer_id=cust["id"])
	await notify("service_request", f"Service request ({sr['priority']}): {sr['name']}", f"{sr['ref']} · {sr['issue_type']}",
				 "/staff/service", roles=["admin", "manager"])
	return sr