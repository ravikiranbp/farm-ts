"""Uploaded file contents: Google Cloud Storage when GCS_BUCKET is set (required on Cloud Run), else backend/uploads/
(local dev / single VPS). MongoDB holds only the metadata in `files`."""
import asyncio
import logging
import os
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException
from fastapi.responses import Response

from lib.db import db  # also loads backend/.env before GCS_BUCKET is read

GCS_BUCKET = os.environ.get("GCS_BUCKET", "").strip()
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
if os.environ.get("K_SERVICE") and not GCS_BUCKET:  # K_SERVICE is set by Cloud Run
	raise RuntimeError("GCS_BUCKET must be set on Cloud Run: the container disk is wiped on every restart")

logger = logging.getLogger(__name__)
_bucket = None


def _gcs_blob(fid: str):
	global _bucket
	if _bucket is None:
		from google.cloud import storage  # lazy: local-disk setups need no GCP credentials
		_bucket = storage.Client().bucket(GCS_BUCKET)
	return _bucket.blob(f"files/{fid}")


def _local_path(f: dict) -> Path:
	# Older records stored a full "path" ending in <id><ext>; newer local files are saved as <id>.
	return UPLOAD_DIR / (Path(f["path"]).name if f.get("path") else f["id"])


async def store_file(fid: str, data: bytes, content_type: str) -> None:
	if GCS_BUCKET:
		await asyncio.to_thread(_gcs_blob(fid).upload_from_string, data, content_type=content_type)
	else:
		UPLOAD_DIR.mkdir(exist_ok=True)
		await asyncio.to_thread((UPLOAD_DIR / fid).write_bytes, data)


async def _load(f: dict) -> bytes | None:
	if GCS_BUCKET:
		from google.api_core.exceptions import NotFound
		try:
			return await asyncio.to_thread(_gcs_blob(f["id"]).download_as_bytes)
		except NotFound:
			return None
	path = _local_path(f)
	return await asyncio.to_thread(path.read_bytes) if path.is_file() else None


async def file_response(f: dict, download: bool = True) -> Response:
	data = await _load(f)
	if data is None:
		raise HTTPException(404, "File content is missing")
	headers = {"Content-Disposition": f"attachment; filename*=utf-8''{quote(f['name'])}"} if download else None
	return Response(data, media_type=f["content_type"], headers=headers)


async def upload_local_files_to_gcs() -> int:
	"""Copy files present in backend/uploads/ but missing from the bucket. Safe to re-run."""
	if not GCS_BUCKET:
		return 0
	copied = 0
	async for f in db.files.find({}, {"_id": 0}):
		path, blob = _local_path(f), _gcs_blob(f["id"])
		if path.is_file() and not await asyncio.to_thread(blob.exists):
			await asyncio.to_thread(blob.upload_from_filename, str(path), content_type=f["content_type"])
			copied += 1
	if copied:
		logger.info("Copied %d local file(s) to gs://%s", copied, GCS_BUCKET)
	return copied
