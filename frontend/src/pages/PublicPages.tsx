import { useState, type FormEvent } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Phone, Mail, MessageCircle, MapPin, X } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api";
import type { Brochure, EnquiryResult, Product, Project } from "@/lib/types";
import { ISSUE_TYPES, errMsg, fmtDate } from "@/lib/format";
import { FALLBACK_COMPANY, usePublicContent } from "@/components/PublicLayout";
import EnquiryForm, { Success } from "@/components/EnquiryForm";
import BrochureGate from "@/components/BrochureGate";
import { Field, NSelect } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

function Hero({ over, title, text }: { over: string; title: string; text?: string }) {
	return (
		<section className="border-b border-line bg-[radial-gradient(ellipse_at_10%_0%,rgba(214,162,58,0.12),transparent_55%)]">
			<div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 sm:py-16">
				<p className="overline">{over}</p>
				<h1 className="mt-3 max-w-3xl font-heading text-3xl font-bold text-white sm:text-5xl">{title}</h1>
				{text && <p className="mt-4 max-w-2xl text-steel">{text}</p>}
			</div>
		</section>
	);
}
const Wrap = ({ children, className }: { children: React.ReactNode; className?: string }) => <div className={cn("mx-auto max-w-7xl px-4 py-12 sm:px-6", className)}>{children}</div>;

const COMPARE_ROWS: [string, (p: Product) => string][] = [
	["Category", (p) => p.category], ["Capacity", (p) => p.capacity], ["Speed", (p) => p.speed],
	["Floors supported", (p) => p.floors_supported], ["Door types", (p) => p.door_types.join(", ")],
	["Configurations", (p) => p.configurations.join(", ")],
];

export function ProductsPage() {
	const { data, isLoading } = usePublicContent();
	const [cat, setCat] = useState("All");
	const [cmp, setCmp] = useState<string[]>([]);
	const [showCmp, setShowCmp] = useState(false);
	const products = data?.products ?? [];
	const cats = ["All", ...new Set(products.map((p) => p.category))];
	const list = products.filter((p) => cat === "All" || p.category === cat);
	const toggle = (id: string) => setCmp((c) => c.includes(id) ? c.filter((x) => x !== id) : c.length >= 3 ? (toast.info("Compare up to 3 lifts"), c) : [...c, id]);
	const chosen = products.filter((p) => cmp.includes(p.id));
	return (
		<>
			<Hero over="Product catalogue" title="Lift solutions for every building" text="Specifications shown are indicative and confirmed by our engineers after a site inspection." />
			<Wrap>
				<div className="flex flex-wrap gap-2">{cats.map((c) => (
					<button key={c} onClick={() => setCat(c)} data-testid={`category-filter-${c}`} className={cn("rounded-full border px-3 py-1.5 text-xs transition-colors", c === cat ? "border-gold bg-gold/15 text-champagne" : "border-line text-steel hover:border-gold/40")}>{c}</button>
				))}</div>
				{isLoading && <p className="mt-8 text-sm text-steel">Loading catalogue…</p>}
				<div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{list.map((p) => (
						<article key={p.id} className="card-lift overflow-hidden rounded-xl border border-line bg-panel" data-testid={`product-card-${p.slug}`}>
							<Link to={`/products/${p.slug}`}><img src={p.images[0]} alt={p.name} className="h-52 w-full object-cover" loading="lazy" /></Link>
							<div className="p-5">
								<p className="text-[11px] uppercase tracking-wider text-champagne">{p.category}</p>
								<h3 className="mt-1 font-heading text-xl font-semibold">{p.name}</h3>
								<p className="mt-2 line-clamp-2 text-sm text-steel">{p.description}</p>
								<div className="mt-3 grid grid-cols-3 gap-2 text-xs"><span className="text-steel">Capacity<br /><b className="text-platinum">{p.capacity}</b></span><span className="text-steel">Speed<br /><b className="text-platinum">{p.speed}</b></span><span className="text-steel">Floors<br /><b className="text-platinum">{p.floors_supported}</b></span></div>
								<div className="mt-4 flex items-center justify-between">
									<Link to={`/products/${p.slug}`} className="text-sm font-semibold text-gold">View details →</Link>
									<label className="flex items-center gap-1.5 text-xs text-steel"><input type="checkbox" checked={cmp.includes(p.id)} onChange={() => toggle(p.id)} data-testid={`compare-toggle-${p.slug}`} className="accent-[#D6A23A]" />Compare</label>
								</div>
							</div>
						</article>
					))}
				</div>
			</Wrap>
			{cmp.length > 0 && (
				<div className="fixed inset-x-0 bottom-0 z-30 border-t border-gold/40 bg-panel/95 backdrop-blur-md">
					<div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
						<span className="text-sm text-steel">{cmp.length} selected for comparison</span>
						<div className="flex gap-2"><Button variant="ghost" size="sm" onClick={() => setCmp([])}>Clear</Button><Button size="sm" className="gold-btn" onClick={() => setShowCmp(true)} data-testid="open-compare-btn">Compare now</Button></div>
					</div>
				</div>
			)}
			<Dialog open={showCmp} onOpenChange={setShowCmp}>
				<DialogContent className="max-h-[90vh] overflow-auto border-line bg-panel sm:max-w-4xl" data-testid="compare-dialog">
					<DialogTitle className="font-heading">Compare lifts</DialogTitle>
					<table className="w-full text-sm"><thead><tr><th className="p-2 text-left text-steel" />{chosen.map((p) => <th key={p.id} className="p-2 text-left text-champagne">{p.name}</th>)}</tr></thead>
						<tbody>{COMPARE_ROWS.map(([l, fn]) => <tr key={l} className="border-t border-line"><td className="p-2 text-steel">{l}</td>{chosen.map((p) => <td key={p.id} className="p-2">{fn(p)}</td>)}</tr>)}</tbody></table>
				</DialogContent>
			</Dialog>
		</>
	);
}

export function ProductDetailPage() {
	const { slug } = useParams();
	const { data, isLoading, isError } = useQuery({ queryKey: ["product", slug], queryFn: () => apiGet<{ product: Product; related_projects: Project[] }>(`/public/products/${slug}`) });
	const [img, setImg] = useState(0);
	if (isLoading) return <Wrap><p className="text-steel">Loading…</p></Wrap>;
	if (isError || !data) return <Wrap><p className="text-steel">This product could not be loaded. <Link to="/products" className="text-gold">Back to catalogue</Link></p></Wrap>;
	const p = data.product;
	const list = (t: string, xs: string[]) => xs.length > 0 && <div><h3 className="overline mb-2">{t}</h3><div className="flex flex-wrap gap-2">{xs.map((x) => <span key={x} className="rounded-full border border-line bg-elev px-3 py-1 text-xs">{x}</span>)}</div></div>;
	return (
		<Wrap>
			<Link to="/products" className="text-sm text-steel hover:text-gold">← All lifts</Link>
			<div className="mt-6 grid gap-10 lg:grid-cols-2">
				<div>
					<img src={p.images[img]} alt={p.name} className="h-[360px] w-full rounded-xl border border-line object-cover sm:h-[460px]" />
					<div className="mt-3 flex gap-2">{p.images.map((s, i) => <button key={s} onClick={() => setImg(i)} className={cn("overflow-hidden rounded-md border", i === img ? "border-gold" : "border-line")}><img src={s} alt="" className="h-16 w-24 object-cover" /></button>)}</div>
				</div>
				<div className="space-y-6">
					<div><p className="overline">{p.category}</p><h1 className="mt-2 font-heading text-4xl font-bold text-white" data-testid="product-name">{p.name}</h1><p className="mt-3 text-steel">{p.description}</p></div>
					<div className="rounded-xl border border-line bg-panel">
						{p.specs.map((s) => <div key={s.label} className="flex justify-between border-b border-line px-4 py-2.5 text-sm last:border-0"><span className="text-steel">{s.label}</span><span>{s.value}</span></div>)}
					</div>
					{!p.specs_verified && <p className="text-xs text-steel">Specifications are indicative and will be confirmed by our engineers for your site.</p>}
					{list("Cabin designs", p.cabin_designs)}{list("Door types", p.door_types)}{list("Configurations", p.configurations)}{list("Accessories", p.accessories)}
					<div className="flex flex-wrap gap-3">
						<Link to={`/quote?lift=${encodeURIComponent(p.category)}`} className="gold-btn rounded-md px-6 py-3 text-sm font-semibold" data-testid="product-enquire-btn">Enquire about this lift</Link>
						<Link to="/brochures" className="rounded-md border border-gold/50 px-6 py-3 text-sm text-champagne">Download brochure</Link>
					</div>
				</div>
			</div>
			{data.related_projects.length > 0 && <div className="mt-14"><h2 className="font-heading text-2xl font-semibold">Related projects</h2>
				<div className="mt-5 grid gap-5 md:grid-cols-3">{data.related_projects.map((r) => <div key={r.id} className="overflow-hidden rounded-xl border border-line bg-panel"><img src={r.photos[0]} alt={r.name} className="h-40 w-full object-cover" /><div className="p-3 text-sm"><b>{r.name}</b><p className="text-steel">{r.location}</p></div></div>)}</div></div>}
		</Wrap>
	);
}

export function ProjectsPage() {
	const { data } = usePublicContent();
	const [f, setF] = useState("All");
	const [open, setOpen] = useState<Project | null>(null);
	const projects = data?.projects ?? [];
	const types = ["All", ...new Set(projects.map((p) => p.building_type))];
	return (
		<>
			<Hero over="Portfolio" title="Completed projects" text="A selection of lifts we have installed. Customer details are published only with permission." />
			<Wrap>
				<div className="flex flex-wrap gap-2">{types.map((t) => <button key={t} onClick={() => setF(t)} data-testid={`project-filter-${t}`} className={cn("rounded-full border px-3 py-1.5 text-xs", t === f ? "border-gold bg-gold/15 text-champagne" : "border-line text-steel")}>{t}</button>)}</div>
				<div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{projects.filter((p) => f === "All" || p.building_type === f).map((p) => (
						<button key={p.id} onClick={() => setOpen(p)} className="card-lift overflow-hidden rounded-xl border border-line bg-panel text-left" data-testid="project-card">
							<img src={p.photos[0]} alt={p.name} className="h-56 w-full object-cover" loading="lazy" />
							<div className="p-4"><div className="flex items-center justify-between"><h3 className="font-heading text-lg font-semibold">{p.name}</h3>{p.is_sample && <span className="text-[10px] text-steel">SAMPLE</span>}</div>
								<p className="text-sm text-steel">{p.location}</p><p className="mt-2 text-xs text-champagne">{p.building_type} · {p.lift_category} · {p.floors} floors · {p.lifts_count} lift(s)</p></div>
						</button>
					))}
				</div>
			</Wrap>
			<Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
				<DialogContent className="max-h-[90vh] overflow-auto border-line bg-panel sm:max-w-3xl" data-testid="project-dialog">
					{open && <><DialogTitle className="font-heading text-xl">{open.name}</DialogTitle>
						<div className="grid gap-2 sm:grid-cols-2">{open.photos.map((s) => <img key={s} src={s} alt="" className="h-48 w-full rounded-md object-cover" />)}</div>
						<p className="text-sm text-steel">{open.description}</p>
						<p className="text-sm">Completed: {fmtDate(open.completion_date)} · {open.location}</p>
						{open.specs && <p className="text-xs text-steel">{open.specs}</p>}</>}
				</DialogContent>
			</Dialog>
		</>
	);
}

const STEPS = ["Enquiry & consultation", "Free site inspection", "Quotation & approval", "Order & advance", "Material delivery", "Installation", "Testing & commissioning", "Handover & warranty"];
export function ServicesPage() {
	const { data } = usePublicContent();
	return (
		<>
			<Hero over="Services" title="Installation, modernization, maintenance & AMC" />
			<Wrap>
				<div className="grid gap-5 md:grid-cols-3">{(data?.services ?? []).map((s, i) => (
					<div key={s.id} className={cn("rounded-xl border border-line bg-panel p-6", i === 0 && "md:col-span-2")} data-testid="service-card"><h3 className="font-heading text-xl font-semibold text-champagne">{s.title}</h3><p className="mt-2 text-sm text-steel">{s.description}</p></div>
				))}</div>
				<h2 id="process" className="mt-16 font-heading text-3xl font-semibold">Our installation process</h2>
				<ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{STEPS.map((s, i) => <li key={s} className="rounded-lg border border-line bg-panel p-4"><span className="font-mono text-sm text-gold">0{i + 1}</span><p className="mt-1 font-medium">{s}</p></li>)}</ol>
				<div id="amc" className="mt-16 grid gap-8 rounded-2xl border border-gold/30 bg-gold/5 p-6 sm:p-10 lg:grid-cols-2">
					<div><p className="overline">Maintenance & AMC</p><h2 className="mt-2 font-heading text-3xl font-semibold">Keep your lift safe and running</h2>
						<ul className="mt-4 space-y-2 text-sm text-steel"><li>• Scheduled preventive maintenance visits</li><li>• Breakdown attendance and emergency support</li><li>• Comprehensive and non-comprehensive plans</li><li>• Safety checks and service reports</li></ul></div>
					<div className="flex flex-col justify-center gap-3"><Link to="/service-request" className="gold-btn rounded-md px-6 py-3 text-center text-sm font-semibold" data-testid="services-service-request-btn">Raise a service request</Link>
						<Link to="/quote" className="rounded-md border border-gold/50 px-6 py-3 text-center text-sm text-champagne">Ask about AMC plans</Link></div>
				</div>
			</Wrap>
		</>
	);
}

export function BrochuresPage() {
	const { data } = usePublicContent();
	const [sel, setSel] = useState<Brochure | null>(null);
	return (
		<>
			<Hero over="Brochures & catalogues" title="Download our brochures" text="Enter a few details to receive the brochure. Our team may call to help with your requirement." />
			<Wrap>
				<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{(data?.brochures ?? []).map((b) => (
					<div key={b.id} className="card-lift overflow-hidden rounded-xl border border-line bg-panel" data-testid="brochure-card">
						{b.cover_image && <img src={b.cover_image} alt="" className="h-44 w-full object-cover" />}
						<div className="p-5"><h3 className="font-heading text-lg font-semibold">{b.title}</h3><p className="mt-1 text-sm text-steel">{b.description}</p>
							<Button className="gold-btn mt-4" onClick={() => setSel(b)} data-testid={`download-brochure-btn-${b.id}`}><Download className="h-4 w-4" />Download Brochure</Button></div>
					</div>
				))}</div>
			</Wrap>
			<BrochureGate brochure={sel} onClose={() => setSel(null)} />
		</>
	);
}

export function AboutPage() {
	const { data } = usePublicContent();
	const c = data?.company ?? FALLBACK_COMPANY;
	return (
		<>
			<Hero over="About us" title={`${c.company_name} — ${c.tagline}`} text={c.about} />
			<Wrap className="grid gap-10 lg:grid-cols-2">
				<img src="/logo.jpeg" alt="V Tech Elevators" className="w-full max-w-md rounded-2xl border border-line" />
				<div className="space-y-4">
					<h2 className="font-heading text-2xl font-semibold">What customers say</h2>
					{(data?.testimonials ?? []).map((t) => <figure key={t.id} className="rounded-xl border border-line bg-panel p-5"><blockquote className="text-sm">“{t.quote}”</blockquote><figcaption className="mt-2 text-xs text-champagne">{t.name} · <span className="text-steel">{t.role}</span></figcaption></figure>)}
				</div>
			</Wrap>
		</>
	);
}

export function FaqsPage() {
	const { data } = usePublicContent();
	const [open, setOpen] = useState<string | null>(null);
	return (
		<>
			<Hero over="FAQs" title="Frequently asked questions" />
			<Wrap className="max-w-3xl">
				{(data?.faqs ?? []).map((f) => (
					<div key={f.id} className="border-b border-line">
						<button className="flex w-full items-center justify-between py-4 text-left font-medium" onClick={() => setOpen(open === f.id ? null : f.id)} data-testid="faq-toggle">{f.question}<span className="text-gold">{open === f.id ? "−" : "+"}</span></button>
						{open === f.id && <p className="pb-4 text-sm text-steel">{f.answer}</p>}
					</div>
				))}
			</Wrap>
		</>
	);
}

export function ContactPage() {
	const { data } = usePublicContent();
	const c = data?.company ?? FALLBACK_COMPANY;
	return (
		<>
			<Hero over="Contact us" title="Talk to V Tech Elevators" />
			<Wrap className="grid gap-10 lg:grid-cols-[1fr_1.3fr]">
				<div className="space-y-4">
					<a href={`tel:${c.phone}`} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-4" data-testid="contact-phone-link"><Phone className="text-gold" />{c.phone}</a>
					<a href={`mailto:${c.email}`} className="flex items-center gap-3 rounded-xl border border-line bg-panel p-4" data-testid="contact-email-link"><Mail className="text-gold" />{c.email}</a>
					<a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-line bg-panel p-4" data-testid="contact-whatsapp-link"><MessageCircle className="text-gold" />Chat on WhatsApp</a>
					<p className="flex items-center gap-3 rounded-xl border border-line bg-panel p-4"><MapPin className="text-gold" />{c.address}</p>
				</div>
				<div className="rounded-xl border border-line bg-panel p-6"><h2 className="mb-4 font-heading text-xl font-semibold">Request a callback</h2><EnquiryForm type="callback" /></div>
			</Wrap>
		</>
	);
}

export function QuotePage() {
	const [sp] = useSearchParams();
	const insp = sp.get("type") === "inspection";
	return (
		<>
			<Hero over={insp ? "Free site inspection" : "Request a quote"} title={insp ? "Book a free site inspection" : "Tell us about your lift requirement"} text="You'll receive a unique reference number as soon as your request is saved." />
			<Wrap className="max-w-4xl"><div className="rounded-xl border border-line bg-panel p-5 sm:p-8"><EnquiryForm key={insp ? "i" : "e"} type={insp ? "inspection" : "enquiry"} /></div></Wrap>
		</>
	);
}

export function ServiceRequestPage() {
	const [f, setF] = useState({ name: "", mobile: "", email: "", address: "", lift_ref: "", issue_type: "Lift breakdown", description: "", priority: "Normal", preferred_time: "" });
	const [res, setRes] = useState<EnquiryResult | null>(null);
	const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
	const m = useMutation({ mutationFn: () => apiPost<EnquiryResult>("/public/service-requests", { ...f, email: f.email || null }), onSuccess: setRes, onError: (e) => toast.error(errMsg(e)) });
	const submit = (e: FormEvent) => { e.preventDefault(); m.mutate(); };
	return (
		<>
			<Hero over="Service & breakdown" title="Raise a service request" text="For emergencies (someone trapped), call us immediately as well." />
			<Wrap className="max-w-3xl">
				<div className="rounded-xl border border-line bg-panel p-5 sm:p-8">
					{res ? <Success result={res} onReset={() => setRes(null)} /> : (
						<form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" data-testid="service-request-form">
							<Field label="Name" required><Input value={f.name} onChange={set("name")} required data-testid="sr-name-input" /></Field>
							<Field label="Contact number" required><Input value={f.mobile} onChange={set("mobile")} required data-testid="sr-mobile-input" /></Field>
							<Field label="Project / site address" required className="sm:col-span-2"><Input value={f.address} onChange={set("address")} required data-testid="sr-address-input" /></Field>
							<Field label="Lift reference (if known)"><Input value={f.lift_ref} onChange={set("lift_ref")} data-testid="sr-liftref-input" /></Field>
							<Field label="Issue type" required><NSelect value={f.issue_type} onChange={set("issue_type")} options={ISSUE_TYPES} data-testid="sr-issue-select" /></Field>
							<Field label="Priority"><NSelect value={f.priority} onChange={set("priority")} options={["Low", "Normal", "High", "Emergency"]} data-testid="sr-priority-select" /></Field>
							<Field label="Email"><Input type="email" value={f.email} onChange={set("email")} data-testid="sr-email-input" /></Field>
							<Field label="Issue description" required className="sm:col-span-2"><Textarea rows={4} value={f.description} onChange={set("description")} required minLength={5} data-testid="sr-description-input" /></Field>
							<Button type="submit" disabled={m.isPending} className="gold-btn h-11 sm:col-span-2" data-testid="sr-submit-btn">{m.isPending ? "Submitting…" : "Submit service request"}</Button>
						</form>
					)}
				</div>
			</Wrap>
		</>
	);
}

export function NotFound() {
	return <Wrap><p className="text-steel">Page not found. <Link to="/" className="text-gold">Go home</Link></p><X className="hidden" /></Wrap>;
}