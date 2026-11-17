import { useState } from "react";
import { Link, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Amc, Customer, Followup, Inspection, Interaction, Lead, Order, Quotation, ServiceRequest, User } from "@/lib/types";
import { errMsg, fmtDate, fmtDateTime, inr } from "@/lib/format";
import { Empty, Field, NSelect, PageHeader, Panel, StatusBadge } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useStaff } from "./Leads";

export function CustomersPage() {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const { data, isLoading } = useQuery({ queryKey: ["customers", term], queryFn: () => apiGet<{ items: Customer[]; total: number }>(`/customers?q=${encodeURIComponent(term)}`) });
  return (
    <div>
      <PageHeader title="Customers" subtitle={`${data?.total ?? 0} customers · search by name, phone, location, lead / quotation / order reference`} />
      <form onSubmit={(e) => { e.preventDefault(); setTerm(q); }} className="mb-4 flex max-w-xl gap-2"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, mobile, area, ENQ-…, QTN-…, ORD-…" data-testid="customer-search-input" /><Button type="submit" data-testid="customer-search-btn">Search</Button></form>
      <div className="rounded-lg border border-line bg-panel">
        <Table><TableHeader><TableRow className="border-line"><TableHead>Ref</TableHead><TableHead>Name</TableHead><TableHead>Mobile</TableHead><TableHead className="hidden sm:table-cell">Location</TableHead><TableHead className="hidden md:table-cell">Since</TableHead></TableRow></TableHeader>
          <TableBody>{(data?.items ?? []).map((c) => (
            <TableRow key={c.id} className="border-line" data-testid="customer-row">
              <TableCell><Link to={`/staff/customers/${c.id}`} className="font-mono text-xs text-champagne hover:underline">{c.ref}</Link></TableCell>
              <TableCell><Link to={`/staff/customers/${c.id}`}>{c.name}</Link>{c.is_sample && <span className="ml-1 text-[9px] text-steel">SAMPLE</span>}</TableCell><TableCell>{c.mobile}</TableCell>
              <TableCell className="hidden text-steel sm:table-cell">{[c.area, c.city].filter(Boolean).join(", ")}</TableCell><TableCell className="hidden text-xs text-steel md:table-cell">{fmtDate(c.created_at)}</TableCell>
            </TableRow>))}</TableBody></Table>
        {isLoading ? <Empty text="Loading…" /> : !data?.items.length && <Empty text="No customers found" />}
      </div>
    </div>
  );
}

interface Profile {
  customer: Customer; leads: Lead[]; interactions: Interaction[]; followups: Followup[];
  brochures: { id: string; brochure_title: string; at: string }[]; inspections: Inspection[]; quotations: Quotation[];
  orders: Order[]; service_requests: ServiceRequest[]; amc: Amc[]; timeline: { at: string; kind: string; title: string; detail?: string | null }[];
}

export function CustomerProfile() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [edit, setEdit] = useState<Partial<Customer> | null>(null);
  const { data, isLoading, error } = useQuery({ queryKey: ["customer", id], queryFn: () => apiGet<Profile>(`/customers/${id}`) });
  const save = useMutation({ mutationFn: () => apiPatch(`/customers/${id}`, edit), onSuccess: () => { toast.success("Customer updated"); setEdit(null); qc.invalidateQueries({ queryKey: ["customer", id] }); }, onError: (e) => toast.error(errMsg(e)) });
  if (isLoading) return <p className="text-steel">Loading…</p>;
  if (error || !data) return <p className="text-red-300">{errMsg(error)}</p>;
  const c = data.customer;
  const pending = data.followups.filter((f) => !f.done);
  return (
    <div>
      <PageHeader title={c.name} subtitle={`${c.ref} · ${c.mobile} · ${[c.area, c.city].filter(Boolean).join(", ")}`} actions={<Button variant="outline" onClick={() => setEdit({ name: c.name, email: c.email, city: c.city, area: c.area, address: c.address, notes: c.notes })} data-testid="edit-customer-btn">Edit customer</Button>} />
      {edit && <Panel title="Edit customer" className="mb-5"><div className="grid gap-3 sm:grid-cols-3">
        {(["name", "email", "city", "area", "address", "notes"] as const).map((k) => <Field key={k} label={k}><Input value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: e.target.value })} data-testid={`customer-${k}-input`} /></Field>)}
        <Button className="gold-btn" onClick={() => save.mutate()} data-testid="customer-save-btn">Save</Button></div></Panel>}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8 text-center text-xs">
        {[["Enquiries", data.leads.length], ["Interactions", data.interactions.length], ["Brochures", data.brochures.length], ["Inspections", data.inspections.length], ["Quotations", data.quotations.length], ["Orders", data.orders.length], ["Service", data.service_requests.length], ["AMC", data.amc.length]].map(([k, v]) => (
          <div key={k as string} className="rounded-lg border border-line bg-panel p-3"><div className="font-heading text-xl text-champagne">{v}</div><div className="text-steel">{k}</div></div>))}
      </div>
      <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Timeline">
          <ol className="relative border-l border-gold/30 pl-4" data-testid="customer-timeline">
            {data.timeline.map((t, i) => <li key={i} className="mb-3"><span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-gold" /><div className="text-xs text-steel">{fmtDateTime(t.at)} · {t.kind}</div><div className="text-sm">{t.title}</div>{t.detail && <div className="text-xs text-steel">{t.detail}</div>}</li>)}
          </ol>
        </Panel>
        <div className="space-y-5">
          <Panel title="Enquiries / leads">{data.leads.map((l) => <Link key={l.id} to={`/staff/leads/${l.id}`} className="flex justify-between py-1.5 text-sm hover:text-champagne"><span><span className="font-mono text-xs">{l.ref}</span> · {l.requirement ?? l.enquiry_type} · {l.assigned_name ?? "Unassigned"}</span><StatusBadge status={l.status} /></Link>)}</Panel>
          <Panel title="Pending actions">{!pending.length ? <Empty text="No pending follow-ups" /> : pending.map((f) => <div key={f.id} className="text-sm">{fmtDateTime(f.due_at)} · {f.kind} · {f.assigned_name}</div>)}</Panel>
          <Panel title="Quotations & orders">
            {data.quotations.map((q) => <Link key={q.id} to={`/staff/quotations/${q.id}`} className="flex justify-between py-1 text-sm"><span>{q.number} R{q.revision}</span><span>{inr(q.totals.total)}</span><StatusBadge status={q.status} /></Link>)}
            {data.orders.map((o) => <div key={o.id} className="flex justify-between py-1 text-sm"><span>{o.ref}</span><span>{inr(o.amount)}</span><StatusBadge status={o.stage} /></div>)}
            {!data.quotations.length && !data.orders.length && <Empty text="None yet" />}
          </Panel>
          <Panel title="Service & AMC">
            {data.service_requests.map((s) => <div key={s.id} className="flex justify-between py-1 text-sm"><span>{s.ref} · {s.issue_type}</span><StatusBadge status={s.status} /></div>)}
            {data.amc.map((a) => <div key={a.id} className="flex justify-between py-1 text-sm"><span>{a.ref} · {a.start_date} → {a.end_date}</span><StatusBadge status={a.status} /></div>)}
            {!data.service_requests.length && !data.amc.length && <Empty text="None yet" />}
          </Panel>
          <Panel title="Brochures requested">{!data.brochures.length ? <Empty text="None" /> : data.brochures.map((b) => <div key={b.id} className="text-sm">{b.brochure_title} · <span className="text-steel">{fmtDateTime(b.at)}</span></div>)}</Panel>
        </div>
      </div>
    </div>
  );
}

export function FollowupsPage() {
  const [sp, setSp] = useSearchParams();
  const state = sp.get("state") ?? "pending";
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["followups", state], queryFn: () => apiGet<Followup[]>(`/followups?state=${state}`) });
  const done = useMutation({ mutationFn: (fid: string) => apiPost(`/followups/${fid}/complete`, { outcome: "Completed" }), onSuccess: () => { toast.success("Follow-up completed"); qc.invalidateQueries({ queryKey: ["followups"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div>
      <PageHeader title="Follow-ups" subtitle="Every active lead should have a clear next action" />
      <div className="mb-4 flex flex-wrap gap-2">{[["pending", "All pending"], ["today", "Today"], ["overdue", "Overdue"], ["done", "Completed"]].map(([k, l]) => (
        <Button key={k} size="sm" variant={state === k ? "default" : "outline"} onClick={() => setSp({ state: k })} data-testid={`followups-tab-${k}`}>{l}</Button>))}</div>
      <div className="rounded-lg border border-line bg-panel">
        <Table><TableHeader><TableRow className="border-line"><TableHead>Due</TableHead><TableHead>Lead</TableHead><TableHead>Type</TableHead><TableHead className="hidden sm:table-cell">Owner</TableHead><TableHead className="hidden md:table-cell">Notes</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{(data ?? []).map((f) => (
            <TableRow key={f.id} className={`border-line ${f.overdue ? "bg-red-500/5" : ""}`} data-testid="followup-list-row">
              <TableCell className={f.overdue ? "font-semibold text-red-300" : ""}>{fmtDateTime(f.due_at)}{f.overdue && <div className="text-[10px]">OVERDUE</div>}</TableCell>
              <TableCell><Link to={`/staff/leads/${f.lead_id}`} className="text-champagne hover:underline">{f.lead_name}</Link><div className="font-mono text-[10px] text-steel">{f.lead_ref}</div></TableCell>
              <TableCell>{f.kind}</TableCell><TableCell className="hidden sm:table-cell">{f.assigned_name}</TableCell><TableCell className="hidden text-xs text-steel md:table-cell">{f.notes}</TableCell>
              <TableCell>{!f.done && <Button size="xs" variant="outline" onClick={() => done.mutate(f.id)} data-testid="followup-list-complete-btn">Done</Button>}</TableCell>
            </TableRow>))}</TableBody></Table>
        {isLoading ? <Empty text="Loading…" /> : !data?.length && <Empty text="Nothing here" />}
      </div>
    </div>
  );
}

const INS_FIELDS: [keyof Inspection, string][] = [["building_type", "Building type"], ["floors", "Floors"], ["stops", "Stops"], ["shaft_width_mm", "Shaft width (mm)"], ["shaft_depth_mm", "Shaft depth (mm)"], ["pit_depth_mm", "Pit depth (mm)"], ["overhead_mm", "Overhead clearance (mm)"], ["floor_heights", "Floor-to-floor heights"], ["machine_room", "Machine room"], ["power_supply", "Power supply"], ["proposed_capacity", "Proposed capacity"], ["door_config", "Door configuration"]];

export function InspectionsPage() {
  const me = useOutletContext<User>();
  const qc = useQueryClient();
  const [sel, setSel] = useState<Inspection | null>(null);
  const { data: staff } = useStaff(me.role !== "telecaller");
  const { data, isLoading } = useQuery({ queryKey: ["inspections"], queryFn: () => apiGet<Inspection[]>("/inspections") });
  const save = useMutation({ mutationFn: (i: Inspection) => apiPatch<Inspection>(`/inspections/${i.id}`, i), onSuccess: (i) => { toast.success("Inspection saved"); setSel(i); qc.invalidateQueries({ queryKey: ["inspections"] }); }, onError: (e) => toast.error(errMsg(e)) });
  const set = (k: keyof Inspection) => (e: { target: { value: string } }) => sel && setSel({ ...sel, [k]: ["floors", "stops"].includes(k) ? (e.target.value ? Number(e.target.value) : null) : e.target.value });
  return (
    <div>
      <PageHeader title="Site inspections" subtitle="Schedule from a lead page. Record measurements and download the report here." />
      <div className="rounded-lg border border-line bg-panel">
        <Table><TableHeader><TableRow className="border-line"><TableHead>Ref</TableHead><TableHead>Customer</TableHead><TableHead>Scheduled</TableHead><TableHead className="hidden sm:table-cell">Inspector</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{(data ?? []).map((i) => (
            <TableRow key={i.id} className="border-line" data-testid="inspection-row">
              <TableCell className="font-mono text-xs text-champagne">{i.ref}</TableCell><TableCell>{i.customer_name}<div className="text-xs text-steel">{i.address}</div></TableCell>
              <TableCell className="text-sm">{fmtDateTime(i.scheduled_at)}</TableCell><TableCell className="hidden sm:table-cell">{i.assigned_name}</TableCell><TableCell><StatusBadge status={i.status} /></TableCell>
              <TableCell className="space-x-2 whitespace-nowrap"><Button size="xs" variant="outline" onClick={() => setSel(i)} data-testid="inspection-open-btn">Record</Button><a href={`/api/inspections/${i.id}/pdf`} className="text-xs text-gold" data-testid="inspection-pdf-link">PDF</a></TableCell>
            </TableRow>))}</TableBody></Table>
        {isLoading ? <Empty text="Loading…" /> : !data?.length && <Empty text="No inspections scheduled" />}
      </div>
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full overflow-y-auto bg-panel sm:max-w-xl" data-testid="inspection-sheet">
          <SheetTitle className="px-4 pt-4 font-heading">{sel?.ref} · {sel?.customer_name}</SheetTitle>
          {sel && <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="Status"><NSelect value={sel.status} onChange={set("status")} options={["Pending", "Scheduled", "Completed", "Rescheduled"]} data-testid="inspection-status-select" /></Field>
            {me.role !== "telecaller" && <Field label="Inspector"><NSelect value={sel.assigned_to} onChange={set("assigned_to")} options={(staff ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field>}
            <Field label="Address" className="sm:col-span-2"><Input value={sel.address ?? ""} onChange={set("address")} /></Field>
            {INS_FIELDS.map(([k, l]) => <Field key={k} label={l}><Input value={(sel[k] as string | number | null) ?? ""} onChange={set(k)} data-testid={`inspection-${k}-input`} /></Field>)}
            {sel.extra_fields.map((x, i) => <Field key={i} label={x.label}><Input value={x.value} onChange={(e) => setSel({ ...sel, extra_fields: sel.extra_fields.map((y, j) => j === i ? { ...y, value: e.target.value } : y) })} /></Field>)}
            <Button size="sm" variant="ghost" onClick={() => { const label = prompt("Custom measurement name"); if (label) setSel({ ...sel, extra_fields: [...sel.extra_fields, { label, value: "" }] }); }} data-testid="inspection-add-field-btn">+ Custom field</Button>
            <Field label="Technical observations" className="sm:col-span-2"><Textarea value={sel.observations ?? ""} onChange={set("observations")} data-testid="inspection-observations-input" /></Field>
            <Field label="Recommendations" className="sm:col-span-2"><Textarea value={sel.recommendations ?? ""} onChange={set("recommendations")} data-testid="inspection-recommendations-input" /></Field>
            <Button className="gold-btn sm:col-span-2" disabled={save.isPending} onClick={() => save.mutate(sel)} data-testid="inspection-record-save-btn">Save inspection</Button>
            {me.role !== "telecaller" && <Link to={`/staff/quotations/new?lead=${sel.lead_id}`} className="text-center text-sm text-gold sm:col-span-2">Create quotation from this inspection →</Link>}
          </div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}
