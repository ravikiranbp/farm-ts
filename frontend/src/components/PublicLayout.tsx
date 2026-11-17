import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Menu, Phone, Mail, MessageCircle, MapPin } from "lucide-react";
import { apiGet } from "@/lib/api";
import type { PublicContent } from "@/lib/types";
import { Logo } from "@/components/common";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export const FALLBACK_COMPANY = {
	company_name: "V Tech Elevators", tagline: "Lifting Lives Higher", city: "Bengaluru", address: "Bengaluru, Karnataka, India",
	phone: "+91 90000 00000", whatsapp: "919000000000", email: "info@vtechelevators.in",
	about: "V Tech Elevators designs, installs and maintains lifts across Bengaluru.",
};

export function usePublicContent() {
	return useQuery({ queryKey: ["public-content"], queryFn: () => apiGet<PublicContent>("/public/content"), staleTime: 60_000 });
}

const NAV = [
	["/products", "Lift Solutions"], ["/projects", "Projects"], ["/services", "Services & AMC"],
	["/brochures", "Brochures"], ["/about", "About"], ["/faqs", "FAQs"], ["/contact", "Contact"],
];

export default function PublicLayout() {
	const { data } = usePublicContent();
	const c = data?.company ?? FALLBACK_COMPANY;
	const [open, setOpen] = useState(false);
	const linkCls = ({ isActive }: { isActive: boolean }) => cn("text-sm transition-colors hover:text-champagne", isActive ? "text-gold" : "text-platinum/85");
	return (
		<div className="min-h-screen bg-ink text-platinum">
			<header className="sticky top-0 z-40 border-b border-line/80 bg-ink/85 backdrop-blur-xl">
				<div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
					<Link to="/" data-testid="header-home-link"><Logo /></Link>
					<nav className="hidden items-center gap-6 lg:flex">
						{NAV.map(([to, l]) => <NavLink key={to} to={to} className={linkCls} data-testid={`nav-${to.slice(1)}`}>{l}</NavLink>)}
					</nav>
					<div className="flex items-center gap-2">
						<Link to="/quote" className="gold-btn hidden rounded-md px-4 py-2 text-sm font-semibold sm:inline-block" data-testid="header-get-quote-btn">Get a Quote</Link>
						<Sheet open={open} onOpenChange={setOpen}>
							<SheetTrigger className="rounded-md p-2 lg:hidden" data-testid="mobile-menu-btn" aria-label="Open menu"><Menu className="h-5 w-5" /></SheetTrigger>
							<SheetContent side="right" className="bg-panel">
								<SheetTitle className="px-4 pt-4"><Logo /></SheetTitle>
								<div className="flex flex-col gap-4 p-4">
									{NAV.map(([to, l]) => <NavLink key={to} to={to} onClick={() => setOpen(false)} className={linkCls}>{l}</NavLink>)}
									<Link to="/quote" onClick={() => setOpen(false)} className="gold-btn rounded-md px-4 py-2 text-center text-sm font-semibold">Get a Quote</Link>
									<Link to="/service-request" onClick={() => setOpen(false)} className="text-sm text-steel">Service request</Link>
									<Link to="/login" onClick={() => setOpen(false)} className="text-sm text-steel">Staff login</Link>
								</div>
							</SheetContent>
						</Sheet>
					</div>
				</div>
			</header>
			<main><Outlet /></main>
			<footer className="border-t border-line bg-[#080A10]">
				<div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-4">
					<div className="md:col-span-2">
						<img src="/logo.jpeg" alt="V Tech Elevators" className="h-28 w-28 rounded-lg object-cover" />
						<p className="mt-4 max-w-md text-sm text-steel">{c.about}</p>
					</div>
					<div className="space-y-2 text-sm">
						<p className="overline mb-3">Explore</p>
						{[ ["/products", "Lift catalogue"], ["/projects", "Completed projects"], ["/services", "Installation & AMC"], ["/quote?type=inspection", "Free site inspection"], ["/service-request", "Service request"], ["/login", "Staff login"]].map(([to, l]) => (
							<Link key={to} to={to} className="block text-steel hover:text-champagne">{l}</Link>
						))}
					</div>
					<div className="space-y-3 text-sm" data-testid="footer-contact">
						<p className="overline mb-3">Contact</p>
						<a href={`tel:${c.phone}`} className="flex items-center gap-2 text-steel hover:text-champagne"><Phone className="h-4 w-4 text-gold" />{c.phone}</a>
						<a href={`mailto:${c.email}`} className="flex items-center gap-2 text-steel hover:text-champagne"><Mail className="h-4 w-4 text-gold" />{c.email}</a>
						<a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-steel hover:text-champagne"><MessageCircle className="h-4 w-4 text-gold" />WhatsApp us</a>
						<p className="flex items-start gap-2 text-steel"><MapPin className="mt-0.5 h-4 w-4 text-gold" />{c.address}</p>
					</div>
				</div>
				<div className="border-t border-line py-5 text-center text-xs text-steel">© {new Date().getFullYear()} {c.company_name} · {c.tagline}</div>
			</footer>
			<a href={`https://wa.me/${c.whatsapp}`} target="_blank" rel="noreferrer" data-testid="floating-whatsapp-btn" aria-label="Chat on WhatsApp"
				className="fixed bottom-5 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-gold text-ink shadow-lg transition-transform hover:scale-105">
				<MessageCircle className="h-5 w-5" />
			</a>
			<Toaster richColors />
		</div>
	);
}