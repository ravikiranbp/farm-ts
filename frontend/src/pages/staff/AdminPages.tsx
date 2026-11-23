import { useState } from "react";
import { useOutletContext } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiGet, apiPatch, apiPost, apiPut, apiUpload } from "@/lib/api";
import type { AuditEntry, GroupRow, OfferAdmin, Report, Settings, User } from "@/lib/types";
import { LEAD_STATUSES, errMsg, fmtDateTime, inr } from "@/lib/format";
import { Empty, Field, NSelect, PageHeader, Panel, Stat, StatusBadge } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useStaff } from "./Leads";

const TT = { contentStyle: { background: "#1C2230", border: "1px solid #232B3B" } };

function GroupTable({ rows, label }: { rows: GroupRow[]; label: string }) {
  return (
    <Table><TableHeader><TableRow className="border-line"><TableHead>{label}</TableHead><TableHead>Leads</TableHead><TableHead>Quotations</TableHead><TableHead>Won</TableHead><TableHead>Order value</TableHead><TableHead>Conv.</TableHead></TableRow></TableHeader>
      <TableBody>{rows.sort((a, b) => b.leads - a.leads).map((r) => <TableRow key={r.key} className="border-line"><TableCell>{r.key}</TableCell><TableCell>{r.leads}</TableCell><TableCell>{r.quotations}</TableCell><TableCell>{r.won}</TableCell><TableCell>{inr(r.order_value)}</TableCell><TableCell>{r.conversion}%</TableCell></TableRow>)}</TableBody></Table>
  );
}

export function ReportsPage() {
  const { data: staff } = useStaff(true);
  const [f, setF] = useState({ date_from: "", date_to: "", employee: "", status: "" });
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const { data: r, isLoading } = useQuery({ queryKey: ["reports", qs], queryFn: () => apiGet<Report>(`/reports?${qs}`) });
  const exp = (k: string) => <a href={`/api/reports/export/${k}?${qs}`} className="inline-flex items-center gap-1 text-xs text-gold" data-testid={`export-${k}-btn`}><Download className="h-3.5 w-3.5" />CSV</a>;
  return (
    <div>
      <PageHeader title="Reports & analytics" subtitle="Built from live database records" actions={exp("leads")} />
      <div className="mb-5 grid gap-2 sm:grid-cols-4">
        <Field label="From"><Input type="date" value={f.date_from} onChange={(e) => setF({ ...f, date_from: e.target.value })} data-testid="report-from-input" /></Field>
        <Field label="To"><Input type="date" value={f.date_to} onChange={(e) => setF({ ...f, date_to: e.target.value })} data-testid="report-to-input" /></Field>
        <Field label="Employee"><NSelect value={f.employee} onChange={(e) => setF({ ...f, employee: e.target.value })} placeholder="All" options={(staff ?? []).map((s) => ({ value: s.id, label: s.name }))} data-testid="report-employee-select" /></Field>
        <Field label="Lead status"><NSelect value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} placeholder="All" options={LEAD_STATUSES} data-testid="report-status-select" /></Field>
      </div>
      {isLoading || !r ? <Empty text="Loading report…" /> : <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Leads" value={r.totals.leads} testId="report-total-leads" /><Stat label="Quotations" value={r.totals.quotations} /><Stat label="Quote value" value={inr(r.totals.quote_value)} tone="gold" />
          <Stat label="Orders" value={r.totals.orders} /><Stat label="Order value" value={inr(r.totals.order_value)} tone="green" /><Stat label="Won" value={r.totals.won} tone="green" /><Stat label="Lost / not int." value={r.totals.lost} />
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Daily enquiries"><div className="h-56"><ResponsiveContainer><LineChart data={r.daily}><CartesianGrid stroke="#232B3B" /><XAxis dataKey="date" stroke="#A1A7B3" fontSize={10} /><YAxis stroke="#A1A7B3" fontSize={10} allowDecimals={false} /><Tooltip {...TT} /><Line dataKey="leads" stroke="#D6A23A" strokeWidth={2} /></LineChart></ResponsiveContainer></div></Panel>
          <Panel title="Sales pipeline"><div className="h-56"><ResponsiveContainer><BarChart data={r.pipeline}><CartesianGrid stroke="#232B3B" /><XAxis dataKey="status" stroke="#A1A7B3" fontSize={9} interval={0} angle={-20} height={50} /><YAxis stroke="#A1A7B3" fontSize={10} allowDecimals={false} /><Tooltip {...TT} /><Bar dataKey="count" fill="#F2C66D" /></BarChart></ResponsiveContainer></div></Panel>
        </div>
        <Panel title="Employee performance" actions={exp("performance")}>
          <Table><TableHeader><TableRow className="border-line">{["Employee", "Assigned", "Contacted", "F/U done", "F/U overdue", "Positive sub.", "Positive appr.", "Quotations", "Won", "Conv."].map((h) => <TableHead key={h}>{h}</TableHead>)}</TableRow></TableHeader>
            <TableBody>{r.performance.map((p) => <TableRow key={p.name} className="border-line" data-testid="performance-row"><TableCell>{p.name}{!p.active && <span className="ml-1 text-[10px] text-steel">inactive</span>}</TableCell><TableCell>{p.assigned}</TableCell><TableCell>{p.contacted}</TableCell><TableCell>{p.followups_done}</TableCell><TableCell className={p.followups_overdue ? "text-red-300" : ""}>{p.followups_overdue}</TableCell><TableCell>{p.positive_submitted}</TableCell><TableCell>{p.positive_approved}</TableCell><TableCell>{p.quotations}</TableCell><TableCell>{p.won}</TableCell><TableCell>{p.conversion}%</TableCell></TableRow>)}</TableBody></Table>
        </Panel>
        <Panel title="Lead source performance" actions={exp("by_source")}><GroupTable rows={r.by_source} label="Source" /></Panel>
        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="Customer locations" actions={exp("by_city")}><GroupTable rows={r.by_city} label="City" /></Panel>
          <Panel title="Lift category demand" actions={exp("by_lift_type")}><GroupTable rows={r.by_lift_type} label="Lift type" /></Panel>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {([["Quotations by status", r.quotations_by_status.map((x) => [x.status, x.count])], ["Installation progress", r.installations.map((x) => [x.stage, x.count])], ["Service requests", r.service_by_status.map((x) => [x.status, x.count])]] as [string, [string, number][]][]).map(([t, rows]) => (
            <Panel key={t} title={t}>{!rows.length ? <Empty text="No data" /> : rows.map(([k, v]) => <div key={k} className="flex justify-between py-1 text-sm"><span className="text-steel">{k}</span><span>{v}</span></div>)}</Panel>))}
        </div>
      </div>}
    </div>
  );
}

export function EmployeesPage() {
  const qc = useQueryClient();
  const { data } = useStaff(true);
  const [nu, setNu] = useState<null | { name: string; email: string; phone: string; role: string; password: string }>(null);
  const [pw, setPw] = useState<null | { id: string; name: string; pw: string }>(null);
  const [move, setMove] = useState<null | { from: string; to: string }>(null);
  const [hist, setHist] = useState<string | null>(null);
  const inv = () => qc.invalidateQueries({ queryKey: ["staff"] });
  const create = useMutation({ mutationFn: () => apiPost<User>("/users", nu), onSuccess: () => { toast.success("Employee created"); setNu(null); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const upd = useMutation({ mutationFn: (p: { id: string } & Partial<User>) => apiPatch<User>(`/users/${p.id}`, p), onSuccess: () => { toast.success("Employee updated"); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const reset = useMutation({ mutationFn: () => apiPost(`/users/${pw?.id}/reset-password`, { new_password: pw?.pw }), onSuccess: () => { toast.success("Password reset"); setPw(null); }, onError: (e) => toast.error(errMsg(e)) });
  const bulk = useMutation({ mutationFn: () => apiPost<{ moved: number }>("/leads/bulk-reassign", { from_user: move?.from, to_user: move?.to }), onSuccess: (r) => { toast.success(`${r.moved} open leads reassigned`); setMove(null); }, onError: (e) => toast.error(errMsg(e)) });
  const { data: logins } = useQuery({ queryKey: ["logins", hist], queryFn: () => apiGet<{ id: string; email: string; success: boolean; ip: string; at: string }[]>(`/users/login-history${hist && hist !== "all" ? `?user_id=${hist}` : ""}`), enabled: !!hist });
  return (
    <div>
      <PageHeader title="Employees" subtitle="Individual accounts only. Deactivating keeps all leads — reassign them below." actions={<>
        <Button variant="outline" onClick={() => setHist("all")} data-testid="login-history-btn">Login history</Button>
        <Button className="gold-btn" onClick={() => setNu({ name: "", email: "", phone: "", role: "telecaller", password: "" })} data-testid="add-employee-btn">Add employee</Button></>} />
      <div className="rounded-lg border border-line bg-panel">
        <Table><TableHeader><TableRow className="border-line"><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Status</TableHead><TableHead className="hidden md:table-cell">Last login</TableHead><TableHead /></TableRow></TableHeader>
          <TableBody>{(data ?? []).map((u) => (
            <TableRow key={u.id} className="border-line" data-testid="employee-row">
              <TableCell>{u.name}</TableCell><TableCell className="text-sm text-steel">{u.email}</TableCell>
              <TableCell><NSelect className="h-8 w-32" value={u.role} options={["admin", "manager", "telecaller"]} onChange={(e) => confirm(`Change ${u.name}'s role to ${e.target.value}?`) && upd.mutate({ id: u.id, role: e.target.value as User["role"] })} data-testid="employee-role-select" /></TableCell>
              <TableCell><StatusBadge status={u.active ? "Active" : "Inactive"} /></TableCell><TableCell className="hidden text-xs text-steel md:table-cell">{fmtDateTime(u.last_login_at)}</TableCell>
              <TableCell className="space-x-1 whitespace-nowrap">
                <Button size="xs" variant="outline" onClick={() => confirm(`${u.active ? "Deactivate" : "Activate"} ${u.name}?`) && upd.mutate({ id: u.id, active: !u.active })} data-testid="employee-toggle-active-btn">{u.active ? "Deactivate" : "Activate"}</Button>
                <Button size="xs" variant="outline" onClick={() => setPw({ id: u.id, name: u.name, pw: "" })} data-testid="employee-reset-pw-btn">Reset password</Button>
                <Button size="xs" variant="ghost" onClick={() => setMove({ from: u.id, to: "" })} data-testid="employee-reassign-btn">Reassign leads</Button>
                <Button size="xs" variant="ghost" onClick={() => setHist(u.id)}>Logins</Button>
              </TableCell>
            </TableRow>))}</TableBody></Table>
      </div>
      <Dialog open={!!nu} onOpenChange={(o) => !o && setNu(null)}><DialogContent className="border-line bg-panel" data-testid="add-employee-dialog"><DialogTitle className="font-heading">Add employee</DialogTitle>
        {nu && <div className="grid gap-2">{(["name", "email", "phone", "password"] as const).map((k) => <Field key={k} label={k}><Input type={k === "password" ? "password" : "text"} value={nu[k]} onChange={(e) => setNu({ ...nu, [k]: e.target.value })} data-testid={`employee-${k}-input`} /></Field>)}
          <Field label="Role"><NSelect value={nu.role} options={["telecaller", "manager", "admin"]} onChange={(e) => setNu({ ...nu, role: e.target.value })} data-testid="employee-new-role-select" /></Field>
          <p className="text-xs text-steel">Password: minimum 8 characters.</p>
          <Button className="gold-btn" onClick={() => create.mutate()} data-testid="employee-create-btn">Create account</Button></div>}
      </DialogContent></Dialog>
      <Dialog open={!!pw} onOpenChange={(o) => !o && setPw(null)}><DialogContent className="border-line bg-panel"><DialogTitle className="font-heading">Reset password — {pw?.name}</DialogTitle>
        <Input type="password" placeholder="New password (min 8)" value={pw?.pw ?? ""} onChange={(e) => pw && setPw({ ...pw, pw: e.target.value })} data-testid="reset-pw-input" />
        <Button className="gold-btn" onClick={() => reset.mutate()} data-testid="reset-pw-confirm-btn">Reset</Button></DialogContent></Dialog>
      <Dialog open={!!move} onOpenChange={(o) => !o && setMove(null)}><DialogContent className="border-line bg-panel"><DialogTitle className="font-heading">Reassign all open leads</DialogTitle>
        <NSelect value={move?.to ?? ""} placeholder="Move to…" options={(data ?? []).filter((u) => u.active && u.id !== move?.from).map((u) => ({ value: u.id, label: u.name }))} onChange={(e) => move && setMove({ ...move, to: e.target.value })} data-testid="bulk-reassign-select" />
        <Button className="gold-btn" disabled={!move?.to} onClick={() => bulk.mutate()} data-testid="bulk-reassign-confirm-btn">Reassign</Button></DialogContent></Dialog>
      <Dialog open={!!hist} onOpenChange={(o) => !o && setHist(null)}><DialogContent className="max-h-[80vh] overflow-y-auto border-line bg-panel sm:max-w-xl"><DialogTitle className="font-heading">Login history</DialogTitle>
        {(logins ?? []).map((l) => <div key={l.id} className="flex justify-between text-xs"><span>{l.email} · {l.ip}</span><span className={l.success ? "text-emerald-300" : "text-red-300"}>{l.success ? "success" : "failed"} · {fmtDateTime(l.at)}</span></div>)}
      </DialogContent></Dialog>
    </div>
  );
}

export function AuditPage() {
  const me = useOutletContext<User>();
  const { data: staff } = useStaff(me.role !== "telecaller");
  const [f, setF] = useState({ user_id: "", module: "", action: "", ref: "", date_from: "", date_to: "" });
  const [page, setPage] = useState(1);
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), page: String(page) }).toString();
  const { data } = useQuery({ queryKey: ["audit", qs], queryFn: () => apiGet<{ items: AuditEntry[]; total: number }>(`/audit?${qs}`) });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => { setPage(1); setF({ ...f, [k]: e.target.value }); };
  return (
    <div>
      <PageHeader title="Activity logs" subtitle={`${data?.total ?? 0} entries · append-only, cannot be edited or deleted${me.role === "telecaller" ? " · showing your own activity" : me.role === "manager" ? " · team activity" : ""}`} />
      <div className="mb-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {me.role !== "telecaller" && <NSelect value={f.user_id} onChange={set("user_id")} placeholder="All employees" options={(staff ?? []).map((s) => ({ value: s.id, label: s.name }))} data-testid="audit-user-filter" />}
        <NSelect value={f.module} onChange={set("module")} placeholder="All modules" options={["auth", "leads", "approvals", "followups", "customers", "inspections", "quotations", "orders", "service", "amc", "users", "settings", "backup", "reports"]} data-testid="audit-module-filter" />
        <Input placeholder="Action (e.g. lead_assigned)" value={f.action} onChange={set("action")} data-testid="audit-action-filter" />
        <Input placeholder="Record ref (ENQ-…)" value={f.ref} onChange={set("ref")} data-testid="audit-ref-filter" />
        <Input type="date" value={f.date_from} onChange={set("date_from")} /><Input type="date" value={f.date_to} onChange={set("date_to")} />
      </div>
      <div className="rounded-lg border border-line bg-panel">
        <Table><TableHeader><TableRow className="border-line"><TableHead>When</TableHead><TableHead>Employee</TableHead><TableHead>Action</TableHead><TableHead>Record</TableHead><TableHead className="hidden lg:table-cell">Change</TableHead></TableRow></TableHeader>
          <TableBody>{(data?.items ?? []).map((a) => (
            <TableRow key={a.id} className="border-line align-top" data-testid="audit-row">
              <TableCell className="whitespace-nowrap text-xs">{fmtDateTime(a.at)}<div className="font-mono text-[10px] text-steel">{a.ref}</div></TableCell>
              <TableCell className="text-sm">{a.user_name}<div className="text-[10px] uppercase text-champagne">{a.user_role}</div></TableCell>
              <TableCell className="text-sm">{a.action.replace(/_/g, " ")}<div className="text-xs text-steel">{a.module}</div></TableCell>
              <TableCell className="font-mono text-xs">{a.record_ref ?? "—"}</TableCell>
              <TableCell className="hidden max-w-md text-xs text-steel lg:table-cell">{a.old != null && <div>old: {JSON.stringify(a.old)}</div>}{a.new != null && <div>new: {JSON.stringify(a.new)}</div>}{a.comment && <div className="text-platinum">“{a.comment}”</div>}</TableCell>
            </TableRow>))}</TableBody></Table>
        {!data?.items.length && <Empty text="No activity found" />}
      </div>
      <div className="mt-3 flex justify-end gap-2"><Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</Button><Button size="sm" variant="outline" disabled={(data?.total ?? 0) <= page * 50} onClick={() => setPage(page + 1)}>Next</Button></div>
    </div>
  );
}

type CmsItem = Record<string, unknown> & { id?: string; published?: boolean; archived?: boolean };
const CMS_FIELDS: Record<string, [string, string, "text" | "area" | "list" | "specs" | "bool" | "num"][]> = {
  products: [["name", "Name", "text"], ["category", "Category", "text"], ["description", "Description", "area"], ["images", "Image URLs (one per line)", "list"], ["capacity", "Capacity", "text"], ["speed", "Speed", "text"], ["floors_supported", "Floors supported", "text"], ["cabin_designs", "Cabin designs", "list"], ["door_types", "Door types", "list"], ["configurations", "Configurations", "list"], ["accessories", "Accessories", "list"], ["specs", "Technical specs (Label: value per line)", "specs"], ["specs_verified", "Specs verified by engineering", "bool"], ["order", "Display order", "num"]],
  projects: [["name", "Project name", "text"], ["location", "Location", "text"], ["building_type", "Building type", "text"], ["lift_category", "Lift category", "text"], ["floors", "Floors", "num"], ["lifts_count", "Lifts installed", "num"], ["completion_date", "Completion date (YYYY-MM-DD)", "text"], ["photos", "Photo URLs (one per line)", "list"], ["description", "Description", "area"], ["specs", "Specifications", "area"], ["testimonial", "Customer testimonial", "area"], ["permission_to_publish", "Customer permission to publish", "bool"]],
  testimonials: [["name", "Name", "text"], ["role", "Role / location", "text"], ["quote", "Quote", "area"], ["rating", "Rating", "num"]],
  faqs: [["question", "Question", "text"], ["answer", "Answer", "area"], ["order", "Order", "num"]],
  services: [["title", "Title", "text"], ["description", "Description", "area"], ["order", "Order", "num"]],
  brochures: [["title", "Title", "text"], ["description", "Description", "area"], ["cover_image", "Cover image URL", "text"]],
};

function toForm(kind: string, it: CmsItem): Record<string, string | boolean> {
  return Object.fromEntries(CMS_FIELDS[kind].map(([k, , t]) => {
    const v = it[k];
    if (t === "list") return [k, ((v as string[]) ?? []).join("\n")];
    if (t === "specs") return [k, ((v as { label: string; value: string }[]) ?? []).map((s) => `${s.label}: ${s.value}`).join("\n")];
    if (t === "bool") return [k, Boolean(v)];
    return [k, v == null ? "" : String(v)];
  }));
}
function fromForm(kind: string, f: Record<string, string | boolean>): CmsItem {
  return Object.fromEntries(CMS_FIELDS[kind].map(([k, , t]) => {
    const v = f[k];
    if (t === "list") return [k, String(v).split("\n").map((s) => s.trim()).filter(Boolean)];
    if (t === "specs") return [k, String(v).split("\n").filter((s) => s.includes(":")).map((s) => ({ label: s.split(":")[0].trim(), value: s.split(":").slice(1).join(":").trim() }))];
    if (t === "num") return [k, v === "" ? null : Number(v)];
    return [k, v];
  }));
}

function CmsTab({ kind }: { kind: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["cms", kind], queryFn: () => apiGet<CmsItem[]>(`/cms/${kind}`) });
  const [ed, setEd] = useState<null | { id?: string; f: Record<string, string | boolean> }>(null);
  const inv = () => { qc.invalidateQueries({ queryKey: ["cms", kind] }); qc.invalidateQueries({ queryKey: ["public-content"] }); };
  const save = useMutation({ mutationFn: () => ed?.id ? apiPut(`/cms/${kind}/${ed.id}`, fromForm(kind, ed.f)) : apiPost(`/cms/${kind}`, fromForm(kind, ed!.f)), onSuccess: () => { toast.success("Saved"); setEd(null); inv(); }, onError: (e) => toast.error(errMsg(e)) });
  const pub = useMutation({ mutationFn: (it: CmsItem) => apiPut(`/cms/${kind}/${it.id}`, { published: !it.published, archived: false }), onSuccess: inv, onError: (e) => toast.error(errMsg(e)) });
  const remove = useMutation({ mutationFn: (id: string) => apiPost(`/cms/${kind}/${id}/remove`), onSuccess: () => { toast.success("Removed from public display (recoverable)"); inv(); } });
  const upload = useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => { const fd = new FormData(); fd.append("file", file); fd.append("entity_type", "brochure"); fd.append("entity_id", id); const r = await apiUpload<{ id: string }>("/files", fd); return apiPut(`/cms/brochures/${id}`, { file_id: r.id }); },
    onSuccess: () => { toast.success("Brochure file attached"); inv(); }, onError: (e) => toast.error(errMsg(e)),
  });
  const photos = (it: CmsItem) => (it.photos as string[] | undefined) ?? [];
  const addPhotos = useMutation({
    mutationFn: async ({ it, files }: { it: CmsItem; files: File[] }) => {
      const urls: string[] = [];
      for (const file of files) {
        const fd = new FormData(); fd.append("file", file); fd.append("entity_type", "project"); fd.append("entity_id", it.id!);
        urls.push(`/api/public/files/${(await apiUpload<{ id: string }>("/files", fd)).id}`);
      }
      return apiPut(`/cms/projects/${it.id}`, { photos: [...photos(it), ...urls] });
    },
    onSuccess: () => { toast.success("Photos added"); inv(); }, onError: (e) => { toast.error(errMsg(e)); inv(); },
  });
  const dropPhoto = useMutation({
    mutationFn: ({ it, url }: { it: CmsItem; url: string }) => apiPut(`/cms/projects/${it.id}`, { photos: photos(it).filter((u) => u !== url) }),
    onSuccess: () => { toast.success("Photo removed"); inv(); }, onError: (e) => toast.error(errMsg(e)),
  });
  const title = CMS_FIELDS[kind][0][0];
  return (
    <Panel actions={<Button size="sm" className="gold-btn" onClick={() => setEd({ f: toForm(kind, {}) })} data-testid={`cms-add-${kind}-btn`}>Add</Button>}>
      {(data ?? []).map((it) => (
        <div key={it.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-2 last:border-0" data-testid={`cms-row-${kind}`}>
          <div className="text-sm">{String(it[title] ?? "")} {it.archived && <span className="text-xs text-steel">(removed)</span>}
            {kind === "projects" && photos(it).length > 0 && <div className="mt-2 flex flex-wrap gap-2">{photos(it).map((u) => (
              <div key={u} className="relative"><img src={u} alt="" className="h-14 w-20 rounded border border-line object-cover" />
                <button type="button" aria-label="Remove photo" onClick={() => confirm("Remove this photo?") && dropPhoto.mutate({ it, url: u })}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-xs text-white" data-testid="project-photo-remove">✕</button></div>))}</div>}
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={it.published ? "Active" : "Draft"} />
            <Button size="xs" variant="outline" onClick={() => pub.mutate(it)} data-testid="cms-publish-toggle">{it.published ? "Unpublish" : "Publish"}</Button>
            <Button size="xs" variant="outline" onClick={() => setEd({ id: it.id, f: toForm(kind, it) })} data-testid="cms-edit-btn">Edit</Button>
            {kind === "brochures" && <label className="cursor-pointer text-xs text-gold">Upload PDF<input type="file" accept=".pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload.mutate({ id: it.id!, file: e.target.files[0] })} /></label>}
            {kind === "projects" && <label className="cursor-pointer text-xs text-gold">{addPhotos.isPending ? "Uploading…" : "Upload photos"}<input type="file" accept=".jpg,.jpeg,.png,.webp" multiple className="hidden" disabled={addPhotos.isPending}
              onChange={(e) => { const fs = Array.from(e.target.files ?? []); e.target.value = ""; if (fs.length) addPhotos.mutate({ it, files: fs }); }} data-testid="project-photo-input" /></label>}
            {!it.archived && <Button size="xs" variant="ghost" onClick={() => confirm("Remove from public display?") && remove.mutate(it.id!)}>Remove</Button>}
          </div>
        </div>))}
      <Dialog open={!!ed} onOpenChange={(o) => !o && setEd(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border-line bg-panel sm:max-w-2xl" data-testid="cms-dialog"><DialogTitle className="font-heading">{ed?.id ? "Edit" : "Add"} {kind}</DialogTitle>
          {ed && <div className="grid gap-3">{CMS_FIELDS[kind].map(([k, l, t]) => <Field key={k} label={l}>
            {t === "bool" ? <Checkbox checked={Boolean(ed.f[k])} onCheckedChange={(v) => setEd({ ...ed, f: { ...ed.f, [k]: Boolean(v) } })} />
              : t === "text" || t === "num" ? <Input value={String(ed.f[k])} onChange={(e) => setEd({ ...ed, f: { ...ed.f, [k]: e.target.value } })} data-testid={`cms-${k}-input`} />
                : <Textarea rows={3} value={String(ed.f[k])} onChange={(e) => setEd({ ...ed, f: { ...ed.f, [k]: e.target.value } })} data-testid={`cms-${k}-input`} />}</Field>)}
            <Button className="gold-btn" onClick={() => save.mutate()} data-testid="cms-save-btn">Save</Button></div>}
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function OfferTab() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["admin-offer"], queryFn: () => apiGet<OfferAdmin>("/admin/offer") });
  const [want, setWant] = useState<boolean | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const on = want ?? Boolean(data?.enabled);
  const pick = (f: File | null) => { if (preview) URL.revokeObjectURL(preview); setFile(f); setPreview(f ? URL.createObjectURL(f) : null); };
  const done = (msg: string) => { toast.success(msg); pick(null); setWant(null); qc.invalidateQueries({ queryKey: ["admin-offer"] }); qc.invalidateQueries({ queryKey: ["public-content"] }); };
  const post = useMutation({ mutationFn: () => { const fd = new FormData(); fd.append("file", file!); return apiUpload<OfferAdmin>("/admin/offer", fd); },
    onSuccess: () => done("Offer overlay is live on the home page"), onError: (e) => toast.error(errMsg(e)) });
  const remove = useMutation({ mutationFn: () => apiPost<OfferAdmin>("/admin/offer/remove"), onSuccess: () => done("Offer overlay removed"), onError: (e) => toast.error(errMsg(e)) });
  const toggle = (v: boolean) => {
    if (!v && data?.enabled) { if (confirm("Remove the offer overlay from the website?")) remove.mutate(); return; }
    if (!v) pick(null);
    setWant(v);
  };
  return (
    <Panel>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={on} onCheckedChange={(v) => toggle(Boolean(v))} data-testid="offer-enable-checkbox" />Show an offer overlay</label>
      <p className="mt-1 text-xs text-steel">Shown once per visit on the home page, 2 s after it opens; closes after 10 s. Tapping it opens the enquiry form.</p>
      {data?.enabled && data.image_url && <div className="mt-4"><p className="text-xs text-steel">Live now{data.posted_at ? ` · since ${fmtDateTime(data.posted_at)}` : ""}{data.posted_by ? ` · by ${data.posted_by}` : ""}</p>
        <img src={data.image_url} alt="Live offer" className="mt-2 max-h-64 rounded border border-line object-contain" data-testid="offer-live-image" /></div>}
      {on && <div className="mt-4 space-y-3">
        <label className="inline-block cursor-pointer rounded-md border border-gold/50 px-3 py-1.5 text-sm text-champagne">{data?.enabled ? "Replace image" : "Choose image"}
          <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={(e) => pick(e.target.files?.[0] ?? null)} data-testid="offer-file-input" /></label>
        <span className="ml-2 text-xs text-steel">JPG, PNG or WEBP · max 5 MB</span>
        {preview && <div><p className="text-xs text-steel">Preview — not live until you post</p>
          <div className="mt-2 inline-block bg-black/70 p-4"><img src={preview} alt="Preview" className="max-h-72 object-contain" data-testid="offer-preview-image" /></div></div>}
        <div><Button className="gold-btn" disabled={!file || post.isPending} onClick={() => post.mutate()} data-testid="offer-post-btn">{post.isPending ? "Posting…" : "Post"}</Button></div>
      </div>}
    </Panel>
  );
}

export function ContentPage() {
  return (
    <div>
      <PageHeader title="Website content" subtitle="Changes appear on the public website immediately after publishing" />
      <Tabs defaultValue="products"><TabsList className="flex-wrap">{Object.keys(CMS_FIELDS).map((k) => <TabsTrigger key={k} value={k} data-testid={`cms-tab-${k}`}>{k}</TabsTrigger>)}
        <TabsTrigger value="offer" data-testid="cms-tab-offer">offer</TabsTrigger></TabsList>
        {Object.keys(CMS_FIELDS).map((k) => <TabsContent key={k} value={k}><CmsTab kind={k} /></TabsContent>)}
        <TabsContent value="offer"><OfferTab /></TabsContent></Tabs>
    </div>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => apiGet<Settings>("/settings") });
  const [s, setS] = useState<Settings | null>(null);
  const cur = s ?? data ?? null;
  const [vres, setVres] = useState<string | null>(null);
  const save = useMutation({ mutationFn: () => apiPut<Settings>("/settings", cur), onSuccess: () => { toast.success("Settings saved"); setS(null); qc.invalidateQueries({ queryKey: ["settings"] }); qc.invalidateQueries({ queryKey: ["public-content"] }); }, onError: (e) => toast.error(errMsg(e)) });
  const verify = useMutation({ mutationFn: (file: File) => { const fd = new FormData(); fd.append("file", file); return apiUpload<{ ok: boolean; counts: Record<string, number>; backup_created_at: string }>("/admin/backup/verify", fd); },
    onSuccess: (r) => setVres(`${r.ok ? "✔ Backup is restorable" : "✘ Verification mismatch"} — backup from ${r.backup_created_at}, ${Object.values(r.counts).reduce((a, b) => a + b, 0)} records across ${Object.keys(r.counts).length} collections.`), onError: (e) => toast.error(errMsg(e)) });
  const restore = useMutation({ mutationFn: (file: File) => { const fd = new FormData(); fd.append("file", file); return apiUpload("/admin/backup/restore", fd); }, onSuccess: () => { toast.success("Backup restored"); qc.invalidateQueries(); }, onError: (e) => toast.error(errMsg(e)) });
  if (!cur) return <p className="text-steel">Loading…</p>;
  const set = (k: keyof Settings, num?: boolean) => (e: { target: { value: string } }) => setS({ ...cur, [k]: num ? Number(e.target.value) : e.target.value });
  const txt: [keyof Settings, string][] = [["company_name", "Company name"], ["tagline", "Tagline"], ["phone", "Phone"], ["whatsapp", "WhatsApp (digits with country code)"], ["email", "Email"], ["city", "City"], ["address", "Address"], ["gstin", "GSTIN"], ["signatory", "Authorised signatory"]];
  return (
    <div>
      <PageHeader title="Settings & backup" actions={<Button className="gold-btn" disabled={!s || save.isPending} onClick={() => save.mutate()} data-testid="settings-save-btn">Save settings</Button>} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Company & contact details"><div className="grid gap-3 sm:grid-cols-2">{txt.map(([k, l]) => <Field key={k} label={l}><Input value={String(cur[k] ?? "")} onChange={set(k)} data-testid={`settings-${k}-input`} /></Field>)}
          <Field label="About (public website)" className="sm:col-span-2"><Textarea value={cur.about} onChange={set("about")} /></Field></div></Panel>
        <Panel title="Quotation rules & defaults"><div className="grid gap-3 sm:grid-cols-2">
          <Field label="Default tax / GST %"><Input type="number" value={cur.tax_pct} onChange={set("tax_pct", true)} data-testid="settings-tax-input" /></Field>
          <Field label="Quote validity (days)"><Input type="number" value={cur.quote_validity_days} onChange={set("quote_validity_days", true)} /></Field>
          <Field label="Manager approval limit — amount (₹)"><Input type="number" value={cur.manager_max_quote_amount} onChange={set("manager_max_quote_amount", true)} data-testid="settings-max-amount-input" /></Field>
          <Field label="Manager approval limit — discount %"><Input type="number" value={cur.manager_max_discount_pct} onChange={set("manager_max_discount_pct", true)} data-testid="settings-max-discount-input" /></Field>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={cur.require_quote_approval} onCheckedChange={(v) => setS({ ...cur, require_quote_approval: Boolean(v) })} />Quotations must be approved before sending</label>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={cur.auto_assign} onCheckedChange={(v) => setS({ ...cur, auto_assign: Boolean(v) })} data-testid="settings-auto-assign" />Auto-assign website leads (round-robin)</label>
          <Field label="Inactivity logout (minutes)"><Input type="number" value={cur.session_timeout_minutes} onChange={set("session_timeout_minutes", true)} /></Field>
          {(["payment_terms", "warranty", "terms", "delivery_timeline", "installation_timeline"] as const).map((k) => <Field key={k} label={k.replace(/_/g, " ")} className="sm:col-span-2"><Textarea rows={2} value={cur[k]} onChange={set(k)} /></Field>)}
        </div></Panel>
        <Panel title="Call checklist questions" className="lg:col-span-2">
          <p className="mb-3 text-xs text-steel">Shown on every lead for telecallers. Answers already saved on leads are kept even if a question is removed.</p>
          <div className="space-y-2" data-testid="checklist-editor">
            {cur.call_checklist.map((q, i) => {
              const upd = (patch: Partial<typeof q>) => setS({ ...cur, call_checklist: cur.call_checklist.map((x, j) => j === i ? { ...x, ...patch } : x) });
              return (
                <div key={q.id} className="grid gap-2 rounded-md border border-line p-2 sm:grid-cols-[1fr_110px_1fr_auto_auto]" data-testid="checklist-editor-row">
                  <Input value={q.question} onChange={(e) => upd({ question: e.target.value })} data-testid={`checklist-question-${i}`} />
                  <NSelect value={q.type} options={[{ value: "text", label: "Free text" }, { value: "choice", label: "Choices" }]} onChange={(e) => upd({ type: e.target.value as "text" | "choice" })} />
                  <Input disabled={q.type !== "choice"} placeholder="Options, comma separated" value={(q.options ?? []).join(", ")} onChange={(e) => upd({ options: e.target.value.split(",").map((o) => o.trimStart()) })} data-testid={`checklist-options-${i}`} />
                  <label className="flex items-center gap-1.5 text-xs"><Checkbox checked={!!q.required} onCheckedChange={(v) => upd({ required: Boolean(v) })} />Required</label>
                  <Button size="xs" variant="ghost" onClick={() => setS({ ...cur, call_checklist: cur.call_checklist.filter((_, j) => j !== i) })} aria-label="Remove question">Remove</Button>
                </div>
              );
            })}
            <Button size="sm" variant="outline" onClick={() => setS({ ...cur, call_checklist: [...cur.call_checklist, { id: `q${Date.now().toString(36)}`, question: "", type: "text", required: false }] })} data-testid="checklist-add-btn">+ Add question</Button>
          </div>
        </Panel>
        <Panel title="Notification preferences (in-app)"><div className="grid gap-2 sm:grid-cols-2">{Object.entries(cur.notify_prefs).map(([k, v]) => (
          <label key={k} className="flex items-center gap-2 text-sm"><Checkbox checked={v} onCheckedChange={(nv) => setS({ ...cur, notify_prefs: { ...cur.notify_prefs, [k]: Boolean(nv) } })} />{k.replace(/_/g, " ")}</label>))}</div>
          <p className="mt-3 text-xs text-steel">SMS, WhatsApp and email alerts are not configured (no paid services). They can be added later without affecting saved records.</p></Panel>
        <Panel title="Backup & recovery">
          <div className="space-y-3 text-sm">
            <a href="/api/admin/backup" className="gold-btn inline-flex items-center gap-2 rounded-md px-4 py-2 font-semibold" data-testid="download-backup-btn"><Download className="h-4 w-4" />Download full database backup</a>
            <p className="text-xs text-steel">Store backups outside this server (e.g. company Google Drive). Uploaded files live in the server's uploads folder and should be copied separately.</p>
            <label className="block"><span className="field-label">Test a backup (restores into a temporary database, then discards it)</span><Input type="file" accept=".json" onChange={(e) => e.target.files?.[0] && verify.mutate(e.target.files[0])} data-testid="verify-backup-input" /></label>
            {vres && <p className="rounded-md border border-gold/30 bg-gold/5 p-2 text-xs" data-testid="verify-backup-result">{vres}</p>}
            <label className="block"><span className="field-label text-red-300">Restore backup (replaces current data)</span><Input type="file" accept=".json" onChange={(e) => { const f = e.target.files?.[0]; if (f && confirm("This will REPLACE all current data with the backup. Continue?")) restore.mutate(f); e.target.value = ""; }} data-testid="restore-backup-input" /></label>
          </div>
        </Panel>
      </div>
    </div>
  );
}
