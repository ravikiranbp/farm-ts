import { useState } from "react";
import { Link, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Phone, MessageCircle, Upload, FileText } from "lucide-react";
import { apiGet, apiPatch, apiPost, apiUpload } from "@/lib/api";
import type { AuditEntry, Customer, FileMeta, Followup, Inspection, Interaction, Lead, User } from "@/lib/types";
import { BUILDING_TYPES, CONSTRUCTION, LEAD_STATUSES, LIFT_TYPES, REQUIREMENTS, SOURCES, TELECALLER_BLOCKED, errMsg, fmtDateTime, inr, localToIso } from "@/lib/format";
import { Empty, Field, KV, NSelect, PageHeader, Panel, StatusBadge } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStaff } from "./Leads";
import CallChecklist, { checklistProgress, useChecklist } from "@/components/CallChecklist";

interface Detail {
  lead: Lead; customer: Customer; interactions: Interaction[]; followups: Followup[]; inspections: Inspection[];
  quotations: { id: string; number: string; revision: number; status: string; totals: { total: number }; updated_at: string }[];
  files: FileMeta[]; history: AuditEntry[];
}

export default function LeadDetail() {
  const { id = "" } = useParams();
  const me = useOutletContext<User>();
  const qc = useQueryClient();
  const nav = useNavigate();
  const mgmt = me.role !== "telecaller";
  const { data, isLoading, error } = useQuery({ queryKey: ["lead", id], queryFn: () => apiGet<Detail>(`/leads/${id}`) });
  const { data: staff } = useStaff(mgmt);
  const { data: checklist = [] } = useChecklist();
  const refresh = () => { qc.invalidateQueries({ queryKey: ["lead", id] }); qc.invalidateQueries({ queryKey: ["leads"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); };
  const act = (fn: () => Promise<unknown>, ok: string, after?: () => void) => ({
    mutationFn: fn, onSuccess: () => { toast.success(ok); refresh(); after?.(); }, onError: (e: unknown) => toast.error(errMsg(e)),
  });

  const [note, setNote] = useState({ kind: "call", answered: "yes", outcome: "", notes: "" });
  const [fu, setFu] = useState({ due_at: "", kind: "call", notes: "" });
  const [status, setStatus] = useState({ status: "", comment: "" });
  const [assign, setAssign] = useState({ user_id: "", reason: "" });
  const [pos, setPos] = useState<null | { lift_type: string; floors: string; lifts_count: string; requirement_summary: string; notes: string }>(null);
  const [decision, setDecision] = useState<null | { decision: "approve" | "reject" | "request_info"; comment: string }>(null);
  const [edit, setEdit] = useState<Partial<Lead> | null>(null);
  const [insp, setInsp] = useState<null | { scheduled_at: string; assigned_to: string; address: string }>(null);
  const [dup, setDup] = useState("");

  const addNote = useMutation(act(() => apiPost(`/leads/${id}/interactions`, { kind: note.kind, answered: note.kind === "note" ? null : note.answered === "yes", outcome: note.outcome || null, notes: note.notes }), "Interaction saved", () => setNote({ ...note, outcome: "", notes: "" })));
  const addFu = useMutation(act(() => apiPost(`/leads/${id}/followups`, { ...fu, due_at: localToIso(fu.due_at) }), "Follow-up scheduled", () => setFu({ due_at: "", kind: "call", notes: "" })));
  const doneFu = useMutation({ mutationFn: (fid: string) => apiPost(`/followups/${fid}/complete`, { outcome: "Completed" }), onSuccess: () => { toast.success("Follow-up completed"); refresh(); }, onError: (e) => toast.error(errMsg(e)) });
  const chStatus = useMutation(act(() => apiPost(`/leads/${id}/status`, status), "Status updated", () => setStatus({ status: "", comment: "" })));
  const doAssign = useMutation(act(() => apiPost(`/leads/${id}/assign`, assign), "Lead assigned", () => setAssign({ user_id: "", reason: "" })));
  const submitPos = useMutation(act(() => apiPost(`/leads/${id}/submit-positive`, { ...pos, floors: Number(pos?.floors), lifts_count: Number(pos?.lifts_count || 1) }), "Submitted for manager approval", () => setPos(null)));
  const decide = useMutation(act(() => apiPost(`/leads/${id}/decision`, decision), "Decision recorded", () => setDecision(null)));
  const save = useMutation(act(() => apiPatch(`/leads/${id}`, edit), "Lead updated", () => setEdit(null)));
  const schedule = useMutation(act(() => apiPost(`/inspections`, { lead_id: id, ...insp, scheduled_at: insp?.scheduled_at ? localToIso(insp.scheduled_at) : null }), "Site inspection scheduled", () => setInsp(null)));
  const archive = useMutation(act(() => apiPost(`/leads/${id}/${data?.lead.archived ? "restore" : "archive"}`, { comment: "Admin action" }), "Archive state updated"));
  const markDup = useMutation(act(() => apiPost(`/leads/${id}/mark-duplicate`, { duplicate_of: dup }), "Marked as duplicate", () => setDup("")));
  const upload = useMutation({
    mutationFn: (file: File) => { const fd = new FormData(); fd.append("file", file); fd.append("entity_type", "lead"); fd.append("entity_id", id); return apiUpload<FileMeta>("/files", fd); },
    onSuccess: () => { toast.success("File uploaded"); refresh(); }, onError: (e) => toast.error(errMsg(e)),
  });

  if (isLoading) return <p className="text-steel">Loading lead…</p>;
  if (error || !data) return <p className="text-red-300">{errMsg(error)} <Link to="/staff/leads" className="text-gold">Back to leads</Link></p>;
  const l = data.lead;
  const ap = l.approval;
  const canDecide = mgmt && ap?.state === "pending" && (ap.submitted_by !== me.id || me.role === "admin");
  const statusOpts = LEAD_STATUSES.filter((s) => s !== "Positive – Awaiting Manager Approval" && (me.role === "admin" || s !== "Approved") && (mgmt || !TELECALLER_BLOCKED.includes(s)));
  const e = edit ?? {};
  const setE = (k: keyof Lead) => (ev: { target: { value: string } }) => setEdit({ ...e, [k]: ["floors", "lifts_count"].includes(k) ? (ev.target.value ? Number(ev.target.value) : null) : ev.target.value });

  return (
    <div>
      <PageHeader title={l.name} subtitle={`${l.ref} · ${l.source} · created ${fmtDateTime(l.created_at)} by ${l.created_by_name ?? "Website"}`}
        actions={<>
          <a href={`tel:${l.mobile}`} className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:border-gold" data-testid="call-customer-btn"><Phone className="h-4 w-4" />{l.mobile}</a>
          <a href={`https://wa.me/91${l.mobile}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:border-gold" data-testid="whatsapp-customer-btn"><MessageCircle className="h-4 w-4" />WhatsApp</a>
          <Button variant="outline" onClick={() => setEdit({ name: l.name, email: l.email, city: l.city, area: l.area, address: l.address, building_type: l.building_type, requirement: l.requirement, floors: l.floors, lifts_count: l.lifts_count, construction_status: l.construction_status, lift_type: l.lift_type, additional_requirements: l.additional_requirements, preferred_callback_time: l.preferred_callback_time, source: l.source })} data-testid="edit-lead-btn">Edit</Button>
          {ap?.state !== "pending" && !["Won", "Approved"].includes(l.status) && <Button className="gold-btn" onClick={() => setPos({ lift_type: l.lift_type ?? "", floors: String(l.floors ?? ""), lifts_count: String(l.lifts_count ?? 1), requirement_summary: l.requirement ?? "", notes: "" })} data-testid="submit-positive-btn">Submit positive lead</Button>}
          {mgmt && <Button variant="outline" onClick={() => nav(`/staff/quotations/new?lead=${l.id}`)} data-testid="create-quotation-btn">Create quotation</Button>}
        </>} />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={l.status} testId="lead-status-badge" />
        {l.archived && <StatusBadge status="Archived" />}
        {l.possible_duplicate && <span className="text-xs text-amber-300">Possible duplicate of {l.duplicate_of}</span>}
        {l.is_sample && <span className="text-xs text-steel">SAMPLE RECORD</span>}
        <span className="text-xs text-steel">Owner: <b className="text-platinum" data-testid="lead-owner">{l.assigned_name ?? "Unassigned"}</b></span>
        <Link to={`/staff/customers/${l.customer_id}`} className="text-xs text-gold hover:underline" data-testid="customer-profile-link">Customer profile ({data.customer?.ref}) →</Link>
      </div>

      {ap && (
        <div className={`mb-4 rounded-lg border p-4 ${ap.state === "pending" ? "border-amber-500/40 bg-amber-500/5" : ap.state === "approved" ? "border-emerald-500/40 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`} data-testid="approval-panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm"><b>Approval: </b><StatusBadge status={ap.state} testId="approval-state" /> · submitted by {ap.submitted_by_name} on {fmtDateTime(ap.submitted_at)}
              {ap.decided_by_name && <> · decided by <b>{ap.decided_by_name}</b> on {fmtDateTime(ap.decided_at)}</>}</div>
            {canDecide && <div className="flex gap-2">
              <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-500" onClick={() => setDecision({ decision: "approve", comment: "" })} data-testid="approve-lead-btn">Approve</Button>
              <Button size="sm" variant="outline" onClick={() => setDecision({ decision: "request_info", comment: "" })} data-testid="request-info-btn">Request info</Button>
              <Button size="sm" variant="destructive" onClick={() => setDecision({ decision: "reject", comment: "" })} data-testid="reject-lead-btn">Reject</Button></div>}
            {mgmt && ap.state === "pending" && !canDecide && <span className="text-xs text-amber-300">You submitted this lead — another manager or admin must decide.</span>}
          </div>
          {ap.summary && <p className="mt-2 text-sm text-steel">Requirement: {ap.summary}</p>}
          {ap.comment && <p className="mt-1 text-sm">Manager comment: <span className="text-champagne" data-testid="approval-comment">{ap.comment}</span></p>}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_1.5fr]">
        <div className="space-y-5">
          <Panel title="Customer & requirement">
            <KV k="Mobile" v={l.mobile} /><KV k="Email" v={l.email} /><KV k="Location" v={[l.area, l.city].filter(Boolean).join(", ")} /><KV k="Address" v={l.address} />
            <KV k="Building" v={l.building_type} /><KV k="Requirement" v={l.requirement} /><KV k="Lift type" v={l.lift_type} /><KV k="Floors / lifts" v={`${l.floors ?? "—"} / ${l.lifts_count ?? "—"}`} />
            <KV k="Construction" v={l.construction_status} /><KV k="Callback time" v={l.preferred_callback_time} /><KV k="Enquiry type" v={l.enquiry_type} />
            {l.additional_requirements && <p className="mt-2 text-xs text-steel">{l.additional_requirements}</p>}
          </Panel>
          <Panel title="Update status">
            <div className="space-y-2">
              <NSelect value={status.status} onChange={(ev) => setStatus({ ...status, status: ev.target.value })} options={statusOpts} placeholder="Choose new status" data-testid="lead-status-select" />
              <Input placeholder="Comment / reason" value={status.comment} onChange={(ev) => setStatus({ ...status, comment: ev.target.value })} data-testid="lead-status-comment" />
              <Button size="sm" disabled={!status.status || chStatus.isPending} onClick={() => chStatus.mutate()} data-testid="lead-status-save-btn">Update status</Button>
            </div>
          </Panel>
          {mgmt && <Panel title="Assignment">
            <div className="space-y-2">
              <NSelect value={assign.user_id} onChange={(ev) => setAssign({ ...assign, user_id: ev.target.value })} placeholder="Select employee" options={(staff ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: `${s.name}` }))} data-testid="lead-assign-select" />
              <Input placeholder="Reason (optional)" value={assign.reason} onChange={(ev) => setAssign({ ...assign, reason: ev.target.value })} data-testid="lead-assign-reason" />
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!assign.user_id} onClick={() => doAssign.mutate()} data-testid="lead-assign-btn">{l.assigned_to ? "Reassign" : "Assign"}</Button>
                <Button size="sm" variant="outline" onClick={() => setInsp({ scheduled_at: "", assigned_to: me.id, address: l.address ?? "" })} data-testid="schedule-inspection-btn">Schedule site inspection</Button>
              </div>
              <div className="flex gap-2 pt-2"><Input placeholder="Original lead ref (ENQ-…)" value={dup} onChange={(ev) => setDup(ev.target.value)} data-testid="duplicate-ref-input" /><Button size="sm" variant="outline" disabled={!dup} onClick={() => markDup.mutate()} data-testid="mark-duplicate-btn">Mark duplicate</Button></div>
              {me.role === "admin" && <Button size="sm" variant="ghost" className="text-steel" onClick={() => confirm(l.archived ? "Restore this lead?" : "Archive this lead? It stays recoverable.") && archive.mutate()} data-testid="archive-lead-btn">{l.archived ? "Restore lead" : "Archive lead"}</Button>}
            </div>
          </Panel>}
          <Panel title="Documents & photos" actions={<label className="inline-flex cursor-pointer items-center gap-1 text-xs text-gold" data-testid="upload-file-label"><Upload className="h-3.5 w-3.5" />Upload<input type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx" onChange={(ev) => ev.target.files?.[0] && upload.mutate(ev.target.files[0])} data-testid="upload-file-input" /></label>}>
            {!data.files.length ? <Empty text="No files (JPG, PNG, PDF, DOCX · max 5 MB)" /> : data.files.map((f) => <a key={f.id} href={`/api/files/${f.id}`} className="flex items-center gap-2 py-1 text-sm hover:text-champagne"><FileText className="h-4 w-4 text-gold" />{f.name}<span className="text-xs text-steel">· {f.uploaded_by}</span></a>)}
          </Panel>
        </div>

        <div className="space-y-5">
          <CallChecklist lead={l} />
          <Panel title="Log a call / interaction">
            <div className="grid gap-2 sm:grid-cols-3">
              <NSelect value={note.kind} onChange={(ev) => setNote({ ...note, kind: ev.target.value })} options={["call", "whatsapp", "email", "visit", "note"]} data-testid="interaction-kind-select" />
              {note.kind !== "note" && <NSelect value={note.answered} onChange={(ev) => setNote({ ...note, answered: ev.target.value })} options={[{ value: "yes", label: "Answered" }, { value: "no", label: "Not answered" }]} data-testid="interaction-answered-select" />}
              <NSelect value={note.outcome} onChange={(ev) => setNote({ ...note, outcome: ev.target.value })} placeholder="Outcome" options={["Interested", "Not interested", "Call again", "Wants site visit", "Wants quotation", "Busy / call later", "Wrong number"]} data-testid="interaction-outcome-select" />
            </div>
            <Textarea className="mt-2" rows={3} placeholder="Conversation summary / customer requirements" value={note.notes} onChange={(ev) => setNote({ ...note, notes: ev.target.value })} data-testid="interaction-notes-input" />
            <Button size="sm" className="mt-2" disabled={note.notes.length < 2 || addNote.isPending} onClick={() => addNote.mutate()} data-testid="interaction-save-btn">Save interaction</Button>
          </Panel>
          <Panel title="Follow-ups">
            <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
              <Input type="datetime-local" value={fu.due_at} onChange={(ev) => setFu({ ...fu, due_at: ev.target.value })} data-testid="followup-date-input" />
              <NSelect value={fu.kind} onChange={(ev) => setFu({ ...fu, kind: ev.target.value })} options={["call", "whatsapp", "visit", "email", "meeting"]} data-testid="followup-kind-select" />
              <Input placeholder="Notes" value={fu.notes} onChange={(ev) => setFu({ ...fu, notes: ev.target.value })} data-testid="followup-notes-input" />
              <Button size="sm" disabled={!fu.due_at || addFu.isPending} onClick={() => addFu.mutate()} data-testid="followup-save-btn">Schedule</Button>
            </div>
            <div className="mt-3">
              {data.followups.map((f) => {
                const overdue = !f.done && f.due_at < new Date().toISOString();
                return <div key={f.id} className="flex items-center justify-between gap-2 border-b border-line/60 py-2 text-sm last:border-0" data-testid="followup-row">
                  <span className={overdue ? "text-red-300" : f.done ? "text-steel line-through" : ""}>{fmtDateTime(f.due_at)} · {f.kind} · {f.assigned_name}{f.notes && <span className="text-steel"> — {f.notes}</span>}{overdue && " · OVERDUE"}</span>
                  {!f.done && <Button size="xs" variant="outline" onClick={() => doneFu.mutate(f.id)} data-testid="followup-complete-btn">Done</Button>}
                </div>;
              })}
            </div>
          </Panel>
          <Tabs defaultValue="interactions">
            <TabsList><TabsTrigger value="interactions">Interactions ({data.interactions.length})</TabsTrigger><TabsTrigger value="history" data-testid="history-tab">History</TabsTrigger><TabsTrigger value="sales">Inspections & quotes</TabsTrigger></TabsList>
            <TabsContent value="interactions"><Panel>
              {!data.interactions.length ? <Empty text="No interactions yet" /> : data.interactions.map((i) => (
                <div key={i.id} className="border-b border-line/60 py-2 text-sm last:border-0" data-testid="interaction-row">
                  <div className="flex justify-between text-xs text-steel"><span><b className="text-champagne">{i.kind}</b>{i.answered === false && " · not answered"}{i.outcome && ` · ${i.outcome}`} · {i.by_name}</span><span>{fmtDateTime(i.at)}</span></div>
                  <p className="mt-0.5">{i.notes}</p>
                </div>))}
            </Panel></TabsContent>
            <TabsContent value="history"><Panel>
              {data.history.map((h) => <div key={h.id} className="flex flex-wrap justify-between gap-2 border-b border-line/60 py-1.5 text-xs last:border-0"><span><b>{h.user_name}</b> · {h.action.replace(/_/g, " ")}{h.comment && <span className="text-steel"> — {h.comment}</span>}</span><span className="text-steel">{fmtDateTime(h.at)}</span></div>)}
            </Panel></TabsContent>
            <TabsContent value="sales"><Panel>
              {data.inspections.map((i) => <div key={i.id} className="flex justify-between py-1 text-sm"><Link to="/staff/inspections" className="text-champagne">{i.ref}</Link><span>{fmtDateTime(i.scheduled_at)}</span><StatusBadge status={i.status} /></div>)}
              {data.quotations.map((q) => <div key={q.id} className="flex justify-between py-1 text-sm"><Link to={`/staff/quotations/${q.id}`} className="text-champagne">{q.number} R{q.revision}</Link><span>{inr(q.totals.total)}</span><StatusBadge status={q.status} /></div>)}
              {!data.inspections.length && !data.quotations.length && <Empty text="No inspections or quotations yet" />}
            </Panel></TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={!!pos} onOpenChange={(o) => !o && setPos(null)}>
        <DialogContent className="border-line bg-panel" data-testid="positive-dialog">
          <DialogTitle className="font-heading">Submit positive lead for approval</DialogTitle>
          {pos && <div className="grid gap-3 sm:grid-cols-3">
            {(() => { const miss = checklistProgress(checklist, l.checklist_answers ?? {}).missing; return miss.length > 0 && (
              <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-200 sm:col-span-3" data-testid="positive-checklist-warning">
                Call checklist incomplete — {miss.length} required question(s) unanswered: {miss.map((q) => q.question).join(" · ")}</p>); })()}
            <Field label="Lift type" required className="sm:col-span-3"><NSelect value={pos.lift_type} onChange={(ev) => setPos({ ...pos, lift_type: ev.target.value })} options={LIFT_TYPES} placeholder="Select" data-testid="positive-lifttype-select" /></Field>
            <Field label="Floors" required><Input type="number" min={1} value={pos.floors} onChange={(ev) => setPos({ ...pos, floors: ev.target.value })} data-testid="positive-floors-input" /></Field>
            <Field label="Lifts"><Input type="number" min={1} value={pos.lifts_count} onChange={(ev) => setPos({ ...pos, lifts_count: ev.target.value })} data-testid="positive-lifts-input" /></Field>
            <Field label="Customer requirements" required className="sm:col-span-3"><Textarea value={pos.requirement_summary} onChange={(ev) => setPos({ ...pos, requirement_summary: ev.target.value })} data-testid="positive-requirement-input" /></Field>
            <Field label="Call notes" required className="sm:col-span-3"><Textarea value={pos.notes} onChange={(ev) => setPos({ ...pos, notes: ev.target.value })} data-testid="positive-notes-input" /></Field>
            <Button className="gold-btn sm:col-span-3" disabled={submitPos.isPending} onClick={() => submitPos.mutate()} data-testid="positive-submit-btn">Submit for approval</Button>
          </div>}
        </DialogContent>
      </Dialog>
      <Dialog open={!!decision} onOpenChange={(o) => !o && setDecision(null)}>
        <DialogContent className="border-line bg-panel" data-testid="decision-dialog">
          <DialogTitle className="font-heading">{decision?.decision === "approve" ? "Approve lead" : decision?.decision === "reject" ? "Reject lead" : "Request more information"}</DialogTitle>
          <Textarea placeholder={decision?.decision === "approve" ? "Comment (optional)" : "Reason (required)"} value={decision?.comment ?? ""} onChange={(ev) => decision && setDecision({ ...decision, comment: ev.target.value })} data-testid="decision-comment-input" />
          <Button className="gold-btn" disabled={decide.isPending} onClick={() => decide.mutate()} data-testid="decision-confirm-btn">Confirm</Button>
        </DialogContent>
      </Dialog>
      <Dialog open={!!insp} onOpenChange={(o) => !o && setInsp(null)}>
        <DialogContent className="border-line bg-panel" data-testid="inspection-dialog">
          <DialogTitle className="font-heading">Schedule site inspection</DialogTitle>
          {insp && <div className="space-y-3">
            <Field label="Date & time"><Input type="datetime-local" value={insp.scheduled_at} onChange={(ev) => setInsp({ ...insp, scheduled_at: ev.target.value })} data-testid="inspection-date-input" /></Field>
            <Field label="Inspector"><NSelect value={insp.assigned_to} onChange={(ev) => setInsp({ ...insp, assigned_to: ev.target.value })} options={(staff ?? []).filter((s) => s.active).map((s) => ({ value: s.id, label: s.name }))} data-testid="inspection-assignee-select" /></Field>
            <Field label="Site address"><Input value={insp.address} onChange={(ev) => setInsp({ ...insp, address: ev.target.value })} data-testid="inspection-address-input" /></Field>
            <Button className="gold-btn w-full" disabled={schedule.isPending} onClick={() => schedule.mutate()} data-testid="inspection-save-btn">Schedule</Button>
          </div>}
        </DialogContent>
      </Dialog>
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-line bg-panel sm:max-w-2xl" data-testid="edit-lead-dialog">
          <DialogTitle className="font-heading">Edit lead</DialogTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name"><Input value={e.name ?? ""} onChange={setE("name")} data-testid="edit-name-input" /></Field>
            <Field label="Email"><Input value={e.email ?? ""} onChange={setE("email")} /></Field>
            <Field label="City"><Input value={e.city ?? ""} onChange={setE("city")} /></Field>
            <Field label="Area"><Input value={e.area ?? ""} onChange={setE("area")} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={e.address ?? ""} onChange={setE("address")} /></Field>
            <Field label="Building"><NSelect value={e.building_type ?? ""} onChange={setE("building_type")} options={BUILDING_TYPES} placeholder="—" /></Field>
            <Field label="Requirement"><NSelect value={e.requirement ?? ""} onChange={setE("requirement")} options={REQUIREMENTS} placeholder="—" /></Field>
            <Field label="Lift type"><NSelect value={e.lift_type ?? ""} onChange={setE("lift_type")} options={LIFT_TYPES} placeholder="—" /></Field>
            <Field label="Construction"><NSelect value={e.construction_status ?? ""} onChange={setE("construction_status")} options={CONSTRUCTION} placeholder="—" /></Field>
            <Field label="Floors"><Input type="number" value={e.floors ?? ""} onChange={setE("floors")} /></Field>
            <Field label="Lifts"><Input type="number" value={e.lifts_count ?? ""} onChange={setE("lifts_count")} /></Field>
            <Field label="Source"><NSelect value={e.source ?? ""} onChange={setE("source")} options={SOURCES} /></Field>
            <Field label="Callback time"><Input value={e.preferred_callback_time ?? ""} onChange={setE("preferred_callback_time")} /></Field>
            <Field label="Additional requirements" className="sm:col-span-2"><Textarea value={e.additional_requirements ?? ""} onChange={setE("additional_requirements")} /></Field>
            <Button className="gold-btn sm:col-span-2" disabled={save.isPending} onClick={() => save.mutate()} data-testid="edit-lead-save-btn">Save changes</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
