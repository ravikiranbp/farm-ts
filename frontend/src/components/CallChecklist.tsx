import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiGet, apiPut } from "@/lib/api";
import type { ChecklistItem, Lead, Settings } from "@/lib/types";
import { errMsg, fmtDateTime } from "@/lib/format";
import { Panel } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function checklistProgress(items: ChecklistItem[], answers: Record<string, string>) {
	const req = items.filter((q) => q.required);
	const done = items.filter((q) => (answers[q.id] ?? "").trim()).length;
	const missing = req.filter((q) => !(answers[q.id] ?? "").trim());
	return { done, total: items.length, missing, pct: items.length ? Math.round((100 * done) / items.length) : 0 };
}

export function useChecklist() {
	return useQuery({ queryKey: ["settings"], queryFn: () => apiGet<Settings>("/settings"), staleTime: 300_000, select: (s) => s.call_checklist ?? [] });
}

export default function CallChecklist({ lead }: { lead: Lead }) {
	const qc = useQueryClient();
	const { data: items = [] } = useChecklist();
	const [ans, setAns] = useState<Record<string, string>>(lead.checklist_answers ?? {});
	useEffect(() => setAns(lead.checklist_answers ?? {}), [lead.checklist_answers]);
	const save = useMutation({
		mutationFn: () => apiPut<Lead>(`/leads/${lead.id}/checklist`, { answers: ans }),
		onSuccess: () => { toast.success("Checklist saved"); qc.invalidateQueries({ queryKey: ["lead", lead.id] }); },
		onError: (e) => toast.error(errMsg(e)),
	});
	const p = checklistProgress(items, ans);
	const dirty = JSON.stringify(ans) !== JSON.stringify(lead.checklist_answers ?? {});
	return (
		<Panel title="Call checklist" actions={<span className="text-xs text-steel" data-testid="checklist-progress">{p.done}/{p.total} answered</span>}>
			<div className="mb-3 h-1.5 rounded-full bg-elev"><div className={cn("h-1.5 rounded-full transition-[width] duration-300", p.missing.length ? "bg-gold" : "bg-emerald-500")} style={{ width: `${p.pct}%` }} /></div>
			<ol className="space-y-3" data-testid="call-checklist">
				{items.map((q, i) => (
					<li key={q.id} data-testid={`checklist-item-${q.id}`}>
						<p className="text-sm"><span className="mr-1 font-mono text-xs text-gold">{i + 1}.</span>{q.question}{q.required && <span className="text-gold"> *</span>}</p>
						{q.type === "choice" ? (
							<div className="mt-1.5 flex flex-wrap gap-1.5">
								{(q.options ?? []).map((o) => (
									<button key={o} type="button" onClick={() => setAns({ ...ans, [q.id]: ans[q.id] === o ? "" : o })} data-testid={`checklist-${q.id}-option`}
										className={cn("rounded-full border px-2.5 py-1 text-xs transition-colors", ans[q.id] === o ? "border-gold bg-gold/15 text-champagne" : "border-line text-steel hover:border-gold/40")}>{o}</button>
								))}
							</div>
						) : (
							<Input className="mt-1.5" value={ans[q.id] ?? ""} onChange={(e) => setAns({ ...ans, [q.id]: e.target.value })} data-testid={`checklist-${q.id}-input`} />
						)}
					</li>
				))}
			</ol>
			<div className="mt-4 flex flex-wrap items-center justify-between gap-2">
				<span className="text-[11px] text-steel">{lead.checklist_updated_at ? `Last saved ${fmtDateTime(lead.checklist_updated_at)} by ${lead.checklist_updated_by}` : "Not filled yet"}</span>
				<Button size="sm" disabled={!dirty || save.isPending} onClick={() => save.mutate()} data-testid="checklist-save-btn">{save.isPending ? "Saving…" : "Save checklist"}</Button>
			</div>
		</Panel>
	);
}