# V Tech Elevators — Self-Deployment Guide

This guide takes you from "I only have a laptop" to "the website and staff CRM are live on my own domain with HTTPS",
using free or low-cost services only. No Emergent or third-party help is required.

> **Two ways to deploy:** Parts C–G put everything on one VPS (Nginx + MongoDB on the same server).
> **PART I** deploys to free managed services instead: Cloudflare Pages (website) + Render (API) +
> Supabase Storage (files) + MongoDB Atlas M0 (database). No card needed. Parts A–B (laptop setup) apply to both.

---

## 0. What you are deploying (read once)

| Part | Technology | Folder | Runs on |
|---|---|---|---|
| Public website + staff CRM screens | React 19 + Vite (TypeScript) | `frontend/` | Built into static files (`frontend/dist`) served by Nginx |
| API / business logic / PDFs | Python 3.11+ FastAPI (uvicorn) | `backend/` | Port **8001** (only reachable from the same machine) |
| Database | MongoDB Community (free) | — | Port **27017** (only reachable from the same machine) |
| Uploaded files, brochure PDFs | Plain folder (VPS) — or Supabase Storage bucket (PART I) | `backend/uploads/` | Server disk / bucket |

How a request flows on the live server:

```
Browser ──HTTPS──> Nginx (port 443)
                    ├── /            → static files in frontend/dist  (the React app)
                    └── /api/...     → uvicorn on 127.0.0.1:8001  (FastAPI)
                                          └── MongoDB on 127.0.0.1:27017
```

The frontend always calls relative `/api/...` URLs, so the website and API **must be on the same domain**
(Nginx does this for you). The backend reads its settings from `backend/.env`.

### Costs summary

| Item | Option | Cost |
|---|---|---|
| Server (VPS) | Hetzner CX22 / DigitalOcean / AWS Lightsail / Hostinger KVM 1 | ~US$4–12 per month |
| Server (free) | Oracle Cloud "Always Free" ARM VM | ₹0 (needs a card for verification; availability varies) |
| Database | MongoDB Community installed on the same server | ₹0 |
| Database (alternative) | MongoDB Atlas M0 free cluster | ₹0 (512 MB limit) |
| Domain | `.in` / `.com` from any registrar (GoDaddy, Namecheap, Hostinger, Cloudflare) | ~₹800–1,500 per year |
| HTTPS certificate | Let's Encrypt (certbot) | ₹0 |
| Code hosting | GitHub private repository | ₹0 |

**Recommended minimum:** 1 VPS with **2 GB RAM, 1–2 vCPU, 20+ GB disk, Ubuntu 24.04 LTS**.
1 GB RAM works only if you add swap (step 4.3) — building the frontend needs memory.

---

## PART A — Get the code onto your laptop

### A1. Install the tools on your laptop

| Tool | Why | Where |
|---|---|---|
| Git | download/upload code | https://git-scm.com/downloads |
| VS Code (optional) | edit files | https://code.visualstudio.com |
| Python 3.11 or 3.12 | run backend locally | https://www.python.org/downloads (Windows: tick "Add Python to PATH") |
| Node.js 20 LTS or 22 LTS | build frontend | https://nodejs.org |
| Yarn | frontend package manager | after Node: run `corepack enable` (or `npm install -g yarn`) |
| MongoDB Community Server | local database | https://www.mongodb.com/try/download/community (choose "Install as a Service") |
| MongoDB Compass (optional) | look at the data visually | https://www.mongodb.com/try/download/compass |

Check they work (open a terminal / PowerShell):

```bash
git --version
python --version        # Windows may be: py --version
node --version
yarn --version
```

### A2. Save your current data from the preview BEFORE leaving

The preview database does **not** come with the code.

1. Open the preview site, log in as **Admin**.
2. Go to the Admin **Backup** section → **Download backup**. You get a file like `vtech-backup-20261117-1200.json`.
3. Keep this file safe — it contains customer data. You will restore it later (step 7).
4. Uploaded files (photos/documents attached to leads) live in `backend/uploads/` (or in the Supabase Storage
   bucket, PART I) and are **not** inside the JSON backup. Copy that folder/bucket too, or re-upload important ones.

### A3. Push the code to your GitHub

1. Create a free GitHub account at https://github.com.
2. In Emergent, use **Save to GitHub**, connect your account and choose/create a **private** repository
   (e.g. `vtech-elevators`).
3. On your laptop:

```bash
git clone https://github.com/<your-username>/vtech-elevators.git
cd vtech-elevators
```

> Keep the repository **private**. Never commit real passwords. `backend/.env` holds only database connection
> settings; on the server you will create your own copy.

---

## PART B — Run it on your laptop (to confirm it works)

### B1. Start MongoDB

- Windows/macOS installer "as a Service": it is already running.
- macOS with Homebrew: `brew tap mongodb/brew && brew install mongodb-community && brew services start mongodb-community`
- Check: open Compass and connect to `mongodb://localhost:27017`.

### B2. Backend

```bash
cd backend
python -m venv venv
# Windows:  venv\Scripts\activate
# mac/Linux: source venv/bin/activate
pip install --upgrade pip
pip install -r requirements-dev.txt
```

Create/confirm `backend/.env`:

```
MONGO_URL="mongodb://localhost:27017"
DB_NAME="vtech"
CORS_ORIGINS="http://localhost:3000"
APP_URL="http://localhost:3000"
APP_TZ="Asia/Kolkata"
```

Load the starting data (staff accounts, products, projects, FAQs, brochures, a few clearly-marked SAMPLE leads).
It is safe to run more than once:

```bash
python seed.py
```

Start the API:

```bash
uvicorn server:app --host 127.0.0.1 --port 8001 --reload
```

Test in a browser: http://localhost:8001/api/ → `{"message":"V Tech Elevators API"}`.

### B3. Frontend (second terminal)

```bash
cd frontend
yarn install
yarn dev
```

Open http://localhost:3000. In development Vite forwards `/api` to `localhost:8001` automatically.
Staff login is at http://localhost:3000/login.

Default seeded staff logins (**change them before going live** — step 8):

| Role | Email | Password |
|---|---|---|
| Admin | admin@vtech.in | Admin@123 |
| Manager | manager@vtech.in | Manager@123 |
| Telecaller | priya@vtech.in | Telecaller@123 |

> The two Emergent-only editor add-ons have been removed from the frontend dependencies
> and Vite configuration. They are not needed to run or build the application.
> See `README.md` for the local Windows setup, including standalone MongoDB.

If everything works on the laptop, continue.

---

## PART C — Buy/get the cheap pieces

### C1. Domain

Buy e.g. `vtechelevators.in` from any registrar. You will only need access to its **DNS settings**.

### C2. Server (VPS)

Create a VPS with **Ubuntu 24.04 LTS**, 2 GB RAM. Examples:
- **Hetzner Cloud** CX22 (~€4/month) — cheapest reliable option.
- **DigitalOcean** Basic Droplet 2 GB (~$12/month), **AWS Lightsail** 2 GB (~$10/month), **Hostinger KVM 1**.
- **Oracle Cloud Always Free** (Ampere A1 ARM, Ubuntu 24.04) — free; also open ports 80/443 in the
  "Security List" of the VCN in Oracle's console.

During creation:
- Choose a region near Bengaluru/India (e.g. Mumbai/Singapore) if offered.
- Add an **SSH key** (recommended) or set a strong root password.
  Create a key on your laptop: `ssh-keygen -t ed25519` → paste the content of `~/.ssh/id_ed25519.pub`.
- Note the server's **public IP address** (e.g. `203.0.113.10`).

### C3. Point the domain to the server

In your registrar's DNS panel add:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | your server IP | 300 / default |
| A | `www` | your server IP | 300 / default |

DNS can take 5 minutes to a few hours. Check from the laptop: `ping vtechelevators.in` shows your IP.

---

## PART D — Prepare the server

All commands below are run **on the server**. Connect from your laptop:

```bash
ssh root@203.0.113.10
```

### 4.1 Update and basic tools

```bash
apt update && apt upgrade -y
apt install -y git curl gnupg nginx ufw python3 python3-venv python3-pip build-essential
timedatectl set-timezone Asia/Kolkata
```

### 4.2 Create a normal user (do not run the app as root)

```bash
adduser vtech                 # set a password
usermod -aG sudo vtech
rsync --archive --chown=vtech:vtech ~/.ssh /home/vtech   # copy your SSH key
```

### 4.3 Add swap (important on 1–2 GB servers)

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 4.4 Firewall — only SSH and web are open

```bash
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw enable
ufw status
```

MongoDB (27017) and the API (8001) stay **closed** to the internet. That is intentional.

### 4.5 Install MongoDB Community 8.0 (free)

```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-8.0.asc | gpg -o /usr/share/keyrings/mongodb-server-8.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-8.0.gpg ] https://repo.mongodb.org/apt/ubuntu noble/mongodb-org/8.0 multiverse" > /etc/apt/sources.list.d/mongodb-org-8.0.list
apt update
apt install -y mongodb-org
systemctl enable --now mongod
systemctl status mongod        # should say "active (running)"
```

By default MongoDB listens only on `127.0.0.1`, so it cannot be reached from outside. Verify:

```bash
grep bindIp /etc/mongod.conf     # → bindIp: 127.0.0.1
```

**Optional but recommended: enable a database password.**

```bash
mongosh
```
```js
use admin
db.createUser({ user: "vtechadmin", pwd: "CHOOSE-A-LONG-PASSWORD", roles: [ { role: "root", db: "admin" } ] })
use vtech
db.createUser({ user: "vtechapp", pwd: "ANOTHER-LONG-PASSWORD", roles: [ { role: "readWrite", db: "vtech" } ] })
exit
```
Edit `/etc/mongod.conf` and add:
```yaml
security:
  authorization: enabled
```
Then `systemctl restart mongod`. Your connection string becomes
`mongodb://vtechapp:ANOTHER-LONG-PASSWORD@127.0.0.1:27017/vtech?authSource=vtech`.
(If the password has special characters like `@ : / ?`, URL-encode them or use only letters and numbers.)

> **Alternative — MongoDB Atlas free tier instead of installing MongoDB:** create an M0 cluster at
> https://www.mongodb.com/cloud/atlas, create a database user, in "Network Access" allow your server's IP,
> and copy the `mongodb+srv://...` string into `MONGO_URL`. Nothing else in the app changes.

### 4.6 Install Node.js 22 and Yarn (to build the frontend)

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
corepack enable
node --version && yarn --version
```

---

## PART E — Install the app on the server

Switch to the app user:

```bash
su - vtech
```

### 5.1 Download the code

For a private repo, create a GitHub **Personal Access Token** (GitHub → Settings → Developer settings →
Personal access tokens → Fine-grained → read access to this repo) and use it as the password, or add a
deploy key.

```bash
cd ~
git clone https://github.com/<your-username>/vtech-elevators.git app
cd app
```

The app now lives in `/home/vtech/app`.

### 5.2 Backend setup

```bash
cd /home/vtech/app/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Create `/home/vtech/app/backend/.env` (`nano .env`):

```
MONGO_URL="mongodb://127.0.0.1:27017"
DB_NAME="vtech"
CORS_ORIGINS="https://vtechelevators.in,https://www.vtechelevators.in"
APP_URL="https://vtechelevators.in"
APP_TZ="Asia/Kolkata"
```

(Use the password version of `MONGO_URL` from 4.5 if you enabled authentication.)

```bash
chmod 600 .env
python seed.py          # creates staff accounts + website content; safe to re-run
deactivate
```

Quick test (Ctrl+C to stop):

```bash
cd /home/vtech/app/backend && ./venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001
# in another SSH window:  curl http://127.0.0.1:8001/api/
```

### 5.3 Build the frontend

```bash
cd /home/vtech/app/frontend
yarn install
yarn build
ls dist                 # index.html + assets/ → this is the website
```

`yarn build` also type-checks the code; if it reports an error, fix it before going on.

### 5.4 Keep the API running forever (systemd)

Exit back to root (`exit`) and create `/etc/systemd/system/vtech-api.service`:

```ini
[Unit]
Description=V Tech Elevators API (FastAPI)
After=network.target mongod.service
Wants=mongod.service

[Service]
User=vtech
Group=vtech
WorkingDirectory=/home/vtech/app/backend
ExecStart=/home/vtech/app/backend/venv/bin/uvicorn server:app --host 127.0.0.1 --port 8001 --workers 2
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable --now vtech-api
systemctl status vtech-api          # active (running)
curl http://127.0.0.1:8001/api/     # {"message":"V Tech Elevators API"}
```

Logs: `journalctl -u vtech-api -f`

> Use `--workers 1` on a 1 GB server.

### 5.5 Nginx: serve the website and forward /api

Allow Nginx to read the built files:

```bash
chmod o+x /home/vtech /home/vtech/app /home/vtech/app/frontend
chmod -R o+r /home/vtech/app/frontend/dist
```

Create `/etc/nginx/sites-available/vtech`:

```nginx
server {
    listen 80;
    server_name vtechelevators.in www.vtechelevators.in;

    root /home/vtech/app/frontend/dist;
    index index.html;

    # uploads (lead photos/documents, backups) — must be at least the app's largest upload
    client_max_body_size 25M;

    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    # API → FastAPI
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # needed: login cookie is marked Secure on HTTPS
        proxy_read_timeout 120s;
    }

    # cache built assets
    location /assets/ {
        expires 30d;
        add_header Cache-Control "public, immutable";
        try_files $uri =404;
    }

    # React routes (/products, /login, /staff/..., /q/<token>) → index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

```bash
ln -s /etc/nginx/sites-available/vtech /etc/nginx/sites-enabled/vtech
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

Open `http://vtechelevators.in` — the website should load.

### 5.6 Free HTTPS (Let's Encrypt)

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d vtechelevators.in -d www.vtechelevators.in --redirect -m you@yourmail.com --agree-tos
certbot renew --dry-run      # auto-renewal check (renews itself every ~60 days)
```

Now `https://vtechelevators.in` works and http redirects to https.

> Staff login uses an HTTP-only cookie that is marked *Secure* when the site is on HTTPS. Always use the
> https address; the `X-Forwarded-Proto` line in Nginx is what tells the app it is on HTTPS.

---

## PART F — Data, accounts and going live

### 7. Restore your preview data (optional)

1. Open `https://vtechelevators.in/login`, sign in as **Admin** (seeded login above).
2. Admin **Backup** section → **Verify** the `vtech-backup-....json` file first, then **Restore**.
3. Restoring brings back the users from the preview too, so log in afterwards with the preview credentials.

### 8. Security checklist before sharing the site

- [ ] Change **every** staff password (Admin → Employees), especially the seeded `Admin@123`, `Manager@123`, `Telecaller@123`.
- [ ] Deactivate staff accounts you do not use.
- [ ] Settings → enter real **phone, email, WhatsApp number, address** (customer pages read these).
- [ ] Mark/close the clearly-labelled SAMPLE leads (do not delete records — use status/archive).
- [ ] `ufw status` shows only OpenSSH + Nginx Full.
- [ ] `backend/.env` is `chmod 600` and is not pushed to a public place.
- [ ] Optional: disable root SSH login — in `/etc/ssh/sshd_config` set `PermitRootLogin no`, then `systemctl restart ssh`
      (only after confirming `ssh vtech@<ip>` works).

### 9. Automatic daily backups (free)

Back up the **database** (it also holds uploaded files and brochure PDFs). As user `vtech`:

```bash
mkdir -p /home/vtech/backups
nano /home/vtech/backup.sh
```

```bash
#!/bin/bash
set -e
STAMP=$(date +%Y%m%d-%H%M)
DEST=/home/vtech/backups/$STAMP
mkdir -p "$DEST"
mongodump --uri="mongodb://127.0.0.1:27017" --db=vtech --out="$DEST/db"     # use your auth URI if enabled
tar -czf "$DEST/uploads.tar.gz" -C /home/vtech/app/backend uploads
find /home/vtech/backups -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +   # keep 14 days
```

```bash
chmod +x /home/vtech/backup.sh
crontab -e
# add this line (daily 2:30 AM):
30 2 * * * /home/vtech/backup.sh >> /home/vtech/backups/backup.log 2>&1
```

(`mongodump` comes with the `mongodb-org` package; if missing: `sudo apt install -y mongodb-database-tools`.)

**Keep a copy off the server**, e.g. weekly from your laptop:

```bash
scp -r vtech@203.0.113.10:/home/vtech/backups ./vtech-backups
```

Also download the in-app JSON backup from the Admin panel from time to time (it does not contain uploaded
files — the `uploads.tar.gz` above does).

**Restore from a mongodump** (disaster recovery):

```bash
mongorestore --uri="mongodb://127.0.0.1:27017" --drop /home/vtech/backups/<STAMP>/db
tar -xzf /home/vtech/backups/<STAMP>/uploads.tar.gz -C /home/vtech/app/backend
```

---

## PART G — Updating the app later

On your laptop: make changes → `git add . && git commit -m "change" && git push`.

On the server:

```bash
ssh vtech@203.0.113.10
cd ~/app && git pull

# if backend/requirements.txt changed:
cd backend && ./venv/bin/pip install -r requirements.txt && cd ..

# if the frontend changed:
cd frontend && yarn install && yarn build && cd ..

sudo systemctl restart vtech-api
```

No Nginx change is needed; it serves the new `frontend/dist` immediately.

---

## PART H — Troubleshooting

| Symptom | Check / fix |
|---|---|
| Website shows Nginx "Welcome" page | `rm /etc/nginx/sites-enabled/default && systemctl reload nginx` |
| 502 Bad Gateway on /api | API not running: `systemctl status vtech-api`, `journalctl -u vtech-api -n 100` |
| API log: `KeyError: 'MONGO_URL'` | `backend/.env` missing or in the wrong folder |
| API log: `ServerSelectionTimeoutError` | MongoDB not running: `systemctl status mongod`; wrong `MONGO_URL`/password |
| 403/404 on website files | permissions: re-run the `chmod` lines in 5.5; check `root` path in Nginx |
| Refreshing `/staff/leads` gives 404 | the `try_files ... /index.html` line is missing in Nginx |
| Login succeeds but you are sent back to login | open the **https** URL; confirm `X-Forwarded-Proto` line in Nginx |
| Upload fails "413 Request Entity Too Large" | raise `client_max_body_size` in Nginx, reload |
| `yarn build` killed / out of memory | add swap (4.3) or build on the laptop and upload `dist` with `scp -r frontend/dist vtech@IP:~/app/frontend/` |
| Certbot fails | DNS not pointing to server yet (`ping` your domain), or ports 80/443 closed (ufw / cloud security list) |
| Wrong times on follow-ups/reports | set `APP_TZ="Asia/Kolkata"` in `.env` and `timedatectl set-timezone Asia/Kolkata`, restart API |
| Disk full | `df -h`; clean old backups in `/home/vtech/backups` |

Useful commands:

```bash
systemctl restart vtech-api      # restart backend
systemctl reload nginx           # reload web server
journalctl -u vtech-api -f       # live API logs
tail -f /var/log/nginx/error.log # web server errors
mongosh vtech                    # open the database shell  (e.g. db.leads.countDocuments())
```

---

## Appendix — Where customer data lives

Database `vtech` (MongoDB on your server). Main collections:
`customers`, `leads`, `interactions` (calls/notes/checklist answers), `followups`, `quotations`,
`quotation_revisions`, `quotation_views`, `orders`, `inspections`, `service_requests`, `amc`,
`brochure_downloads`, `audit_logs`, `users` (staff, passwords stored only as bcrypt hashes),
`sessions`, `login_history`, `notifications`, `settings`, plus website content
(`products`, `projects`, `services`, `faqs`, `testimonials`, `brochures`).
Files: `files` collection holds only name/type/owner; the contents are in `/home/vtech/app/backend/uploads/`
(VPS) or in the Supabase Storage bucket `files`, one object per file id (PART I).

Nothing is sent to any outside service — there is no paid SMS, WhatsApp, email or analytics integration.

---

## PART I — Free managed services: Cloudflare Pages + Render + Supabase Storage + MongoDB Atlas M0

Use this instead of Parts C–G if you do not want to manage a server. None of these services needs a card.

```
Browser ──HTTPS──> Cloudflare Pages  (your domain)
                    ├── /          → static files from frontend/dist
                    └── /api/...   → Pages Function frontend/functions/api/[[path]].ts
                                       └── forwards (with PROXY_SECRET) to Render (FastAPI, Docker)
                                              ├── MongoDB Atlas M0       (records)
                                              └── Supabase Storage       (uploaded files, brochure PDFs)
```

The browser only ever talks to your Cloudflare domain:
- The Render address (`*.onrender.com`), database and Supabase details never reach the browser — not in the
  page code, not in the Network tab, not in response headers (the Function strips hosting headers).
- The Render address rejects any request that did not come through the Function (it returns 404 without the
  shared `PROXY_SECRET`), so nobody can bypass your site and call the API directly.
- API documentation pages (`/docs`, `/openapi.json`) are off unless `API_DOCS=1` is set.
- What the Network tab *does* show is your own site's `/api/...` calls and the data the logged-in user is
  allowed to see — that is how any web app works; role checks on the server decide what each user gets.

### I1. MongoDB Atlas (free M0)

1. Sign up at https://www.mongodb.com/cloud/atlas → **Create** → **M0 Free**, region **Mumbai**
   (untick "Load sample dataset").
2. **Database Access** → database user, password with letters and numbers only, role
   **readWrite @ `vtech`** (not Atlas admin).
3. **Network Access** → Add IP Address → `0.0.0.0/0` (Render has no fixed outgoing IP on the free plan;
   the strong DB password is the protection).
4. **Connect** → Drivers → Python → copy the string, e.g.
   `mongodb+srv://<user>:<password>@<cluster>.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   You load the starting data in I3, after the file storage exists.

M0 limits: 512 MB storage, no automatic backups — download the in-app JSON backup (Admin → Backup) regularly.
Atlas stores only records; all uploaded files and brochure PDFs go to Supabase Storage (I2).

### I2. Supabase Storage (files)

1. Sign up at https://supabase.com → **New project**: name `vtech`, a strong database password (not used by
   this app, but keep it), region **Mumbai** (or Singapore), plan **Free**.
2. **Storage** → **New bucket** → name `files`, **Public bucket: OFF** (files include customer documents;
   the app streams them only to authorised users).
3. **Project Settings → API Keys** (or **Data API**): copy
   - **Project URL** → e.g. `https://abcdefgh.supabase.co` → this is `SUPABASE_URL`
   - the **secret** key (`sb_secret_...`) — or on older projects the **service_role** key (`eyJ...`) →
     this is `SUPABASE_SERVICE_KEY`. **Never** put it in frontend code or share it; it bypasses all bucket rules.

Free plan: about 1 GB of files. Free projects **pause after ~7 days without activity** — the keep-alive job
in I6 prevents that. If it ever pauses, open the Supabase dashboard and click **Restore**.

### I3. Load starting data (from your laptop)

In `backend/.env` (never committed) set:

```
MONGO_URL="<Atlas string from I1, with your password>"
DB_NAME="vtech"
SUPABASE_URL="https://abcdefgh.supabase.co"
SUPABASE_SERVICE_KEY="<secret key from I2>"
SUPABASE_BUCKET="files"
```

Then `python seed.py` (see B2). It creates staff accounts, website content and brochure PDFs (uploaded to
Supabase), and copies any files already in `backend/uploads/` to Supabase (safe to re-run).
Then follow step 8 to change the seeded passwords. To go back to purely local testing, switch `MONGO_URL` back to
`mongodb://127.0.0.1:27017` and remove the three `SUPABASE_` lines.

Create the shared proxy secret now (used in I4 and I5) and keep it in your password manager:

```bash
python -c "import secrets; print(secrets.token_urlsafe(32))"
```

### I4. Render (API)

1. Sign up at https://render.com with your GitHub account.
2. **New → Web Service** → connect your GitHub repository.

| Setting | Value |
|---|---|
| Name | `vtech-api` (becomes `https://vtech-api.onrender.com` — only the Cloudflare Function uses it) |
| Region | **Singapore** (closest to India) |
| Branch | `main` |
| Root Directory | `backend` |
| Language / Runtime | **Docker** (uses `backend/Dockerfile`) |
| Instance Type | **Free** |

3. **Environment Variables** (Add from .env, or one by one):

| Key | Value |
|---|---|
| `MONGO_URL` | Atlas string from I1 (with password) |
| `DB_NAME` | `vtech` |
| `APP_TZ` | `Asia/Kolkata` |
| `SUPABASE_URL` | from I2 |
| `SUPABASE_SERVICE_KEY` | from I2 |
| `SUPABASE_BUCKET` | `files` |
| `PROXY_SECRET` | the value you generated in I3 |

   - Do **not** set `CORS_ORIGINS` or `API_DOCS` (the site reaches `/api` through the Function on the same domain).
   - The app refuses to start on Render without the Supabase settings, so files can never land on Render's
     temporary disk (it is wiped on every restart/deploy).
4. **Advanced → Health Check Path**: `/api/` (the only path that answers without the proxy secret).
5. **Create Web Service**. The first build takes a few minutes. Note the URL, e.g. `https://vtech-api.onrender.com`.
6. Test: `https://vtech-api.onrender.com/api/` → `{"message":"V Tech Elevators API"}`, and
   `https://vtech-api.onrender.com/api/public/content` → `{"detail":"Not Found"}` (blocked without the secret — correct).

Free plan: sleeps after ~15 minutes without traffic (the first request then waits ~30–60 s) — the keep-alive job
in I6 prevents that. ~750 free hours/month covers one service running all month.

### I5. Cloudflare Pages (website)

1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git** →
   choose your GitHub repository.
2. Build settings:

| Setting | Value |
|---|---|
| Framework preset | None (or Vite) |
| Root directory | `frontend` |
| Build command | `yarn build` |
| Build output directory | `dist` |

3. **Settings → Variables and Secrets** (add for both *Production* and *Preview*):

| Name | Type | Value |
|---|---|---|
| `API_ORIGIN` | Text | your Render URL from I4, e.g. `https://vtech-api.onrender.com` — **no trailing slash** |
| `PROXY_SECRET` | **Secret** (encrypted) | the same value you put on Render |
| `NODE_VERSION` | Text | `22` |

   These are read only by the Function on Cloudflare's servers; none of them is sent to the browser.
4. Save and **Retry deployment** (variable changes only apply to new deployments).
5. Test: `https://<project>.pages.dev/api/` → `{"message":"V Tech Elevators API"}`.

### I6. Keep-alive jobs (free, no card)

Use https://cron-job.org (free account). Both jobs call **your Cloudflare site**, never the Render address, so
they pass through the Function like normal visitors.

| Job | URL | Schedule | Why |
|---|---|---|---|
| Keep API awake | `https://<your-site>/api/` | every **14 minutes** | Render sleeps after 15 min without traffic |
| Keep storage active | `https://<your-site>/api/health/storage` | days **1, 6, 11, 16, 21, 26** of the month, 03:00 | Supabase pauses free projects after ~7 days idle; this makes a real storage call |

- Method `GET`, no headers or body needed. Enable "notify on failure" so you get an email if a job fails.
- `/api/health/storage` should return `{"ok":true}`; `{"ok":false}` means the Supabase settings on Render are wrong
  or the project is paused.
- One service awake all month uses ~744 of Render's ~750 free hours — don't add a second always-on service.

### I7. Your own domain (optional)

1. Pages project → **Custom domains** → add `vtechelevators.in` (and `www`). Easiest if the domain's DNS is
   on Cloudflare (free plan); otherwise follow the CNAME instructions shown.
   No backend change is needed — the Function proxies `/api` for every domain attached to the project.

### I8. Check it works

- [ ] `https://<your-site>/api/` returns the API message.
- [ ] `https://<your-site>/api/health/storage` returns `{"ok":true}`.
- [ ] `https://vtech-api.onrender.com/api/public/content` returns `{"detail":"Not Found"}` (direct access blocked).
- [ ] Public site loads; submitting an enquiry shows a reference number; a brochure downloads.
- [ ] `/login` → staff login works and stays logged in after a page refresh.
- [ ] Opening `https://<your-site>/staff/leads` directly (refresh) loads the page, not a 404.
- [ ] Upload a file on a lead → it appears in Supabase → Storage → `files`, and downloads in the app.
- [ ] A quotation **PDF** download and a CSV export work.
- [ ] Browser DevTools → Network: no request or response header mentions `onrender.com` or `supabase.co`.
- [ ] Then complete the security checklist in step 8.

### I9. Updating later

- `git push` to `main` → Cloudflare Pages rebuilds the website and Render rebuilds the API automatically.

### I10. Troubleshooting

| Symptom | Check / fix |
|---|---|
| `/api/...` returns "Service is not configured" | `API_ORIGIN` or `PROXY_SECRET` missing in Pages settings → add, then **Retry deployment** |
| Every `/api/...` call returns `{"detail":"Not Found"}` but `/api/` works | `PROXY_SECRET` differs between Render and Cloudflare (copy it again, no spaces) |
| `/api/...` very slow the first time | Render was asleep; check the I6 keep-alive job is running |
| Render deploy fails with `SUPABASE_URL and SUPABASE_SERVICE_KEY must be set` | Add both on Render → Environment |
| Upload fails "Could not store the file" | Render logs show the Supabase reply: bucket name wrong, wrong key (must be secret/service_role, not anon/publishable), or project paused |
| `/api/health/storage` returns `{"ok":false}` | Same as above |
| API log `ServerSelectionTimeoutError` | Atlas Network Access missing `0.0.0.0/0`, or wrong password in `MONGO_URL` |
| API log `KeyError: 'MONGO_URL'` | Env var not set on Render |
| Logs: Render → vtech-api → **Logs**; Pages → deployment → **Functions** tab | |
