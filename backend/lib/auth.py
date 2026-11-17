"""Session-cookie auth + role guards. Every staff route depends on current_user or require()."""
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import Depends, HTTPException, Request

from lib.common import get_settings, iso_now
from lib.db import db

COOKIE = "vt_session"
STAFF = ("admin", "manager", "telecaller")
MGMT = ("admin", "manager")


def hash_pw(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()


def check_pw(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except ValueError:
        return False


async def current_user(request: Request) -> dict:
    tok = request.cookies.get(COOKIE)
    if not tok:
        raise HTTPException(401, "Not signed in")
    s = await db.sessions.find_one({"token": tok})
    if not s:
        raise HTTPException(401, "Session not found")
    timeout = (await get_settings())["session_timeout_minutes"]
    last = datetime.fromisoformat(s["last_seen"].replace("Z", "+00:00"))
    if datetime.now(timezone.utc) - last > timedelta(minutes=timeout):
        await db.sessions.delete_one({"token": tok})
        raise HTTPException(401, "Session expired due to inactivity")
    user = await db.users.find_one({"id": s["user_id"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("active"):
        raise HTTPException(401, "Account inactive")
    await db.sessions.update_one({"token": tok}, {"$set": {"last_seen": iso_now()}})
    return user


def require(*roles: str):
    async def dep(user: dict = Depends(current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(403, "You do not have permission for this action")
        return user
    return dep


def is_mgmt(user: dict) -> bool:
    return user["role"] in MGMT