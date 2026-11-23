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

## C. Optional feature

- [ ] **Upload photo** button for products and projects (store photos in Supabase instead of pasting image links)

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
