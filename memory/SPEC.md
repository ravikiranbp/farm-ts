# V Tech Elevators — Platform Spec

Public website + internal business console for a Bengaluru lift company. FastAPI + Mongo backend, React frontend.

## Public site (no login)
/, /products (+compare up to 3), /products/:slug, /projects (filters, lightbox), /services (process + AMC), /brochures (gated download), /about, /faqs, /contact (callback form), /quote (?type=inspection for site inspection), /service-request.
- POST /api/public/enquiries {enquiry_type: enquiry|callback|inspection|brochure, name, mobile(10-digit IN), city, consent=true, ...} → {reference: ENQ-YYYY-NNNN, download_url?}
- Brochure: requires brochure_id; records brochure_downloads; download via /api/public/brochures/download/{id}.
- POST /api/public/service-requests → SRV-YYYY-NNNN.
- Customer dedupe by normalised mobile; each enquiry is a new lead; open lead for same customer → possible_duplicate + duplicate_of.
- Auto-assign (settings.auto_assign) round-robin among active telecallers → status "Assigned".

## Auth & roles
httpOnly cookie `vt_session`, server-side sliding inactivity timeout (settings.session_timeout_minutes, default 30). Roles: admin, manager, telecaller. Enforced in backend (lib/auth.require).
- Telecaller: only leads assigned_to them (others 403); cannot set Approved/Quotation Sent/Negotiation/Won/Inspection Scheduled/Completed; cannot approve; cannot create/approve quotations; audit = own only.
- Manager: all leads, assign/reassign, approve positive leads EXCEPT ones they submitted themselves, quotations (approve within limits: manager_max_quote_amount ₹25,00,000, manager_max_discount_pct 10%), team audit.
- Admin: everything incl. employees, settings, CMS, archive/restore, backup/restore.

## Lead workflow
18 statuses (lib/common.LEAD_STATUSES). submit-positive → "Positive – Awaiting Manager Approval" + approval.state=pending. decision approve→Approved, reject (comment required)→Follow-up Required, request_info→Interested. Closing statuses (Lost/Not Interested/Invalid) need a comment. No hard delete; admin archive/restore.
Interactions (call notes) auto-move New/Assigned → Contacted when answered. Follow-ups have due_at, owner, done; overdue = due < now.

## Quotations
QTN-YYYY-NNNN, revisions in quotation_revisions. Statuses Draft → Pending Approval → Approved → Sent to Customer → Under Negotiation → Accepted/Rejected; Expired computed from valid_until. Editing an issued quote (Approved/Sent/Negotiation/Expired) creates revision+1 (status Draft) and freezes the old snapshot. Accept → creates Order (ORD-…) with 3 payment milestones, lead → Won. PDF: /api/quotations/{id}/pdf[?revision=n].
Totals: subtotal = items + installation + transport + additional; discount = subtotal*pct; tax on (subtotal-discount).

## Quotation share link
POST /api/quotations/{id}/share (manager/admin; status Approved/Sent/Negotiation) → share.token tied to current revision (snapshot frozen). Public page /q/{token} → GET /api/public/quotes/{token} (+/pdf). Link invalid if revoked (404), past valid_until or quotation revised since sharing (410). Views counted (view_count, first/last_viewed_at, quotation_views log) except when a staff session cookie is present; first view notifies creator. Customer can POST /respond {accept|changes, name, comment (required for changes)} → customer_responses + notify; status is NOT changed — manager confirms via "Customer accepted". Revoke: POST /share/revoke.

## Call checklist
settings.call_checklist (10 default questions: id, question, type text|choice, options, required), editable by admin in Settings. Answers in lead.checklist_answers via PUT /api/leads/{id}/checklist (scoped like the lead; unknown ids ignored; audited). Lead page shows progress; positive-lead dialog warns (doesn't block) on unanswered required questions.

## Other modules
Inspections (INS-…, checklist fields + custom fields, PDF report), Orders (12 installation stages, stage history), Service requests (SRV-…), AMC (AMC-…, expiring within 30 days flagged), Customers (unified profile + timeline), Notifications (in-app only; reminder sweep on GET /notifications for due follow-ups & AMC expiry), Reports (/api/reports + CSV exports), Audit log (append-only, /api/audit), Settings, CMS (/api/cms/{products|projects|testimonials|faqs|brochures|services}), Backup (/api/admin/backup JSON; verify restores into scratch DB; restore replaces).

## Seed (python seed.py, idempotent)
5 staff users (see test_credentials.md), 8 products (specs flagged indicative/unverified), 6 projects, 3 testimonials, 6 FAQs, 5 services, 2 brochures with generated PDFs, 6 SAMPLE leads (is_sample=true) auto-assigned round-robin to Priya/Rahul.

## Unopened quotation reminder
- Runs inside the existing reminder sweep (triggered whenever staff load notifications; no cron needed).
- A quotation shared via link (status Approved / Sent to Customer / Under Negotiation, link not revoked, current revision) with zero customer views 2 days after the link was created triggers ONCE per link:
  - an auto follow-up (kind "Call", due now, `auto: "quote_unopened"`) assigned to the lead owner (fallback: quotation creator);
  - an in-app notification (kind `quote_unopened`) to that owner plus all Managers/Admins;
  - an audit entry `quotation_unopened_reminder` (by System).
- Flag `share.unopened_reminded` prevents duplicates; creating a new share link resets it.

## Company contact details
- Public phone/email/WhatsApp come from Settings (Admin). Still placeholders (+91 90000 00000, info@vtechelevators.in) until the real details are entered.
