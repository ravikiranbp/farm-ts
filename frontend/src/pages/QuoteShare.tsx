import { useState, type FormEvent } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Download, MessageSquare, Phone } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { PublicQuote } from "@/lib/types";
import { errMsg, fmtDate, fmtDateTime, inr } from "@/lib/format";
import { Field, KV } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

export default function QuoteShare() {
	const { token = "" } = useParams();
	const qc = useQueryClient();
	const { data, isLoading, error } = useQuery({ queryKey: ["public-quote", token], queryFn: () => apiGet<PublicQuote>(`/public/quotes/${token}`), retry: false, refetchOnWindowFocus: false });
	const [mode, setMode] = useState<null | "accept" | "changes">(null);
	const [name, setName] = useState("");
	const [comment, setComment] = useState("");
	const [done, setDone] = useState<string | null>(null);
	const m = useMutation({
		mutationFn: () => apiPost<{ ok: boolean; message: string }>(`/public/quotes/${token}/respond`, { response: mode, name, comment: comment || null }),
		onSuccess: (r) => { setDone(r.message); setMode(null); qc.invalidateQueries({ queryKey: ["public-quote", token] }); },
		onError: (e) => toast.error(errMsg(e)),
	});
	const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };

	if (isLoading) return <div className="mx-auto max-w-4xl px-4 py-16 text-steel">Loading your quotation…</div>;
	if (error || !data) return (
		<div className="mx-auto max-w-xl px-4 py-20 text-center" data-testid="quote-share-error">
			<h1 className="font-heading text-2xl font-semibold">Quotation unavailable</h1>
			<p className="mt-3 text-steel">{errMsg(error)}</p>
		</div>
	);
	const q = data.quotation;
	const c = data.company;
	return (
		<div className="mx-auto max-w-4xl px-4 py-10 sm:px-6">
			<div className="flex flex-wrap items-end justify-between gap-4 border-b border-line pb-6">
				<div>
					<p className="overline">Quotation for {q.customer_name}</p>
					<h1 className="mt-2 font-heading text-3xl font-bold text-white" data-testid="quote-share-number">{q.number} · Revision {q.revision}</h1>
					<p className="mt-1 text-sm text-steel">Valid until <b className="text-platinum">{fmtDate(q.valid_until)}</b></p>
				</div>
				<a href={`/api/public/quotes/${token}/pdf`} className="gold-btn inline-flex items-center gap-2 rounded-md px-5 py-2.5 text-sm font-semibold" data-testid="quote-share-pdf-btn"><Download className="h-4 w-4" />Download PDF</a>
			</div>

			<div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
				<section className="rounded-xl border border-line bg-panel p-5">
					<h2 className="font-heading text-lg font-semibold">Lift configuration</h2>
					<div className="mt-2"><KV k="Lift category" v={q.lift_category} /><KV k="Capacity" v={q.capacity} /><KV k="Floors / stops" v={`${q.floors ?? "—"} / ${q.stops ?? "—"}`} /><KV k="Number of lifts" v={q.lifts_count} /><KV k="Project address" v={q.project_address} /></div>
					{q.technical_config && <p className="mt-3 text-sm text-steel">{q.technical_config}</p>}
					{q.product_description && <p className="mt-2 text-sm text-steel">{q.product_description}</p>}
					<h2 className="mt-6 font-heading text-lg font-semibold">Price breakup</h2>
					<div className="mt-2">
						{q.items.map((i, n) => <div key={n} className="flex justify-between border-b border-line/60 py-1.5 text-sm"><span>{i.description} × {i.qty}</span><span>{inr(i.qty * i.unit_price)}</span></div>)}
						{q.installation_charges > 0 && <KV k="Installation" v={inr(q.installation_charges)} />}
						{q.transport_charges > 0 && <KV k="Transportation" v={inr(q.transport_charges)} />}
						{q.additional_charges > 0 && <KV k="Additional charges" v={inr(q.additional_charges)} />}
						<KV k="Subtotal" v={inr(q.totals.subtotal)} />
						{q.discount_pct > 0 && <KV k={`Discount (${q.discount_pct}%)`} v={`− ${inr(q.totals.discount)}`} />}
						<KV k={`Tax / GST (${q.tax_pct}%)`} v={inr(q.totals.tax)} />
						<div className="mt-2 flex justify-between font-heading text-2xl font-semibold text-champagne"><span>Total</span><span data-testid="quote-share-total">{inr(q.totals.total)}</span></div>
					</div>
				</section>
				<aside className="space-y-5">
					<section className="rounded-xl border border-gold/40 bg-gold/5 p-5" data-testid="quote-share-respond">
						{done ? (
							<div className="text-center" data-testid="quote-share-response-done"><CheckCircle2 className="mx-auto h-9 w-9 text-gold" /><p className="mt-2 text-sm">{done}</p></div>
						) : data.can_respond ? (
							mode ? (
								<form onSubmit={submit} className="space-y-3">
									<h2 className="font-heading font-semibold">{mode === "accept" ? "Accept this quotation" : "Request changes"}</h2>
									<Field label="Your name" required><Input value={name} onChange={(e) => setName(e.target.value)} required minLength={2} data-testid="quote-share-name-input" /></Field>
									<Field label={mode === "accept" ? "Message (optional)" : "What would you like changed?"} required={mode === "changes"}>
										<Textarea value={comment} onChange={(e) => setComment(e.target.value)} required={mode === "changes"} data-testid="quote-share-comment-input" /></Field>
									{mode === "accept" && <p className="text-[11px] text-steel">Our team will call you to confirm the order and advance payment.</p>}
									<div className="flex gap-2"><Button type="submit" className="gold-btn flex-1" disabled={m.isPending} data-testid="quote-share-submit-btn">{m.isPending ? "Sending…" : "Submit"}</Button><Button type="button" variant="ghost" onClick={() => setMode(null)}>Cancel</Button></div>
								</form>
							) : (
								<div className="space-y-3">
									<h2 className="font-heading font-semibold">Happy with this quotation?</h2>
									<Button className="gold-btn w-full" onClick={() => setMode("accept")} data-testid="quote-share-accept-btn"><CheckCircle2 className="h-4 w-4" />Accept quotation</Button>
									<Button variant="outline" className="w-full" onClick={() => setMode("changes")} data-testid="quote-share-changes-btn"><MessageSquare className="h-4 w-4" />Request changes</Button>
								</div>
							)
						) : <p className="text-sm text-steel">This quotation is {data.status.toLowerCase()}. Please contact us for any changes.</p>}
						{data.last_response && !done && <p className="mt-3 text-xs text-steel">Last response: {data.last_response.response === "accept" ? "accepted" : "changes requested"} by {data.last_response.name} on {fmtDateTime(data.last_response.at)}</p>}
					</section>
					<section className="rounded-xl border border-line bg-panel p-5 text-sm">
						<h2 className="font-heading font-semibold">Commercial terms</h2>
						<div className="mt-2 space-y-2 text-steel">
							{([["Payment", q.payment_terms], ["Delivery", q.delivery_timeline], ["Installation", q.installation_timeline], ["Warranty", q.warranty], ["AMC", q.amc_info], ["Terms", q.terms]] as [string, string | null | undefined][]).filter(([, v]) => v).map(([k, v]) => <p key={k}><b className="text-platinum">{k}:</b> {v}</p>)}
						</div>
					</section>
					<a href={`tel:${c.phone}`} className="flex items-center gap-2 rounded-xl border border-line bg-panel p-4 text-sm hover:border-gold"><Phone className="h-4 w-4 text-gold" />Questions? Call {c.company_name} on {c.phone}</a>
				</aside>
			</div>
		</div>
	);
}