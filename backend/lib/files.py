"""Uploaded file contents: Supabase Storage when SUPABASE_URL/SUPABASE_SERVICE_KEY are set (required on Render),
else backend/uploads/ (local dev / single VPS). MongoDB holds only the metadata in `files`."""
import asyncio
import logging
import os
import ssl
from pathlib import Path
from urllib.parse import quote

import httpx
from fastapi import HTTPException
from fastapi.responses import Response

from lib.db import db  # also loads backend/.env before the settings below are read

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "").strip()
SUPABASE_BUCKET = os.environ.get("SUPABASE_BUCKET", "files").strip()
USE_SUPABASE = bool(SUPABASE_URL and SUPABASE_KEY)
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
if (os.environ.get("RENDER") or os.environ.get("K_SERVICE")) and not USE_SUPABASE:  # set by Render / Cloud Run
	raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY must be set: this host's disk is wiped on every restart")

logger = logging.getLogger(__name__)
# OS trust store (not certifi) so it also works behind corporate TLS inspection on Windows.
_TLS = ssl.create_default_context()


def _headers(extra: dict | None = None) -> dict:
	h = {"apikey": SUPABASE_KEY}
	if SUPABASE_KEY.startswith("eyJ"):  # legacy service_role JWT; new sb_secret_ keys go in `apikey` only
		h["Authorization"] = f"Bearer {SUPABASE_KEY}"
	return h | (extra or {})


def _object_url(fid: str) -> str:
	return f"{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{fid}"


def _local_path(f: dict) -> Path:
	# Older records stored a full "path" ending in <id><ext>; newer local files are saved as <id>.
	return UPLOAD_DIR / (Path(f["path"]).name if f.get("path") else f["id"])


async def _upload(fid: str, data: bytes, content_type: str, upsert: bool) -> httpx.Response:
	async with httpx.AsyncClient(timeout=60, verify=_TLS) as c:
		return await c.post(_object_url(fid), content=data,
							headers=_headers({"Content-Type": content_type, "x-upsert": "true" if upsert else "false"}))


async def store_file(fid: str, data: bytes, content_type: str) -> None:
	if USE_SUPABASE:
		r = await _upload(fid, data, content_type, upsert=True)
		if r.status_code >= 300:
			logger.error("Supabase upload %s failed (%s): %s", fid, r.status_code, r.text[:300])
			raise HTTPException(502, "Could not store the file. Please try again.")
	else:
		UPLOAD_DIR.mkdir(exist_ok=True)
		await asyncio.to_thread((UPLOAD_DIR / fid).write_bytes, data)


async def _load(f: dict) -> bytes | None:
	if USE_SUPABASE:
		async with httpx.AsyncClient(timeout=60, verify=_TLS) as c:
			r = await c.get(_object_url(f["id"]), headers=_headers())
		if r.status_code == 200:
			return r.content
		if r.status_code in (400, 404):  # Supabase reports a missing object as 400 {"statusCode":"404"} or 404
			return None
		logger.error("Supabase download %s failed (%s): %s", f["id"], r.status_code, r.text[:300])
		raise HTTPException(502, "Could not load the file. Please try again.")
	path = _local_path(f)
	return await asyncio.to_thread(path.read_bytes) if path.is_file() else None


async def file_response(f: dict, download: bool = True) -> Response:
	data = await _load(f)
	if data is None:
		raise HTTPException(404, "File content is missing")
	headers = {"Content-Disposition": f"attachment; filename*=utf-8''{quote(f['name'])}"} if download else None
	return Response(data, media_type=f["content_type"], headers=headers)


async def delete_file(f: dict) -> None:
	"""Remove the stored contents and the `files` record; a missing object is not an error."""
	if USE_SUPABASE:
		async with httpx.AsyncClient(timeout=30, verify=_TLS) as c:
			r = await c.delete(_object_url(f["id"]), headers=_headers())
		if r.status_code >= 300 and r.status_code not in (400, 404):
			logger.error("Supabase delete %s failed (%s): %s", f["id"], r.status_code, r.text[:300])
	else:
		await asyncio.to_thread(_local_path(f).unlink, missing_ok=True)
	await db.files.delete_one({"id": f["id"]})


async def upload_local_files_to_storage() -> int:
	"""Copy files present in backend/uploads/ but missing from Supabase. Safe to re-run."""
	if not USE_SUPABASE:
		return 0
	copied = 0
	async for f in db.files.find({}, {"_id": 0}):
		path = _local_path(f)
		if not path.is_file():
			continue
		r = await _upload(f["id"], await asyncio.to_thread(path.read_bytes), f["content_type"], upsert=False)
		if r.status_code < 300:
			copied += 1
		elif "exists" not in r.text.lower() and "duplicate" not in r.text.lower():
			raise RuntimeError(f"Supabase upload {f['id']} failed ({r.status_code}): {r.text[:300]}")
	if copied:
		logger.info("Copied %d local file(s) to Supabase bucket %s", copied, SUPABASE_BUCKET)
	return copied


async def storage_ping() -> bool:
	"""Cheap Supabase call; a scheduled hit keeps the free project from pausing for inactivity."""
	if not USE_SUPABASE:
		return False
	async with httpx.AsyncClient(timeout=30, verify=_TLS) as c:
		r = await c.post(f"{SUPABASE_URL}/storage/v1/object/list/{SUPABASE_BUCKET}",
						 json={"prefix": "", "limit": 1}, headers=_headers())
	return r.status_code == 200
