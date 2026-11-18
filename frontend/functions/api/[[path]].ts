// Cloudflare Pages Function: forwards /api/* to the Cloud Run backend so the browser sees one origin.
interface Env {
	API_ORIGIN: string; // e.g. https://vtech-api-xxxxx-el.a.run.app (no trailing slash)
}

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
	if (!env.API_ORIGIN) return new Response("API_ORIGIN is not configured", { status: 500 });

	const url = new URL(request.url);
	const target = new URL(url.pathname + url.search, env.API_ORIGIN);

	const headers = new Headers(request.headers);
	headers.delete("host");
	headers.set("x-forwarded-host", url.host);
	headers.set("x-forwarded-proto", url.protocol.replace(":", ""));
	const clientIp = request.headers.get("cf-connecting-ip");
	if (clientIp) headers.set("x-forwarded-for", clientIp);

	const hasBody = request.method !== "GET" && request.method !== "HEAD";
	return fetch(target.toString(), {
		method: request.method,
		headers,
		body: hasBody ? request.body : undefined,
		redirect: "manual",
	});
}
