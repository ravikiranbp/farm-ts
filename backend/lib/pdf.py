"""ReportLab PDF builders (quotation, inspection report, brochure). No paid service needed."""
from io import BytesIO
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Image, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

LOGO = Path(__file__).parent.parent / "assets" / "logo.jpeg"
GOLD = colors.HexColor("#B8862B")
DARK = colors.HexColor("#0B0E16")
ss = getSampleStyleSheet()
H = ParagraphStyle("h", parent=ss["Heading2"], textColor=DARK, spaceAfter=4)
B = ParagraphStyle("b", parent=ss["BodyText"], fontSize=9, leading=12)
S = ParagraphStyle("s", parent=B, fontSize=8, textColor=colors.HexColor("#555555"))


def inr(v) -> str:
	try:
		v = float(v or 0)
	except (TypeError, ValueError):
		return str(v)
	s = f"{v:,.2f}"
	whole, frac = f"{v:.2f}".split(".")
	neg = whole.startswith("-")
	whole = whole.lstrip("-")
	if len(whole) > 3:
		head, tail = whole[:-3], whole[-3:]
		parts = []
		while len(head) > 2:
			parts.insert(0, head[-2:])
			head = head[:-2]
		if head:
			parts.insert(0, head)
		s = ",".join(parts) + "," + tail
	else:
		s = whole
	return f"{'-' if neg else ''}Rs. {s}.{frac}"


def _header(settings: dict, title: str):
	left = Image(str(LOGO), width=26 * mm, height=26 * mm) if LOGO.exists() else Paragraph("", B)
	info = Paragraph(
		f"<b><font size=13>{settings['company_name']}</font></b><br/>{settings.get('address','')}<br/>"
		f"Phone: {settings.get('phone','')} &nbsp; Email: {settings.get('email','')}"
		+ (f"<br/>GSTIN: {settings['gstin']}" if settings.get("gstin") else ""), B)
	t = Table([[left, info, Paragraph(f"<b><font size=14 color='#B8862B'>{title}</font></b>", B)]],
			  colWidths=[30 * mm, 100 * mm, 50 * mm])
	t.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
						   ("LINEBELOW", (0, 0), (-1, 0), 1.2, GOLD)]))
	return t


def _kv(rows: list[tuple[str, str]], widths=(45 * mm, 135 * mm)):
	t = Table([[Paragraph(f"<b>{k}</b>", B), Paragraph(str(v or "—"), B)] for k, v in rows], colWidths=widths)
	t.setStyle(TableStyle([("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CCCCCC")),
						   ("BACKGROUND", (0, 0), (0, -1), colors.HexColor("#F6F1E6")),
						   ("VALIGN", (0, 0), (-1, -1), "TOP")]))
	return t


def _build(story) -> bytes:
	buf = BytesIO()
	SimpleDocTemplate(buf, pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm,
					  topMargin=12 * mm, bottomMargin=12 * mm).build(story)
	return buf.getvalue()


def quotation_pdf(q: dict, settings: dict) -> bytes:
	story = [_header(settings, "QUOTATION"), Spacer(1, 6)]
	story.append(_kv([
		("Quotation No.", f"{q['number']} — Revision {q['revision']}"),
		("Date", q.get("updated_at", "")[:10]), ("Valid Until", q.get("valid_until") or "—"),
		("Status", q.get("status")), ("Customer", q.get("customer_name")),
		("Mobile", q.get("customer_mobile")), ("Project Address", q.get("project_address")),
	]))
	story += [Spacer(1, 8), Paragraph("Lift Configuration", H), _kv([
		("Lift Category", q.get("lift_category")), ("Capacity", q.get("capacity")),
		("Floors / Stops", f"{q.get('floors') or '—'} / {q.get('stops') or '—'}"),
		("Number of Lifts", q.get("lifts_count")), ("Technical Configuration", q.get("technical_config")),
		("Product Description", q.get("product_description")),
	])]
	rows = [["#", "Description", "Qty", "Unit Price", "Amount"]]
	for i, it in enumerate(q.get("items", []), 1):
		rows.append([str(i), Paragraph(it.get("description", ""), B), str(it.get("qty", 1)),
					 inr(it.get("unit_price")), inr(float(it.get("qty", 1)) * float(it.get("unit_price", 0)))])
	t = q.get("totals", {})
	for label, key in [("Installation charges", "installation_charges"), ("Transportation", "transport_charges"),
					   ("Additional charges", "additional_charges")]:
		if q.get(key):
			rows.append(["", label, "", "", inr(q.get(key))])
	rows += [["", "Subtotal", "", "", inr(t.get("subtotal"))],
			 ["", f"Discount ({q.get('discount_pct', 0)}%)", "", "", "- " + inr(t.get("discount"))],
			 ["", f"Tax / GST ({q.get('tax_pct', 0)}%)", "", "", inr(t.get("tax"))],
			 ["", Paragraph("<b>FINAL AMOUNT</b>", B), "", "", Paragraph(f"<b>{inr(t.get('total'))}</b>", B)]]
	tbl = Table(rows, colWidths=[10 * mm, 90 * mm, 15 * mm, 32 * mm, 33 * mm])
	tbl.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), DARK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
							 ("GRID", (0, 0), (-1, -1), 0.3, colors.HexColor("#CCCCCC")),
							 ("ALIGN", (2, 0), (-1, -1), "RIGHT"), ("FONTSIZE", (0, 0), (-1, -1), 8.5),
							 ("BACKGROUND", (0, -1), (-1, -1), colors.HexColor("#F6F1E6"))]))
	story += [Spacer(1, 8), Paragraph("Price Breakup", H), tbl, Spacer(1, 8), Paragraph("Commercial Terms", H),
			  _kv([("Payment Schedule", q.get("payment_terms")), ("Delivery Timeline", q.get("delivery_timeline")),
				   ("Installation Timeline", q.get("installation_timeline")), ("Warranty", q.get("warranty")),
				   ("AMC", q.get("amc_info")), ("Terms & Conditions", q.get("terms"))]),
			  Spacer(1, 24), Paragraph(f"For {settings['company_name']}", B), Spacer(1, 22),
			  Paragraph(f"<b>{settings.get('signatory','Authorised Signatory')}</b>", B),
			  Spacer(1, 6), Paragraph("This is a system-generated quotation.", S)]
	return _build(story)


def inspection_pdf(i: dict, settings: dict) -> bytes:
	story = [_header(settings, "SITE INSPECTION REPORT"), Spacer(1, 6), _kv([
		("Inspection Ref", i.get("ref")), ("Lead", i.get("lead_ref")), ("Customer", i.get("customer_name")),
		("Address", i.get("address")), ("Scheduled", (i.get("scheduled_at") or "")[:16].replace("T", " ")),
		("Inspector", i.get("assigned_name")), ("Status", i.get("status")),
	]), Spacer(1, 8), Paragraph("Measurements & Checklist", H)]
	rows = [("Building type", i.get("building_type")), ("Floors / Stops", f"{i.get('floors') or '—'} / {i.get('stops') or '—'}"),
			("Shaft width (mm)", i.get("shaft_width_mm")), ("Shaft depth (mm)", i.get("shaft_depth_mm")),
			("Pit depth (mm)", i.get("pit_depth_mm")), ("Overhead clearance (mm)", i.get("overhead_mm")),
			("Floor-to-floor heights", i.get("floor_heights")), ("Machine room", i.get("machine_room")),
			("Power supply", i.get("power_supply")), ("Proposed capacity", i.get("proposed_capacity")),
			("Door configuration", i.get("door_config"))]
	rows += [(f.get("label", ""), f.get("value", "")) for f in i.get("extra_fields", [])]
	story += [_kv(rows), Spacer(1, 8), Paragraph("Technical Observations", H), Paragraph(i.get("observations") or "—", B),
			  Spacer(1, 6), Paragraph("Recommendations", H), Paragraph(i.get("recommendations") or "—", B)]
	return _build(story)


def brochure_pdf(title: str, products: list[dict], settings: dict) -> bytes:
	story = [_header(settings, "BROCHURE"), Spacer(1, 8), Paragraph(title, H), Paragraph(settings.get("about", ""), B), Spacer(1, 8)]
	for p in products:
		story += [Paragraph(p["name"], H), Paragraph(p.get("description", ""), B), Spacer(1, 4)]
		specs = [(s["label"], s["value"]) for s in p.get("specs", [])]
		if specs:
			story.append(_kv(specs))
		story.append(Spacer(1, 8))
	story.append(Paragraph(f"Contact: {settings['phone']} | {settings['email']}", S))
	return _build(story)