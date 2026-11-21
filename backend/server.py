import asyncio
import secrets
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, APIRouter, Request
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes  # noqa: E402
from lib.files import storage_ping  # noqa: E402
from routers import admin, auth_users, crm, leads, public, sales  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
	app.state.index_task = asyncio.create_task(ensure_indexes())
	yield
	app.state.index_task.cancel()
	with suppress(asyncio.CancelledError):
		await app.state.index_task
	client.close()


_docs = os.environ.get("API_DOCS", "").lower() in ("1", "true", "yes")
app = FastAPI(lifespan=lifespan, title="V Tech Elevators API",
			  docs_url="/docs" if _docs else None, redoc_url=None, openapi_url="/openapi.json" if _docs else None)
api_router = APIRouter(prefix="/api")
PROXY_SECRET = os.environ.get("PROXY_SECRET", "").strip()


@app.middleware("http")
async def require_proxy(request: Request, call_next):
	# When set, only the Cloudflare proxy (which adds this header) may call the API; /api/ stays open for host health checks.
	if PROXY_SECRET and request.url.path != "/api/" and not secrets.compare_digest(
			request.headers.get("x-proxy-secret", "").encode(), PROXY_SECRET.encode()):
		return JSONResponse({"detail": "Not Found"}, status_code=404)
	return await call_next(request)


@api_router.get("/")
async def root():
	return {"message": "V Tech Elevators API"}


@api_router.get("/health/storage")
async def storage_health():
	return {"ok": await storage_ping()}


for module in (public, auth_users, leads, sales, crm, admin):
	api_router.include_router(module.router)

app.add_middleware(
	CORSMiddleware,
	allow_credentials=True,
	# Unset = no cross-origin access; the site reaches /api same-origin (Nginx or Cloudflare Pages proxy).
	allow_origins=[o.strip() for o in os.environ.get('CORS_ORIGINS', '').split(',') if o.strip() and o.strip() != '*'],
	allow_methods=["*"],
	allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Include the router in the main app (must stay last)
app.include_router(api_router)