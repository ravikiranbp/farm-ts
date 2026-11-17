import { ApiError } from "./api";

export const LEAD_STATUSES = [
	"New", "Assigned", "First Call Pending", "Contacted", "Follow-up Required", "Interested",
	"Positive – Awaiting Manager Approval", "Approved", "Site Inspection Required", "Site Inspection Scheduled",
	"Site Inspection Completed", "Quotation Required", "Quotation Sent", "Negotiation", "Won", "Lost",
	"Not Interested", "Invalid / Duplicate",
];
export const TELECALLER_BLOCKED = ["Approved", "Quotation Sent", "Negotiation", "Won", "Site Inspection Scheduled",
	"Site Inspection Completed", "Positive – Awaiting Manager Approval"];
export const ORDER_STAGES = ["Order Confirmed", "Advance Payment Received", "Site Readiness Pending", "Site Ready",
	"Materials Ordered", "Materials Received", "Installation Started", "Installation In Progress",
	"Testing and Commissioning", "Inspection / Compliance Documentation", "Handover Pending", "Completed"];
export const BUILDING_TYPES = ["Residential", "Apartment", "Commercial", "Hospital", "Hotel", "Industrial", "Other"];
export const REQUIREMENTS = ["New lift installation", "Existing lift replacement", "Lift modernization", "Lift maintenance", "Lift repair", "Other"];
export const CONSTRUCTION = ["Planning stage", "Under construction", "Building completed"];
export const SOURCES = ["Company website", "Brochure download", "Google Business Profile", "Google search", "WhatsApp",
	"Phone call", "Social media", "Referral", "Existing customer", "Advertisement", "Manual entry", "Other"];
export const LIFT_TYPES = ["Passenger lifts", "Home elevators", "Hospital lifts", "Goods lifts", "Commercial lifts",
	"Capsule lifts", "Hydraulic lifts", "Machine-room / MRL lifts", "Lift modernization and replacement", "Customized solution"];
export const ISSUE_TYPES = ["Lift breakdown", "Lift not operating", "Door issues", "Unusual noise", "Electrical issues",
	"Routine maintenance", "Emergency service", "Other complaint"];

export function inr(v: number | null | undefined): string {
	return "₹" + Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}
export function fmtDate(iso?: string | null): string {
	if (!iso) return "—";
	const d = new Date(iso.length === 10 ? iso + "T00:00:00" : iso);
	return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB");
}
export function fmtDateTime(iso?: string | null): string {
	if (!iso) return "—";
	const d = new Date(iso);
	return isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}
/** datetime-local input value → ISO UTC */
export function localToIso(v: string): string {
	return new Date(v).toISOString();
}
export function errMsg(e: unknown): string {
	if (e instanceof ApiError) {
		const b = e.body as { detail?: unknown } | null;
		if (typeof b?.detail === "string") return b.detail;
		if (Array.isArray(b?.detail)) {
			return (b.detail as { msg: string; loc: string[] }[])
				.map((d) => `${d.loc?.[d.loc.length - 1] ?? ""}: ${d.msg.replace("Value error, ", "")}`).join("; ");
		}
		return `Request failed (${e.status})`;
	}
	return "Network error — please try again";
}

export function statusTone(s: string): string {
	if (["Won", "Approved", "Accepted", "Completed", "Resolved", "Closed", "Active", "approved"].includes(s)) return "bg-emerald-500/12 text-emerald-300 border-emerald-500/30";
	if (["Lost", "Not Interested", "Invalid / Duplicate", "Rejected", "Expired", "rejected", "Emergency"].includes(s)) return "bg-red-500/10 text-red-300 border-red-500/30";
	if (s.startsWith("Positive") || ["Pending Approval", "pending", "High", "info_requested"].includes(s)) return "bg-amber-500/12 text-amber-300 border-amber-500/30";
	if (["New", "Assigned", "Open", "Draft"].includes(s)) return "bg-sky-500/10 text-sky-300 border-sky-500/25";
	return "bg-gold/10 text-champagne border-gold/30";
}