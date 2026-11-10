/**
 * GET /api/astraura/modelos-fuentes?u=<url> — lector de las dos fuentes públicas del catálogo de modelos
 * (MOD1110A): la biblioteca de Ollama y el índice de capacidades de Epoch AI. El navegador no puede leerlas
 * directamente (CORS), así que este puente same-origin las trae. LISTA CERRADA: solo las URLs que
 * `urlPermitida` acepta (nada de APIs de terceros ni puertos; de las comunidades, solo las páginas de los publicadores de la lista cerrada de las variantes sin filtros); sin redirecciones; con tope de tamaño.
 */
import { urlPermitida } from "@/lib/astraura/modelos/actualizar-catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOPE_BYTES = 4 * 1024 * 1024;

export async function GET(peticion: Request): Promise<Response> {
  const u = new URL(peticion.url).searchParams.get("u") ?? "";
  if (!urlPermitida(u)) return Response.json({ error: "fuente-no-permitida" }, { status: 400 });
  try {
    const r = await fetch(u, {
      redirect: "manual",
      headers: { "user-agent": "StarSeedOS-catalogo-modelos", accept: "text/html,text/csv,*/*" },
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    });
    if (!r.ok) return Response.json({ error: "fuente-no-disponible", estado: r.status }, { status: 502 });
    const largo = Number(r.headers.get("content-length") ?? 0);
    if (largo > TOPE_BYTES) return Response.json({ error: "fuente-demasiado-grande" }, { status: 502 });
    const texto = await r.text();
    if (texto.length > TOPE_BYTES) return Response.json({ error: "fuente-demasiado-grande" }, { status: 502 });
    return new Response(texto, { status: 200, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "private, max-age=3600" } });
  } catch {
    return Response.json({ error: "fuente-sin-respuesta" }, { status: 502 });
  }
}
