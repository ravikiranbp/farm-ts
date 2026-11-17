// Hand-written mirrors of backend/models/schemas.py (and dict-shaped responses). Keep in sync.
export type Role = "admin" | "manager" | "telecaller";

export interface User {
	id: string; name: string; email: string; phone?: string | null; role: Role; active: boolean;
	created_at?: string | null; last_login_at?: string | null;
}

export interface EnquiryResult { reference: string; message: string; download_url?: string | null }

export interface Approval {
	state: "pending" | "approved" | "rejected" | "info_requested";
	submitted_by: string; submitted_by_name: string; submitted_at: string; summary?: string; notes?: string;
	decided_by?: string; decided_by_name?: string; decided_at?: string; comment?: string | null;
}

export interface HistoryEntry { [k: string]: string | number | boolean | null | undefined }

export interface Lead {
	id: string; ref: string; customer_id: string; name: string; mobile: string; email?: string | null;
	city?: string | null; area?: string | null; address?: string | null; building_type?: string | null;
	requirement?: string | null; floors?: number | null; lifts_count?: number | null;
	construction_status?: string | null; lift_type?: string | null; additional_requirements?: string | null;
	preferred_callback_time?: string | null; source: string; campaign?: string | null; enquiry_type: string;
	status: string; assigned_to?: string | null; assigned_name?: string | null; created_by?: string | null;
	created_by_name?: string | null; approval?: Approval | null; approval_history: HistoryEntry[];
	assignment_history: HistoryEntry[]; status_history: HistoryEntry[]; possible_duplicate: boolean;
	duplicate_of?: string | null; archived: boolean; next_followup_at?: string | null;
	last_contacted_at?: string | null; checklist_answers: Record<string, string>; checklist_updated_at?: string | null;
	checklist_updated_by?: string | null; is_sample: boolean; created_at: string; updated_at: string;
}
export interface LeadPage { items: Lead[]; total: number }

export interface ChecklistItem { id: string; question: string; type: "text" | "choice"; options?: string[]; required?: boolean }

export interface Customer {
	id: string; ref: string; name: string; mobile: string; email?: string | null; city?: string | null;
	area?: string | null; address?: string | null; notes?: string | null; is_sample?: boolean; created_at: string; updated_at: string;
}

export interface Interaction {
	id: string; lead_id: string; kind: string; answered?: boolean | null; outcome?: string | null; notes: string;
	by_name: string; at: string;
}
export interface Followup {
	id: string; lead_id: string; lead_ref: string; lead_name: string; due_at: string; kind: string;
	notes?: string | null; assigned_to: string; assigned_name?: string | null; done: boolean;
	outcome?: string | null; overdue?: boolean; created_by: string;
}
export interface FileMeta { id: string; name: string; content_type: string; size: number; uploaded_by: string; at: string }
export interface AuditEntry {
	id: string; ref: string; user_id?: string | null; user_name: string; user_role: string; action: string; module: string;
	record_ref?: string | null; old?: unknown; new?: unknown; comment?: string | null; at: string; lead_id?: string | null;
}

export interface Inspection {
	id: string; ref: string; lead_id: string; lead_ref: string; customer_id: string; customer_name: string;
	customer_mobile?: string; address?: string; scheduled_at?: string | null; status: string; assigned_to: string;
	assigned_name?: string; building_type?: string | null; floors?: number | null; stops?: number | null;
	shaft_width_mm?: string; shaft_depth_mm?: string; pit_depth_mm?: string; overhead_mm?: string;
	floor_heights?: string; machine_room?: string; power_supply?: string; proposed_capacity?: string;
	door_config?: string; observations?: string; recommendations?: string;
	extra_fields: { label: string; value: string }[]; created_at: string;
}

export interface QuoteItem { description: string; qty: number; unit_price: number }
export interface QuoteTotals { items_total: number; subtotal: number; discount: number; taxable: number; tax: number; total: number }
export interface QuoteFields {
	project_address?: string | null; lift_category?: string | null; capacity?: string | null; floors?: number | null;
	stops?: number | null; lifts_count?: number | null; technical_config?: string | null; product_description?: string | null;
	items: QuoteItem[]; installation_charges: number; transport_charges: number; additional_charges: number;
	discount_pct: number; tax_pct: number; payment_terms?: string | null; delivery_timeline?: string | null;
	installation_timeline?: string | null; warranty?: string | null; amc_info?: string | null; terms?: string | null;
	valid_until?: string | null;
}
export interface Quotation extends QuoteFields {
	id: string; number: string; revision: number; status: string; lead_id?: string | null; lead_ref?: string | null;
	customer_id: string; customer_name: string; customer_mobile?: string | null; totals: QuoteTotals;
	approval_history: HistoryEntry[]; negotiation_notes: HistoryEntry[]; created_by?: string | null;
	created_by_name?: string | null; order_id?: string | null; created_at: string; updated_at: string;
	share?: { token: string; revision: number; created_at: string; created_by: string; revoked: boolean } | null;
	view_count: number; first_viewed_at?: string | null; last_viewed_at?: string | null;
	customer_responses: CustomerResponse[];
}
export interface CustomerResponse { response: "accept" | "changes"; name: string; comment?: string | null; revision: number; at: string }
export interface QuoteView { id: string; quotation_id: string; revision: number; at: string; ua: string }
export interface PublicQuote {
	quotation: QuoteFields & { number: string; revision: number; customer_name: string; totals: QuoteTotals };
	status: string; company: { company_name: string; phone: string; email: string; whatsapp: string; address: string; signatory: string };
	last_response: CustomerResponse | null; can_respond: boolean;
}
export interface QuotationRevision extends Quotation { snapshot_at: string }

export interface Milestone { label: string; amount: number; status: string; paid_on?: string | null }
export interface Order {
	id: string; ref: string; quotation_id: string; quotation_number: string; lead_id?: string | null; customer_id: string;
	customer_name: string; customer_mobile?: string; location?: string; specs: string; amount: number;
	payment_milestones: Milestone[]; expected_delivery?: string | null; start_date?: string | null;
	expected_completion?: string | null; project_manager_id?: string; project_manager_name?: string; stage: string;
	stage_history: HistoryEntry[]; pending_activities?: string; compliance_docs?: string;
	completion?: { date?: string; handover_to?: string; remarks?: string } | null; created_at: string; updated_at: string;
}

export interface ServiceRequest {
	id: string; ref: string; customer_id: string; name: string; mobile: string; address?: string; lift_ref?: string | null;
	issue_type: string; description: string; priority: string; status: string; assigned_to?: string | null;
	assigned_name?: string | null; visit_at?: string | null; work_done?: string | null; parts_replaced?: string | null;
	customer_confirmed: boolean; notes: HistoryEntry[]; created_at: string;
}
export interface Amc {
	id: string; ref: string; customer_id: string; customer_name: string; lift_details?: string; start_date: string;
	end_date: string; amount?: number; payment_status?: string; coverage?: string; frequency?: string;
	next_visit?: string; status: string; expiring_soon?: boolean; created_at: string;
}

export interface Notification { id: string; kind: string; title: string; body: string; link: string; read: boolean; at: string }

export interface Spec { label: string; value: string }
export interface Product {
	id: string; slug: string; name: string; category: string; description: string; images: string[];
	cabin_designs: string[]; door_types: string[]; capacity: string; speed: string; floors_supported: string;
	configurations: string[]; accessories: string[]; specs: Spec[]; published: boolean; specs_verified?: boolean; order?: number;
}
export interface Project {
	id: string; name: string; location: string; building_type: string; lift_category: string; floors: number;
	lifts_count: number; photos: string[]; description: string; completion_date: string; specs?: string;
	testimonial?: string; published: boolean; permission_to_publish: boolean; is_sample?: boolean;
}
export interface Testimonial { id: string; name: string; role: string; quote: string; rating: number; published: boolean }
export interface Faq { id: string; question: string; answer: string; order: number; published: boolean }
export interface Brochure { id: string; title: string; description: string; cover_image?: string; published: boolean }
export interface ServiceItem { id: string; title: string; description: string; published: boolean }
export interface Company {
	company_name: string; tagline: string; city: string; address: string; phone: string; whatsapp: string; email: string; about: string;
}
export interface PublicContent {
	company: Company; products: Product[]; projects: Project[]; testimonials: Testimonial[]; faqs: Faq[];
	brochures: Brochure[]; services: ServiceItem[];
}

export interface Settings extends Company {
	gstin?: string; tax_pct: number; manager_max_quote_amount: number; manager_max_discount_pct: number;
	require_quote_approval: boolean; quote_validity_days: number; auto_assign: boolean; session_timeout_minutes: number;
	payment_terms: string; warranty: string; terms: string; delivery_timeline: string; installation_timeline: string;
	signatory: string; notify_prefs: Record<string, boolean>; call_checklist: ChecklistItem[];
}

export interface Dashboard {
	role: Role; total_leads: number; new_leads: number; pending_calls: number; today_followups: number;
	overdue_followups: number; contacted: number; interested: number; awaiting_approval: number; approved: number;
	rejected: number; not_interested: number; won: number; lost: number; converted_to_quotation: number;
	status_counts: Record<string, number>; recent: Lead[]; quotations_pending: number; quotations_approved: number;
	quotations_sent: number; conversion_rate?: number; unassigned?: number;
	per_employee?: { name: string; assigned: number; won: number; positive: number }[];
	inspections_upcoming?: number; total_customers?: number; quote_value?: number; order_value?: number;
	active_installations?: number; pending_service?: number; active_amc?: number; amc_expiring?: Amc[];
	by_source?: Record<string, number>; recent_activity?: AuditEntry[];
}

export interface GroupRow { key: string; leads: number; quotations: number; won: number; order_value: number; conversion: number }
export interface PerfRow {
	name: string; role: string; active: boolean; assigned: number; contacted: number; followups_done: number;
	followups_overdue: number; positive_submitted: number; positive_approved: number; quotations: number; won: number; conversion: number;
}
export interface Report {
	totals: { leads: number; quotations: number; quote_value: number; orders: number; order_value: number; won: number; lost: number };
	daily: { date: string; leads: number }[]; pipeline: { status: string; count: number }[];
	by_source: GroupRow[]; by_city: GroupRow[]; by_lift_type: GroupRow[]; by_employee: GroupRow[]; performance: PerfRow[];
	quotations_by_status: { status: string; count: number }[]; service_by_status: { status: string; count: number }[];
	installations: { stage: string; count: number }[];
}