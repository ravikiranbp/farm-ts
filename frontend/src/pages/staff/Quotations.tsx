import { useMemo, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Eye, Mail } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { Lead, QuoteFields, QuoteView, Quotation, QuotationRevision, Settings, User } from "@/lib/types";
import { errMsg, fmtDate, fmtDateTime, inr } from "@/lib/format";
import { Empty, KV, NSelect, PageHeader, Panel, StatusBadge } from "@/components/common";
import { QuoteForm, useQuoteDefaults, withDefaults } from "./QuoteForm";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const Q_STATUSES = ["Draft", "Pending Approval", "Approved", "Sent to Customer", "Under Negotiation", "Accepted", "Rejected", "Expired"];

export function QuotationsList() {
  const me = useOutletContext<User>();
  const [status, setStatus] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["quotations", status], queryFn: () => apiGet<Quotation[]>(`/quotations${status ? `?status=${encodeURIComponent(status)}` : ""}`) });
  return (
    <div>
      <PageHeader title="Quotations" subtitle={me.role === "telecaller" ? "Quotations for your leads (view only)" : "Create quotations from an approved lead's page"}
        actions={<>{me.role !== "telecaller" && <Link to="/staff/quotations/defaults" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-gold" data-testid="quote-defaults-link">Quotation defaults</Link>}<NSelect value={status} onChange={(e) => setStatus(e.target.value)} options={Q_STATUSES} placeholder="All statuses" className="w-48" data-testid="quotation-status-filter" /></>} />
      <div className="rounded-lg border border-line bg-panel">
        <Table><TableHeader><TableRow className="border-line"><TableHead>Number</TableHead><TableHead>Customer</TableHead><TableHead className="hidden md:table-cell">Lift</TableHead><TableHead>Total</TableHead><TableHead>Status</TableHead><TableHead className="hidden sm:table-cell">Updated</TableHead></TableRow></TableHeader>
          <TableBody>{(data ?? []).map((q) => (
            <TableRow key={q.id} className="border-line" data-testid="quotation-row">
              <TableCell><Link to={`/staff/quotations/${q.id}`} className="font-mono text-xs text-champagne hover:underline">{q.number} R{q.revision}</Link></TableCell>
              <TableCell>{q.customer_name}<div className="text-xs text-steel">{q.lead_ref}</div></TableCell>
              <TableCell className="hidden text-xs text-steel md:table-cell">{q.lift_category} · {q.floors ?? "—"} floors</TableCell>
              <TableCell>{inr(q.totals.total)}</TableCell><TableCell><StatusBadge status={q.status} /></TableCell>
              <TableCell className="hidden text-xs text-steel sm:table-cell">{fmtDateTime(q.updated_at)}</TableCell>
            </TableRow>))}</TableBody></Table>
        {isLoading ? <Empty text="Loading…" /> : !data?.length && <Empty text="No quotations yet" />}
      </div>
    </div>
  );
}

export function QuotationNew() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const leadId = sp.get("lead") ?? "";
  const { data } = useQuery({ queryKey: ["lead", leadId], queryFn: () => apiGet<{ lead: Lead }>(`/leads/${leadId}`), enabled: !!leadId });
  const { data: s } = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<Settings>("/settings") });
  const { data: d } = useQuoteDefaults(!!leadId);
  const m = useMutation({ mutationFn: (f: QuoteFields) => apiPost<Quotation>("/quotations", { ...f, lead_id: leadId }), onSuccess: (q) => { toast.success(`Quotation ${q.number} created`); nav(`/staff/quotations/${q.id}`, { replace: true }); }, onError: (e) => toast.error(errMsg(e)) });
  const l = data?.lead;
  const init = useMemo<QuoteFields | null>(() => {
    if (!l || !d || !s) return null;
    const floors = l.floors ?? null;
    const lifts = l.lifts_count ?? 1;
    const specs = d.tech_specs.map((r) => {
      if (r.key === "elevator_count") return { ...r, value: String(lifts) };
      if (floors && (r.key === "floors" || r.key === "stops")) return { ...r, value: String(floors) };
      return { ...r };
    });
    const base: QuoteFields = {
      items: [{ description: d.price_description, qty: lifts, unit_price: 0 }], installation_charges: 0, transport_charges: 0,
      additional_charges: 0, discount_pct: 0, tax_pct: s.tax_pct ?? 18, lift_category: l.lift_type ?? "", floors, stops: floors,
      lifts_count: lifts, project_address: [l.address, l.area, l.city].filter(Boolean).join(", "),
      customer_name: l.name, customer_mobile: l.mobile, customer_email: l.email ?? "",
      customer_address: [l.address, l.area, l.city].filter(Boolean).join("\n"), quote_date: new Date().toISOString().slice(0, 10),
    };
    return { ...withDefaults(base, d), tech_specs: specs };
  }, [l, d, s]);
  if (!leadId) return <p className="text-steel">Open a lead and click "Create quotation".</p>;
  return (<div><PageHeader title="New quotation" subtitle={l ? `${l.name} · ${l.ref}` : "Loading lead…"}
    actions={<Link to="/staff/quotations/defaults" className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-gold">Quotation defaults</Link>} />
    {init ? <QuoteForm initial={init} catalog={d?.material_catalog ?? {}} onSave={(f) => m.mutate(f)} saving={m.isPending} /> : <p className="text-steel">Loading…</p>}</div>);
}

async function emailQuote(q: Quotation, me: User) {
  const res = await fetch(`/api/quotations/${q.id}/pdf`, { credentials: "include" });
  if (!res.ok) throw new Error("Could not generate the PDF");
  const blob = await res.blob();
  const name = `${q.number}-R${q.revision}.pdf`;
  const file = new File([blob], name, { type: "application/pdf" });
  const link = q.share && !q.share.revoked ? `${window.location.origin}/q/${q.share.token}` : "";
  const subject = `Quotation ${q.number} (Revision ${q.revision}) - V Tech Elevators`;
  const body = `Dear ${q.customer_name},\n\nPlease find attached our quotation ${q.number} (Revision ${q.revision}).${link ? `\n\nYou can also view it online: ${link}` : ""}\n\nRegards,\n${me.name}\nV Tech Elevators`;
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: subject, text: body }); return; } catch (e) { if ((e as Error).name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  window.location.href = `mailto:${encodeURIComponent(q.customer_email ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  toast.info("PDF downloaded — attach it to the email that just opened.");
}

function diff(a: QuotationRevision, b: QuotationRevision): string[] {
  const keys: (keyof QuoteFields)[] = ["lift_category", "capacity", "floors", "stops", "lifts_count", "installation_charges", "transport_charges", "additional_charges", "discount_pct", "tax_pct", "valid_until", "payment_terms", "warranty"];
  const out = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => `${k.replace(/_/g, " ")}: ${a[k] ?? "—"} → ${b[k] ?? "—"}`);
  if (JSON.stringify(a.items) !== JSON.stringify(b.items)) out.push(`line items changed (${a.items.length} → ${b.items.length})`);
  for (const [k, label] of [["tech_specs", "technical specifications"], ["payment_schedule", "payment schedule"], ["materials", "materials"], ["builder_side_work", "builder side work"], ["contract_conditions", "conditions"], ["preparatory_work", "preparatory work"], ["builder_work", "work by builder"]] as [keyof QuoteFields, string][])
    if (a[k] != null && JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`${label} changed`);
  if (a.totals.total !== b.totals.total) out.push(`total: ${inr(a.totals.total)} → ${inr(b.totals.total)}`);
  return out;
}

function SharePanel({ q, views, mgmt, onChange }: { q: Quotation; views: QuoteView[]; mgmt: boolean; onChange: () => void }) {
  const live = q.share && !q.share.revoked;
  const stale = live && q.share!.revision !== q.revision;
  const url = live ? `${window.location.origin}/q/${q.share!.token}` : "";
  const create = useMutation({ mutationFn: () => apiPost<Quotation>(`/quotations/${q.id}/share`), onSuccess: () => { toast.success("Share link created"); onChange(); }, onError: (e) => toast.error(errMsg(e)) });
  const revoke = useMutation({ mutationFn: () => apiPost<Quotation>(`/quotations/${q.id}/share/revoke`), onSuccess: () => { toast.success("Link revoked"); onChange(); }, onError: (e) => toast.error(errMsg(e)) });
  const copy = async () => { try { await navigator.clipboard.writeText(url); toast.success("Link copied"); } catch { toast.info(url); } };
  const wa = `https://wa.me/91${q.customer_mobile ?? ""}?text=${encodeURIComponent(`Dear ${q.customer_name}, please find your V Tech Elevators quotation ${q.number}: ${url}`)}`;
  return (
    <Panel title="Customer share link" actions={live && <span className="text-xs text-steel" data-testid="share-view-count">{q.view_count} view(s)</span>}>
      {live ? (
        <div className="space-y-2 text-sm">
          <div className="flex gap-2"><Input readOnly value={url} className="font-mono text-xs" data-testid="share-url-input" /><Button size="sm" variant="outline" onClick={copy} data-testid="share-copy-btn">Copy</Button></div>
          <div className="flex flex-wrap gap-2">
            <a href={wa} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2.5 py-1 text-xs hover:border-gold" data-testid="share-whatsapp-btn">Send on WhatsApp</a>
            <a href={url} target="_blank" rel="noreferrer" className="rounded-md border border-line px-2.5 py-1 text-xs hover:border-gold">Preview</a>
            {mgmt && <Button size="xs" variant="ghost" onClick={() => confirm("Revoke this link? The customer will no longer be able to open it.") && revoke.mutate()} data-testid="share-revoke-btn">Revoke</Button>}
          </div>
          <p className="text-xs text-steel">Shares revision R{q.share!.revision} · created {fmtDateTime(q.share!.created_at)} by {q.share!.created_by} · expires after {fmtDate(q.valid_until)}</p>
          <p className="text-xs" data-testid="share-viewed-status">{q.first_viewed_at ? <span className="text-emerald-300">Opened by customer · first {fmtDateTime(q.first_viewed_at)} · last {fmtDateTime(q.last_viewed_at)}</span> : <span className="text-steel">Not opened yet</span>}</p>
          {stale && <p className="text-xs text-amber-300">This quotation was revised after the link was created — the old link now shows "updated". Create a new link once R{q.revision} is approved.</p>}
          {views.length > 0 && <details className="text-xs text-steel"><summary className="cursor-pointer">View log</summary>{views.map((v) => <div key={v.id}>{fmtDateTime(v.at)} · R{v.revision} · {v.ua.slice(0, 60)}</div>)}</details>}
        </div>
      ) : <p className="text-sm text-steel">{q.share?.revoked ? "Previous link was revoked. " : ""}Create a secure link the customer can open to view, download, accept or request changes.</p>}
      {mgmt && (!live || stale) && <Button size="sm" className="gold-btn mt-3" disabled={create.isPending} onClick={() => create.mutate()} data-testid="share-create-btn">{live ? "Create new link" : "Create share link"}</Button>}
      {q.customer_responses.length > 0 && <div className="mt-3 border-t border-line pt-2" data-testid="customer-responses">
        <p className="field-label mb-1">Customer responses</p>
        {[...q.customer_responses].reverse().map((r, i) => <div key={i} className="text-xs"><StatusBadge status={r.response === "accept" ? "Accepted" : "Changes requested"} /> <b>{r.name}</b> · R{r.revision} · {fmtDateTime(r.at)}{r.comment && <div className="text-steel">“{r.comment}”</div>}</div>)}
        {q.customer_responses[q.customer_responses.length - 1].response === "accept" && q.status !== "Accepted" && <p className="mt-1 text-xs text-amber-300">Customer accepted online — confirm with "Customer accepted" to create the order.</p>}
      </div>}
    </Panel>
  );
}

export function QuotationDetail() {
  const { id = "" } = useParams();
  const me = useOutletContext<User>();
  const qc = useQueryClient();
  const [sp] = useSearchParams();
  const [editing, setEditing] = useState(sp.get("edit") === "1" && me.role !== "telecaller");
  const [action, setAction] = useState<null | { action: string; comment: string }>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["quotation", id], queryFn: () => apiGet<{ quotation: Quotation; revisions: QuotationRevision[]; views: QuoteView[] }>(`/quotations/${id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["quotation", id] }); qc.invalidateQueries({ queryKey: ["quotations"] }); };
  const save = useMutation({ mutationFn: (f: QuoteFields) => apiPut<Quotation>(`/quotations/${id}`, f), onSuccess: (q) => { toast.success(`Saved — revision ${q.revision}`); setEditing(false); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  const act = useMutation({ mutationFn: () => apiPost<Quotation>(`/quotations/${id}/action`, action), onSuccess: (q) => { toast.success(`Quotation is now ${q.status}`); setAction(null); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  const mgmt = me.role !== "telecaller";
  const { data: dflt } = useQuoteDefaults(mgmt);
  const [emailing, setEmailing] = useState(false);
  const q0 = data?.quotation;
  const editInit = useMemo(() => (q0 ? withDefaults(q0, dflt) : null), [q0, dflt]);
  if (isLoading) return <p className="text-steel">Loading…</p>;
  if (error || !data) return <p className="text-red-300">{errMsg(error)}</p>;
  const q = data.quotation;
  const sendEmail = async () => { setEmailing(true); try { await emailQuote(q, me); } catch (e) { toast.error(errMsg(e)); } finally { setEmailing(false); } };
  const issued = ["Approved", "Sent to Customer", "Under Negotiation", "Expired"].includes(q.status);
  const btns: [string, string][] = ({
    Draft: [["submit", "Submit for approval"], ["approve", "Approve"]], "Pending Approval": [["approve", "Approve"], ["reject", "Reject"]],
    Approved: [["send", "Mark sent to customer"]], "Sent to Customer": [["negotiation", "Record negotiation"], ["accept", "Customer accepted"], ["customer_reject", "Customer rejected"]],
    "Under Negotiation": [["negotiation", "Add negotiation note"], ["accept", "Customer accepted"], ["customer_reject", "Customer rejected"]],
  } as Record<string, [string, string][]>)[q.status] ?? [];
  return (
    <div>
      <PageHeader title={`${q.number} · Revision ${q.revision}`} subtitle={`${q.customer_name} · ${q.lead_ref ?? ""} · by ${q.created_by_name}`}
        actions={<>
          <a href={`/api/quotations/${q.id}/pdf?inline=1`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:border-gold" data-testid="quotation-preview-btn"><Eye className="h-4 w-4" />Preview</a>
          <a href={`/api/quotations/${q.id}/pdf`} className="inline-flex items-center gap-1.5 rounded-md border border-gold/50 px-3 py-1.5 text-sm text-champagne hover:bg-gold/10" data-testid="quotation-pdf-btn"><Download className="h-4 w-4" />Download</a>
          <Button variant="outline" disabled={emailing} onClick={sendEmail} data-testid="quotation-email-btn"><Mail className="h-4 w-4" />{emailing ? "Preparing…" : "Email"}</Button>
          {mgmt && q.status !== "Accepted" && <Button variant="outline" onClick={() => setEditing(!editing)} data-testid="quotation-edit-btn">{editing ? "Cancel edit" : issued ? "Revise" : "Edit"}</Button>}
          {mgmt && btns.map(([a, l]) => <Button key={a} className={a === "approve" || a === "accept" ? "gold-btn" : ""} variant={a.includes("reject") ? "destructive" : a === "approve" || a === "accept" ? "default" : "outline"} onClick={() => setAction({ action: a, comment: "" })} data-testid={`quotation-action-${a}`}>{l}</Button>)}
          {q.order_id && <Link to="/staff/orders" className="rounded-md border border-emerald-500/40 px-3 py-1.5 text-sm text-emerald-300">View order →</Link>}
        </>} />
      <div className="mb-4 flex items-center gap-2"><StatusBadge status={q.status} testId="quotation-status" /><span className="text-xs text-steel">Valid until {fmtDate(q.valid_until)}</span></div>
      {editing && editInit ? <QuoteForm initial={editInit} catalog={dflt?.material_catalog ?? {}} meta={{ number: q.number, revision: q.revision, status: q.status }} onSave={(f) => save.mutate(f)} saving={save.isPending} isIssued={issued} /> : (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="Summary">
            <KV k="Lift" v={`${q.lift_category ?? "—"} · ${q.capacity ?? "—"}`} /><KV k="Floors / stops / lifts" v={`${q.floors ?? "—"} / ${q.stops ?? "—"} / ${q.lifts_count ?? "—"}`} /><KV k="Address" v={q.project_address} />
            <div className="mt-3">{q.items.map((i, n) => <div key={n} className="flex justify-between py-1 text-sm"><span>{i.description} × {i.qty}</span><span>{inr(i.qty * i.unit_price)}</span></div>)}</div>
            <div className="mt-2 border-t border-line pt-2"><KV k="Installation / transport / additional" v={`${inr(q.installation_charges)} / ${inr(q.transport_charges)} / ${inr(q.additional_charges)}`} />
              <KV k="Subtotal" v={inr(q.totals.subtotal)} /><KV k={`Discount (${q.discount_pct}%)`} v={`− ${inr(q.totals.discount)}`} /><KV k={`Tax (${q.tax_pct}%)`} v={inr(q.totals.tax)} />
              <div className="flex justify-between pt-2 font-heading text-xl font-semibold text-champagne"><span>Final</span><span data-testid="quotation-total">{inr(q.totals.total)}</span></div></div>
            <div className="mt-4 space-y-1 text-xs text-steel"><p><b>Payment:</b> {q.payment_terms}</p><p><b>Delivery:</b> {q.delivery_timeline}</p><p><b>Installation:</b> {q.installation_timeline}</p><p><b>Warranty:</b> {q.warranty}</p>{q.terms && <p><b>Terms:</b> {q.terms}</p>}</div>
            {!!q.tech_specs?.length && <details className="mt-4 text-sm"><summary className="cursor-pointer text-champagne">Technical specifications</summary>{q.tech_specs.map((r) => <KV key={r.key} k={r.label} v={r.value} />)}</details>}
            {!!q.materials?.length && <details className="mt-2 text-sm"><summary className="cursor-pointer text-champagne">Main materials</summary>{q.materials.map((r, i) => <KV key={i} k={r.category} v={r.detail} />)}</details>}
          </Panel>
          <div className="space-y-5">
            {(q.share || ["Approved", "Sent to Customer", "Under Negotiation"].includes(q.status)) && <SharePanel q={q} views={data.views ?? []} mgmt={mgmt} onChange={refresh} />}
            <Panel title="Revisions">
              {data.revisions.map((r, i) => {
                const prev = data.revisions[i + 1];
                const changes = prev ? diff(prev, r) : [];
                return <div key={r.revision} className="border-b border-line/60 py-2 text-sm last:border-0" data-testid="revision-row">
                  <div className="flex items-center justify-between"><span>R{r.revision} · <StatusBadge status={r.status} /> · {inr(r.totals.total)}</span><a href={`/api/quotations/${q.id}/pdf?revision=${r.revision}`} className="text-xs text-gold">PDF</a></div>
                  {changes.length > 0 && <ul className="mt-1 list-disc pl-4 text-xs text-steel">{changes.map((c) => <li key={c}>{c}</li>)}</ul>}
                </div>;
              })}
            </Panel>
            <Panel title="Approval & activity history">
              {!q.approval_history.length ? <Empty text="No actions yet" /> : q.approval_history.map((h, i) => <div key={i} className="border-b border-line/60 py-1.5 text-xs last:border-0"><b>{String(h.by)}</b> ({String(h.by_role)}) · {String(h.action)} → {String(h.to)} · R{String(h.revision)} · {fmtDateTime(String(h.at))}{h.comment && <div className="text-steel">{String(h.comment)}</div>}</div>)}
            </Panel>
          </div>
        </div>
      )}
      <Dialog open={!!action} onOpenChange={(o) => !o && setAction(null)}>
        <DialogContent className="border-line bg-panel" data-testid="quotation-action-dialog">
          <DialogTitle className="font-heading">Confirm: {action?.action.replace("_", " ")}</DialogTitle>
          <Textarea placeholder="Comment (required for reject / negotiation)" value={action?.comment ?? ""} onChange={(e) => action && setAction({ ...action, comment: e.target.value })} data-testid="quotation-action-comment" />
          <Button className="gold-btn" disabled={act.isPending} onClick={() => act.mutate()} data-testid="quotation-action-confirm">Confirm</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
