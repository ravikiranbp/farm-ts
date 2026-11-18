import asyncio
from contextlib import asynccontextmanager, suppress
from fastapi import FastAPI, APIRouter
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
import os
import logging
from pathlib import Path


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
from lib.db import client, db, ensure_indexes  # noqa: E402
from routers import admin, auth_users, crm, leads, public, sales  # noqa: E402


@asynccontextmanager
async def lifespan(app: FastAPI):
	app.state.index_task = asyncio.create_task(ensure_indexes())
	yield
	app.state.index_task.cancel()
	with suppress(asyncio.CancelledError):
		await app.state.index_task
	client.close()


app = FastAPI(lifespan=lifespan, title="V Tech Elevators API")
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
	return {"message": "V Tech Elevators API"}


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