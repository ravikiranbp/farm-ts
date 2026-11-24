"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

logger = logging.getLogger(__name__)

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
	"users": [IndexModel([("id", ASCENDING)], name="id", unique=True),
			  IndexModel([("email", ASCENDING)], name="email", unique=True)],
	"sessions": [IndexModel([("token", ASCENDING)], name="token", unique=True)],
	"customers": [IndexModel([("id", ASCENDING)], name="id", unique=True),
				  IndexModel([("mobile", ASCENDING)], name="mobile"), IndexModel([("updated_at", DESCENDING)], name="updated")],
	"leads": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("ref", ASCENDING)], name="ref"),
			  IndexModel([("customer_id", ASCENDING)], name="customer"),
			  IndexModel([("archived", ASCENDING), ("assigned_to", ASCENDING), ("updated_at", DESCENDING)], name="scope_updated")],
	"interactions": [IndexModel([("lead_id", ASCENDING), ("at", DESCENDING)], name="lead_at"),
					 IndexModel([("customer_id", ASCENDING)], name="customer")],
	"followups": [IndexModel([("id", ASCENDING)], name="id"), IndexModel([("lead_id", ASCENDING)], name="lead"),
				  IndexModel([("done", ASCENDING), ("assigned_to", ASCENDING), ("due_at", ASCENDING)], name="due")],
	"quotations": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("lead_id", ASCENDING)], name="lead"),
				   IndexModel([("number", ASCENDING)], name="number", unique=True),
				   IndexModel([("customer_id", ASCENDING)], name="customer"), IndexModel([("share.token", ASCENDING)], name="share_token", sparse=True)],
	"quotation_views": [IndexModel([("quotation_id", ASCENDING), ("at", DESCENDING)], name="q_at")],
	"quotation_revisions": [IndexModel([("quotation_id", ASCENDING), ("revision", ASCENDING)], name="qrev", unique=True)],
	"orders": [IndexModel([("id", ASCENDING)], name="id", unique=True), IndexModel([("customer_id", ASCENDING)], name="customer")],
	"inspections": [IndexModel([("id", ASCENDING)], name="id"), IndexModel([("lead_id", ASCENDING)], name="lead")],
	"service_requests": [IndexModel([("id", ASCENDING)], name="id"), IndexModel([("customer_id", ASCENDING)], name="customer")],
	"amc": [IndexModel([("id", ASCENDING)], name="id"), IndexModel([("customer_id", ASCENDING)], name="customer")],
	"audit_logs": [IndexModel([("at", DESCENDING)], name="at"), IndexModel([("lead_id", ASCENDING)], name="lead"),
				   IndexModel([("user_id", ASCENDING), ("at", DESCENDING)], name="user_at")],
	"notifications": [IndexModel([("user_id", ASCENDING), ("at", DESCENDING)], name="user_at")],
	"login_history": [IndexModel([("email", ASCENDING), ("at", DESCENDING)], name="email_at")],
	"brochure_downloads": [IndexModel([("id", ASCENDING)], name="id"), IndexModel([("customer_id", ASCENDING)], name="customer")],
	"files": [IndexModel([("id", ASCENDING)], name="id"), IndexModel([("entity_type", ASCENDING), ("entity_id", ASCENDING)], name="entity")],
}


async def ensure_indexes() -> None:
	for collection, models in INDEXES.items():
		for model in models:  # one at a time so a bad spec skips only itself
			try:
				await db[collection].create_indexes([model])
			except Exception as exc:  # never block boot on an index; the log line names what to fix
				logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)