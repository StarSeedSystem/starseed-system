// Proxy de servidor para bots invitados AG-UI (BOT1011N · contrato architecture/astraura-bots.md §11). SOLO SERVIDOR
// (`node:*`, `undici`): ningún componente lo importa; lo usa `api/bots/invitado`. Guardia de `security/ssrf.ts`, más
// estricta: solo https y NUNCA red privada, local ni metadatos; cada redirección se revalida y la conexión se fija a la IP
// ya validada (sin DNS-rebinding). La cabecera se lee por NOMBRE, nunca vuelve al cliente y del registro solo su longitud.
import { promises as dns, type LookupAddress, type LookupOptions } from "node:dns";
import { randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { Agent, type Dispatcher } from "undici";
import type { AlcanceMemoria, FragmentoMemoria } from "@/lib/nucleo/alcance-memoria";
import { BLOCKED_HOSTNAMES, MAX_REDIRECTS, classifyIp, stripSensitiveHeaders } from "@/lib/security/ssrf";
import { tieneSecreto } from "../acciones";

export const TIEMPO_LIMITE_MS = 60_000, TOPE_BYTES = 1024 * 1024, MAX_MENSAJES = 50, MAX_TEXTO_MENSAJE = 20_000;
export const ALCANCES_PASABLES: readonly AlcanceMemoria[] = ["grupo", "publica"]; // nunca personal ni perfil; sin alcance claro, tampoco
export const PATRON_CABECERA = /^STARSEED_BOT_INVITADO_[A-Z0-9_]{1,48}$/; // nunca otra clave del servidor
export interface DireccionIp { address: string; family: 4 | 6 }
export type Resolver = (host: string) => Promise<DireccionIp[]>;
export type EndpointValidado = { ok: true; url: URL; ip: DireccionIp } | { ok: false; error: string };
export type Pedir = (url: URL, init: { method: "POST"; headers: Record<string, string>; body: string; signal: AbortSignal }, ip: DireccionIp) => Promise<Response>;
export interface MensajeAgUi { id: string; role: "user" | "assistant"; content: string }
export interface CabeceraGuardada { valor: string; origen: string } // valor completo de `Authorization` y su ÚNICO origen
export interface RegistroTurno { host: string; status: number; cabecera: { nombre: string; longitud: number } | null }
export interface EntradaTurno { endpoint: string; mensajes: MensajeAgUi[]; contextoPermitido: FragmentoMemoria[]; cabecera?: string; cuentaId?: string; hiloId?: string } // `cabecera`: NOMBRE de la variable, nunca su valor
export interface DepInvitado { resolver: Resolver; pedir: Pedir; registrar: (r: RegistroTurno) => void; nuevoId: () => string;
  leerCabecera: (nombre: string, cuentaId?: string) => CabeceraGuardada | null; tiempoLimiteMs: number; topeBytes: number }
export type ResultadoTurno = { ok: true; status: number; flujo: ReadableStream<Uint8Array> } | { ok: false; status: number; error: string };
const resolverDns: Resolver = async (host) => (await dns.lookup(host, { all: true })).map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
/** Conecta a la IP ya validada: undici no vuelve a preguntar al DNS (Host y SNI siguen siendo el nombre). */
const pedirFijado: Pedir = (url, init, ip) => {
  const lookup = (_h: string, o: LookupOptions, cb: (e: null, a: string | LookupAddress[], f?: number) => void) =>
    o?.all ? cb(null, [{ address: ip.address, family: ip.family }]) : cb(null, ip.address, ip.family);
  const opciones: RequestInit & { dispatcher: Dispatcher } = { ...init, redirect: "manual", cache: "no-store", dispatcher: new Agent({ connect: { lookup } }) };
  return fetch(url.toString(), opciones);
};

/** Cabecera de la bóveda del servidor por NOMBRE, ligada a su origen (`<NOMBRE>_ORIGEN`). */
export function cabeceraDelEntorno(nombre: string, entorno: Record<string, string | undefined> = process.env): CabeceraGuardada | null {
  if (!PATRON_CABECERA.test(nombre) || nombre.endsWith("_ORIGEN")) return null;
  const valor = entorno[nombre]?.trim();
  try { return valor ? { valor, origen: new URL(entorno[`${nombre}_ORIGEN`] ?? "").origin } : null; } catch { return null; }
}
const DEFECTO: DepInvitado = { resolver: resolverDns, pedir: pedirFijado, nuevoId: randomUUID, leerCabecera: (n) => cabeceraDelEntorno(n),
  registrar: (r) => console.info("[bots/invitado]", JSON.stringify(r)), tiempoLimiteMs: TIEMPO_LIMITE_MS, topeBytes: TOPE_BYTES };
export async function validarEndpoint(entrada: string | URL, resolver: Resolver = resolverDns): Promise<EndpointValidado> {
  const no = (error: string): EndpointValidado => ({ ok: false, error });
  let url: URL; try { url = new URL(String(entrada)); } catch { return no("La dirección del bot invitado no es válida."); }
  if (url.protocol !== "https:" || url.username || url.password) return no("Solo se aceptan bots invitados por https y sin usuario ni contraseña en la dirección.");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || BLOCKED_HOSTNAMES.has(host)) return no("Esa dirección es de metadatos del servidor: no se permite.");
  let ips: DireccionIp[]; try { ips = isIP(host) ? [{ address: host, family: isIP(host) === 6 ? 6 : 4 }] : await resolver(host); } catch { return no("No se pudo resolver la dirección del bot invitado."); }
  if (!ips.length || ips.some((ip) => classifyIp(ip.address) !== "public")) return no("La dirección apunta a una red privada, local o de metadatos (o no resuelve): no se permite.");
  return { ok: true, url, ip: ips[0] };
}

function mensajesValidos(m: unknown): MensajeAgUi[] | string {
  if (!Array.isArray(m) || !m.length || m.length > MAX_MENSAJES) return `Hacen falta entre 1 y ${MAX_MENSAJES} mensajes.`;
  const lista = m as MensajeAgUi[];
  if (lista.some((x) => !x || (x.role !== "user" && x.role !== "assistant") || typeof x.id !== "string" || typeof x.content !== "string" || x.content.length > MAX_TEXTO_MENSAJE)) return "Mensaje con forma inválida o de más de 20 000 caracteres.";
  if (lista.some((x) => tieneSecreto(x.content))) return "Un mensaje lleva algo con forma de clave o de ruta del disco: no sale hacia un invitado.";
  return lista.map(({ id, role, content }) => ({ id, role, content }));
}

/** Pasa el flujo tal cual hasta el tope; si se corta, cierra con un RUN_ERROR de AG-UI legible. */
function acotarFlujo(origen: ReadableStream<Uint8Array>, tope: number, ctrl: AbortController, reloj: ReturnType<typeof setTimeout>): ReadableStream<Uint8Array> {
  const lector = origen.getReader();
  let total = 0;
  const fin = (c: ReadableStreamDefaultController<Uint8Array>, motivo?: string) => {
    clearTimeout(reloj);
    if (motivo) { ctrl.abort(); lector.cancel().catch(() => undefined); c.enqueue(new TextEncoder().encode(`\n\ndata: ${JSON.stringify({ type: "RUN_ERROR", message: motivo })}\n\n`)); }
    c.close();
  };
  return new ReadableStream<Uint8Array>({
    async pull(c) {
      const r = await lector.read().catch(() => null);
      if (!r) return fin(c, ctrl.signal.aborted ? "El bot invitado superó el tiempo límite de 60 s." : "Se cortó el flujo del bot invitado.");
      if (r.done) return fin(c);
      if ((total += r.value.byteLength) <= tope) return c.enqueue(r.value);
      fin(c, "El bot invitado superó el tope de 1 MB por turno: se cortó.");
    },
    cancel() { clearTimeout(reloj); ctrl.abort(); return lector.cancel().catch(() => undefined); },
  });
}

export async function reenviarTurno(e: EntradaTurno, dep: Partial<DepInvitado> = {}): Promise<ResultadoTurno> {
  const d: DepInvitado = { ...DEFECTO, ...dep }, ctx = Array.isArray(e.contextoPermitido) ? e.contextoPermitido : [];
  const fallo = (status: number, error: string): ResultadoTurno => ({ ok: false, status, error });
  const vetado = ctx.length > MAX_MENSAJES || ctx.some((f) => !f || typeof f.texto !== "string" || f.texto.length > MAX_TEXTO_MENSAJE
    || !ALCANCES_PASABLES.includes(f.alcance) || tieneSecreto(`${f.origen ?? ""} ${f.texto}`));
  if (vetado) return fallo(400, `A un bot invitado solo le llegan hasta ${MAX_MENSAJES} fragmentos de grupo o públicos y sin forma de clave: nunca memoria personal ni del perfil.`);
  const mensajes = mensajesValidos(e.mensajes);
  if (typeof mensajes === "string") return fallo(400, mensajes);
  const v = await validarEndpoint(e.endpoint, d.resolver);
  if (!v.ok) return fallo(400, v.error);
  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" };
  const registro: RegistroTurno = { host: v.url.host, status: 0, cabecera: null };
  const c = e.cabecera ? d.leerCabecera(e.cabecera, e.cuentaId) : null;
  if (e.cabecera && (!c || c.origen !== v.url.origin)) return fallo(400, "La cabecera guardada no existe o no está ligada a la dirección de este bot.");
  if (e.cabecera && c) { headers.Authorization = c.valor; registro.cabecera = { nombre: e.cabecera, longitud: c.valor.length }; }
  const body = JSON.stringify({ threadId: e.hiloId || d.nuevoId(), runId: d.nuevoId(), messages: mensajes, tools: [], state: {},
    context: ctx.map((f) => ({ description: String(f.origen ?? "contexto").slice(0, 120), value: f.texto })), forwardedProps: {} });
  const ctrl = new AbortController(), reloj = setTimeout(() => ctrl.abort(), d.tiempoLimiteMs);
  const cortar = (status: number, error: string): ResultadoTurno => { clearTimeout(reloj); ctrl.abort(); d.registrar({ ...registro, status }); return fallo(status, error); };
  try {
    for (let saltos = 0, url = v.url, ip = v.ip; ; saltos++) {
      const res = await d.pedir(url, { method: "POST", headers, body, signal: ctrl.signal }, ip);
      const destino = res.headers.get("location");
      if ((res.status === 307 || res.status === 308) && destino) { // solo estas conservan el POST del turno
        await res.body?.cancel().catch(() => undefined);
        if (saltos >= MAX_REDIRECTS) return cortar(502, "Demasiadas redirecciones del bot invitado.");
        const sig = await validarEndpoint(new URL(destino, url), d.resolver);
        if (!sig.ok) return cortar(502, `El bot invitado redirigió a un destino no permitido: ${sig.error}`);
        if (sig.url.origin !== url.origin) stripSensitiveHeaders(headers);
        url = sig.url; ip = sig.ip; continue;
      }
      if (!res.ok || !res.body) { await res.body?.cancel().catch(() => undefined); return cortar(502, `El bot invitado respondió ${res.status}.`); }
      d.registrar({ ...registro, status: res.status });
      return { ok: true, status: res.status, flujo: acotarFlujo(res.body, d.topeBytes, ctrl, reloj) };
    }
  } catch { return ctrl.signal.aborted ? cortar(504, "El bot invitado no respondió en 60 s.") : cortar(502, "No se pudo contactar con el bot invitado."); }
}
