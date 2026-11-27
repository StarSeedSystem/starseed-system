/* /api/spotify — Spotify con la cuenta de cada persona (NFC1126M · §11).
 * Sin claves en el repo: usa SPOTIFY_CLIENT_ID (PKCE, sin secreto) y el token
 * del usuario, que llega en `Authorization: Bearer` y nunca se guarda ni se registra.
 *   GET ?accion=autorizar&desafio=…&estado=…&redirect=…  → { url }
 *   GET ?accion=estado&neurona=…  → { premium, aparatos, cola, fuentes, enlaces }
 *     `fuentes`: la cola como FuenteAudio de la sala (aportadas por `neurona`);
 *     sin Premium, `enlaces`: la URL abrible de cada pista
 *   POST { accion: AccionSpotify } → control (solo Premium; si no, 403 con el motivo)
 */
import { NextResponse } from "next/server";

import {
  API_SPOTIFY,
  construirUrlAutorizacion,
  enlaceDePista,
  esPremium,
  fuenteDesdePista,
  interpretarCola,
  interpretarDispositivos,
  planControl,
  type AccionSpotify,
  type PistaSpotify,
  type PeticionSpotify,
} from "@/lib/sala-sonido/spotify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const token = (req: Request): string | null => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;

async function llamar(t: string, p: { metodo?: string; ruta: string; consulta?: Record<string, string>; cuerpo?: unknown }): Promise<Response> {
  const q = p.consulta ? `?${new URLSearchParams(p.consulta).toString()}` : "";
  return fetch(`${API_SPOTIFY}${p.ruta}${q}`, {
    method: p.metodo ?? "GET",
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json" },
    body: p.cuerpo ? JSON.stringify(p.cuerpo) : undefined,
    signal: AbortSignal.timeout(8000),
  });
}

const leer = async (r: Response): Promise<unknown> => (r.ok ? r.json().catch(() => null) : null);

export async function GET(req: Request): Promise<Response> {
  const u = new URL(req.url);
  if (u.searchParams.get("accion") === "autorizar") {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const desafio = u.searchParams.get("desafio");
    const estado = u.searchParams.get("estado");
    const redirectUri = u.searchParams.get("redirect");
    if (!clientId) return NextResponse.json({ error: "Spotify no está configurado en este servidor." }, { status: 503 });
    if (!desafio || !estado || !redirectUri) return NextResponse.json({ error: "Faltan datos." }, { status: 400 });
    return NextResponse.json({ url: construirUrlAutorizacion({ clientId, redirectUri, estado, desafio }) });
  }
  const t = token(req);
  if (!t) return NextResponse.json({ error: "Inicia sesión en Spotify." }, { status: 401 });
  const [perfil, aparatos, colaRes] = await Promise.all([
    llamar(t, { ruta: "/me" }),
    llamar(t, { ruta: "/me/player/devices" }),
    llamar(t, { ruta: "/me/player/queue" }),
  ]);
  if (perfil.status === 401) return NextResponse.json({ error: "La sesión de Spotify caducó." }, { status: 401 });
  const p = (await leer(perfil)) as { product?: string } | null;
  const premium = esPremium(p?.product);
  const neurona = u.searchParams.get("neurona") || "spotify";
  const cola = interpretarCola(await leer(colaRes));
  const pistas: PistaSpotify[] = [...(cola.sonando ? [cola.sonando] : []), ...cola.siguientes];
  return NextResponse.json({
    premium,
    ...(premium ? {} : { aviso: "Sin Premium solo se ofrecen enlaces: Spotify no permite controlar la reproducción." }),
    aparatos: interpretarDispositivos(await leer(aparatos)),
    cola,
    fuentes: pistas.map((x) => fuenteDesdePista(x, neurona)),
    ...(premium ? {} : { enlaces: pistas.map((x) => ({ uri: x.uri, url: enlaceDePista(x.uri) })) }),
  });
}

export async function POST(req: Request): Promise<Response> {
  const t = token(req);
  if (!t) return NextResponse.json({ error: "Inicia sesión en Spotify." }, { status: 401 });
  const cuerpo = (await req.json().catch(() => null)) as { accion?: AccionSpotify } | null;
  if (!cuerpo?.accion?.tipo) return NextResponse.json({ error: "Falta la acción." }, { status: 400 });
  const perfil = (await leer(await llamar(t, { ruta: "/me" }))) as { product?: string } | null;
  const plan = planControl(perfil?.product, cuerpo.accion);
  if (!plan.permitido || !plan.peticion) {
    return NextResponse.json({ error: plan.motivo, soloEnlaces: plan.soloEnlaces === true }, { status: 403 });
  }
  const pet: PeticionSpotify = plan.peticion;
  const r = await llamar(t, pet);
  return NextResponse.json({ ok: r.ok }, { status: r.ok ? 200 : 502 });
}
