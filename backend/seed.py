"""Idempotent seed: staff accounts, website content, brochures (generated PDFs), clearly-flagged SAMPLE leads.
Run: cd /app/backend && python seed.py
"""
import asyncio

from lib.auth import hash_pw
from lib.common import DEFAULT_SETTINGS, get_settings, iso_now, new_id
from lib.db import db, ensure_indexes
from lib.files import store_file, upload_local_files_to_storage
from lib.pdf import brochure_pdf
from routers.leads import create_lead

IMG = {
	"hero": "https://images.unsplash.com/photo-1573358575417-a421c842be5a?w=1400&q=80",
	"atrium": "https://images.unsplash.com/photo-1759622956247-f40069072cc7?w=1200&q=80",
	"villa": "https://images.pexels.com/photos/31387264/pexels-photo-31387264.jpeg?auto=compress&w=1200",
	"capsule": "https://images.unsplash.com/photo-1719266076518-a382624987fb?w=1200&q=80",
	"hospital": "https://images.unsplash.com/photo-1566096650255-98ba2641071e?w=1200&q=80",
	"home": "https://images.unsplash.com/photo-1616251414746-1ff204ed0318?w=1200&q=80",
	"cabin": "https://images.pexels.com/photos/8243095/pexels-photo-8243095.jpeg?auto=compress&w=1200",
}
NOTE = "Indicative — to be verified by V Tech engineering"

USERS = [
	("Ravikiran P", "admin@vtech.in", "Admin@123", "admin"),
	("Manjunath K S", "manager@vtech.in", "Manager@123", "manager"),
	("Kiran Kumar (Manager 2)", "manager2@vtech.in", "Manager@123", "manager"),
	("Priya S (Telecaller)", "priya@vtech.in", "Telecaller@123", "telecaller"),
	("Rahul M (Telecaller)", "rahul@vtech.in", "Telecaller@123", "telecaller"),
]


def product(i, name, cat, img, desc, cap, speed, floors, extra=None):
	return {"id": new_id(), "slug": name.lower().replace(" ", "-").replace("/", "-"), "name": name, "category": cat,
			"description": desc, "images": [img, IMG["cabin"]], "order": i, "published": True, "specs_verified": False,
			"capacity": cap, "speed": speed, "floors_supported": floors,
			"cabin_designs": ["Stainless steel hairline", "Mirror finish", "Wooden laminate", "Glass panel"],
			"door_types": ["Automatic centre opening", "Automatic telescopic"] + (extra or []),
			"configurations": ["Machine-room-less (MRL)", "With machine room"], "accessories": ["ARD (auto rescue device)", "Intercom", "Overload indicator", "CCTV ready"],
			"specs": [{"label": "Capacity", "value": cap}, {"label": "Speed", "value": speed},
					  {"label": "Floors supported", "value": floors}, {"label": "Note", "value": NOTE}],
			"created_at": iso_now(), "updated_at": iso_now()}


PRODUCTS = [
	product(1, "Passenger Lift", "Passenger lifts", IMG["atrium"], "Smooth, energy-efficient passenger elevators for apartments and offices.", "6–13 persons", "1.0–1.75 m/s", "Up to 20"),
	product(2, "Home Elevator", "Home elevators", IMG["home"], "Compact, elegant lifts for independent houses and villas with minimal civil work.", "3–6 persons", "0.3–0.6 m/s", "Up to 5"),
	product(3, "Hospital Stretcher Lift", "Hospital lifts", IMG["hospital"], "Spacious stretcher-friendly cabins with smooth levelling for hospitals and nursing homes.", "13–26 persons", "1.0 m/s", "Up to 15"),
	product(4, "Goods Lift", "Goods lifts", IMG["cabin"], "Heavy-duty freight lifts for warehouses, factories and commercial kitchens.", "500–3000 kg", "0.5 m/s", "Up to 10", ["Manual collapsible"]),
	product(5, "Capsule / Panoramic Lift", "Capsule lifts", IMG["capsule"], "Glass panoramic capsule lifts that become an architectural feature.", "8–13 persons", "1.0 m/s", "Up to 12"),
	product(6, "Hydraulic Lift", "Hydraulic lifts", IMG["villa"], "Hydraulic drive lifts for low-rise buildings where overhead is limited.", "4–8 persons", "0.4 m/s", "Up to 4"),
	product(7, "Commercial Lift", "Commercial lifts", IMG["hero"], "High-traffic lifts for malls, hotels and commercial complexes.", "13–20 persons", "1.5–2.0 m/s", "Up to 30"),
	product(8, "Lift Modernization", "Lift modernization and replacement", IMG["atrium"], "Upgrade old lifts with new controllers, drives, doors and cabins.", "As existing", "As designed", "As existing"),
]

PROJECTS = [
	("Whitefield Residency", "Whitefield, Bengaluru", "Apartment", "Passenger lifts", 14, 2, "atrium", "2025-08-20"),
	("Indiranagar Villa", "Indiranagar, Bengaluru", "Residential", "Home elevators", 4, 1, "home", "2025-06-10"),
	("Hebbal Multispeciality Clinic", "Hebbal, Bengaluru", "Hospital", "Hospital lifts", 6, 2, "hospital", "2025-03-05"),
	("Koramangala Business Centre", "Koramangala, Bengaluru", "Commercial", "Commercial lifts", 9, 3, "hero", "2024-12-15"),
	("Peenya Industrial Unit", "Peenya, Bengaluru", "Industrial", "Goods lifts", 3, 1, "cabin", "2024-10-01"),
	("MG Road Boutique Hotel", "MG Road, Bengaluru", "Hotel", "Capsule lifts", 7, 1, "capsule", "2024-07-22"),
]

FAQS = [
	("How long does a lift installation take?", "Typically 8–10 weeks for material delivery after advance and approved drawings, and 3–4 weeks for installation once the site is ready."),
	("Do you offer free site inspections?", "Yes. Our engineer visits your site in Bengaluru to take shaft, pit and overhead measurements at no charge."),
	("Can a lift be installed in an existing house?", "In most cases yes. Home elevators and hydraulic lifts need minimal pit and overhead. We confirm feasibility after inspection."),
	("What does an AMC cover?", "Preventive maintenance visits, breakdown attendance and safety checks. Comprehensive AMCs can also cover parts."),
	("Do you modernize old lifts?", "Yes — controller, drive, door and cabin upgrades for older lifts of most makes."),
	("Who handles statutory lift licensing?", "We assist with documentation. Actual inspection and licensing are issued by the relevant authority for each project."),
]

TESTIMONIALS = [
	("Ramesh K", "Villa owner, Indiranagar", "The home lift was installed neatly and on time. The team explained everything clearly."),
	("Dr. Shalini P", "Clinic director, Hebbal", "Very smooth stretcher lift and prompt service response."),
	("Suresh Reddy", "Builder, Whitefield", "Transparent quotation and a professional installation crew."),
]

SERVICES = [
	("New Lift Installation", "End-to-end supply and installation — design, civil guidance, erection, testing and handover."),
	("Lift Modernization", "Upgrade controllers, drives, doors and cabins to improve safety, comfort and energy use."),
	("Maintenance & AMC", "Scheduled preventive maintenance with comprehensive and non-comprehensive AMC plans."),
	("Breakdown & Repair", "Rapid response for breakdowns, door faults, noises and electrical issues."),
	("Free Site Inspection", "Engineer visit for shaft, pit and overhead measurements with a written recommendation."),
]

SAMPLE_LEADS = [
	("Anand Shetty", "9845011001", "Bengaluru", "Jayanagar", "Residential", "New lift installation", "Home elevators", 3, "Google search"),
	("Lakshmi Apartments RWA", "9845011002", "Bengaluru", "HSR Layout", "Apartment", "Existing lift replacement", "Passenger lifts", 8, "Referral"),
	("Sunrise Hospital", "9845011003", "Bengaluru", "Yelahanka", "Hospital", "New lift installation", "Hospital lifts", 6, "Phone call"),
	("Vikram Traders", "9845011004", "Bengaluru", "Peenya", "Industrial", "New lift installation", "Goods lifts", 3, "WhatsApp"),
	("Neha Gupta", "9845011005", "Bengaluru", "Sarjapur", "Residential", "Lift maintenance", "Home elevators", 2, "Company website"),
	("Greenview Hotel", "9845011006", "Bengaluru", "Hebbal", "Hotel", "Lift modernization", "Capsule lifts", 7, "Google Business Profile"),
]


async def main():
	await ensure_indexes()
	if not await db.settings.find_one({"id": "settings"}):
		await db.settings.insert_one(dict(DEFAULT_SETTINGS))
	for name, email, pw, role in USERS:
		if not await db.users.find_one({"email": email}):
			await db.users.insert_one({"id": new_id(), "name": name, "email": email, "phone": None, "role": role,
									   "password_hash": hash_pw(pw), "active": True, "created_at": iso_now()})
	if not await db.products.count_documents({}):
		await db.products.insert_many([dict(p) for p in PRODUCTS])
	if not await db.projects.count_documents({}):
		await db.projects.insert_many([{"id": new_id(), "name": n, "location": loc, "building_type": bt, "lift_category": cat,
										"floors": fl, "lifts_count": lc, "photos": [IMG[img], IMG["cabin"]],
										"description": f"{lc} {cat.lower()} installed for a {bt.lower()} building with {fl} floors.",
										"completion_date": d, "specs": NOTE, "testimonial": "", "published": True,
										"permission_to_publish": True, "is_sample": True, "created_at": iso_now()}
									   for n, loc, bt, cat, fl, lc, img, d in PROJECTS])
	if not await db.faqs.count_documents({}):
		await db.faqs.insert_many([{"id": new_id(), "question": q, "answer": a, "order": i, "published": True} for i, (q, a) in enumerate(FAQS)])
	if not await db.testimonials.count_documents({}):
		await db.testimonials.insert_many([{"id": new_id(), "name": n, "role": r, "quote": q, "rating": 5, "published": True, "is_sample": True}
										   for n, r, q in TESTIMONIALS])
	if not await db.services.count_documents({}):
		await db.services.insert_many([{"id": new_id(), "title": t, "description": d, "order": i, "published": True} for i, (t, d) in enumerate(SERVICES)])
	if not await db.brochures.count_documents({}):
		settings = await get_settings()
		for title, desc, prods in [("V Tech Complete Lift Catalogue", "All lift categories, cabin finishes and options.", PRODUCTS)]:
			fid = new_id()
			pdf = brochure_pdf(title, prods, settings)
			await store_file(fid, pdf, "application/pdf")
			await db.files.insert_one({"id": fid, "name": title.replace(" ", "-") + ".pdf", "content_type": "application/pdf",
									   "size": len(pdf), "entity_type": "brochure", "entity_id": "",
									   "public": False, "uploaded_by": "seed", "at": iso_now()})
			await db.brochures.insert_one({"id": new_id(), "title": title, "description": desc, "file_id": fid,
										   "cover_image": prods[0]["images"][0], "published": True, "created_at": iso_now()})
	if not await db.leads.count_documents({}):
		for name, mob, city, area, bt, req, lt, fl, src in SAMPLE_LEADS:
			await create_lead({"name": name, "mobile": mob, "city": city, "area": area, "building_type": bt, "requirement": req,
							   "lift_type": lt, "floors": fl, "lifts_count": 1, "source": src, "is_sample": True,
							   "additional_requirements": "SAMPLE RECORD for testing"}, enquiry_type="enquiry", actor=None)
	copied = await upload_local_files_to_storage()
	if copied:
		print(f"copied {copied} file(s) from backend/uploads to Supabase Storage")
	print("seed complete")


if __name__ == "__main__":
	asyncio.run(main())