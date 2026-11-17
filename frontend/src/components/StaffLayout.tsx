import { useEffect, useState } from "react";
import { Link, NavLink, Navigate, Outlet, useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
	LayoutDashboard, Users, PhoneCall, CalendarClock, Ruler, FileText, Package, Wrench, BarChart3, Bell,
	UserCog, ScrollText, Globe, Settings, LogOut, Menu, CheckSquare,
} from "lucide-react";
import { ApiError, apiGet } from "@/lib/api";
import { endSession } from "@/lib/session";
import type { Notification, Role, User } from "@/lib/types";
import { Logo } from "@/components/common";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export function useMe() {
	return useQuery({ queryKey: ["me"], queryFn: () => apiGet<User>("/auth/me"), retry: false, staleTime: 60_000 });
}

const NAV: [string, string, typeof Users, Role[]][] = [
	["/staff", "Dashboard", LayoutDashboard, ["admin", "manager", "telecaller"]],
	["/staff/leads", "Leads", PhoneCall, ["admin", "manager", "telecaller"]],
	["/staff/approvals", "Approvals", CheckSquare, ["admin", "manager"]],
	["/staff/followups", "Follow-ups", CalendarClock, ["admin", "manager", "telecaller"]],
	["/staff/customers", "Customers", Users, ["admin", "manager", "telecaller"]],
	["/staff/inspections", "Site Inspections", Ruler, ["admin", "manager", "telecaller"]],
	["/staff/quotations", "Quotations", FileText, ["admin", "manager", "telecaller"]],
	["/staff/orders", "Orders & Installations", Package, ["admin", "manager", "telecaller"]],
	["/staff/service", "Service & AMC", Wrench, ["admin", "manager", "telecaller"]],
	["/staff/reports", "Reports", BarChart3, ["admin", "manager"]],
	["/staff/notifications", "Notifications", Bell, ["admin", "manager", "telecaller"]],
	["/staff/employees", "Employees", UserCog, ["admin"]],
	["/staff/audit", "Activity Logs", ScrollText, ["admin", "manager", "telecaller"]],
	["/staff/content", "Website Content", Globe, ["admin"]],
	["/staff/settings", "Settings & Backup", Settings, ["admin"]],
];

function Nav({ role, onNav }: { role: Role; onNav?: () => void }) {
	return (
		<nav className="flex flex-col gap-0.5 p-3">
			{NAV.filter((n) => n[3].includes(role)).map(([to, label, Icon]) => (
				<NavLink key={to} to={to} end={to === "/staff"} onClick={onNav} data-testid={`sidebar-${label.toLowerCase().replace(/[^a-z]+/g, "-")}`}
					className={({ isActive }) => cn("flex items-center gap-3 rounded-md border-l-2 px-3 py-2 text-sm transition-colors",
						isActive ? "border-gold bg-gold/12 text-champagne" : "border-transparent text-[#8F97A6] hover:bg-elev hover:text-platinum")}>
					<Icon className="h-4 w-4" />{label}
				</NavLink>
			))}
		</nav>
	);
}

export default function StaffLayout() {
	const { data: me, error, isLoading } = useMe();
	const loc = useLocation();
	const [open, setOpen] = useState(false);
	const { data: notes } = useQuery({ queryKey: ["notifications"], queryFn: () => apiGet<{ items: Notification[]; unread: number }>("/notifications"), enabled: !!me, refetchInterval: 60_000 });

	// Client-side inactivity logout mirrors the server-side session timeout.
	useEffect(() => {
		if (!me) return;
		let t: ReturnType<typeof setTimeout>;
		const reset = () => { clearTimeout(t); t = setTimeout(() => endSession("/login?expired=1"), 30 * 60_000); };
		const evs = ["mousemove", "keydown", "click", "touchstart"];
		evs.forEach((e) => window.addEventListener(e, reset));
		reset();
		return () => { clearTimeout(t); evs.forEach((e) => window.removeEventListener(e, reset)); };
	}, [me]);

	if (isLoading) return <div className="flex min-h-screen items-center justify-center bg-ink text-steel">Loading…</div>;
	if (error instanceof ApiError && error.status === 401) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
	if (!me) return <div className="flex min-h-screen items-center justify-center bg-ink text-steel">Unable to reach the server. <Link to="/login" className="ml-2 text-gold">Sign in</Link></div>;

	return (
		<div className="flex min-h-screen bg-ink text-platinum">
			<aside className="hidden w-60 shrink-0 border-r border-line bg-sidebar lg:block">
				<div className="sticky top-0 h-screen overflow-y-auto">
					<div className="border-b border-line p-4"><Link to="/staff"><Logo /></Link></div>
					<Nav role={me.role} />
				</div>
			</aside>
			<div className="flex min-w-0 flex-1 flex-col">
				<header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-line bg-ink/90 px-4 backdrop-blur-md sm:px-6">
					<Sheet open={open} onOpenChange={setOpen}>
						<SheetTrigger className="rounded-md p-1.5 lg:hidden" data-testid="staff-mobile-menu-btn" aria-label="Menu"><Menu className="h-5 w-5" /></SheetTrigger>
						<SheetContent side="left" className="w-64 bg-sidebar p-0"><SheetTitle className="border-b border-line p-4"><Logo /></SheetTitle><Nav role={me.role} onNav={() => setOpen(false)} /></SheetContent>
					</Sheet>
					<div className="hidden text-xs text-steel sm:block">V Tech Elevators · Business Console</div>
					<div className="flex items-center gap-3">
						<Link to="/staff/notifications" className="relative rounded-md p-1.5 hover:bg-elev" data-testid="header-notifications-btn" aria-label="Notifications">
							<Bell className="h-5 w-5" />
							{!!notes?.unread && <span className="absolute -right-0.5 -top-0.5 rounded-full bg-gold px-1.5 text-[10px] font-bold text-ink" data-testid="notification-count">{notes.unread}</span>}
						</Link>
						<div className="text-right leading-tight"><div className="text-sm" data-testid="current-user-name">{me.name}</div><div className="text-[10px] uppercase tracking-wider text-champagne" data-testid="current-user-role">{me.role}</div></div>
						<button onClick={() => endSession("/login")} className="rounded-md p-1.5 text-steel hover:bg-elev hover:text-platinum" data-testid="logout-btn" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
					</div>
				</header>
				<main className="min-w-0 flex-1 p-4 sm:p-6"><Outlet context={me} /></main>
			</div>
			<Toaster richColors />
		</div>
	);
}