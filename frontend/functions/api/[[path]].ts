// Cloudflare Pages Function: forwards /api/* to the backend so the browser only ever sees this site's origin.
interface Env {
	API_ORIGIN: string; // e.g. https://vtech-api.onrender.com (no trailing slash) — never sent to the browser
	PROXY_SECRET: string; // same value as the backend's PROXY_SECRET; proves the request came through here
}

// Hosting-provider headers that would reveal the backend's address or platform.
const HIDDEN_RESPONSE_HEADERS = ["server", "x-render-origin-server", "rndr-id", "x-powered-by", "via", "alt-svc"];
// The app never returns these itself, so they mean the host is waking up or restarting and the request was not handled.
const RETRY_STATUSES = new Set([502, 503, 504]);
const RETRY_DELAYS_MS = [2000, 3000, 5000, 5000, 5000, 5000, 5000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
	if (!env.API_ORIGIN || !env.PROXY_SECRET) return new Response("Service is not configured", { status: 500 });

	const url = new URL(request.url);
	const target = new URL(url.pathname + url.search, env.API_ORIGIN);

	const headers = new Headers(request.headers);
	for (const h of ["host", "x-proxy-secret", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto"]) headers.delete(h);
	headers.set("x-proxy-secret", env.PROXY_SECRET);
	headers.set("x-forwarded-host", url.host);
	headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
	const clientIp = request.headers.get("cf-connecting-ip");
	if (clientIp) headers.set("x-forwarded-for", clientIp);

	const hasBody = request.method !== "GET" && request.method !== "HEAD";
	const body = hasBody ? await request.arrayBuffer() : undefined; // buffered so a retry can resend it
	const send = () => fetch(target.toString(), { method: request.method, headers, body, redirect: "manual" });

	let upstream: Response | null = null;
	for (let attempt = 0; ; attempt++) {
		try {
			upstream = await send();
			if (!RETRY_STATUSES.has(upstream.status)) break;
			await upstream.body?.cancel();
		} catch {
			upstream = null;
		}
		if (attempt >= RETRY_DELAYS_MS.length) break;
		await sleep(RETRY_DELAYS_MS[attempt]);
	}
	if (!upstream || RETRY_STATUSES.has(upstream.status)) {
		return Response.json({ detail: "Service is starting up. Please try again in a minute." }, { status: 503 });
	}

	const out = new Headers(upstream.headers);
	for (const h of HIDDEN_RESPONSE_HEADERS) out.delete(h);
	const location = out.get("location");
	if (location?.startsWith(env.API_ORIGIN)) out.set("location", url.origin + location.slice(env.API_ORIGIN.length));
	return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}
