// Cloudflare Pages Function: forwards /api/* to the backend so the browser only ever sees this site's origin.
interface Env {
	API_ORIGIN: string; // e.g. https://vtech-api.onrender.com (no trailing slash) — never sent to the browser
	PROXY_SECRET: string; // same value as the backend's PROXY_SECRET; proves the request came through here
}

// Hosting-provider headers that would reveal the backend's address or platform.
const HIDDEN_RESPONSE_HEADERS = ["server", "x-render-origin-server", "rndr-id", "x-powered-by", "via", "alt-svc"];

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
	const upstream = await fetch(target.toString(), {
		method: request.method,
		headers,
		body: hasBody ? request.body : undefined,
		redirect: "manual",
	});

	const out = new Headers(upstream.headers);
	for (const h of HIDDEN_RESPONSE_HEADERS) out.delete(h);
	const location = out.get("location");
	if (location?.startsWith(env.API_ORIGIN)) out.set("location", url.origin + location.slice(env.API_ORIGIN.length));
	return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}
