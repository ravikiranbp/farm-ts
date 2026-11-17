import { useState } from "react";
import { useNavigate, useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import type { Amc, Customer, Notification, Order, ServiceRequest, User } from "@/lib/types";
import { ISSUE_TYPES, ORDER_STAGES, errMsg, fmtDate, fmtDateTime, inr } from "@/lib/format";
import { Empty, Field, KV, NSelect, PageHeader, Panel, StatusBadge } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useStaff } from "./Leads";

export function OrdersPage() {
  const me = useOutletContext<User>();
  const mgmt = me.role !== "telecaller";
  const qc = useQueryClient();
  const { data: staff } = useStaff(mgmt);
  const [sel, setSel] = useState<(Order & { stage_note?: string }) | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["orders"], queryFn: () => apiGet<Order[]>("/orders") });
  const save = useMutation({ mutationFn: (o: Order & { stage_note?: string }) => apiPatch<Order>(`/orders/${o.id}`, o), onSuccess: (o) => { toast.success("Order updated"); setSel(o); qc.invalidateQueries({ queryKey: ["orders"] }); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div>
      <PageHeader title="Orders & installations" subtitle="Orders are created automatically when a customer accepts a quotation" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(data ?? []).map((o) => {
          const idx = ORDER_STAGES.indexOf(o.stage);
          return (
            <button key={o.id} onClick={() => setSel(o)} className="card-lift rounded-lg border border-line bg-panel p-4 text-left" data-testid="order-card">
              <div className="flex justify-between"><span className="font-mono text-xs text-champagne">{o.ref}</span><StatusBadge status={o.stage} /></div>
              <h3 className="mt-2 font-heading font-semibold">{o.customer_name}</h3><p className="text-xs text-steel">{o.specs}</p>
              <div className="mt-3 h-1.5 rounded-full bg-elev"><div className="h-1.5 rounded-full bg-gold" style={{ width: `${((idx + 1) / ORDER_STAGES.length) * 100}%` }} /></div>
              <div className="mt-2 flex justify-between text-xs text-steel"><span>Stage {idx + 1}/{ORDER_STAGES.length}</span><span>{inr(o.amount)}</span></div>
            </button>
          );
        })}
      </div>
      {isLoading ? <Empty text="Loading…" /> : !data?.length && <Empty text="No confirmed orders yet" />}
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full overflow-y-auto bg-panel sm:max-w-xl" data-testid="order-sheet">
          <SheetTitle className="px-4 pt-4 font-heading">{sel?.ref} · {sel?.customer_name}</SheetTitle>
          {sel && <div className="space-y-4 p-4">
            <div><KV k="Quotation" v={sel.quotation_number} /><KV k="Location" v={sel.location} /><KV k="Specs" v={sel.specs} /><KV k="Agreed amount" v={inr(sel.amount)} /><KV k="Project manager" v={sel.project_manager_name} /></div>
            <Field label="Installation stage"><NSelect value={sel.stage} disabled={!mgmt} onChange={(e) => setSel({ ...sel, stage: e.target.value })} options={ORDER_STAGES} data-testid="order-stage-select" /></Field>
            <Input placeholder="Stage note" value={sel.stage_note ?? ""} disabled={!mgmt} onChange={(e) => setSel({ ...sel, stage_note: e.target.value })} data-testid="order-stage-note" />
            <div className="grid grid-cols-3 gap-2">
              <Field label="Material delivery"><Input type="date" disabled={!mgmt} value={sel.expected_delivery ?? ""} onChange={(e) => setSel({ ...sel, expected_delivery: e.target.value })} /></Field>
              <Field label="Install start"><Input type="date" disabled={!mgmt} value={sel.start_date ?? ""} onChange={(e) => setSel({ ...sel, start_date: e.target.value })} /></Field>
              <Field label="Completion"><Input type="date" disabled={!mgmt} value={sel.expected_completion ?? ""} onChange={(e) => setSel({ ...sel, expected_completion: e.target.value })} /></Field>
            </div>
            {mgmt && <Field label="Project manager"><NSelect value={sel.project_manager_id ?? ""} onChange={(e) => setSel({ ...sel, project_manager_id: e.target.value })} options={(staff ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field>}
            <div><p className="field-label mb-1">Payment milestones</p>
              {sel.payment_milestones.map((m, i) => <div key={i} className="flex items-center justify-between gap-2 py-1 text-sm"><span>{m.label} · {inr(m.amount)}</span>
                <NSelect className="w-28" disabled={!mgmt} value={m.status} options={["Pending", "Received"]} onChange={(e) => setSel({ ...sel, payment_milestones: sel.payment_milestones.map((x, j) => j === i ? { ...x, status: e.target.value, paid_on: e.target.value === "Received" ? new Date().toISOString().slice(0, 10) : null } : x) })} data-testid={`milestone-status-${i}`} /></div>)}
            </div>
            <Field label="Pending activities / issues & delays"><Textarea disabled={!mgmt} value={sel.pending_activities ?? ""} onChange={(e) => setSel({ ...sel, pending_activities: e.target.value })} /></Field>
            <Field label="Inspection / compliance documentation (actual licence & inspection references)"><Textarea disabled={!mgmt} value={sel.compliance_docs ?? ""} onChange={(e) => setSel({ ...sel, compliance_docs: e.target.value })} /></Field>
            <Field label="Handover details"><Input disabled={!mgmt} placeholder="Handed over to / remarks" value={sel.completion?.remarks ?? ""} onChange={(e) => setSel({ ...sel, completion: { ...sel.completion, remarks: e.target.value } })} /></Field>
            {mgmt && <Button className="gold-btn w-full" disabled={save.isPending} onClick={() => save.mutate(sel)} data-testid="order-save-btn">Save progress</Button>}
            <div><p className="field-label mb-1">Stage history</p>{sel.stage_history.map((h, i) => <div key={i} className="text-xs text-steel">{fmtDateTime(String(h.at))} · <span className="text-platinum">{String(h.stage)}</span> · {String(h.by)} {h.note ? `— ${String(h.note)}` : ""}</div>)}</div>
          </div>}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export function ServicePage() {
  const me = useOutletContext<User>();
  const mgmt = me.role !== "telecaller";
  const qc = useQueryClient();
  const { data: staff } = useStaff(mgmt);
  const { data: srs } = useQuery({ queryKey: ["srs"], queryFn: () => apiGet<ServiceRequest[]>("/service-requests") });
  const { data: amcs } = useQuery({ queryKey: ["amc"], queryFn: () => apiGet<Amc[]>("/amc") });
  const { data: customers } = useQuery({ queryKey: ["customers", ""], queryFn: () => apiGet<{ items: Customer[] }>("/customers"), enabled: mgmt });
  const [sel, setSel] = useState<(ServiceRequest & { note?: string }) | null>(null);
  const [newSr, setNewSr] = useState<null | Record<string, string>>(null);
  const [newAmc, setNewAmc] = useState<null | Record<string, string>>(null);
  const inv = () => { qc.invalidateQueries({ queryKey: ["srs"] }); qc.invalidateQueries({ queryKey: ["amc"] }); };
  const saveSr = useMutation({ mutationFn: (s: ServiceRequest & { note?: string }) => apiPatch<ServiceRequest>(`/service-requests/${s.id}`, s), onSuccess: (s) => { toast.success("Service request updated"); setSel(s); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const createSr = useMutation({ mutationFn: () => apiPost<ServiceRequest>("/service-requests", newSr), onSuccess: (s) => { toast.success(`Created ${s.ref}`); setNewSr(null); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const createAmc = useMutation({ mutationFn: () => apiPost<Amc>("/amc", { ...newAmc, amount: Number(newAmc?.amount || 0) }), onSuccess: (a) => { toast.success(`AMC ${a.ref} created`); setNewAmc(null); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const updAmc = useMutation({ mutationFn: (a: Partial<Amc> & { id: string }) => apiPatch(`/amc/${a.id}`, a), onSuccess: () => { toast.success("AMC updated"); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  return (
    <div>
      <PageHeader title="Service & AMC" actions={<><Button variant="outline" onClick={() => setNewSr({ name: "", mobile: "", address: "", issue_type: "Lift breakdown", description: "", priority: "Normal" })} data-testid="new-sr-btn">New service request</Button>
        {mgmt && <Button className="gold-btn" onClick={() => setNewAmc({ customer_id: "", start_date: "", end_date: "", amount: "", frequency: "Monthly", coverage: "Non-comprehensive", payment_status: "Pending", lift_details: "" })} data-testid="new-amc-btn">New AMC</Button>}</>} />
      <Tabs defaultValue="sr">
        <TabsList><TabsTrigger value="sr" data-testid="tab-service-requests">Service requests ({srs?.length ?? 0})</TabsTrigger><TabsTrigger value="amc" data-testid="tab-amc">AMC contracts ({amcs?.length ?? 0})</TabsTrigger></TabsList>
        <TabsContent value="sr"><div className="rounded-lg border border-line bg-panel">
          <Table><TableHeader><TableRow className="border-line"><TableHead>Ref</TableHead><TableHead>Customer</TableHead><TableHead>Issue</TableHead><TableHead>Priority</TableHead><TableHead>Status</TableHead><TableHead className="hidden sm:table-cell">Technician</TableHead></TableRow></TableHeader>
            <TableBody>{(srs ?? []).map((s) => <TableRow key={s.id} className="cursor-pointer border-line hover:bg-elev/60" onClick={() => setSel(s)} data-testid="sr-row">
              <TableCell className="font-mono text-xs text-champagne">{s.ref}</TableCell><TableCell>{s.name}<div className="text-xs text-steel">{s.mobile}</div></TableCell><TableCell className="text-sm">{s.issue_type}</TableCell>
              <TableCell><StatusBadge status={s.priority} /></TableCell><TableCell><StatusBadge status={s.status} /></TableCell><TableCell className="hidden sm:table-cell">{s.assigned_name ?? "—"}</TableCell></TableRow>)}</TableBody></Table>
          {!srs?.length && <Empty text="No service requests" />}</div></TabsContent>
        <TabsContent value="amc"><div className="rounded-lg border border-line bg-panel">
          <Table><TableHeader><TableRow className="border-line"><TableHead>Ref</TableHead><TableHead>Customer</TableHead><TableHead>Period</TableHead><TableHead>Value</TableHead><TableHead>Next visit</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>{(amcs ?? []).map((a) => <TableRow key={a.id} className={`border-line ${a.expiring_soon ? "bg-amber-500/5" : ""}`} data-testid="amc-row">
              <TableCell className="font-mono text-xs text-champagne">{a.ref}</TableCell><TableCell>{a.customer_name}<div className="text-xs text-steel">{a.lift_details} · {a.frequency} · {a.coverage}</div></TableCell>
              <TableCell className="text-xs">{fmtDate(a.start_date)} → {fmtDate(a.end_date)}{a.expiring_soon && <div className="text-amber-300">Renewal due</div>}</TableCell><TableCell>{inr(a.amount)}<div className="text-xs text-steel">{a.payment_status}</div></TableCell>
              <TableCell>{mgmt ? <Input type="date" className="h-8 w-36" defaultValue={a.next_visit ?? ""} onBlur={(e) => e.target.value !== (a.next_visit ?? "") && updAmc.mutate({ id: a.id, next_visit: e.target.value })} /> : fmtDate(a.next_visit)}</TableCell>
              <TableCell>{mgmt ? <NSelect className="h-8 w-28" value={a.status} options={["Active", "Expired", "Renewed", "Cancelled"]} onChange={(e) => updAmc.mutate({ id: a.id, status: e.target.value })} /> : <StatusBadge status={a.status} />}</TableCell></TableRow>)}</TableBody></Table>
          {!amcs?.length && <Empty text="No AMC contracts" />}</div></TabsContent>
      </Tabs>
      <Sheet open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <SheetContent className="w-full overflow-y-auto bg-panel sm:max-w-lg" data-testid="sr-sheet">
          <SheetTitle className="px-4 pt-4 font-heading">{sel?.ref} · {sel?.name}</SheetTitle>
          {sel && <div className="space-y-3 p-4">
            <KV k="Mobile" v={sel.mobile} /><KV k="Address" v={sel.address} /><KV k="Lift ref" v={sel.lift_ref} /><KV k="Issue" v={sel.issue_type} /><p className="text-sm text-steel">{sel.description}</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Status"><NSelect value={sel.status} onChange={(e) => setSel({ ...sel, status: e.target.value })} options={["Open", "Assigned", "Scheduled", "In Progress", "Resolved", "Closed"]} data-testid="sr-status-select" /></Field>
              <Field label="Priority"><NSelect value={sel.priority} onChange={(e) => setSel({ ...sel, priority: e.target.value })} options={["Low", "Normal", "High", "Emergency"]} /></Field>
              {mgmt && <Field label="Technician"><NSelect value={sel.assigned_to ?? ""} placeholder="Unassigned" onChange={(e) => setSel({ ...sel, assigned_to: e.target.value })} options={(staff ?? []).map((s) => ({ value: s.id, label: s.name }))} data-testid="sr-assign-select" /></Field>}
              <Field label="Visit"><Input type="datetime-local" value={sel.visit_at ?? ""} onChange={(e) => setSel({ ...sel, visit_at: e.target.value })} /></Field>
            </div>
            <Field label="Work performed"><Textarea value={sel.work_done ?? ""} onChange={(e) => setSel({ ...sel, work_done: e.target.value })} data-testid="sr-work-input" /></Field>
            <Field label="Parts replaced"><Input value={sel.parts_replaced ?? ""} onChange={(e) => setSel({ ...sel, parts_replaced: e.target.value })} /></Field>
            <label className="flex items-center gap-2 text-sm"><Checkbox checked={sel.customer_confirmed} onCheckedChange={(v) => setSel({ ...sel, customer_confirmed: Boolean(v) })} />Customer confirmed the work</label>
            <Field label="Add service note"><Input value={sel.note ?? ""} onChange={(e) => setSel({ ...sel, note: e.target.value })} data-testid="sr-note-input" /></Field>
            <Button className="gold-btn w-full" disabled={saveSr.isPending} onClick={() => saveSr.mutate(sel)} data-testid="sr-save-btn">Save</Button>
            {sel.notes.map((n, i) => <div key={i} className="text-xs text-steel">{fmtDateTime(String(n.at))} · {String(n.by)}: <span className="text-platinum">{String(n.note)}</span></div>)}
          </div>}
        </SheetContent>
      </Sheet>
      <Dialog open={!!newSr} onOpenChange={(o) => !o && setNewSr(null)}>
        <DialogContent className="border-line bg-panel" data-testid="new-sr-dialog"><DialogTitle className="font-heading">New service request</DialogTitle>
          {newSr && <div className="grid gap-2 sm:grid-cols-2">
            {(["name", "mobile", "address", "lift_ref"] as const).map((k) => <Field key={k} label={k.replace("_", " ")}><Input value={newSr[k] ?? ""} onChange={(e) => setNewSr({ ...newSr, [k]: e.target.value })} data-testid={`new-sr-${k}`} /></Field>)}
            <Field label="Issue"><NSelect value={newSr.issue_type} options={ISSUE_TYPES} onChange={(e) => setNewSr({ ...newSr, issue_type: e.target.value })} /></Field>
            <Field label="Priority"><NSelect value={newSr.priority} options={["Low", "Normal", "High", "Emergency"]} onChange={(e) => setNewSr({ ...newSr, priority: e.target.value })} /></Field>
            <Field label="Description" className="sm:col-span-2"><Textarea value={newSr.description} onChange={(e) => setNewSr({ ...newSr, description: e.target.value })} data-testid="new-sr-description" /></Field>
            <Button className="gold-btn sm:col-span-2" onClick={() => createSr.mutate()} data-testid="new-sr-save-btn">Create</Button></div>}
        </DialogContent>
      </Dialog>
      <Dialog open={!!newAmc} onOpenChange={(o) => !o && setNewAmc(null)}>
        <DialogContent className="border-line bg-panel" data-testid="new-amc-dialog"><DialogTitle className="font-heading">New AMC contract</DialogTitle>
          {newAmc && <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Customer" className="sm:col-span-2"><NSelect value={newAmc.customer_id} placeholder="Select customer" options={(customers?.items ?? []).map((c) => ({ value: c.id, label: `${c.name} · ${c.mobile}` }))} onChange={(e) => setNewAmc({ ...newAmc, customer_id: e.target.value })} data-testid="new-amc-customer" /></Field>
            <Field label="Start"><Input type="date" value={newAmc.start_date} onChange={(e) => setNewAmc({ ...newAmc, start_date: e.target.value })} data-testid="new-amc-start" /></Field>
            <Field label="End"><Input type="date" value={newAmc.end_date} onChange={(e) => setNewAmc({ ...newAmc, end_date: e.target.value })} data-testid="new-amc-end" /></Field>
            <Field label="Contract amount (₹)"><Input type="number" value={newAmc.amount} onChange={(e) => setNewAmc({ ...newAmc, amount: e.target.value })} /></Field>
            <Field label="Frequency"><NSelect value={newAmc.frequency} options={["Monthly", "Bi-monthly", "Quarterly"]} onChange={(e) => setNewAmc({ ...newAmc, frequency: e.target.value })} /></Field>
            <Field label="Coverage"><NSelect value={newAmc.coverage} options={["Non-comprehensive", "Comprehensive"]} onChange={(e) => setNewAmc({ ...newAmc, coverage: e.target.value })} /></Field>
            <Field label="Payment"><NSelect value={newAmc.payment_status} options={["Pending", "Paid", "Partial"]} onChange={(e) => setNewAmc({ ...newAmc, payment_status: e.target.value })} /></Field>
            <Field label="Lift / project details" className="sm:col-span-2"><Input value={newAmc.lift_details} onChange={(e) => setNewAmc({ ...newAmc, lift_details: e.target.value })} /></Field>
            <Button className="gold-btn sm:col-span-2" onClick={() => createAmc.mutate()} data-testid="new-amc-save-btn">Create AMC</Button></div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function NotificationsPage() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => apiGet<{ items: Notification[]; unread: number }>("/notifications") });
  const read = useMutation({ mutationFn: (id?: string) => apiPost("/notifications/read", { id }), onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }) });
  return (
    <div>
      <PageHeader title="Notifications" subtitle={`${data?.unread ?? 0} unread · in-app only (SMS/WhatsApp/email can be added later)`} actions={<Button variant="outline" onClick={() => read.mutate(undefined)} data-testid="mark-all-read-btn">Mark all read</Button>} />
      <Panel>{!data?.items.length ? <Empty text="No notifications" /> : data.items.map((n) => (
        <button key={n.id} onClick={() => { read.mutate(n.id); if (n.link) nav(n.link); }} className={`flex w-full items-start justify-between gap-3 border-b border-line/60 py-2.5 text-left last:border-0 ${n.read ? "opacity-60" : ""}`} data-testid="notification-row">
          <span><span className="flex items-center gap-2 text-sm">{!n.read && <span className="h-2 w-2 rounded-full bg-gold" />}{n.title}</span><span className="text-xs text-steel">{n.body}</span></span><span className="shrink-0 text-xs text-steel">{fmtDateTime(n.at)}</span>
        </button>))}</Panel>
    </div>
  );
}
