import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { statusTone } from "@/lib/format";
import { Label } from "@/components/ui/label";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
	return (
		<span className={cn("flex items-center gap-2.5", className)} data-testid="brand-logo">
			<img src="/logo.jpeg" alt="V Tech Elevators logo" className="h-11 w-11 rounded-md object-cover ring-1 ring-gold/30" />
			{!compact && (
				<span className="leading-tight">
					<span className="block font-heading text-lg font-bold tracking-wide"><span className="gold-text">V</span>TECH</span>
					<span className="block text-[10px] tracking-[0.3em] text-champagne">ELEVATORS</span>
				</span>
			)}
		</span>
	);
}

export function Field({ label, children, required, hint, className }: { label: string; children: ReactNode; required?: boolean; hint?: string; className?: string }) {
	return (
		<div className={cn("space-y-1.5", className)}>
			<Label className="field-label">{label}{required && <span className="text-gold"> *</span>}</Label>
			{children}
			{hint && <p className="text-[11px] text-steel">{hint}</p>}
		</div>
	);
}

export function NSelect({ options, placeholder, className, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { options: (string | { value: string; label: string })[]; placeholder?: string }) {
	return (
		<select {...rest} className={cn("h-9 w-full rounded-md border border-input bg-elev px-2.5 text-sm text-platinum outline-none transition-colors focus:border-gold", className)}>
			{placeholder !== undefined && <option value="">{placeholder}</option>}
			{options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
		</select>
	);
}

export function StatusBadge({ status, testId }: { status: string; testId?: string }) {
	return <span data-testid={testId} className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", statusTone(status))}>{status}</span>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
	return (
		<div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
			<div>
				<h1 className="font-heading text-2xl font-semibold text-platinum sm:text-3xl" data-testid="page-title">{title}</h1>
				{subtitle && <p className="mt-1 text-sm text-steel">{subtitle}</p>}
			</div>
			{actions && <div className="flex flex-wrap gap-2">{actions}</div>}
		</div>
	);
}

export function Stat({ label, value, tone, testId, onClick }: { label: string; value: ReactNode; tone?: "gold" | "red" | "green"; testId?: string; onClick?: () => void }) {
	return (
		<button type="button" onClick={onClick} data-testid={testId} disabled={!onClick}
			className={cn("rounded-lg border border-line bg-panel p-4 text-left transition-colors", onClick && "hover:border-gold/50", tone === "red" && "border-red-500/40 bg-red-500/5")}>
			<div className="text-[11px] uppercase tracking-wider text-steel">{label}</div>
			<div className={cn("mt-1 font-heading text-2xl font-semibold", tone === "gold" ? "text-champagne" : tone === "red" ? "text-red-300" : tone === "green" ? "text-emerald-300" : "text-platinum")}>{value}</div>
		</button>
	);
}

export function Panel({ title, children, actions, className }: { title?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
	return (
		<section className={cn("rounded-lg border border-line bg-panel p-4 sm:p-5", className)}>
			{(title || actions) && (
				<div className="mb-3 flex items-center justify-between gap-2">
					{title && <h2 className="font-heading text-base font-semibold text-platinum">{title}</h2>}
					{actions}
				</div>
			)}
			{children}
		</section>
	);
}

export function Empty({ text }: { text: string }) {
	return <p className="py-6 text-center text-sm text-steel">{text}</p>;
}

export function KV({ k, v }: { k: string; v: ReactNode }) {
	return (
		<div className="flex justify-between gap-3 border-b border-line/60 py-1.5 text-sm last:border-0">
			<span className="text-steel">{k}</span><span className="text-right text-platinum">{v ?? "—"}</span>
		</div>
	);
}