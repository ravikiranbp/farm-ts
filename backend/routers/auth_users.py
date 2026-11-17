"""Auth (login/logout/me) and employee management."""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

from lib.auth import COOKIE, MGMT, check_pw, current_user, hash_pw, require
from lib.common import audit, iso_now, new_id
from lib.db import db
from models.schemas import LoginIn, PasswordIn, User, UserCreate, UserUpdate

router = APIRouter()


@router.post("/auth/login", response_model=User)
async def login(body: LoginIn, request: Request, response: Response):
	email = body.email.strip().lower()
	since = (datetime.now(timezone.utc) - timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M:%SZ")
	fails = await db.login_history.count_documents({"email": email, "success": False, "at": {"$gte": since}})
	if fails >= 5:
		raise HTTPException(429, "Too many failed attempts. Try again in 15 minutes.")
	user = await db.users.find_one({"email": email})
	ip = request.client.host if request.client else None
	if not user or not check_pw(body.password, user.get("password_hash", "")):
		await db.login_history.insert_one({"id": new_id(), "email": email, "user_id": user["id"] if user else None,
										   "success": False, "ip": ip, "at": iso_now()})
		await audit(None, "login_failed", "auth", comment=f"Failed login for {email}")
		raise HTTPException(401, "Invalid email or password")
	if not user.get("active"):
		raise HTTPException(403, "Account is deactivated. Contact the administrator.")
	token = secrets.token_urlsafe(32)
	now = iso_now()
	await db.sessions.insert_one({"token": token, "user_id": user["id"], "created_at": now, "last_seen": now})
	await db.users.update_one({"id": user["id"]}, {"$set": {"last_login_at": now}})
	await db.login_history.insert_one({"id": new_id(), "email": email, "user_id": user["id"], "success": True,
									   "ip": ip, "at": now})
	await audit(user, "login", "auth", record_id=user["id"])
	secure = request.headers.get("x-forwarded-proto", request.url.scheme) == "https"
	response.set_cookie(COOKIE, token, httponly=True, samesite="lax", secure=secure, max_age=60 * 60 * 12, path="/")
	user.pop("_id", None)
	return User(**user)


@router.post("/auth/logout")
async def logout(request: Request, response: Response):
	tok = request.cookies.get(COOKIE)
	if tok:
		s = await db.sessions.find_one({"token": tok})
		if s:
			u = await db.users.find_one({"id": s["user_id"]}, {"_id": 0})
			await audit(u, "logout", "auth", record_id=s["user_id"])
			await db.sessions.delete_one({"token": tok})
	response.delete_cookie(COOKIE, path="/")
	return {"ok": True}


@router.get("/auth/me", response_model=User)
async def me(user: dict = Depends(current_user)):
	return User(**user)


@router.post("/auth/change-password")
async def change_password(body: PasswordIn, user: dict = Depends(current_user)):
	full = await db.users.find_one({"id": user["id"]})
	if not body.current_password or not check_pw(body.current_password, full["password_hash"]):
		raise HTTPException(400, "Current password is incorrect")
	await db.users.update_one({"id": user["id"]}, {"$set": {"password_hash": hash_pw(body.new_password)}})
	await audit(user, "password_changed", "users", record_id=user["id"])
	return {"ok": True}


@router.get("/users/staff", response_model=list[User])
async def staff_list(user: dict = Depends(require(*MGMT))):
	"""Minimal staff directory for assignment dropdowns (managers + admins)."""
	docs = await db.users.find({}, {"_id": 0, "password_hash": 0}).sort("name", 1).to_list(500)
	return [User(**d) for d in docs]


@router.post("/users", response_model=User)
async def create_user(body: UserCreate, user: dict = Depends(require("admin"))):
	if await db.users.find_one({"email": body.email}):
		raise HTTPException(409, "An account with this email already exists")
	doc = {"id": new_id(), **body.model_dump(exclude={"password"}), "password_hash": hash_pw(body.password),
		   "active": True, "created_at": iso_now()}
	await db.users.insert_one(doc)
	doc.pop("password_hash")
	await audit(user, "employee_created", "users", record_id=doc["id"], new={k: v for k, v in doc.items() if k != "_id"})
	return User(**doc)


@router.patch("/users/{uid}", response_model=User)
async def update_user(uid: str, body: UserUpdate, user: dict = Depends(require("admin"))):
	old = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
	if not old:
		raise HTTPException(404, "Employee not found")
	changes = body.model_dump(exclude_none=True)
	if uid == user["id"] and (changes.get("active") is False or changes.get("role", "admin") != "admin"):
		raise HTTPException(400, "You cannot deactivate or demote your own account")
	if changes:
		await db.users.update_one({"id": uid}, {"$set": changes})
		if changes.get("active") is False:
			await db.sessions.delete_many({"user_id": uid})
		action = "permission_changed" if "role" in changes else "employee_updated"
		await audit(user, action, "users", record_id=uid, old={k: old.get(k) for k in changes}, new=changes)
	new = await db.users.find_one({"id": uid}, {"_id": 0, "password_hash": 0})
	return User(**new)


@router.post("/users/{uid}/reset-password")
async def reset_password(uid: str, body: PasswordIn, user: dict = Depends(require("admin"))):
	res = await db.users.update_one({"id": uid}, {"$set": {"password_hash": hash_pw(body.new_password)}})
	if not res.matched_count:
		raise HTTPException(404, "Employee not found")
	await db.sessions.delete_many({"user_id": uid})
	await audit(user, "password_reset", "users", record_id=uid)
	return {"ok": True}


@router.get("/users/login-history")
async def login_history(user_id: str | None = None, user: dict = Depends(require("admin"))):
	q = {"user_id": user_id} if user_id else {}
	return await db.login_history.find(q, {"_id": 0}).sort("at", -1).to_list(300)