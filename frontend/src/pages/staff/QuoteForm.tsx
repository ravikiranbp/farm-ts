import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { apiGet, apiPut } from "@/lib/api";
import type { MaterialRow, PayRow, QuoteDefaults, QuoteFields, SpecRow } from "@/lib/types";
import { LIFT_TYPES, amountInWords, errMsg, inr } from "@/lib/format";
import { Field, KV, NSelect, PageHeader, Panel } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const CUSTOM = "__custom";
type UiMaterial = MaterialRow & { _cc?: boolean; _cd?: boolean };

export function calc(f: QuoteFields) {
  const items = f.items.reduce((s, i) => s + Number(i.qty || 0) * Number(i.unit_price || 0), 0);
  const subtotal = items + Number(f.installation_charges || 0) + Number(f.transport_charges || 0) + Number(f.additional_charges || 0);
  const discount = subtotal * Number(f.discount_pct || 0) / 100;
  const tax = (subtotal - discount) * Number(f.tax_pct || 0) / 100;
  return { subtotal, discount, tax, total: subtotal - discount + tax };
}

export const useQuoteDefaults = (enabled = true) =>
  useQuery({ queryKey: ["quote-defaults"], queryFn: () => apiGet<QuoteDefaults>("/quote-defaults"), enabled, staleTime: 60_000 });

const PER_QUOTE: (keyof QuoteDefaults & keyof QuoteFields)[] = ["cover_subject", "cover_body", "cover_points", "cover_closing", "tech_specs",
  "payment_schedule", "delivery_timeline", "installation_timeline", "warranty", "price_note", "builder_side_work", "contract_conditions",
  "preparatory_intro", "preparatory_work", "builder_intro", "builder_work", "materials", "materials_note"];

/** Fill fields that quotations created before the multi-page format do not have. */
export function withDefaults(f: QuoteFields, d?: QuoteDefaults): QuoteFields {
  if (!d) return f;
  const out: QuoteFields = { ...f };
  for (const k of PER_QUOTE) if (out[k] == null) (out as unknown as Record<string, unknown>)[k] = structuredClone(d[k]);
  return out;
}

function ListEditor({ label, value, onChange, rows = 5, hint }: { label: string; value?: string[] | null; onChange: (v: string[]) => void; rows?: number; hint?: string }) {
  const [text, setText] = useState((value ?? []).join("\n"));
  useEffect(() => setText((value ?? []).join("\n")), [value]);
  return (
    <Field label={label}>
      <Textarea rows={rows} value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => onChange(text.split("\n").map((x) => x.trim()).filter(Boolean))} />
      <p className="mt-1 text-xs text-steel">{hint ?? "One item per line."}</p>
    </Field>
  );
}

export function PaymentEditor({ rows, onChange, total }: { rows: PayRow[]; onChange: (r: PayRow[]) => void; total?: number }) {
  const sum = rows.reduce((s, r) => s + Number(r.pct || 0), 0);
  const set = (i: number, patch: Partial<PayRow>) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  return (
    <div className="space-y-2" data-testid="payment-schedule-editor">
      {rows.map((r, i) => (
        <div key={i} className="grid grid-cols-[80px_1fr_auto_auto] items-center gap-2">
          <div className="relative"><Input type="number" min={0} max={100} value={r.pct} onChange={(e) => set(i, { pct: Number(e.target.value) })} className="pr-6" />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-steel">%</span></div>
          <Input value={r.description} onChange={(e) => set(i, { description: e.target.value })} placeholder="Milestone description" />
          <span className="w-24 text-right text-xs text-steel">{total != null ? inr(total * Number(r.pct || 0) / 100) : ""}</span>
          <Button variant="ghost" size="icon" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove milestone"><Trash2 className="h-4 w-4" /></Button>
        </div>))}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={() => onChange([...rows, { pct: 0, description: "" }])}><Plus className="h-4 w-4" />Add milestone</Button>
        <span className={Math.abs(sum - 100) < 0.01 ? "text-xs text-emerald-300" : "text-xs font-semibold text-amber-300"} data-testid="payment-sum">
          Total: {sum}%{Math.abs(sum - 100) < 0.01 ? " ✓" : " — should be 100%"}</span>
      </div>
    </div>
  );
}

export function MaterialsEditor({ rows, catalog, onChange }: { rows: UiMaterial[]; catalog: Record<string, string[]>; onChange: (r: UiMaterial[]) => void }) {
  const cats = Object.keys(catalog);
  const set = (i: number, patch: Partial<UiMaterial>) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  const move = (i: number, d: number) => { const r = [...rows]; [r[i], r[i + d]] = [r[i + d], r[i]]; onChange(r); };
  return (
    <div className="space-y-2" data-testid="materials-editor">
      {rows.map((r, i) => {
        const customCat = r._cc || (!!r.category && !cats.includes(r.category));
        const opts = catalog[r.category] ?? [];
        const customDet = r._cd || customCat || (!!r.detail && !opts.includes(r.detail));
        return (
          <div key={i} className="grid gap-2 rounded-md border border-line/60 p-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_auto]">
            <div className="space-y-1">
              <NSelect value={customCat ? CUSTOM : r.category} placeholder="Material…"
                options={[...cats, { value: CUSTOM, label: "Custom…" }]}
                onChange={(e) => e.target.value === CUSTOM ? set(i, { category: "", detail: "", _cc: true, _cd: true })
                  : set(i, { category: e.target.value, detail: catalog[e.target.value]?.[0] ?? "", _cc: false, _cd: false })} />
              {customCat && <Input value={r.category} onChange={(e) => set(i, { category: e.target.value })} placeholder="Material name" />}
            </div>
            <div className="space-y-1">
              {!customCat && <NSelect value={customDet ? CUSTOM : r.detail} placeholder="Details…"
                options={[...opts, { value: CUSTOM, label: "Custom…" }]}
                onChange={(e) => e.target.value === CUSTOM ? set(i, { detail: "", _cd: true }) : set(i, { detail: e.target.value, _cd: false })} />}
              {customDet && <Input value={r.detail} onChange={(e) => set(i, { detail: e.target.value })} placeholder="Brand / capacity / specification" />}
            </div>
            <div className="flex items-start gap-0.5">
              <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" disabled={i === rows.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown className="h-4 w-4" /></Button>
              <Button variant="ghost" size="icon" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Remove material"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>);
      })}
      <Button variant="outline" size="sm" onClick={() => onChange([...rows, { category: "", detail: "" }])} data-testid="material-add-btn"><Plus className="h-4 w-4" />Add material</Button>
    </div>
  );
}

function SpecsEditor({ rows, onChange, labelsEditable }: { rows: SpecRow[]; onChange: (r: SpecRow[]) => void; labelsEditable?: boolean }) {
  const set = (i: number, patch: Partial<SpecRow>) => onChange(rows.map((r, j) => j === i ? { ...r, ...patch } : r));
  return (
    <div className="grid gap-3 sm:grid-cols-2" data-testid="tech-specs-editor">
      {rows.map((s, i) => (
        <Field key={s.key} label={labelsEditable ? `${i + 1}.` : `${i + 1}. ${s.label}`} className={s.key === "features" ? "sm:col-span-2" : ""}>
          {labelsEditable && <Input value={s.label} onChange={(e) => set(i, { label: e.target.value })} className="mb-1 font-semibold" />}
          {s.key === "features" ? <Textarea rows={2} value={s.value} onChange={(e) => set(i, { value: e.target.value })} />
            : <Input value={s.value} onChange={(e) => set(i, { value: e.target.value })} data-testid={`spec-${s.key}`} />}
        </Field>))}
    </div>
  );
}

export function QuoteForm({ initial, catalog, meta, onSave, saving, isIssued }: {
  initial: QuoteFields; catalog: Record<string, string[]>; meta?: { number?: string; revision?: number; status?: string };
  onSave: (f: QuoteFields & { change_note?: string }) => void; saving: boolean; isIssued?: boolean;
}) {
  const [f, setF] = useState<QuoteFields>(initial);
  const [note, setNote] = useState("");
  useEffect(() => setF(initial), [initial]);
  const set = (k: keyof QuoteFields, num?: boolean) => (e: { target: { value: string } }) =>
    setF((p) => ({ ...p, [k]: num ? (e.target.value === "" ? 0 : Number(e.target.value)) : e.target.value }));
  const put = <K extends keyof QuoteFields>(k: K, v: QuoteFields[K]) => setF((p) => ({ ...p, [k]: v }));
  const setItem = (i: number, k: "description" | "qty" | "unit_price", v: string) =>
    setF((p) => ({ ...p, items: p.items.map((it, j) => j === i ? { ...it, [k]: k === "description" ? v : Number(v) } : it) }));
  const t = calc(f);
  const paySum = (f.payment_schedule ?? []).reduce((s, r) => s + Number(r.pct || 0), 0);
  const save = () => {
    if (Math.abs(paySum - 100) >= 0.01 && !confirm(`Payment schedule adds up to ${paySum}%, not 100%. Save anyway?`)) return;
    onSave({ ...f, change_note: note || undefined });
  };
  return (
    <div className="space-y-4">
      <Tabs defaultValue="customer">
        <TabsList className="flex-wrap">
          <TabsTrigger value="customer" data-testid="qtab-customer">1. Customer & Quote</TabsTrigger>
          <TabsTrigger value="specs" data-testid="qtab-specs">2. Technical Specs</TabsTrigger>
          <TabsTrigger value="price" data-testid="qtab-price">3. Price Breakup</TabsTrigger>
          <TabsTrigger value="terms" data-testid="qtab-terms">4. Commercial Terms</TabsTrigger>
          <TabsTrigger value="materials" data-testid="qtab-materials">5. Materials</TabsTrigger>
        </TabsList>

        <TabsContent value="customer"><Panel>
          <div className="grid gap-3 sm:grid-cols-3">
            {meta?.number && <Field label="Quotation / Reference No."><Input readOnly value={`${meta.number} · Revision ${meta.revision}`} /></Field>}
            {meta?.status && <Field label="Status"><Input readOnly value={meta.status} /></Field>}
            <Field label="Quotation date"><Input type="date" value={f.quote_date ?? ""} onChange={set("quote_date")} data-testid="q-date-input" /></Field>
            <Field label="Valid until"><Input type="date" value={f.valid_until ?? ""} onChange={set("valid_until")} data-testid="q-valid-input" /></Field>
            <Field label="Lift category (for reports)"><NSelect value={f.lift_category ?? ""} onChange={set("lift_category")} options={LIFT_TYPES} placeholder="Select" data-testid="q-category-select" /></Field>
            <Field label="Customer name"><Input value={f.customer_name ?? ""} onChange={set("customer_name")} data-testid="q-customer-name" /></Field>
            <Field label="Mobile number"><Input value={f.customer_mobile ?? ""} onChange={set("customer_mobile")} data-testid="q-customer-mobile" /></Field>
            <Field label="Email (for sending)"><Input type="email" value={f.customer_email ?? ""} onChange={set("customer_email")} data-testid="q-customer-email" /></Field>
            <Field label="Customer address (cover letter)" className="sm:col-span-3"><Textarea rows={3} value={f.customer_address ?? ""} onChange={set("customer_address")} data-testid="q-customer-address" /></Field>
            <Field label="Project / site address" className="sm:col-span-3"><Textarea rows={2} value={f.project_address ?? ""} onChange={set("project_address")} data-testid="q-address-input" /></Field>
            <Field label="Cover letter subject" className="sm:col-span-3"><Input value={f.cover_subject ?? ""} onChange={set("cover_subject")} /></Field>
          </div>
        </Panel></TabsContent>

        <TabsContent value="specs"><Panel>
          <SpecsEditor rows={f.tech_specs ?? []} onChange={(r) => put("tech_specs", r)} />
        </Panel></TabsContent>

        <TabsContent value="price"><Panel>
          <div className="space-y-2">
            <div className="hidden grid-cols-[1fr_70px_120px_auto] gap-2 text-xs text-steel sm:grid"><span>Description</span><span>Qty</span><span>Unit price (₹)</span><span /></div>
            {f.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[1fr_70px_120px_auto] gap-2" data-testid="q-item-row">
                <Input placeholder="Material / equipment description" value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} data-testid={`q-item-desc-${i}`} />
                <Input type="number" min={1} value={it.qty} onChange={(e) => setItem(i, "qty", e.target.value)} data-testid={`q-item-qty-${i}`} />
                <Input type="number" min={0} value={it.unit_price} onChange={(e) => setItem(i, "unit_price", e.target.value)} data-testid={`q-item-price-${i}`} />
                <Button variant="ghost" size="icon" onClick={() => put("items", f.items.filter((_, j) => j !== i))} aria-label="Remove item"><Trash2 className="h-4 w-4" /></Button>
              </div>))}
            <Button variant="outline" size="sm" onClick={() => put("items", [...f.items, { description: "", qty: 1, unit_price: 0 }])} data-testid="q-add-item-btn"><Plus className="h-4 w-4" />Add item</Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            <Field label="Installation (₹)"><Input type="number" value={f.installation_charges} onChange={set("installation_charges", true)} data-testid="q-install-input" /></Field>
            <Field label="Transport (₹)"><Input type="number" value={f.transport_charges} onChange={set("transport_charges", true)} data-testid="q-transport-input" /></Field>
            <Field label="Additional (₹)"><Input type="number" value={f.additional_charges} onChange={set("additional_charges", true)} data-testid="q-additional-input" /></Field>
            <Field label="Discount %"><Input type="number" value={f.discount_pct} onChange={set("discount_pct", true)} data-testid="q-discount-input" /></Field>
            <Field label="Tax / GST %"><Input type="number" value={f.tax_pct} onChange={set("tax_pct", true)} data-testid="q-tax-input" /></Field>
          </div>
          <div className="mt-4 ml-auto max-w-sm rounded-md border border-gold/30 bg-gold/5 p-3 text-sm">
            <KV k="Subtotal" v={inr(t.subtotal)} /><KV k="Discount" v={`− ${inr(t.discount)}`} /><KV k="Tax" v={inr(t.tax)} />
            <div className="flex justify-between pt-2 font-heading text-lg font-semibold text-champagne"><span>Final amount</span><span data-testid="q-total">{inr(t.total)}</span></div>
            <p className="mt-2 text-xs text-steel" data-testid="q-total-words">{amountInWords(t.total)}</p>
          </div>
        </Panel></TabsContent>

        <TabsContent value="terms"><div className="space-y-4">
          <Panel title="Payment schedule"><PaymentEditor rows={f.payment_schedule ?? []} onChange={(r) => put("payment_schedule", r)} total={t.total} /></Panel>
          <Panel title="Timelines & warranty">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Delivery period"><Textarea rows={2} value={f.delivery_timeline ?? ""} onChange={set("delivery_timeline")} data-testid="q-delivery_timeline-input" /></Field>
              <Field label="Installation period"><Textarea rows={2} value={f.installation_timeline ?? ""} onChange={set("installation_timeline")} /></Field>
              <Field label="Warranty"><Textarea rows={2} value={f.warranty ?? ""} onChange={set("warranty")} data-testid="q-warranty-input" /></Field>
              <Field label="AMC (optional)"><Textarea rows={2} value={f.amc_info ?? ""} onChange={set("amc_info")} /></Field>
              <Field label="Note under terms" className="sm:col-span-2"><Input value={f.price_note ?? ""} onChange={set("price_note")} /></Field>
            </div>
          </Panel>
          <Panel title="Builder side work & conditions of contract">
            <div className="grid gap-3">
              <ListEditor label="Builder side work" value={f.builder_side_work} onChange={(v) => put("builder_side_work", v)} />
              <ListEditor label="Conditions of contract" value={f.contract_conditions} onChange={(v) => put("contract_conditions", v)} />
            </div>
          </Panel>
        </div></TabsContent>

        <TabsContent value="materials"><Panel>
          <MaterialsEditor rows={f.materials ?? []} catalog={catalog} onChange={(r) => put("materials", r)} />
          <Field label="Note under materials" className="mt-3"><Input value={f.materials_note ?? ""} onChange={set("materials_note")} /></Field>
        </Panel></TabsContent>
      </Tabs>

      {isIssued && <p className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-200">This quotation has been issued. Saving will create a new revision; the issued version is preserved.</p>}
      <div className="flex flex-wrap gap-2">
        <Input placeholder="Change note (what changed and why)" value={note} onChange={(e) => setNote(e.target.value)} className="max-w-md" data-testid="q-change-note-input" />
        <Button className="gold-btn" disabled={saving} onClick={save} data-testid="q-save-btn">{saving ? "Saving…" : isIssued ? "Save as new revision" : "Save draft"}</Button>
      </div>
    </div>
  );
}

export function QuoteDefaultsPage() {
  const qc = useQueryClient();
  const { data } = useQuoteDefaults();
  const [d, setD] = useState<QuoteDefaults | null>(null);
  const [cats, setCats] = useState<{ name: string; options: string }[]>([]);
  useEffect(() => {
    if (!data) return;
    setD(structuredClone(data));
    setCats(Object.entries(data.material_catalog).map(([name, opts]) => ({ name, options: opts.join("\n") })));
  }, [data]);
  const catalog = Object.fromEntries(cats.filter((c) => c.name.trim()).map((c) => [c.name.trim(), c.options.split("\n").map((x) => x.trim()).filter(Boolean)]));
  const save = useMutation({
    mutationFn: () => apiPut<QuoteDefaults>("/quote-defaults", { ...d, material_catalog: catalog }),
    onSuccess: () => { toast.success("Quotation defaults saved — used for new quotations"); qc.invalidateQueries({ queryKey: ["quote-defaults"] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  if (!d) return <p className="text-steel">Loading…</p>;
  const put = <K extends keyof QuoteDefaults>(k: K, v: QuoteDefaults[K]) => setD({ ...d, [k]: v });
  const txt = (k: keyof QuoteDefaults) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value });
  return (
    <div>
      <PageHeader title="Quotation defaults" subtitle="Pre-filled into every new quotation. Existing quotations are not changed."
        actions={<><Link to="/staff/quotations" className="rounded-md border border-line px-3 py-1.5 text-sm">← Quotations</Link>
          <Button className="gold-btn" disabled={save.isPending} onClick={() => save.mutate()} data-testid="quote-defaults-save-btn">{save.isPending ? "Saving…" : "Save defaults"}</Button></>} />
      <Tabs defaultValue="cover">
        <TabsList className="flex-wrap">
          <TabsTrigger value="cover">Cover letter</TabsTrigger><TabsTrigger value="specs">Technical specs</TabsTrigger>
          <TabsTrigger value="terms">Price & terms</TabsTrigger><TabsTrigger value="clauses">Clauses</TabsTrigger>
          <TabsTrigger value="fixed">Preparatory & builder work</TabsTrigger><TabsTrigger value="materials">Materials</TabsTrigger>
        </TabsList>
        <TabsContent value="cover"><Panel><div className="grid gap-3">
          <Field label="Subject"><Input value={d.cover_subject} onChange={txt("cover_subject")} /></Field>
          <ListEditor label="Letter paragraphs" value={d.cover_body} onChange={(v) => put("cover_body", v)} rows={8} hint="One paragraph per line." />
          <ListEditor label="Bullet points" value={d.cover_points} onChange={(v) => put("cover_points", v)} rows={3} />
          <Field label="Closing paragraph"><Textarea rows={2} value={d.cover_closing} onChange={txt("cover_closing")} /></Field>
        </div></Panel></TabsContent>
        <TabsContent value="specs"><Panel><SpecsEditor rows={d.tech_specs} onChange={(r) => put("tech_specs", r)} labelsEditable /></Panel></TabsContent>
        <TabsContent value="terms"><div className="space-y-4">
          <Panel title="Price"><Field label="Default price line description"><Textarea rows={2} value={d.price_description} onChange={txt("price_description")} /></Field></Panel>
          <Panel title="Payment schedule"><PaymentEditor rows={d.payment_schedule} onChange={(r) => put("payment_schedule", r)} /></Panel>
          <Panel title="Timelines & warranty"><div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delivery period"><Textarea rows={2} value={d.delivery_timeline} onChange={txt("delivery_timeline")} /></Field>
            <Field label="Installation period"><Textarea rows={2} value={d.installation_timeline} onChange={txt("installation_timeline")} /></Field>
            <Field label="Warranty"><Textarea rows={2} value={d.warranty} onChange={txt("warranty")} /></Field>
            <Field label="Note under terms"><Textarea rows={2} value={d.price_note} onChange={txt("price_note")} /></Field>
          </div></Panel>
        </div></TabsContent>
        <TabsContent value="clauses"><Panel><div className="grid gap-3">
          <ListEditor label="Builder side work" value={d.builder_side_work} onChange={(v) => put("builder_side_work", v)} rows={6} />
          <ListEditor label="Conditions of contract" value={d.contract_conditions} onChange={(v) => put("contract_conditions", v)} rows={6} />
        </div></Panel></TabsContent>
        <TabsContent value="fixed"><Panel><div className="grid gap-3">
          <Field label="Customer preparatory work — intro"><Input value={d.preparatory_intro} onChange={txt("preparatory_intro")} /></Field>
          <ListEditor label="Customer preparatory work (page 4)" value={d.preparatory_work} onChange={(v) => put("preparatory_work", v)} rows={10} />
          <Field label="Work by the builder — intro"><Input value={d.builder_intro} onChange={txt("builder_intro")} /></Field>
          <ListEditor label="Work to be carried out by the builder (page 5)" value={d.builder_work} onChange={(v) => put("builder_work", v)} rows={10} />
        </div></Panel></TabsContent>
        <TabsContent value="materials"><div className="space-y-4">
          <Panel title="Material catalogue (dropdown options)">
            <div className="grid gap-3 sm:grid-cols-2">{cats.map((c, i) => (
              <div key={i} className="space-y-1 rounded-md border border-line/60 p-2">
                <div className="flex gap-1"><Input value={c.name} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="font-semibold" placeholder="Category name" />
                  <Button variant="ghost" size="icon" onClick={() => setCats(cats.filter((_, j) => j !== i))} aria-label="Remove category"><Trash2 className="h-4 w-4" /></Button></div>
                <Textarea rows={3} value={c.options} onChange={(e) => setCats(cats.map((x, j) => j === i ? { ...x, options: e.target.value } : x))} placeholder="One option per line" />
              </div>))}</div>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setCats([...cats, { name: "", options: "" }])}><Plus className="h-4 w-4" />Add category</Button>
          </Panel>
          <Panel title="Default material rows for new quotations">
            <MaterialsEditor rows={d.materials} catalog={catalog} onChange={(r) => put("materials", r)} />
            <Field label="Note under materials" className="mt-3"><Input value={d.materials_note} onChange={txt("materials_note")} /></Field>
          </Panel>
        </div></TabsContent>
      </Tabs>
    </div>
  );
}
