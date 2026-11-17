"""Shared helpers: ids, refs, settings, audit trail, notifications."""
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Any

from pymongo import ReturnDocument

from lib.db import db

logger = logging.getLogger(__name__)

LEAD_STATUSES = [
    "New", "Assigned", "First Call Pending", "Contacted", "Follow-up Required", "Interested",
    "Positive – Awaiting Manager Approval", "Approved", "Site Inspection Required",
    "Site Inspection Scheduled", "Site Inspection Completed", "Quotation Required",
    "Quotation Sent", "Negotiation", "Won", "Lost", "Not Interested", "Invalid / Duplicate",
]
POSITIVE = "Positive – Awaiting Manager Approval"
CLOSED_STATUSES = {"Won", "Lost", "Not Interested", "Invalid / Duplicate"}
QUOTE_STATUSES = ["Draft", "Pending Approval", "Approved", "Sent to Customer", "Under Negotiation",
                  "Accepted", "Rejected", "Expired"]
ORDER_STAGES = [
    "Order Confirmed", "Advance Payment Received", "Site Readiness Pending", "Site Ready",
    "Materials Ordered", "Materials Received", "Installation Started", "Installation In Progress",
    "Testing and Commissioning", "Inspection / Compliance Documentation", "Handover Pending", "Completed",
]

DEFAULT_SETTINGS: dict[str, Any] = {
    "id": "settings",
    "company_name": "V Tech Elevators",
    "tagline": "Lifting Lives Higher",
    "city": "Bengaluru",
    "address": "Bengaluru, Karnataka, India",
    "phone": "+91 90000 00000",
    "whatsapp": "919000000000",
    "email": "info@vtechelevators.in",
    "gstin": "",
    "about": "V Tech Elevators designs, installs and maintains passenger, home, hospital, goods and commercial lifts across Bengaluru. We focus on safe installations, transparent quotations and responsive after-sales service.",
    "tax_pct": 18.0,
    "manager_max_quote_amount": 2500000.0,
    "manager_max_discount_pct": 10.0,
    "require_quote_approval": True,
    "quote_validity_days": 30,
    "auto_assign": True,
    "session_timeout_minutes": 30,
    "payment_terms": "40% advance with order, 50% on material delivery at site, 10% on handover.",
    "warranty": "12 months comprehensive warranty from the date of handover against manufacturing defects.",
    "terms": "Prices are valid until the validity date. Civil, electrical and scaffolding works are in the customer's scope unless stated. Delivery timelines begin after site readiness and advance receipt.",
    "delivery_timeline": "8–10 weeks from advance and approved drawings",
    "installation_timeline": "3–4 weeks after material delivery and site readiness",
    "signatory": "Authorised Signatory, V Tech Elevators",
    "call_checklist": [
        {"id": "requirement", "question": "What exactly does the customer need (new lift, replacement, repair)?", "type": "text", "required": True},
        {"id": "building", "question": "Building type and current construction stage?", "type": "text", "required": True},
        {"id": "floors", "question": "Number of floors / stops and number of lifts?", "type": "text", "required": True},
        {"id": "users", "question": "Who will use the lift (family, elderly, patients, goods)?", "type": "text", "required": False},
        {"id": "shaft", "question": "Is a lift shaft / pit already available?", "type": "choice", "options": ["Yes", "No", "Not sure"], "required": True},
        {"id": "budget", "question": "Approximate budget range?", "type": "choice", "options": ["Below ₹10 lakh", "₹10–20 lakh", "₹20–40 lakh", "Above ₹40 lakh", "Not shared"], "required": True},
        {"id": "timeline", "question": "When do they want the lift installed?", "type": "choice", "options": ["Within 1 month", "1–3 months", "3–6 months", "6+ months", "Undecided"], "required": True},
        {"id": "decision_maker", "question": "Are we speaking to the decision-maker?", "type": "choice", "options": ["Yes", "No", "Shared decision"], "required": True},
        {"id": "competitors", "question": "Have they contacted other lift companies?", "type": "choice", "options": ["Yes", "No", "Not shared"], "required": False},
        {"id": "site_visit", "question": "Is the customer open to a free site inspection?", "type": "choice", "options": ["Yes", "No", "Later"], "required": True},
    ],
    "notify_prefs": {
        "new_enquiry": True, "lead_assigned": True, "followup_due": True, "positive_submitted": True,
        "lead_decision": True, "inspection_scheduled": True, "quote_approval": True,
        "quote_decision": True, "quote_viewed": True, "quote_response": True, "quote_unopened": True, "order_confirmed": True, "service_request": True, "amc_expiry": True,
    },
}


def iso_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def norm_iso(value: str | None) -> str | None:
    """Normalise any ISO datetime string (with Z/offset) to UTC 'YYYY-MM-DDTHH:MM:SSZ'."""
    if not value:
        return None
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def new_id() -> str:
    return str(uuid.uuid4())


def norm_mobile(m: str) -> str:
    digits = re.sub(r"\D", "", m or "")
    return digits[-10:]


async def next_ref(prefix: str) -> str:
    year = datetime.now(timezone.utc).year
    doc = await db.counters.find_one_and_update(
        {"_id": f"{prefix}-{year}"}, {"$inc": {"n": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return f"{prefix}-{year}-{doc['n']:04d}"


async def get_settings() -> dict:
    doc = await db.settings.find_one({"id": "settings"}, {"_id": 0}) or {}
    merged = {**DEFAULT_SETTINGS, **doc}
    merged["notify_prefs"] = {**DEFAULT_SETTINGS["notify_prefs"], **(doc.get("notify_prefs") or {})}
    return merged


SENSITIVE = {"password", "password_hash", "token", "new_password"}


def _scrub(v: Any) -> Any:
    if isinstance(v, dict):
        return {k: ("***" if k in SENSITIVE else _scrub(x)) for k, x in v.items() if k != "_id"}
    return v


async def audit(user: dict | None, action: str, module: str, *, record_ref: str | None = None,
                record_id: str | None = None, old: Any = None, new: Any = None, comment: str | None = None,
                customer_id: str | None = None, lead_id: str | None = None) -> None:
    """Append-only audit trail. There is deliberately no update/delete path for these documents."""
    try:
        await db.audit_logs.insert_one({
            "id": new_id(),
            "ref": "AUD-" + uuid.uuid4().hex[:10].upper(),
            "user_id": user.get("id") if user else None,
            "user_name": user.get("name") if user else "Website / System",
            "user_role": user.get("role") if user else "system",
            "action": action, "module": module, "record_ref": record_ref, "record_id": record_id,
            "old": _scrub(old), "new": _scrub(new), "comment": comment,
            "customer_id": customer_id, "lead_id": lead_id, "at": iso_now(),
        })
    except Exception as exc:  # audit failure must be visible in logs
        logger.error("audit write failed: %s", exc)


async def notify(kind: str, title: str, body: str = "", link: str = "", *,
                 user_ids: list[str] | None = None, roles: list[str] | None = None) -> None:
    """Internal notifications. Never raises: a failed notification must not lose a business record."""
    try:
        settings = await get_settings()
        if not settings["notify_prefs"].get(kind, True):
            return
        targets = set(u for u in (user_ids or []) if u)
        if roles:
            async for u in db.users.find({"role": {"$in": roles}, "active": True}, {"id": 1}):
                targets.add(u["id"])
        now = iso_now()
        docs = [{"id": new_id(), "user_id": t, "kind": kind, "title": title, "body": body, "link": link,
                 "read": False, "at": now} for t in targets]
        if docs:
            await db.notifications.insert_many(docs)
    except Exception as exc:
        logger.error("notify failed: %s", exc)


def clean(doc: dict | None) -> dict | None:
    if doc is not None:
        doc.pop("_id", None)
    return doc