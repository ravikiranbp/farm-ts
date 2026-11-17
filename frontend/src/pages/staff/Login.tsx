import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { apiPost } from "@/lib/api";
import { beginSession } from "@/lib/session";
import type { User } from "@/lib/types";
import { errMsg } from "@/lib/format";
import { Field } from "@/components/common";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function Login() {
	const nav = useNavigate();
	const [sp] = useSearchParams();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [err, setErr] = useState<string | null>(sp.get("expired") ? "You were signed out after a period of inactivity." : null);
	const m = useMutation({
		mutationFn: () => apiPost<User>("/auth/login", { email, password }),
		onSuccess: () => { beginSession(); nav(sp.get("next") || "/staff", { replace: true }); },
		onError: (e) => setErr(errMsg(e)),
	});
	const submit = (e: FormEvent) => { e.preventDefault(); setErr(null); m.mutate(); };
	return (
		<div className="grid min-h-screen bg-ink lg:grid-cols-2">
			<div className="relative hidden flex-col justify-between overflow-hidden border-r border-line p-12 lg:flex">
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_30%,rgba(214,162,58,0.16),transparent_60%)]" />
				<Link to="/" className="relative text-sm text-steel hover:text-gold">← Back to website</Link>
				<img src="/logo.jpeg" alt="V Tech Elevators" className="relative mx-auto w-80 rounded-2xl" />
				<p className="relative text-sm text-steel">Staff business console — leads, quotations, installations and service in one place.</p>
			</div>
			<div className="flex items-center justify-center p-6">
				<form onSubmit={submit} className="w-full max-w-sm space-y-5" data-testid="login-form">
					<img src="/logo.jpeg" alt="" className="mx-auto h-24 w-24 rounded-xl lg:hidden" />
					<div><p className="overline">Staff portal</p><h1 className="mt-2 font-heading text-3xl font-semibold">Sign in</h1>
						<p className="mt-1 text-sm text-steel">Use your individual employee account. Accounts must not be shared.</p></div>
					<Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="username" data-testid="login-email-input" /></Field>
					<Field label="Password"><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" data-testid="login-password-input" /></Field>
					{err && <p className="rounded-md border border-red-500/40 bg-red-500/10 p-2.5 text-sm text-red-300" data-testid="login-error">{err}</p>}
					<Button type="submit" disabled={m.isPending} className="gold-btn h-11 w-full font-semibold" data-testid="login-submit-btn">{m.isPending ? "Signing in…" : "Sign in"}</Button>
				</form>
			</div>
		</div>
	);
}