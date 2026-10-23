/**
 * Servidores · CLIENTE COOLIFY en solo lectura (CLF1020A; vértice `architecture/repos-libreria-1020d.md` §2).
 * Solo las dos rutas verificadas el 2026-10-20: `GET {url}/api/v1/teams/current` (sonda: de qué equipo es
 * el token) y `GET {url}/api/v1/servers`. Cabecera `Authorization: Bearer <token>` con el valor entero tal
 * cual (id|secreto). `fetch` y el reloj INYECTADOS, `redirect: "manual"` y tope de tiempo. NADA de
 * desplegar, arrancar ni parar: esas rutas no están verificadas y aquí no se prometen. El token nunca
 * aparece en un error ni en un registro.
 */

export const RUTA_EQUIPO = "/api/v1/teams/current", RUTA_SERVIDORES = "/api/v1/servers";
export const TIEMPO_MS = 15_000;
const SIN_DATO = "sin dato";

export interface PeticionCoolify { method: "GET"; headers: Record<string, string>; signal: AbortSignal; redirect: "manual" }
export interface RespuestaCoolify { ok: boolean; status: number; text(): Promise<string> }
export type FetchCoolify = (url: string, init: PeticionCoolify) => Promise<RespuestaCoolify>;
export interface DestinoCoolify { /** Base de la instancia, p. ej. «https://coolify.mi-red.org». */ url: string; /** Valor entero del token (id|secreto); nunca se registra. */ token: string }
export interface Reloj { ahora(): number; tras(ms: number): { promesa: Promise<void>; cancelar(): void } }
export interface OpcionesCoolify { reloj?: Reloj; tiempoMs?: number; registrar?: (linea: string) => void }

export type FalloCoolify = "config" | "red" | "tiempo" | "http" | "respuesta";
export interface ServidorCoolify { id: string; nombre: string; ip: string; descripcion: string }
export type ResultadoSonda =
  | { ok: true; equipoId: string; nombreEquipo: string; ms: number }
  | { ok: false; fallo: FalloCoolify; status?: number; motivo: string; ms: number };
export type ResultadoServidores =
  | { ok: true; servidores: ServidorCoolify[]; ms: number }
  | { ok: false; fallo: FalloCoolify; status?: number; motivo: string; ms: number };

export const RELOJ: Reloj = { ahora: () => Date.now(), tras: (ms) => { let id: ReturnType<typeof setTimeout> | undefined;
  return { promesa: new Promise<void>((r) => { id = setTimeout(r, ms); }), cancelar: () => clearTimeout(id) }; } };

const textoDe = (v: unknown): string => (typeof v === "string" && v.trim() !== "" ? v : SIN_DATO);
const idDe = (v: unknown): string => (typeof v === "number" && Number.isFinite(v) ? String(v) : textoDe(v));

/** Mapea SOLO los campos que vengan: lo que falte es «sin dato». Los que sobran, se ignoran. */
export function mapearServidor(d: Record<string, unknown>): ServidorCoolify {
  return { id: idDe(d.id ?? d.uuid), nombre: textoDe(d.name ?? d.nombre), ip: textoDe(d.ip), descripcion: textoDe(d.description ?? d.descripcion) };
}

/** Motivo en español si el destino no sirve; `null` si vale. Jamás devuelve el valor del token. */
export function validarDestino(d: DestinoCoolify): string | null {
  if (typeof d.url !== "string" || d.url.trim() === "") return "Falta la URL de la instancia de Coolify.";
  let base: URL;
  try { base = new URL(d.url.trim().replace(/\/+$/, "")); } catch { return "La URL de Coolify no es una dirección válida."; }
  if (base.protocol !== "http:" && base.protocol !== "https:") return "La URL de Coolify debe empezar por https:// (o http:// en red local).";
  if (typeof d.token !== "string" || d.token.trim() === "") return "Falta el token de Coolify (crea una integración en el panel y usa su valor entero id|secreto).";
  return null;
}

function normalizar(url: string): string { return url.trim().replace(/\/+$/, ""); }

/** Traduce un estado HTTP al motivo honesto en español; `texto` (ya tapado) solo entra si conviene. */
export function motivoPorEstado(status: number, texto: string): string {
  if (status === 401) return "El token de Coolify no es válido: crea una integración nueva y pega su valor entero.";
  if (status === 403) return "Coolify deniega la llamada: sin permiso o tu IP no está en la lista permitida de esta instancia.";
  if (status === 404) return `Coolify no tiene esa ruta: un administrador debe encender la API de Coolify. (${texto})`;
  if (status >= 300 && status < 400) return `Redirección no seguida (redirect: manual): Coolify respondió ${status}.`;
  return `Coolify respondió ${status}: ${texto.slice(0, 120)}`;
}

/** GET con Bearer, redirect manual y tope de tiempo; clasifica 401/403/404 y devuelve el JSON si llega. */
async function pedir(ruta: string, d: DestinoCoolify, f: FetchCoolify, o: OpcionesCoolify): Promise<{ ok: true; estado: number; datos: Record<string, unknown> | unknown[]; ms: number } | { ok: false; fallo: FalloCoolify; status?: number; motivo: string; ms: number }> {
  const reloj = o.reloj ?? RELOJ, t0 = reloj.ahora(), tiempoMs = o.tiempoMs ?? TIEMPO_MS, tap = (s: string) => s.split(d.token).join("•••");
  const malo = validarDestino(d);
  if (malo) return { ok: false, fallo: "config", motivo: malo, ms: reloj.ahora() - t0 };
  const ctl = new AbortController(), plazo = reloj.tras(tiempoMs);
  const vencido = () => { ctl.abort(); return { ok: false as const, fallo: "tiempo" as const, motivo: `La instancia de Coolify no respondió en ${tiempoMs / 1000} s.`, ms: reloj.ahora() - t0 }; };
  try {
    const r = await Promise.race([f(`${normalizar(d.url)}${ruta}`, { method: "GET", headers: { accept: "application/json", authorization: `Bearer ${d.token}` }, signal: ctl.signal, redirect: "manual" }), plazo.promesa.then(vencido)]);
    if ("fallo" in r) return r;
    const texto = tap(await r.text());
    if (!r.ok) { o.registrar?.(`Coolify ${ruta} · ${r.status}`); return { ok: false, fallo: "http", status: r.status, motivo: motivoPorEstado(r.status, texto.slice(0, 160)), ms: reloj.ahora() - t0 }; }
    let datos: unknown[] | Record<string, unknown>;
    try { const brutos: unknown = JSON.parse(texto); if (typeof brutos !== "object" || brutos === null) throw new Error("escalar");
      datos = brutos as unknown[] | Record<string, unknown>; } catch { return { ok: false, fallo: "respuesta", motivo: "La respuesta de Coolify no es JSON.", ms: reloj.ahora() - t0 }; }
    o.registrar?.(`Coolify ${ruta} · ${r.status}`);
    return { ok: true, estado: r.status, datos, ms: reloj.ahora() - t0 };
  } catch (e) {
    const porTiempo = () => ({ ok: false as const, fallo: "tiempo" as const, motivo: `La instancia de Coolify no respondió en ${tiempoMs / 1000} s.`, ms: reloj.ahora() - t0 });
    if (ctl.signal.aborted) return porTiempo();
    o.registrar?.(`Coolify ${ruta} · sin respuesta`);
    return { ok: false, fallo: "red", motivo: `La instancia de Coolify no contesta (${e instanceof Error ? e.message.slice(0, 80) : "error de red"}).`, ms: reloj.ahora() - t0 };
  } finally { plazo.cancelar(); }
}

export async function sondear(d: DestinoCoolify, f: FetchCoolify, o: OpcionesCoolify = {}): Promise<ResultadoSonda> {
  const r = await pedir(RUTA_EQUIPO, d, f, o);
  if (!r.ok) return r;
  const datos = r.datos as Record<string, unknown>;
  if (typeof datos !== "object" || Array.isArray(datos)) return { ok: false, fallo: "respuesta", motivo: "La sonda no devolvió un equipo: respuesta inesperada.", ms: r.ms };
  return { ok: true, equipoId: idDe(datos.id ?? datos.uuid), nombreEquipo: textoDe(datos.name ?? datos.nombre), ms: r.ms };
}

/** Lista los servidores que Coolify conozca: acepta un array o `{ data: [...] }`; nunca manda acciones. */
export async function listarServidores(d: DestinoCoolify, f: FetchCoolify, o: OpcionesCoolify = {}): Promise<ResultadoServidores> {
  const r = await pedir(RUTA_SERVIDORES, d, f, o);
  if (!r.ok) return r;
  const lista = Array.isArray(r.datos) ? r.datos : Array.isArray((r.datos as { data?: unknown[] }).data) ? (r.datos as { data: unknown[] }).data : null;
  if (lista === null) return { ok: false, fallo: "respuesta", motivo: "La respuesta de servidores no traía una lista.", ms: r.ms };
  const servidores = lista.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x)).map(mapearServidor);
  return { ok: true, servidores, ms: r.ms };
}
