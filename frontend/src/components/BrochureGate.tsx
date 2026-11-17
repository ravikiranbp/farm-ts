import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiPost } from "@/lib/api";
import type { Brochure, EnquiryResult } from "@/lib/types";
import { BUILDING_TYPES, LIFT_TYPES, errMsg } from "@/lib/format";
import { Field, NSelect } from "@/components/common";
import { ConsentBox, Success } from "@/components/EnquiryForm";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function BrochureGate({ brochure, onClose }: { brochure: Brochure | null; onClose: () => void }) {
	const [f, setF] = useState({ name: "", mobile: "", city: "Bengaluru", email: "", lift_type: "", building_type: "" });
	const [consent, setConsent] = useState(false);
	const [result, setResult] = useState<EnquiryResult | null>(null);
	const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
	const m = useMutation({
		mutationFn: () => apiPost<EnquiryResult>("/public/enquiries", { ...f, email: f.email || null, enquiry_type: "brochure", brochure_id: brochure?.id, consent }),
		onSuccess: setResult, onError: (e) => toast.error(errMsg(e)),
	});
	const submit = (e: FormEvent) => {
		e.preventDefault();
		if (!consent) return toast.error("Please accept the consent note to continue");
		m.mutate();
	};
	const close = () => { setResult(null); setConsent(false); onClose(); };
	return (
		<Dialog open={!!brochure} onOpenChange={(o) => !o && close()}>
			<DialogContent className="max-h-[92vh] overflow-y-auto border-line bg-panel sm:max-w-lg" data-testid="brochure-gate-dialog">
				<DialogHeader>
					<DialogTitle className="font-heading text-platinum">Download: {brochure?.title}</DialogTitle>
					<DialogDescription className="text-steel">Share a few details and your brochure will be ready instantly.</DialogDescription>
				</DialogHeader>
				{result ? <Success result={result} /> : (
					<form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" data-testid="brochure-form">
						<Field label="Full name" required><Input value={f.name} onChange={set("name")} required minLength={2} data-testid="brochure-name-input" /></Field>
						<Field label="Mobile number" required><Input value={f.mobile} onChange={set("mobile")} required inputMode="tel" data-testid="brochure-mobile-input" /></Field>
						<Field label="City / location" required><Input value={f.city} onChange={set("city")} required data-testid="brochure-city-input" /></Field>
						<Field label="Email"><Input type="email" value={f.email} onChange={set("email")} data-testid="brochure-email-input" /></Field>
						<Field label="Lift type"><NSelect value={f.lift_type} onChange={set("lift_type")} options={LIFT_TYPES} placeholder="Optional" data-testid="brochure-lifttype-select" /></Field>
						<Field label="Building type"><NSelect value={f.building_type} onChange={set("building_type")} options={BUILDING_TYPES} placeholder="Optional" data-testid="brochure-building-select" /></Field>
						<div className="sm:col-span-2"><ConsentBox checked={consent} onChange={setConsent} /></div>
						<Button type="submit" disabled={m.isPending} className="gold-btn font-semibold sm:col-span-2" data-testid="brochure-submit-btn">{m.isPending ? "Saving…" : "Get brochure"}</Button>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}