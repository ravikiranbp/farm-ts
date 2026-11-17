import { useState, type FormEvent } from "react";
import { Link, useNavigate, useOutletContext, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Download } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { Lead, LeadPage, User } from "@/lib/types";
import { BUILDING_TYPES, LEAD_STATUSES, LIFT_TYPES, REQUIREMENTS, SOURCES, errMsg, fmtDateTime } from "@/lib/format";
import { Field, NSelect, PageHeader, StatusBadge, Empty } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function useStaff(enabled: boolean) {
  return useQuery({ queryKey: ["staff"], queryFn: () => apiGet<User[]>("/users/staff"), enabled, staleTime: 300_000 });
}

function AddLeadDialog({ open, onClose, me }: { open: boolean; onClose: () => void; me: User }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data: staff } = useStaff(me.role !== "telecaller");
  const [f, setF] = useState({ name: "", mobile: "", email: "", city: "Bengaluru", area: "", building_type: "", requirement: "", lift_type: "", floors: "", source: "Phone call", assigned_to: "", additional_requirements: "" });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const m = useMutation({
    mutationFn: () => apiPost<Lead>("/leads", { ...f, email: f.email || null, floors: f.floors ? Number(f.floors) : null, assigned_to: f.assigned_to || null }),
    onSuccess: (l) => { qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); toast.success(`Lead ${l.ref} created${l.possible_duplicate ? " — possible duplicate of " + l.duplicate_of : ""}`); onClose(); nav(`/staff/leads/${l.id}`); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto border-line bg-panel sm:max-w-2xl" data-testid="add-lead-dialog">
        <DialogTitle className="font-heading">Add new lead</DialogTitle>
        <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer name" required><Input value={f.name} onChange={set("name")} required data-testid="lead-name-input" /></Field>
          <Field label="Mobile" required><Input value={f.mobile} onChange={set("mobile")} required data-testid="lead-mobile-input" /></Field>
          <Field label="Email"><Input value={f.email} onChange={set("email")} data-testid="lead-email-input" /></Field>
          <Field label="City" required><Input value={f.city} onChange={set("city")} required data-testid="lead-city-input" /></Field>
          <Field label="Area"><Input value={f.area} onChange={set("area")} data-testid="lead-area-input" /></Field>
          <Field label="Source"><NSelect value={f.source} onChange={set("source")} options={SOURCES} data-testid="lead-source-select" /></Field>
          <Field label="Building type"><NSelect value={f.building_type} onChange={set("building_type")} options={BUILDING_TYPES} placeholder="Select" data-testid="lead-building-select" /></Field>
          <Field label="Requirement"><NSelect value={f.requirement} onChange={set("requirement")} options={REQUIREMENTS} placeholder="Select" data-testid="lead-requirement-select" /></Field>
          <Field label="Lift type"><NSelect value={f.lift_type} onChange={set("lift_type")} options={LIFT_TYPES} placeholder="Select" data-testid="lead-lifttype-select" /></Field>
          <Field label="Floors"><Input type="number" min={1} value={f.floors} onChange={set("floors")} data-testid="lead-floors-input" /></Field>
          {me.role !== "telecaller" && <Field label="Assign to"><NSelect value={f.assigned_to} onChange={set("assigned_to")} placeholder="Auto / unassigned" options={(staff ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: `${s.name}` }))} data-testid="lead-assign-select" /></Field>}
          <Field label="Notes" className="sm:col-span-2"><Input value={f.additional_requirements} onChange={set("additional_requirements")} data-testid="lead-notes-input" /></Field>
          <Button type="submit" disabled={m.isPending} className="gold-btn sm:col-span-2" data-testid="lead-create-submit-btn">{m.isPending ? "Saving…" : "Create lead"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Leads({ approvals }: { approvals?: boolean }) {
  const me = useOutletContext<User>();
  const [sp, setSp] = useSearchParams();
  const [add, setAdd] = useState(false);
  const mgmt = me.role !== "telecaller";
  const { data: staff } = useStaff(mgmt);
  const page = Number(sp.get("page") ?? 1);
  const params = new URLSearchParams(sp);
  if (approvals) params.set("approval", "pending");
  const { data, isLoading, isError } = useQuery({ queryKey: ["leads", params.toString()], queryFn: () => apiGet<LeadPage>(`/leads?${params.toString()}`) });
  const setParam = (k: string, v: string) => { const n = new URLSearchParams(sp); if (v) n.set(k, v); else n.delete(k); n.delete("page"); setSp(n); };
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));
  return (
    <div>
      <PageHeader title={approvals ? "Positive lead approvals" : "Leads"} subtitle={approvals ? "Positive leads submitted by the team awaiting a decision" : `${data?.total ?? 0} leads${me.role === "telecaller" ? " assigned to you" : ""}`}
        actions={!approvals && <>
          {mgmt && <a href={`/api/reports/export/leads?${sp.toString()}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:border-gold" data-testid="export-leads-btn"><Download className="h-4 w-4" />Export CSV</a>}
          <Button className="gold-btn" onClick={() => setAdd(true)} data-testid="add-lead-btn"><Plus className="h-4 w-4" />Add lead</Button></>} />
      {!approvals && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
          <Input placeholder="Search name, mobile, ref, area…" defaultValue={sp.get("q") ?? ""} onKeyDown={(e) => e.key === "Enter" && setParam("q", (e.target as HTMLInputElement).value)} className="lg:col-span-2" data-testid="leads-search-input" />
          <NSelect value={sp.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value)} options={LEAD_STATUSES} placeholder="All statuses" data-testid="leads-status-filter" />
          <NSelect value={sp.get("followup") ?? ""} onChange={(e) => setParam("followup", e.target.value)} options={[{ value: "today", label: "Follow-up today" }, { value: "overdue", label: "Follow-up overdue" }]} placeholder="Any follow-up" data-testid="leads-followup-filter" />
          <NSelect value={sp.get("source") ?? ""} onChange={(e) => setParam("source", e.target.value)} options={SOURCES} placeholder="All sources" data-testid="leads-source-filter" />
          {mgmt && <NSelect value={sp.get("assigned_to") ?? ""} onChange={(e) => setParam("assigned_to", e.target.value)} placeholder="All owners" options={[{ value: "unassigned", label: "Unassigned" }, ...(staff ?? []).map((s) => ({ value: s.id, label: s.name }))]} data-testid="leads-owner-filter" />}
          {me.role === "admin" && <label className="flex items-center gap-2 text-xs text-steel"><input type="checkbox" checked={sp.get("archived") === "true"} onChange={(e) => setParam("archived", e.target.checked ? "true" : "")} data-testid="leads-archived-toggle" />Show archived</label>}
        </div>
      )}
      <div className="rounded-lg border border-line bg-panel">
        <Table>
          <TableHeader><TableRow className="border-line"><TableHead>Ref</TableHead><TableHead>Customer</TableHead><TableHead className="hidden md:table-cell">Requirement</TableHead><TableHead>Status</TableHead><TableHead className="hidden sm:table-cell">Owner</TableHead><TableHead className="hidden lg:table-cell">Next follow-up</TableHead>{approvals && <TableHead>Submitted by</TableHead>}</TableRow></TableHeader>
          <TableBody>
            {(data?.items ?? []).map((l) => {
              const overdue = l.next_followup_at && l.next_followup_at < new Date().toISOString();
              return (
                <TableRow key={l.id} className="border-line hover:bg-elev/60" data-testid="lead-row">
                  <TableCell><Link to={`/staff/leads/${l.id}`} className="font-mono text-xs text-champagne hover:underline" data-testid={`lead-link-${l.ref}`}>{l.ref}</Link>{l.is_sample && <span className="ml-1 text-[9px] text-steel">SAMPLE</span>}</TableCell>
                  <TableCell><Link to={`/staff/leads/${l.id}`} className="hover:text-champagne">{l.name}</Link><div className="text-xs text-steel">{l.mobile} · {l.area || l.city}</div>{l.possible_duplicate && <div className="text-[10px] text-amber-300">Possible duplicate of {l.duplicate_of}</div>}</TableCell>
                  <TableCell className="hidden text-xs text-steel md:table-cell">{l.lift_type || "—"}<br />{l.source}</TableCell>
                  <TableCell><StatusBadge status={l.status} /></TableCell>
                  <TableCell className="hidden text-sm sm:table-cell">{l.assigned_name ?? <span className="text-amber-300">Unassigned</span>}</TableCell>
                  <TableCell className={`hidden text-xs lg:table-cell ${overdue ? "font-semibold text-red-300" : "text-steel"}`}>{fmtDateTime(l.next_followup_at)}{overdue && " · overdue"}</TableCell>
                  {approvals && <TableCell className="text-xs">{l.approval?.submitted_by_name}<br /><span className="text-steel">{fmtDateTime(l.approval?.submitted_at)}</span></TableCell>}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {isLoading && <Empty text="Loading leads…" />}
        {isError && <Empty text="Leads could not be loaded." />}
        {data && !data.items.length && <Empty text={approvals ? "No leads awaiting approval" : "No leads match these filters"} />}
      </div>
      {pages > 1 && (
        <div className="mt-3 flex items-center justify-end gap-2 text-sm">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { const n = new URLSearchParams(sp); n.set("page", String(page - 1)); setSp(n); }} data-testid="leads-prev-page">Prev</Button>
          <span className="text-steel">Page {page} / {pages}</span>
          <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => { const n = new URLSearchParams(sp); n.set("page", String(page + 1)); setSp(n); }} data-testid="leads-next-page">Next</Button>
        </div>
      )}
      <AddLeadDialog open={add} onClose={() => setAdd(false)} me={me} />
    </div>
  );
}
