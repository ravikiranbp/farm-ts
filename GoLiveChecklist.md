# V Tech Elevators — Go-Live Checklist

Tick each box (`[ ]` → `[x]`) when done. Live site: https://farm-ts.pages.dev · Staff login: https://farm-ts.pages.dev/login

---

## A. Update yourself in the admin screens (no code needed)

### A1. Company details — Staff → **Settings** → Save settings

Shown on the website (Contact page, footer, WhatsApp button) and on quotation / inspection PDFs.

- [ ] **Phone** — replace `+91 90000 00000` with the real number
- [ ] **WhatsApp** — replace `919000000000` with the real number (country code + number, digits only, e.g. `9198xxxxxxxx`)
- [ ] **Email** — replace `info@vtechelevators.in` with an email you actually receive
- [ ] **Address** — replace `Bengaluru, Karnataka, India` with the full office address
- [ ] **GSTIN** — add GST number (printed on quotations)
- [ ] **About** — replace generic text with the real company story (About page)
- [ ] **Tagline** — keep "Lifting Lives Higher" or change
- [ ] **Payment terms** — replace 40% / 50% / 10% with real terms
- [ ] **Warranty** — replace "12 months comprehensive…" with real warranty
- [ ] **Terms & conditions** — replace generic terms with real terms
- [ ] **Delivery timeline** — confirm / replace "8–10 weeks"
- [ ] **Installation timeline** — confirm / replace "3–4 weeks"
- [ ] **Authorised signatory** — e.g. "Ravikiran P, Director"
- [ ] **Tax % (18%) and quote validity (30 days)** — confirm

### A2. Website content — Staff → **Website Content**

- [ ] **projects** — unpublish all 6 SAMPLE projects (made-up sites with stock photos)
- [ ] **projects** — add real completed projects (name, location, floors, lifts, photos, customer permission)
- [ ] **testimonials** — unpublish all 3 SAMPLE testimonials
- [ ] **testimonials** — add real testimonials (only with customer permission)
- [ ] **products** — review all 8 products: names, descriptions, capacity, speed, specs
- [ ] **products** — replace stock photos with real photos
- [ ] **products** — tick **Specs verified** once engineering has confirmed specs
- [ ] **services** — review the 5 services and their wording
- [ ] **faqs** — review the 6 FAQ answers (timelines, AMC, licensing)
- [ ] **brochures** — **Upload PDF** with the real catalogue (max 10 MB) and edit title / description
- [ ] **offer** — (optional) post an offer image

### A3. Sample leads — Staff → **Leads**

- [ ] Archive or delete the 6 SAMPLE leads / customers (fake numbers `98450110xx`)

---

## B. Needs a code change — send the content, then it gets updated

- [x] **Logo & browser icon** — current `logo.jpeg` confirmed as the real logo
- [x] **Home page big photo** — keep the stock photo (decided)
- [x] **Home page headline & paragraph** — keep as is (decided)
- [x] **Home page highlights** — "Free site inspection · 12 mo warranty · AMC plans" confirmed true
- [x] **Google search title & description** (`index.html`) — keep current wording (decided)
- [x] **Installation steps** (Services page, 8 steps) — keep as is (decided)
- [x] **"Specifications are indicative" notes** — Products page line kept; product detail line always shown; "Note" row removed from product spec tables; note removed from projects
- [ ] **Backup contact details** (`PublicLayout.tsx`) — update to real values after A1 is done
- [x] (Optional) **Google Maps location** on Contact page — not needed (decided)
- [ ] (Optional) **Social media links** — send Instagram / Facebook / YouTube links when available

## C. Features in progress

- [x] **Upload photos for projects** (products keep image links) — Website Content → projects → Upload photos
- [x] **Auto-retry in Cloudflare proxy** — waits up to ~30 s while Render wakes up / restarts instead of showing 502

---

## D. Staff accounts & security

- [ ] Change password for **Ravikiran P** (`admin@vtech.in`) — Staff → Employees → Reset password
- [ ] Change password for **Manjunath K S** (`manager@vtech.in`)
- [ ] Decide on demo accounts **Kiran Kumar (Manager 2)**, **Priya S**, **Rahul M** — deactivate or rename to real staff
- [ ] (Optional) Change login emails to real emails

## E. Keep the free services awake — https://cron-job.org

- [ ] Job 1: `https://farm-ts.pages.dev/api/` — every **14 minutes**
- [ ] Job 2: `https://farm-ts.pages.dev/api/health/storage` — days **1, 6, 11, 16, 21, 26** of the month, 03:00
- [ ] "Notify on failure" turned on for both

## F. Later

- [ ] (Optional) Buy a domain (e.g. `vtechelevators.in`) → add in Cloudflare Pages → Custom domains
- [ ] If the domain is added and `farm-ts.pages.dev` is redirected → update both cron job URLs
- [ ] Download a backup regularly — Staff → Settings → Download full database backup

---

## Done — requests already completed (for reference)

- [x] Deployment: Cloudflare Pages (website) + Render (API, Singapore) + Supabase Storage (files) + MongoDB Atlas M0 (Singapore)
- [x] API hidden behind Cloudflare: Render address, keys and API docs never reach the browser; direct Render access blocked
- [x] Uploaded files stored in Supabase (private bucket `Files`), not in the database
- [x] Starting data loaded into Atlas; demo PDFs cleaned up
- [x] Brochure PDF upload limit raised to 10 MB (other files 5 MB)
- [x] Only one brochure kept ("V Tech Complete Lift Catalogue"); "Home Elevators Brochure" removed
- [x] Consent checkbox removed from enquiry, brochure and service request forms
- [x] Home-page offer overlay: admin tab, image-only popup, ✕ close, 2 s delay, 10 s auto-close, once per visit, tap → enquiry form "Enquiry about Offer"
- [x] Staff names: admin → **Ravikiran P**, manager → **Manjunath K S**
- [x] Product spec "Note" row removed; project indicative note removed; product disclaimer always shown
- [x] Security fixes: CORS locked down, password change signs out other sessions, slim production dependencies
