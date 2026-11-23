"""ReportLab PDF builders (quotation, inspection report, brochure). No paid service needed."""
from datetime import datetime
from io import BytesIO
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (BaseDocTemplate, Frame, Image, KeepTogether, ListFlowable, ListItem, NextPageTemplate,
								PageBreak, PageTemplate, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle)

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
	return _quotation_doc(q, settings)


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


# ---------------- Multi-page quotation ----------------
_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
		 "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _below_100(n: int) -> str:
	return _ONES[n] if n < 20 else _TENS[n // 10] + (f"-{_ONES[n % 10]}" if n % 10 else "")


def _below_1000(n: int) -> str:
	h, r = divmod(n, 100)
	return " ".join(p for p in (f"{_ONES[h]} Hundred" if h else "", _below_100(r) if r else "") if p)


def _indian(n: int) -> str:
	crore, n = divmod(n, 10_000_000)
	lakh, n = divmod(n, 100_000)
	thousand, n = divmod(n, 1000)
	parts = [f"{_indian(crore)} Crore" if crore else "", f"{_below_100(lakh)} Lakh" if lakh else "",
			 f"{_below_100(thousand)} Thousand" if thousand else "", _below_1000(n) if n else ""]
	return " ".join(p for p in parts if p)


def amount_in_words(value) -> str:
	"""Indian numbering, e.g. 173755 -> 'Rupees One Lakh Seventy-Three Thousand Seven Hundred Fifty-Five Only'."""
	total = round(float(value or 0), 2)
	rupees = int(total)
	paise = int(round((total - rupees) * 100))
	words = f"Rupees {_indian(rupees) or 'Zero'}"
	if paise:
		words += f" and {_below_100(paise)} Paise"
	return words + " Only"


def _t(v) -> str:
	return escape(str(v or "")).replace("\n", "<br/>")


def _fmt_date(iso: str | None) -> str:
	try:
		return datetime.strptime((iso or "")[:10], "%Y-%m-%d").strftime("%d/%m/%Y")
	except ValueError:
		return iso or ""


PAGE_W, PAGE_H = A4
MARGIN = 15 * mm
FOOTER_H = 30 * mm
J = ParagraphStyle("j", parent=B, alignment=TA_JUSTIFY, fontSize=9.5, leading=14, spaceAfter=6)
SEC = ParagraphStyle("sec", parent=H, fontSize=12.5, textColor=DARK, spaceBefore=0, spaceAfter=5, keepWithNext=1)
SUB = ParagraphStyle("sub", parent=B, fontName="Helvetica-Bold", fontSize=10, spaceBefore=8, spaceAfter=4, keepWithNext=1)
CELL = ParagraphStyle("cell", parent=B, fontSize=8.5, leading=11)
CELL_B = ParagraphStyle("cellb", parent=CELL, fontName="Helvetica-Bold")
HEAD = ParagraphStyle("head", parent=CELL_B, textColor=colors.white)
GRID = colors.HexColor("#CCCCCC")
TINT = colors.HexColor("#F6F1E6")


class _PageCountCanvas(rl_canvas.Canvas):
	"""Defers page output so every page after the cover can show 'Page X of Y'."""

	def __init__(self, *args, **kwargs):
		super().__init__(*args, **kwargs)
		self._pages: list[dict] = []

	def showPage(self):
		self._pages.append(dict(self.__dict__))
		self._startPage()

	def save(self):
		total = len(self._pages)
		for state in self._pages:
			self.__dict__.update(state)
			if self._pageNumber > 1:
				self.setFont("Helvetica", 8)
				self.setFillColor(colors.HexColor("#555555"))
				self.drawCentredString(PAGE_W / 2, 10 * mm, f"Page {self._pageNumber} of {total}")
			super().showPage()
		super().save()


def _bullets(items: list[str]) -> ListFlowable:
	return ListFlowable([ListItem(Paragraph(_t(x), J), leftIndent=12) for x in items if str(x).strip()],
						bulletType="bullet", start="\u2022", leftIndent=12, bulletFontSize=9)


def _grid(rows: list[list], widths: list[float], header=True, zebra=True, align_right_from: int | None = None, pad: float = 3) -> Table:
	t = Table(rows, colWidths=widths, repeatRows=1 if header else 0)
	style = [("GRID", (0, 0), (-1, -1), 0.3, GRID), ("VALIGN", (0, 0), (-1, -1), "TOP"),
			 ("TOPPADDING", (0, 0), (-1, -1), pad), ("BOTTOMPADDING", (0, 0), (-1, -1), pad)]
	if header:
		style.append(("BACKGROUND", (0, 0), (-1, 0), DARK))
	if zebra:
		style += [("BACKGROUND", (0, r), (-1, r), TINT) for r in range(2 if header else 1, len(rows), 2)]
	if align_right_from is not None:
		style.append(("ALIGN", (align_right_from, 0), (-1, -1), "RIGHT"))
	t.setStyle(TableStyle(style))
	return t


def _quotation_doc(q: dict, settings: dict) -> bytes:
	company = settings.get("company_name", "")
	signatory = settings.get("signatory") or "Authorised Signatory"
	letterhead = _header(settings, "QUOTATION")
	content_w = PAGE_W - 2 * MARGIN
	_, lh_h = letterhead.wrap(content_w, PAGE_H)
	lh_top = PAGE_H - 12 * mm
	header_h = 12 * mm + lh_h + 6 * mm

	def draw_letterhead(c, _doc):
		letterhead.drawOn(c, MARGIN, lh_top - lh_h)

	def cover_page(c, doc):
		c.saveState()
		draw_letterhead(c, doc)
		c.restoreState()

	def body_page(c, doc):
		c.saveState()
		draw_letterhead(c, doc)
		c.setStrokeColor(colors.HexColor("#888888"))
		c.setLineWidth(0.5)
		c.line(MARGIN, 24 * mm, MARGIN + 60 * mm, 24 * mm)
		c.line(PAGE_W - MARGIN - 60 * mm, 24 * mm, PAGE_W - MARGIN, 24 * mm)
		c.setFont("Helvetica-Bold", 8.5)
		c.setFillColor(DARK)
		c.drawString(MARGIN, 20 * mm, "Authorised Signatory")
		c.drawRightString(PAGE_W - MARGIN, 20 * mm, "Customer Signature")
		c.setFont("Helvetica", 8)
		c.drawString(MARGIN, 16.5 * mm, f"For {company}")
		c.setFillColor(colors.HexColor("#777777"))
		c.setFont("Helvetica", 7)
		c.drawCentredString(PAGE_W / 2, 6 * mm, f"{q.get('number', '')} \u2014 Revision {q.get('revision', 1)}")
		c.restoreState()

	buf = BytesIO()
	doc = BaseDocTemplate(buf, pagesize=A4, leftMargin=MARGIN, rightMargin=MARGIN, topMargin=MARGIN, bottomMargin=MARGIN,
						  title=f"Quotation {q.get('number', '')}", author=company)
	cover_frame = Frame(MARGIN, MARGIN, content_w, PAGE_H - MARGIN - header_h, id="cover", leftPadding=0, rightPadding=0)
	body_frame = Frame(MARGIN, FOOTER_H, content_w, PAGE_H - header_h - FOOTER_H, id="body", leftPadding=0, rightPadding=0)
	doc.addPageTemplates([PageTemplate("cover", [cover_frame], onPage=cover_page),
						  PageTemplate("body", [body_frame], onPage=body_page)])

	story: list = []

	# Page 1 — cover letter
	ref = Table([[Paragraph(f"<b>Ref. No.:</b> {_t(q.get('number'))} (Rev. {q.get('revision', 1)})", B),
				  Paragraph(f"<b>Date:</b> {_fmt_date(q.get('quote_date') or q.get('created_at'))}", B)]],
				colWidths=[content_w * 0.6, content_w * 0.4])
	ref.setStyle(TableStyle([("ALIGN", (1, 0), (1, 0), "RIGHT"), ("LEFTPADDING", (0, 0), (-1, -1), 0)]))
	to_lines = [f"<b>{_t(q.get('customer_name'))}</b>", _t(q.get("customer_address") or q.get("project_address"))]
	if q.get("customer_mobile"):
		to_lines.append(f"Mobile: {_t(q['customer_mobile'])}")
	story += [ref, Spacer(1, 8), Paragraph("To,", B), Paragraph("<br/>".join(x for x in to_lines if x), B), Spacer(1, 10),
			  Paragraph("Dear Sir / Madam,", B), Spacer(1, 4),
			  Paragraph(f"<b>Sub: {_t(q.get('cover_subject'))}</b>", B), Spacer(1, 6)]
	story += [Paragraph(_t(p), J) for p in q.get("cover_body") or [] if str(p).strip()]
	if q.get("cover_points"):
		story.append(_bullets(q["cover_points"]))
		story.append(Spacer(1, 4))
	if q.get("cover_closing"):
		story.append(Paragraph(_t(q["cover_closing"]), J))
	sign = Table([[Paragraph(f"For <b>{_t(company)}</b><br/><br/><br/><br/>______________________<br/>"
							 f"<b>Authorised Signatory</b><br/>{_t(signatory)}", B),
				   Paragraph("<br/><br/><br/><br/>______________________<br/><b>Customer Signature &amp; Stamp</b><br/>"
							 "Accepted Date: ____________", B)]], colWidths=[content_w / 2, content_w / 2])
	sign.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("VALIGN", (0, 0), (-1, -1), "BOTTOM")]))
	story += [KeepTogether([Spacer(1, 6), Paragraph("Thanking you,", B), Paragraph("Yours faithfully,", B), Spacer(1, 4), sign]),
			  NextPageTemplate("body"), PageBreak()]

	# Page 2 — technical specifications & price schedule
	specs = [[Paragraph("Sl.", HEAD), Paragraph("Description", HEAD), Paragraph("Specification", HEAD)]]
	specs += [[Paragraph(str(i), CELL), Paragraph(_t(s.get("label")), CELL_B), Paragraph(_t(s.get("value")) or "\u2014", CELL)]
			  for i, s in enumerate(q.get("tech_specs") or [], 1)]
	story += [Paragraph("Technical Specifications", SEC), _grid(specs, [12 * mm, 58 * mm, content_w - 70 * mm], pad=1.8), Spacer(1, 8)]

	tot = q.get("totals") or {}
	price = [[Paragraph(h, HEAD) for h in ("#", "Description", "Qty", "Unit Price", "Amount")]]
	for i, it in enumerate(q.get("items") or [], 1):
		qty, unit = float(it.get("qty", 1)), float(it.get("unit_price", 0))
		price.append([str(i), Paragraph(_t(it.get("description")), CELL), f"{qty:g}", inr(unit), inr(qty * unit)])
	for label, key in (("Installation charges", "installation_charges"), ("Transportation", "transport_charges"),
					   ("Additional charges", "additional_charges")):
		if q.get(key):
			price.append(["", label, "", "", inr(q[key])])
	price += [["", "Subtotal", "", "", inr(tot.get("subtotal"))]]
	if float(q.get("discount_pct") or 0):
		price.append(["", f"Discount ({q.get('discount_pct'):g}%)", "", "", "- " + inr(tot.get("discount"))])
	price += [["", f"GST ({float(q.get('tax_pct') or 0):g}%)", "", "", inr(tot.get("tax"))],
			  ["", Paragraph("<b>FINAL AMOUNT</b>", CELL), "", "", Paragraph(f"<b>{inr(tot.get('total'))}</b>", CELL)]]
	price_tbl = _grid(price, [10 * mm, content_w - 87 * mm, 15 * mm, 31 * mm, 31 * mm], zebra=False, align_right_from=2, pad=2)
	price_tbl.setStyle(TableStyle([("FONTSIZE", (0, 1), (-1, -1), 8.5), ("BACKGROUND", (0, -1), (-1, -1), TINT)]))
	story += [KeepTogether([Paragraph("Price Schedule", SEC), price_tbl, Spacer(1, 5),
							Paragraph(f"<b>Amount in Words:</b> {amount_in_words(tot.get('total'))}", B)]), PageBreak()]

	# Page 3 — commercial terms, builder side work, conditions of contract
	total = float(tot.get("total") or 0)
	pay = [[Paragraph(h, HEAD) for h in ("#", "%", "Payment Milestone", "Amount")]]
	pay += [[str(i), f"{float(p.get('pct') or 0):g}%", Paragraph(_t(p.get("description")), CELL), inr(total * float(p.get("pct") or 0) / 100)]
			for i, p in enumerate(q.get("payment_schedule") or [], 1)]
	story += [Paragraph("Commercial Terms", SEC), Paragraph("Payment Schedule", SUB),
			  _grid(pay, [10 * mm, 16 * mm, content_w - 62 * mm, 36 * mm], align_right_from=3), Spacer(1, 6)]
	terms = [("Delivery Period", q.get("delivery_timeline")), ("Installation Period", q.get("installation_timeline")),
			 ("Warranty", q.get("warranty")), ("Quotation Valid Until", _fmt_date(q.get("valid_until")))]
	if q.get("amc_info"):
		terms.append(("AMC", q["amc_info"]))
	story.append(_grid([[Paragraph(f"<b>{k}</b>", CELL), Paragraph(_t(v) or "\u2014", CELL)] for k, v in terms],
					   [45 * mm, content_w - 45 * mm], header=False, zebra=False))
	if q.get("price_note"):
		story += [Spacer(1, 5), Paragraph(f"<b>Note:</b> {_t(q['price_note'])}", B)]
	if q.get("builder_side_work"):
		story += [Paragraph("Builder Side Work", SUB), _bullets(q["builder_side_work"])]
	if q.get("contract_conditions"):
		story += [Paragraph("Conditions of Contract", SUB), _bullets(q["contract_conditions"])]
	story.append(PageBreak())

	# Page 4 — customer preparatory work
	story += [Paragraph("Customer Preparatory Work", SEC), Paragraph(_t(q.get("preparatory_intro")), J),
			  _bullets(q.get("preparatory_work") or []), PageBreak()]

	# Page 5 — work to be carried out by the builder
	story += [Paragraph("Work to be Carried Out by the Builder", SEC), Paragraph(_t(q.get("builder_intro")), J),
			  _bullets(q.get("builder_work") or []), PageBreak()]

	# Page 6 — main material details
	mats = [[Paragraph(h, HEAD) for h in ("Sl.", "Material", "Details / Make")]]
	mats += [[Paragraph(str(i), CELL), Paragraph(_t(m.get("category")), CELL_B), Paragraph(_t(m.get("detail")) or "\u2014", CELL)]
			 for i, m in enumerate([m for m in q.get("materials") or [] if m.get("category") or m.get("detail")], 1)]
	story += [Paragraph("Main Material Details", SEC), _grid(mats, [12 * mm, 55 * mm, content_w - 67 * mm])]
	if q.get("materials_note"):
		story += [Spacer(1, 6), Paragraph(_t(q["materials_note"]), S)]

	doc.build(story, canvasmaker=_PageCountCanvas)
	return buf.getvalue()