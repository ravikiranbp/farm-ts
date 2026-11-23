"""Pydantic v2 request/response models. Mirror: frontend/src/lib/types.ts."""
import re
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

MOBILE_RE = re.compile(r"^(\+?91[\s-]?)?[6-9]\d{9}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _mobile(v: str) -> str:
	v = (v or "").strip().replace(" ", "")
	if not MOBILE_RE.match(v):
		raise ValueError("Enter a valid 10-digit Indian mobile number")
	return v[-10:]


def _email(v: Optional[str]) -> Optional[str]:
	if v is None or v.strip() == "":
		return None
	if not EMAIL_RE.match(v.strip()):
		raise ValueError("Enter a valid email address")
	return v.strip().lower()


class Flexible(BaseModel):
	model_config = ConfigDict(extra="ignore")


# ---------- auth / users ----------
class LoginIn(BaseModel):
	email: str
	password: str


class User(Flexible):
	id: str
	name: str
	email: str
	phone: Optional[str] = None
	role: Literal["admin", "manager", "telecaller"]
	active: bool = True
	created_at: Optional[str] = None
	last_login_at: Optional[str] = None


class UserCreate(BaseModel):
	name: str = Field(min_length=2)
	email: str
	phone: Optional[str] = None
	role: Literal["admin", "manager", "telecaller"]
	password: str = Field(min_length=8)

	@field_validator("email")
	@classmethod
	def _v(cls, v: str) -> str:
		out = _email(v)
		if not out:
			raise ValueError("Email required")
		return out


class UserUpdate(BaseModel):
	name: Optional[str] = None
	phone: Optional[str] = None
	role: Optional[Literal["admin", "manager", "telecaller"]] = None
	active: Optional[bool] = None


class PasswordIn(BaseModel):
	new_password: str = Field(min_length=8)
	current_password: Optional[str] = None


# ---------- public ----------
class EnquiryIn(BaseModel):
	enquiry_type: Literal["enquiry", "callback", "inspection", "brochure"] = "enquiry"
	name: str = Field(min_length=2, max_length=100)
	mobile: str
	email: Optional[str] = None
	city: str = Field(min_length=2, max_length=80)
	area: Optional[str] = None
	address: Optional[str] = None
	building_type: Optional[str] = None
	requirement: Optional[str] = None
	floors: Optional[int] = Field(default=None, ge=1, le=200)
	lifts_count: Optional[int] = Field(default=None, ge=1, le=100)
	construction_status: Optional[str] = None
	lift_type: Optional[str] = None
	additional_requirements: Optional[str] = Field(default=None, max_length=2000)
	preferred_callback_time: Optional[str] = None
	preferred_date: Optional[str] = None
	brochure_id: Optional[str] = None
	source: Optional[str] = None
	campaign: Optional[str] = None
	consent: bool = True
	_m = field_validator("mobile")(lambda cls, v: _mobile(v))
	_e = field_validator("email")(lambda cls, v: _email(v))


class EnquiryResult(BaseModel):
	reference: str
	message: str
	download_url: Optional[str] = None


class ServiceRequestIn(BaseModel):
	name: str = Field(min_length=2)
	mobile: str
	email: Optional[str] = None
	address: str = Field(min_length=3)
	lift_ref: Optional[str] = None
	issue_type: str
	description: str = Field(min_length=5, max_length=2000)
	priority: Literal["Low", "Normal", "High", "Emergency"] = "Normal"
	preferred_time: Optional[str] = None
	consent: bool = True
	_m = field_validator("mobile")(lambda cls, v: _mobile(v))
	_e = field_validator("email")(lambda cls, v: _email(v))


# ---------- leads ----------
class Lead(Flexible):
	id: str
	ref: str
	customer_id: str
	name: str
	mobile: str
	email: Optional[str] = None
	city: Optional[str] = None
	area: Optional[str] = None
	address: Optional[str] = None
	building_type: Optional[str] = None
	requirement: Optional[str] = None
	floors: Optional[int] = None
	lifts_count: Optional[int] = None
	construction_status: Optional[str] = None
	lift_type: Optional[str] = None
	additional_requirements: Optional[str] = None
	preferred_callback_time: Optional[str] = None
	source: str = "Company website"
	campaign: Optional[str] = None
	enquiry_type: str = "enquiry"
	status: str
	assigned_to: Optional[str] = None
	assigned_name: Optional[str] = None
	created_by: Optional[str] = None
	created_by_name: Optional[str] = None
	approval: Optional[dict] = None
	approval_history: list[dict] = []
	assignment_history: list[dict] = []
	status_history: list[dict] = []
	possible_duplicate: bool = False
	duplicate_of: Optional[str] = None
	archived: bool = False
	next_followup_at: Optional[str] = None
	last_contacted_at: Optional[str] = None
	checklist_answers: dict[str, str] = {}
	checklist_updated_at: Optional[str] = None
	checklist_updated_by: Optional[str] = None
	is_sample: bool = False
	created_at: str
	updated_at: str


class LeadPage(BaseModel):
	items: list[Lead]
	total: int


class LeadCreate(BaseModel):
	name: str = Field(min_length=2)
	mobile: str
	email: Optional[str] = None
	city: str = Field(min_length=2)
	area: Optional[str] = None
	address: Optional[str] = None
	building_type: Optional[str] = None
	requirement: Optional[str] = None
	floors: Optional[int] = Field(default=None, ge=1, le=200)
	lifts_count: Optional[int] = Field(default=None, ge=1, le=100)
	construction_status: Optional[str] = None
	lift_type: Optional[str] = None
	additional_requirements: Optional[str] = None
	preferred_callback_time: Optional[str] = None
	source: str = "Manual entry"
	campaign: Optional[str] = None
	assigned_to: Optional[str] = None
	_m = field_validator("mobile")(lambda cls, v: _mobile(v))
	_e = field_validator("email")(lambda cls, v: _email(v))


class LeadUpdate(BaseModel):
	name: Optional[str] = None
	email: Optional[str] = None
	city: Optional[str] = None
	area: Optional[str] = None
	address: Optional[str] = None
	building_type: Optional[str] = None
	requirement: Optional[str] = None
	floors: Optional[int] = None
	lifts_count: Optional[int] = None
	construction_status: Optional[str] = None
	lift_type: Optional[str] = None
	additional_requirements: Optional[str] = None
	preferred_callback_time: Optional[str] = None
	source: Optional[str] = None
	_e = field_validator("email")(lambda cls, v: _email(v))


class StatusIn(BaseModel):
	status: str
	comment: Optional[str] = None


class AssignIn(BaseModel):
	user_id: str
	reason: Optional[str] = None


class BulkReassignIn(BaseModel):
	from_user: str
	to_user: str
	reason: Optional[str] = None


class InteractionIn(BaseModel):
	kind: Literal["call", "whatsapp", "email", "visit", "note"] = "call"
	answered: Optional[bool] = None
	outcome: Optional[str] = None
	notes: str = Field(min_length=2, max_length=4000)


class FollowupIn(BaseModel):
	due_at: str
	kind: Literal["call", "whatsapp", "visit", "email", "meeting"] = "call"
	notes: Optional[str] = None
	assigned_to: Optional[str] = None


class FollowupDone(BaseModel):
	outcome: Optional[str] = None


class PositiveIn(BaseModel):
	lift_type: str = Field(min_length=2)
	floors: int = Field(ge=1, le=200)
	lifts_count: int = Field(default=1, ge=1, le=100)
	requirement_summary: str = Field(min_length=5)
	notes: str = Field(min_length=5)


class DecisionIn(BaseModel):
	decision: Literal["approve", "reject", "request_info"]
	comment: Optional[str] = None


class ChecklistIn(BaseModel):
	answers: dict[str, str]


class QuoteResponseIn(BaseModel):
	response: Literal["accept", "changes"]
	name: str = Field(min_length=2, max_length=100)
	comment: Optional[str] = Field(default=None, max_length=2000)


class DuplicateIn(BaseModel):
	duplicate_of: str
	comment: Optional[str] = None


class CommentIn(BaseModel):
	comment: Optional[str] = None


# ---------- quotations ----------
class QuoteItem(BaseModel):
	description: str
	qty: float = Field(default=1, gt=0)
	unit_price: float = Field(default=0, ge=0)


class QuotationIn(BaseModel):
	lead_id: Optional[str] = None
	inspection_id: Optional[str] = None
	project_address: Optional[str] = None
	lift_category: Optional[str] = None
	capacity: Optional[str] = None
	floors: Optional[int] = None
	stops: Optional[int] = None
	lifts_count: Optional[int] = 1
	technical_config: Optional[str] = None
	product_description: Optional[str] = None
	items: list[QuoteItem] = []
	installation_charges: float = Field(default=0, ge=0)
	transport_charges: float = Field(default=0, ge=0)
	additional_charges: float = Field(default=0, ge=0)
	discount_pct: float = Field(default=0, ge=0, le=100)
	tax_pct: float = Field(default=18, ge=0, le=100)
	payment_terms: Optional[str] = None
	delivery_timeline: Optional[str] = None
	installation_timeline: Optional[str] = None
	warranty: Optional[str] = None
	amc_info: Optional[str] = None
	terms: Optional[str] = None
	valid_until: Optional[str] = None
	change_note: Optional[str] = None


class QuoteAction(BaseModel):
	action: Literal["submit", "approve", "reject", "send", "negotiation", "accept", "customer_reject"]
	comment: Optional[str] = None


class Quotation(Flexible):
	id: str
	number: str
	revision: int
	status: str
	lead_id: Optional[str] = None
	lead_ref: Optional[str] = None
	customer_id: str
	customer_name: str
	customer_mobile: Optional[str] = None
	project_address: Optional[str] = None
	lift_category: Optional[str] = None
	capacity: Optional[str] = None
	floors: Optional[int] = None
	stops: Optional[int] = None
	lifts_count: Optional[int] = None
	technical_config: Optional[str] = None
	product_description: Optional[str] = None
	items: list[dict] = []
	installation_charges: float = 0
	transport_charges: float = 0
	additional_charges: float = 0
	discount_pct: float = 0
	tax_pct: float = 0
	totals: dict = {}
	payment_terms: Optional[str] = None
	delivery_timeline: Optional[str] = None
	installation_timeline: Optional[str] = None
	warranty: Optional[str] = None
	amc_info: Optional[str] = None
	terms: Optional[str] = None
	valid_until: Optional[str] = None
	approval_history: list[dict] = []
	negotiation_notes: list[dict] = []
	created_by: Optional[str] = None
	created_by_name: Optional[str] = None
	order_id: Optional[str] = None
	share: Optional[dict] = None
	view_count: int = 0
	first_viewed_at: Optional[str] = None
	last_viewed_at: Optional[str] = None
	customer_responses: list[dict] = []
	created_at: str
	updated_at: str