import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import type { EnquiryResult } from "@/lib/types";
import { BUILDING_TYPES, CONSTRUCTION, LIFT_TYPES, REQUIREMENTS, errMsg } from "@/lib/format";
import { Field, NSelect } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export type EnquiryType = "enquiry" | "callback" | "inspection" | "brochure";

export function Success({ result, onReset }: { result: EnquiryResult; onReset?: () => void }) {
	return (
		<div className="rounded-lg border border-gold/40 bg-gold/5 p-6 text-center" data-testid="enquiry-success">
			<CheckCircle2 className="mx-auto h-10 w-10 text-gold" />
			<p className="mt-3 text-platinum">{result.message}</p>
			<p className="mt-2 text-sm text-steel">Your reference number</p>
			<p className="font-mono text-xl font-semibold text-champagne" data-testid="enquiry-reference">{result.reference}</p>
			{result.download_url && <a href={result.download_url} className="gold-btn mt-4 inline-block rounded-md px-5 py-2 text-sm font-semibold" data-testid="brochure-download-link">Download brochure</a>}
			{onReset && <button className="mt-4 block w-full text-xs text-steel underline" onClick={onReset}>Submit another request</button>}
		</div>
	);
}

const EMPTY = { name: "", mobile: "", email: "", city: "Bengaluru", area: "", address: "", building_type: "", requirement: "", floors: "",
	lifts_count: "", construction_status: "", lift_type: "", additional_requirements: "", preferred_callback_time: "", preferred_date: "" };

export default function EnquiryForm({ type, compact }: { type: EnquiryType; compact?: boolean }) {
	const [sp] = useSearchParams();
	const fromOffer = sp.get("offer") === "1";
	const [f, setF] = useState({ ...EMPTY, lift_type: sp.get("lift") ?? "", additional_requirements: fromOffer ? "Enquiry about Offer" : "" });
	const [result, setResult] = useState<EnquiryResult | null>(null);
	const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
	const m = useMutation({
		mutationFn: () => apiPost<EnquiryResult>("/public/enquiries", {
			...f, enquiry_type: type, email: f.email || null,
			floors: f.floors ? Number(f.floors) : null, lifts_count: f.lifts_count ? Number(f.lifts_count) : null,
			source: sp.get("utm_source") ?? (fromOffer ? "Website offer" : undefined), campaign: sp.get("utm_campaign") ?? undefined,
		}),
		onSuccess: (r) => { setResult(r); setF(EMPTY); },
		onError: (e) => toast.error(errMsg(e)),
	});
	const submit = (e: FormEvent) => {
		e.preventDefault();
		if (!/^[6-9]\d{9}$/.test(f.mobile.replace(/\D/g, "").slice(-10))) return toast.error("Enter a valid 10-digit mobile number");
		m.mutate();
	};
	if (result) return <Success result={result} onReset={() => setResult(null)} />;
	const full = type === "enquiry" && !compact;
	return (
		<form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" data-testid={`${type}-form`}>
			<Field label="Full name" required><Input value={f.name} onChange={set("name")} required minLength={2} data-testid="enquiry-name-input" /></Field>
			<Field label="Mobile number" required><Input value={f.mobile} onChange={set("mobile")} required inputMode="tel" placeholder="10-digit mobile" data-testid="enquiry-mobile-input" /></Field>
			<Field label="Email"><Input type="email" value={f.email} onChange={set("email")} data-testid="enquiry-email-input" /></Field>
			<Field label="City" required><Input value={f.city} onChange={set("city")} required data-testid="enquiry-city-input" /></Field>
			{type !== "callback" && <Field label="Area / locality"><Input value={f.area} onChange={set("area")} data-testid="enquiry-area-input" /></Field>}
			{type !== "callback" && <Field label="Building type"><NSelect value={f.building_type} onChange={set("building_type")} options={BUILDING_TYPES} placeholder="Select" data-testid="enquiry-building-select" /></Field>}
			{(full || type === "inspection") && <>
				<Field label="Requirement"><NSelect value={f.requirement} onChange={set("requirement")} options={REQUIREMENTS} placeholder="Select" data-testid="enquiry-requirement-select" /></Field>
				<Field label="Lift type interested in"><NSelect value={f.lift_type} onChange={set("lift_type")} options={LIFT_TYPES} placeholder="Select" data-testid="enquiry-lifttype-select" /></Field>
				<Field label="Number of floors"><Input type="number" min={1} value={f.floors} onChange={set("floors")} data-testid="enquiry-floors-input" /></Field>
				<Field label="Number of lifts"><Input type="number" min={1} value={f.lifts_count} onChange={set("lifts_count")} data-testid="enquiry-lifts-input" /></Field>
			</>}
			{full && <Field label="Construction status"><NSelect value={f.construction_status} onChange={set("construction_status")} options={CONSTRUCTION} placeholder="Select" data-testid="enquiry-construction-select" /></Field>}
			{type === "inspection" && <>
				<Field label="Site address" className="sm:col-span-2"><Input value={f.address} onChange={set("address")} data-testid="enquiry-address-input" /></Field>
				<Field label="Preferred inspection date"><Input type="date" value={f.preferred_date} onChange={set("preferred_date")} data-testid="enquiry-date-input" /></Field>
			</>}
			<Field label="Preferred callback time"><NSelect value={f.preferred_callback_time} onChange={set("preferred_callback_time")} options={["Morning (9–12)", "Afternoon (12–4)", "Evening (4–7)", "Anytime"]} placeholder="Select" data-testid="enquiry-callback-select" /></Field>
			{type !== "callback" && <Field label="Additional requirements" className="sm:col-span-2"><Textarea rows={3} value={f.additional_requirements} onChange={set("additional_requirements")} data-testid="enquiry-notes-input" /></Field>}
			<Button type="submit" disabled={m.isPending} className="gold-btn h-11 font-semibold sm:col-span-2" data-testid="enquiry-submit-btn">
				{m.isPending ? "Submitting…" : type === "callback" ? "Request callback" : type === "inspection" ? "Book free site inspection" : "Submit enquiry"}
			</Button>
		</form>
	);
}