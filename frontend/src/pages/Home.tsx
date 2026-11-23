import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Wrench, ClipboardCheck, Clock } from "lucide-react";
import { usePublicContent } from "@/components/PublicLayout";
import EnquiryForm from "@/components/EnquiryForm";
import OfferOverlay from "@/components/OfferOverlay";

const HERO = "https://images.unsplash.com/photo-1573358575417-a421c842be5a?w=1600&q=80";

export default function Home() {
  const { data } = usePublicContent();
  const products = data?.products ?? [];
  const projects = data?.projects ?? [];
  return (
    <div>
      <OfferOverlay offer={data?.offer} />
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(214,162,58,0.14),transparent_55%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="rise-in flex flex-col justify-center">
            <p className="overline">Bengaluru · Lift installation, sales & service</p>
            <h1 className="mt-4 font-heading text-4xl font-bold leading-[1.08] text-white sm:text-5xl lg:text-6xl">
              Elevators engineered to <span className="gold-text">lift lives higher.</span>
            </h1>
            <p className="mt-5 max-w-xl text-base text-steel sm:text-lg">
              Home, passenger, hospital, goods and panoramic lifts — designed, installed and maintained by V Tech Elevators with transparent quotations and responsive after-sales care.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/quote" className="gold-btn rounded-md px-6 py-3 text-sm font-semibold" data-testid="hero-get-quote-btn">Get a Quote</Link>
              <Link to="/products" className="rounded-md border border-gold/50 px-6 py-3 text-sm font-semibold text-champagne transition-colors hover:bg-gold/10" data-testid="hero-explore-btn">Explore Lifts</Link>
              <Link to="/quote?type=inspection" className="rounded-md px-4 py-3 text-sm text-platinum underline-offset-4 hover:underline" data-testid="hero-inspection-btn">Book a free site inspection →</Link>
            </div>
            <div className="mt-10 grid max-w-lg grid-cols-3 gap-4 border-t border-line pt-6">
              {[["Free", "site inspection"], ["12 mo", "standard warranty"], ["AMC", "plans available"]].map(([a, b]) => (
                <div key={b}><div className="font-heading text-2xl font-semibold text-champagne">{a}</div><div className="text-xs text-steel">{b}</div></div>
              ))}
            </div>
          </div>
          <div className="relative">
            <img src={HERO} alt="Modern glass elevator interior" className="h-[380px] w-full rounded-2xl border border-line object-cover sm:h-[520px]" />
            <div className="absolute -bottom-5 left-4 right-4 rounded-xl border border-line bg-panel/90 p-4 backdrop-blur-md sm:left-auto sm:right-6 sm:w-72">
              <p className="overline">Quick callback</p>
              <p className="mt-1 text-sm text-steel">Leave your number — our team calls you back.</p>
              <Link to="/contact" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-gold">Request a callback <ArrowRight className="h-4 w-4" /></Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <div><p className="overline">Lift solutions</p><h2 className="mt-2 font-heading text-3xl font-semibold">Choose the right lift</h2></div>
          <Link to="/products" className="hidden text-sm text-gold sm:block">View catalogue →</Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {products.slice(0, 8).map((p, i) => (
            <Link key={p.id} to={`/products/${p.slug}`} data-testid={`home-product-card-${p.slug}`}
              className={`card-lift group overflow-hidden rounded-xl border border-line bg-panel ${i === 0 ? "lg:col-span-2 lg:row-span-2" : ""}`}>
              <img src={p.images[0]} alt={p.name} className={`w-full object-cover ${i === 0 ? "h-56 lg:h-[420px]" : "h-44"}`} loading="lazy" />
              <div className="p-4"><p className="text-[11px] uppercase tracking-wider text-champagne">{p.category}</p><h3 className="mt-1 font-heading text-lg font-semibold">{p.name}</h3>
                <p className="mt-1 line-clamp-2 text-sm text-steel">{p.description}</p></div>
            </Link>
          ))}
          {!products.length && <p className="text-sm text-steel">Catalogue is loading…</p>}
        </div>
      </section>

      <section className="border-y border-line bg-panel/60">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 py-14 sm:px-6 md:grid-cols-4">
          {[[ClipboardCheck, "Free site inspection", "Shaft, pit and overhead measured by our engineer."], [ShieldCheck, "Transparent quotations", "Item-wise pricing, taxes and terms in writing."],
            [Wrench, "Installation & handover", "Tracked stages from order to commissioning."], [Clock, "Service & AMC", "Preventive maintenance and breakdown support."]].map(([Icon, t, d]) => {
            const I = Icon as typeof ShieldCheck;
            return <div key={t as string}><I className="h-7 w-7 text-gold" /><h3 className="mt-3 font-heading font-semibold">{t as string}</h3><p className="mt-1 text-sm text-steel">{d as string}</p></div>;
          })}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
        <p className="overline">Previous projects</p><h2 className="mt-2 font-heading text-3xl font-semibold">Installed across Bengaluru</h2>
        <div className="mt-8 grid gap-5 md:grid-cols-3">
          {projects.slice(0, 3).map((p) => (
            <Link to="/projects" key={p.id} className="card-lift overflow-hidden rounded-xl border border-line bg-panel" data-testid="home-project-card">
              <img src={p.photos[0]} alt={p.name} className="h-52 w-full object-cover" loading="lazy" />
              <div className="p-4"><h3 className="font-heading font-semibold">{p.name}</h3><p className="text-sm text-steel">{p.location} · {p.floors} floors · {p.lift_category}</p></div>
            </Link>
          ))}
        </div>
      </section>

      {!!data?.testimonials.length && (
        <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
          <div className="grid gap-5 md:grid-cols-3">
            {data.testimonials.map((t) => (
              <figure key={t.id} className="rounded-xl border border-line bg-panel p-5" data-testid="testimonial-card">
                <blockquote className="text-sm text-platinum">“{t.quote}”</blockquote>
                <figcaption className="mt-3 text-xs text-champagne">{t.name} · <span className="text-steel">{t.role}</span></figcaption>
              </figure>
            ))}
          </div>
        </section>
      )}

      <section className="border-t border-line bg-[radial-gradient(ellipse_at_80%_0%,rgba(214,162,58,0.10),transparent_60%)]">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
          <div><p className="overline">Start your project</p><h2 className="mt-2 font-heading text-3xl font-semibold">Tell us about your building</h2>
            <p className="mt-3 text-steel">Get a reference number instantly. Our team will call you to understand your requirement and schedule a free site inspection.</p></div>
          <div className="rounded-xl border border-line bg-panel p-5 sm:p-6"><EnquiryForm type="enquiry" compact /></div>
        </div>
      </section>
    </div>
  );
}
