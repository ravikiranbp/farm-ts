"""Quotation master data: default cover letter, specs, terms, clauses and material catalogue (editable by admin/manager)."""
import copy

from lib.db import db

DEFAULT_QUOTE_DEFAULTS: dict = {
	"cover_subject": "Proposal for Supply, Installation, Testing & Commissioning of Elevator",
	"cover_body": [
		"V Tech Elevators is a fast-growing company in the Indian elevator industry, managed by experienced professionals. "
		"We provide complete vertical transportation solutions through a wide range of passenger and freight elevators for "
		"residential, commercial, shopping complex, hospital, industrial and institutional use, with short delivery and "
		"installation periods.",
		"Our team of professionally and technically qualified personnel works at every level with a single objective: "
		"complete customer satisfaction.",
		"Quality and safety are at the heart of everything we do, and our continued focus on both has resulted in more "
		"reliable and efficient elevators for our customers.",
	],
	"cover_points": [
		"The preparatory works to be completed from your side are listed in this proposal.",
		"On acceptance of this proposal, we will be pleased to meet you at a date and time convenient to you.",
	],
	"cover_closing": "We look forward to your valued enquiries. Please feel free to contact us to build an innovative and "
					 "lasting business relationship.",
	"tech_specs": [
		{"key": "elevator_type", "label": "Type of Elevator", "value": "MRL (Machine Room Less)"},
		{"key": "elevator_count", "label": "Number of Elevators", "value": "1 No."},
		{"key": "capacity", "label": "Capacity", "value": "6 Persons – 408 Kg"},
		{"key": "speed", "label": "Speed", "value": "1.0 m/s"},
		{"key": "drive", "label": "Type of Drive", "value": "V3F Drive"},
		{"key": "controller", "label": "Controller", "value": "Microprocessor-Based Controller"},
		{"key": "travel", "label": "Travel & Floor Rise", "value": "12 Meters, 3 m Floor Rise"},
		{"key": "floors", "label": "Number of Floors", "value": "G + 3"},
		{"key": "stops", "label": "Number of Stops & Openings", "value": "4 Landings / 4 Openings"},
		{"key": "required_well", "label": "Required Well Size (W x D)", "value": "1600 mm x 1700 mm"},
		{"key": "available_well", "label": "Available Well Size (W x D)", "value": "1500 mm x 1500 mm"},
		{"key": "car_size", "label": "Car Size (W x D)", "value": "1100 mm x 1000 mm"},
		{"key": "power_supply", "label": "Power Supply", "value": "415 V, 3-Phase, 50 Hz AC"},
		{"key": "light_supply", "label": "Light Supply", "value": "220 V, Single-Phase, 50 Hz AC"},
		{"key": "pit_depth", "label": "Pit Depth", "value": "1450 mm"},
		{"key": "car_ceiling", "label": "Car Ceiling", "value": "Stainless Steel Ceiling with LED Lights"},
		{"key": "car_panels", "label": "Car Panels", "value": "Stainless Steel (Hairline Finish)"},
		{"key": "car_flooring", "label": "Car Flooring", "value": "Anti-Skid PVC Flooring"},
		{"key": "entrances", "label": "Number of Entrances", "value": "One Location, Front Opening"},
		{"key": "car_entrance", "label": "Car Entrance", "value": "SS Auto Center Opening Door"},
		{"key": "landing_entrance", "label": "Landing Entrance", "value": "SS Auto Center Opening Door"},
		{"key": "clear_opening", "label": "Clear Opening", "value": "800 mm x 2000 mm"},
		{"key": "indicator", "label": "Indicator", "value": "Digital Position Indicators & Direction Arrows at All Landings"},
		{"key": "features", "label": "Features", "value": "Emergency Light & Alarm Bell with Battery Backup, SS COP in Car & "
																 "LOP at Each Landing, LED Cabin Lights, Ventilation Fan"},
	],
	"price_description": "Supply of materials, installation, testing & commissioning, including transportation and motor shifting charges",
	"payment_schedule": [
		{"pct": 40, "description": "Mobilisation advance along with the order / contract"},
		{"pct": 55, "description": "Against delivery of first-stage materials at site"},
		{"pct": 5, "description": "On completion of the lift installation work"},
	],
	"delivery_timeline": "8 to 10 weeks from the date of agreement and receipt of advance.",
	"installation_timeline": "3 to 4 weeks after delivery of materials and site readiness.",
	"warranty": "2 years from the date of handover of the elevator (1-year guarantee on all electrical and electronic equipment).",
	"price_note": "The preparatory works listed in this proposal are not included in the above price.",
	"builder_side_work": [
		"Lift entrance architraves.",
		"Electrical panel board in the machine room with 3-phase and single-phase power supply cables terminated in the "
		"machine room, and an earth pit with earth leads terminated on a bus bar in the machine room, as per our requirements.",
		"Bulkhead light fittings inside the lift shaft.",
		"All other civil and electrical works, lift inspectorate approvals and licences, and scaffolding.",
		"The 3-phase supply cable must be routed outside the lift shaft, with an independent 4-pole incoming MCB.",
	],
	"contract_conditions": [
		"This quotation is valid for 30 days from the date of the proposal; thereafter it is subject to change without notice.",
		"If the client cancels the order for any reason, compensation shall be payable to us as follows: 10% of the contract "
		"value if cancelled before approval of drawings; 25% if cancelled within 30 days of approval of the general "
		"arrangement (GA) drawings; 55% if cancelled after 60 days of approval of the GA drawings but before delivery of "
		"materials; and 90% if cancelled after delivery of materials at site.",
		"We shall not be responsible for any loss of, or damage to, lift materials caused by the negligence of others.",
	],
	"preparatory_intro": "The customer agrees to carry out the following at their own cost:",
	"preparatory_work": [
		"Furnish all data required for the performance of this contract within two weeks of acceptance of this proposal (or sooner if required).",
		"Design and provide a properly framed and enclosed lift hoistway that complies with statutory requirements, including "
		"any extension above the roof, capable of withstanding the forces and loads resulting from use of the lift. The lift "
		"shaft must be lit, treated and painted to minimise the accumulation and circulation of dust.",
		"Provide a lift pit of the proper statutory depth below the lowest landing, with suitable drainage and waterproofing "
		"where required, and a steel ladder for access to the pit.",
		"Provide a properly lit and ventilated fireproof machine room (where applicable) of sufficient size for our "
		"equipment, with a concrete floor, metal grating and proper access. Its walls, floor and ceiling must be treated and "
		"painted to minimise the accumulation and circulation of dust.",
		"Supply and install lift shaft door frames, architraves and brick or steel fascia plates, unless otherwise stated in this proposal.",
		"Provide the required power supply in the machine room, terminated in suitable main switches for power and lighting "
		"circuits, with circuit breakers, lightning arresters and proper earthing.",
		"Provide adequate safety and security to prevent damage, theft or pilferage of materials during storage and "
		"installation, until the lift is handed over.",
		"Provide a weatherproof, lockable storage area of approximately 50 sq. m per lift at ground-floor level near the "
		"hoistway, available well before the materials arrive.",
		"Provide hoisting beams or hooks in the machine-room ceiling, and rolled steel sections with bearing plates to support "
		"the machine, where required.",
		"Provide living accommodation (with lighting, running water and sanitary facilities) for our installation staff at or near the site.",
	],
	"builder_intro": "The builder shall carry out the following works as per our instructions:",
	"builder_work": [
		"Cast the lift-well top slab at the specified height.",
		"Extend the slab as required, wherever possible.",
		"Fix one hook at the centre of the top slab with a load capacity of up to 2 tonnes.",
		"Plaster and whitewash the lift shaft.",
		"Keep the pit clean and waterproof.",
		"Erect scaffolding as instructed.",
		"Make pocket holes as instructed.",
		"Make wooden templates as per the drawing.",
		"Arrange a room for storing lift materials.",
		"Provide buffer spring beds in the pit.",
		"Provide bulkhead light fittings in the lift shaft.",
		"Provide a 3-phase power supply electrical panel board in the lift machine room.",
		"Construct machine beds as required.",
		"Complete granite cladding around the lift entrances before the doors are fixed.",
		"Provide earthing from the pit to the headroom inside the lift shaft.",
	],
	"material_catalog": {
		"Motor": ["6 Passenger / 5 HP Gearless Motor – Montanari", "8 Passenger / 7.5 HP Gearless Motor – Montanari"],
		"Drive": ["Monarch Inverter (V3F) Drive"],
		"Car Operator": ["Genesis Car Door Operator"],
		"Landing Header": ["Genesis Landing Header"],
		"Cabin": ["SS Cabin – 6 Passenger", "SS Cabin – 8 Passenger"],
		"LOP & COP": ["7-Segment Electronic LOP & COP"],
		"Ventilation / Fan": ["Blower Fan"],
		"Brackets": ["MS Brackets – 4 mm Thickness"],
		"Door Entrance Frame": ["SS Door Entrance Frame"],
		"Landing Door": ["SS ACO-700 Landing Door with Frame & Header"],
		"Car Door": ["SS AC-700 Car Door with Operator"],
		"Car & CWT Frames": ["Car Frame 926 x 1326 (2:1 Roping)"],
		"Guide Rails": ["9 mm + 5 mm Guide Rails – Marazzi"],
		"Controls & ARD": ["Mitsubishi Controller with ARD", "Monarch Controller with ARD"],
		"Steel Rope": ["Usha Martin 8 mm Steel Rope"],
		"Overspeed Governor": ["Overspeed Governor with Safety Wiring"],
		"Diverter Pulley": ["Diverter Pulley for Car Frame"],
		"Counter Weight": ["Counterweight with Filler Weights"],
	},
	"materials_note": "All components are sourced from the reputed manufacturers listed above.",
}
DEFAULT_QUOTE_DEFAULTS["materials"] = [{"category": c, "detail": opts[0]} for c, opts in DEFAULT_QUOTE_DEFAULTS["material_catalog"].items()]

# Copied onto each new quotation so later changes to the defaults never alter issued quotations.
PER_QUOTE_KEYS = ["cover_subject", "cover_body", "cover_points", "cover_closing", "tech_specs", "payment_schedule",
				  "delivery_timeline", "installation_timeline", "warranty", "price_note", "builder_side_work",
				  "contract_conditions", "preparatory_intro", "preparatory_work", "builder_intro", "builder_work",
				  "materials", "materials_note"]


async def get_quote_defaults() -> dict:
	doc = await db.settings.find_one({"id": "quote_defaults"}, {"_id": 0}) or {}
	merged = copy.deepcopy(DEFAULT_QUOTE_DEFAULTS)
	merged.update({k: v for k, v in doc.items() if k in DEFAULT_QUOTE_DEFAULTS})
	return merged
