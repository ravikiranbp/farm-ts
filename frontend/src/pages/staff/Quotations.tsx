import { useEffect, useState } from "react";
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Download } from "lucide-react";
import { apiGet, apiPost, apiPut } from "@/lib/api";
import type { Lead, QuoteFields, QuoteItem, QuoteView, Quotation, QuotationRevision, Settings, User } from "@/lib/types";
import { LIFT_TYPES, errMsg, fmtDate, fmtDateTime, inr } from "@/lib/format";
import { Empty, Field, KV, NSelect, PageHeader, Panel, StatusBadge } from "@/components/common";
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
        actions={<NSelect value={status} onChange={(e) => setStatus(e.target.value)} options={Q_STATUSES} placeholder="All statuses" className="w-48" data-testid="quotation-status-filter" />} />
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

const BLANK: QuoteFields = { items: [{ description: "", qty: 1, unit_price: 0 }], installation_charges: 0, transport_charges: 0, additional_charges: 0, discount_pct: 0, tax_pct: 18, lifts_count: 1 };

function calc(f: QuoteFields) {
  const items = f.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_price || 0), 0);
  const subtotal = items + Number(f.installation_charges || 0) + Number(f.transport_charges || 0) + Number(f.additional_charges || 0);
  const discount = subtotal * Number(f.discount_pct || 0) / 100;
  const tax = (subtotal - discount) * Number(f.tax_pct || 0) / 100;
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

function QuoteForm({ initial, onSave, saving, isIssued }: { initial: QuoteFields; onSave: (f: QuoteFields & { change_note?: string }) => void; saving: boolean; isIssued?: boolean }) {
  const [f, setF] = useState<QuoteFields>(initial);
  const [note, setNote] = useState("");
  useEffect(() => setF(initial), [initial]);
  const set = (k: keyof QuoteFields, num?: boolean) => (e: { target: { value: string } }) => setF({ ...f, [k]: num ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value });
  const setItem = (i: number, k: keyof QuoteItem, v: string) => setF({ ...f, items: f.items.map((it, j) => j === i ? { ...it, [k]: k === "description" ? v : Number(v) } : it) });
  const t = calc(f);
  return (
    <div className="space-y-5">
      <Panel title="Lift configuration">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Lift category"><NSelect value={f.lift_category ?? ""} onChange={set("lift_category")} options={LIFT_TYPES} placeholder="Select" data-testid="q-category-select" /></Field>
          <Field label="Capacity"><Input value={f.capacity ?? ""} onChange={set("capacity")} placeholder="e.g. 8 persons / 544 kg" data-testid="q-capacity-input" /></Field>
          <Field label="Number of lifts"><Input type="number" value={f.lifts_count ?? ""} onChange={set("lifts_count", true)} data-testid="q-lifts-input" /></Field>
          <Field label="Floors"><Input type="number" value={f.floors ?? ""} onChange={set("floors", true)} data-testid="q-floors-input" /></Field>
          <Field label="Stops"><Input type="number" value={f.stops ?? ""} onChange={set("stops", true)} data-testid="q-stops-input" /></Field>
          <Field label="Valid until"><Input type="date" value={f.valid_until ?? ""} onChange={set("valid_until")} data-testid="q-valid-input" /></Field>
          <Field label="Project address" className="sm:col-span-3"><Input value={f.project_address ?? ""} onChange={set("project_address")} data-testid="q-address-input" /></Field>
          <Field label="Technical configuration" className="sm:col-span-3"><Textarea rows={2} value={f.technical_config ?? ""} onChange={set("technical_config")} placeholder="Drive, controller, door type, cabin finish…" data-testid="q-tech-input" /></Field>
          <Field label="Product description" className="sm:col-span-3"><Textarea rows={2} value={f.product_description ?? ""} onChange={set("product_description")} data-testid="q-desc-input" /></Field>
        </div>
      </Panel>
      <Panel title="Price breakup">
        <div className="space-y-2">
          {f.items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_70px_120px_auto] gap-2" data-testid="q-item-row">
              <Input placeholder="Material / equipment description" value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} data-testid={`q-item-desc-${i}`} />
              <Input type="number" min={1} value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} data-testid={`q-item-qty-${i}`} />
              <Input type="number" min={0} value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} data-testid={`q-item-price-${i}`} />
              <Button variant="ghost" size="icon" onClick={() => setF({ ...f, items: f.items.filter((_, j) => j !== i) })} aria-label="Remove item"><Trash2 className="h-4 w-4" /></Button>
            </div>))}
          <Button variant="outline" size="sm" onClick={() => setF({ ...f, items: [...f.items, { description: "", qty: 1, unit_price: 0 }] })} data-testid="q-add-item-btn"><Plus className="h-4 w-4" />Add item</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-5">
          <Field label="Installation (₹)"><Input type="number" value={f.installation_charges} onChange={set("installation_charges", true)} data-testid="q-install-input" /></Field>
          <Field label="Transport (₹)"><Input type="number" value={f.transport_charges} onChange={set("transport_charges", true)} data-testid="q-transport-input" /></Field>
          <Field label="Additional (₹)"><Input type="number" value={f.additional_charges} onChange={set("additional_charges", true)} data-testid="q-additional-input" /></Field>
          <Field label="Discount %"><Input type="number" value={f.discount_pct} onChange={set("discount_pct", true)} data-testid="q-discount-input" /></Field>
          <Field label="Tax / GST %"><Input type="number" value={f.tax_pct} onChange={set("tax_pct", true)} data-testid="q-tax-input" /></Field>
        </div>
        <div className="mt-4 ml-auto max-w-xs rounded-md border border-gold/30 bg-gold/5 p-3 text-sm">
          <KV k="Subtotal" v={inr(t.subtotal)} /><KV k="Discount" v={`− ${inr(t.discount)}`} /><KV k="Tax" v={inr(t.tax)} />
          <div className="flex justify-between pt-2 font-heading text-lg font-semibold text-champagne"><span>Final amount</span><span data-testid="q-total">{inr(t.total)}</span></div>
        </div>
      </Panel>
      <Panel title="Commercial terms">
        <div className="grid gap-3 sm:grid-cols-2">
          {([["payment_terms", "Payment schedule"], ["delivery_timeline", "Delivery timeline"], ["installation_timeline", "Installation timeline"], ["warranty", "Warranty"], ["amc_info", "AMC information"], ["terms", "Terms & conditions"]] as [keyof QuoteFields, string][]).map(([k, l]) => (
            <Field key={k} label={l}><Textarea rows={2} value={(f[k] as string) ?? ""} onChange={set(k)} placeholder="Leave blank to use company default" data-testid={`q-${k}-input`} /></Field>))}
        </div>
      </Panel>
      {isIssued && <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-200">This quotation has been issued. Saving will create a new revision; the issued version is preserved.</p>}
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Change note (what changed and why)" value={note} onChange={(e) => setNote(e.target.value)} className="max-w-md" data-testid="q-change-note-input" />
        <Button className="gold-btn" disabled={saving} onClick={() => onSave({ ...f, change_note: note || undefined })} data-testid="q-save-btn">{saving ? "Saving…" : isIssued ? "Save as new revision" : "Save draft"}</Button>
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
  const m = useMutation({ mutationFn: (f: QuoteFields) => apiPost<Quotation>("/quotations", { ...f, lead_id: leadId }), onSuccess: (q) => { toast.success(`Quotation ${q.number} created`); nav(`/staff/quotations/${q.id}`, { replace: true }); }, onError: (e) => toast.error(errMsg(e)) });
  if (!leadId) return <p className="text-steel">Open a lead and click "Create quotation".</p>;
  const l = data?.lead;
  const init: QuoteFields = { ...BLANK, tax_pct: s?.tax_pct ?? 18, lift_category: l?.lift_type ?? "", floors: l?.floors ?? null, stops: l?.floors ?? null, lifts_count: l?.lifts_count ?? 1, project_address: [l?.address, l?.area, l?.city].filter(Boolean).join(", ") };
  return (<div><PageHeader title="New quotation" subtitle={l ? `${l.name} · ${l.ref}` : "Loading lead…"} />{l && <QuoteForm initial={init} onSave={(f) => m.mutate(f)} saving={m.isPending} />}</div>);
}

function diff(a: QuotationRevision, b: QuotationRevision): string[] {
  const keys: (keyof QuoteFields)[] = ["lift_category", "capacity", "floors", "stops", "lifts_count", "installation_charges", "transport_charges", "additional_charges", "discount_pct", "tax_pct", "valid_until", "payment_terms", "warranty"];
  const out = keys.filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).map((k) => `${k.replace(/_/g, " ")}: ${a[k] ?? "—"} → ${b[k] ?? "—"}`);
  if (JSON.stringify(a.items) !== JSON.stringify(b.items)) out.push(`line items changed (${a.items.length} → ${b.items.length})`);
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
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<null | { action: string; comment: string }>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["quotation", id], queryFn: () => apiGet<{ quotation: Quotation; revisions: QuotationRevision[]; views: QuoteView[] }>(`/quotations/${id}`) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["quotation", id] }); qc.invalidateQueries({ queryKey: ["quotations"] }); };
  const save = useMutation({ mutationFn: (f: QuoteFields) => apiPut<Quotation>(`/quotations/${id}`, f), onSuccess: (q) => { toast.success(`Saved — revision ${q.revision}`); setEditing(false); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  const act = useMutation({ mutationFn: () => apiPost<Quotation>(`/quotations/${id}/action`, action), onSuccess: (q) => { toast.success(`Quotation is now ${q.status}`); setAction(null); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  if (isLoading) return <p className="text-steel">Loading…</p>;
  if (error || !data) return <p className="text-red-300">{errMsg(error)}</p>;
  const q = data.quotation;
  const mgmt = me.role !== "telecaller";
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
          <a href={`/api/quotations/${q.id}/pdf`} className="inline-flex items-center gap-1.5 rounded-md border border-gold/50 px-3 py-1.5 text-sm text-champagne hover:bg-gold/10" data-testid="quotation-pdf-btn"><Download className="h-4 w-4" />PDF</a>
          {mgmt && q.status !== "Accepted" && <Button variant="outline" onClick={() => setEditing(!editing)} data-testid="quotation-edit-btn">{editing ? "Cancel edit" : issued ? "Revise" : "Edit"}</Button>}
          {mgmt && btns.map(([a, l]) => <Button key={a} className={a === "approve" || a === "accept" ? "gold-btn" : ""} variant={a.includes("reject") ? "destructive" : a === "approve" || a === "accept" ? "default" : "outline"} onClick={() => setAction({ action: a, comment: "" })} data-testid={`quotation-action-${a}`}>{l}</Button>)}
          {q.order_id && <Link to="/staff/orders" className="rounded-md border border-emerald-500/40 px-3 py-1.5 text-sm text-emerald-300">View order →</Link>}
        </>} />
      <div className="mb-4 flex items-center gap-2"><StatusBadge status={q.status} testId="quotation-status" /><span className="text-xs text-steel">Valid until {fmtDate(q.valid_until)}</span></div>
      {editing ? <QuoteForm initial={q} onSave={(f) => save.mutate(f)} saving={save.isPending} isIssued={issued} /> : (
        <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Panel title="Summary">
            <KV k="Lift" v={`${q.lift_category ?? "—"} · ${q.capacity ?? "—"}`} /><KV k="Floors / stops / lifts" v={`${q.floors ?? "—"} / ${q.stops ?? "—"} / ${q.lifts_count ?? "—"}`} /><KV k="Address" v={q.project_address} />
            <div className="mt-3">{q.items.map((i, n) => <div key={n} className="flex justify-between py-1 text-sm"><span>{i.description} × {i.qty}</span><span>{inr(i.qty * i.unit_price)}</span></div>)}</div>
            <div className="mt-2 border-t border-line pt-2"><KV k="Installation / transport / additional" v={`${inr(q.installation_charges)} / ${inr(q.transport_charges)} / ${inr(q.additional_charges)}`} />
              <KV k="Subtotal" v={inr(q.totals.subtotal)} /><KV k={`Discount (${q.discount_pct}%)`} v={`− ${inr(q.totals.discount)}`} /><KV k={`Tax (${q.tax_pct}%)`} v={inr(q.totals.tax)} />
              <div className="flex justify-between pt-2 font-heading text-xl font-semibold text-champagne"><span>Final</span><span data-testid="quotation-total">{inr(q.totals.total)}</span></div></div>
            <div className="mt-4 space-y-1 text-xs text-steel"><p><b>Payment:</b> {q.payment_terms}</p><p><b>Delivery:</b> {q.delivery_timeline}</p><p><b>Installation:</b> {q.installation_timeline}</p><p><b>Warranty:</b> {q.warranty}</p><p><b>Terms:</b> {q.terms}</p></div>
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
