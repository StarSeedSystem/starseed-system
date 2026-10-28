/**
 * Protomolécula · SERVICIOS LOCALES y LANZADOR NATIVO (F5; contrato §3.2 y §8.1). Cliente de servicios en 127.0.0.1 de una neurona
 * (ComfyUI, Ollama…) con `fetch` y el reloj INYECTADOS, sin seguir redirecciones (`redirect: "manual"`: un 3xx no saca la llamada de
 * 127.0.0.1, queda en fallo «http»). El token se lee por el NOMBRE de variable que declara la definición, en el medio que llama (app
 * nativa o servidor): jamás un valor en el código, en un error ni en un registro. NO ejecuta procesos: `pedirLanzamiento` devuelve la
 * solicitud para la app nativa, con lista blanca CERRADA y SIEMPRE con la confirmación de una persona (`decidir` de `./permisos`).
 */
import { decidir } from "./permisos";
import type { Ambito, Origen, Rol } from "./tipos";
export interface DefinicionServicio { id: string; nombre: string; puerto: number; rutaSalud: string; maxBytes?: number; tiempoMs?: number;
  /** NOMBRE de la variable que guarda el token (p. ej. «COMFYUI_TOKEN»), nunca su valor. */ variableToken?: string }
interface LectorBytes { read(): Promise<{ done: boolean; value?: Uint8Array }>; cancel(): Promise<void> }
export interface RespuestaLocal { ok: boolean; status: number; headers: { get(nombre: string): string | null }; body?: { getReader(): LectorBytes } | null; text(): Promise<string> }
export interface PeticionLocal { method: "GET" | "POST"; headers: Record<string, string>; body?: string; signal: AbortSignal; redirect: "manual" }
export type FetchLocal = (url: string, init: PeticionLocal) => Promise<RespuestaLocal>;
export interface Reloj { ahora(): number; tras(ms: number): { promesa: Promise<void>; cancelar(): void } }
export interface OpcionesServicio { reloj?: Reloj; leerVariable?: (nombre: string) => string | undefined; registrar?: (linea: string) => void }
export type FalloServicio = "definicion" | "token-ausente" | "caido" | "tiempo" | "enorme" | "http";
export type ResultadoServicio = { ok: true; estado: number; texto: string; datos: unknown; ms: number } | { ok: false; fallo: FalloServicio; motivo: string; ms: number };

export const MAX_BYTES = 8 * 1024 * 1024, MAX_CUERPO = 1024 * 1024, TIEMPO_MS = 30_000, TIEMPO_SALUD_MS = 3_000;
export const SERVICIOS_CONOCIDOS: readonly DefinicionServicio[] = [
  { id: "comfyui", nombre: "ComfyUI", puerto: 8188, rutaSalud: "/system_stats" },
  { id: "ollama", nombre: "Ollama", puerto: 11434, rutaSalud: "/api/version" },
  { id: "hyperframes", nombre: "HyperFrames", puerto: 4490, rutaSalud: "/health" },
];
const NOMBRE_VARIABLE = /^[A-Z][A-Z0-9_]{1,63}$/;
const RUTA = /^\/(?![/\\])[A-Za-z0-9\-._~/%?=&+,:]*$/;
const RELOJ: Reloj = { ahora: () => Date.now(), tras: (ms) => { let id: ReturnType<typeof setTimeout> | undefined;
  return { promesa: new Promise<void>((r) => { id = setTimeout(r, ms); }), cancelar: () => clearTimeout(id) }; } };
const bytes = (s: string) => new TextEncoder().encode(s).byteLength;
const kb = (n: number) => (n >= 1024 * 1024 ? `${Math.round(n / 1024 / 1024)} MB` : `${Math.round(n / 1024)} KB`);
const json = (s: string): unknown => { try { return JSON.parse(s); } catch { return s; } };

/** Motivo en español si la definición no sirve; `null` si vale. Nunca repite el valor de la variable. */
export function validarDefinicion(d: DefinicionServicio): string | null {
  if (!Number.isInteger(d.puerto) || d.puerto < 1 || d.puerto > 65535) return `El puerto de «${d.nombre}» no es válido.`;
  if (!RUTA.test(d.rutaSalud)) return `La ruta de salud de «${d.nombre}» no es una ruta local válida.`;
  if (d.variableToken !== undefined && !NOMBRE_VARIABLE.test(d.variableToken)) return `«${d.nombre}» debe declarar el NOMBRE de la variable del token (MAYÚSCULAS y _), nunca su valor.`;
  if ([d.maxBytes, d.tiempoMs].some((n) => n !== undefined && !(Number.isInteger(n) && n > 0 && n <= 2_147_483_647))) return `Los límites de tamaño y tiempo de «${d.nombre}» deben ser enteros positivos.`;
  return null;
}

/** Lee como mucho `max` bytes; con flujo, corta y cancela en cuanto se pasa. `null` = enorme. */
async function leerAcotado(r: RespuestaLocal, max: number): Promise<string | null> {
  const lector = r.body?.getReader();
  if (!lector) { const t = await r.text(); return bytes(t) > max ? null : t; }
  const partes: Uint8Array[] = []; let n = 0;
  for (let p = await lector.read(); !p.done; p = await lector.read()) {
    n += p.value?.byteLength ?? 0;
    if (n > max) { void lector.cancel().catch(() => undefined); return null; }
    if (p.value) partes.push(p.value);
  }
  const todo = new Uint8Array(n); partes.reduce((i, x) => { todo.set(x, i); return i + x.byteLength; }, 0);
  return new TextDecoder().decode(todo);
}

async function pedir(def: DefinicionServicio, ruta: string, cuerpo: unknown, f: FetchLocal, o: OpcionesServicio, tiempoMs: number, salud: boolean): Promise<ResultadoServicio> {
  const reloj = o.reloj ?? RELOJ, t0 = reloj.ahora(), metodo = cuerpo === undefined ? "GET" : "POST";
  let token: string | undefined; // se tapa ANTES de recortar: un recorte que parta el token dejaría su principio a la vista
  const tapar = (s: string) => (token ? s.split(token).join("•••") : s), donde = () => `${def.id} ${metodo} ${tapar(ruta).slice(0, 80)}`;
  const fallo = (tipo: FalloServicio, motivo: string): ResultadoServicio => { o.registrar?.(tapar(`${donde()} · ${tipo}: ${motivo}`));
    return { ok: false, fallo: tipo, motivo: tapar(motivo), ms: reloj.ahora() - t0 }; };
  const malo = validarDefinicion(def) ?? (RUTA.test(ruta) ? null : `La ruta «${ruta.slice(0, 80)}» no es una ruta local válida.`);
  if (malo) return fallo("definicion", malo);
  const url = new URL(`http://127.0.0.1:${def.puerto}${ruta}`);
  if (url.hostname !== "127.0.0.1" || Number(url.port || 80) !== def.puerto) return fallo("definicion", "Solo se llama a servicios de 127.0.0.1 de esta neurona.");
  const headers: Record<string, string> = { accept: "application/json" };
  token = def.variableToken ? o.leerVariable?.(def.variableToken)?.trim() || undefined : undefined;
  if (token) headers.authorization = `Bearer ${token}`;
  else if (def.variableToken && !salud) return fallo("token-ausente", `Falta la variable «${def.variableToken}» en este medio: «${def.nombre}» pide un token.`);
  let texto: string | undefined;
  if (cuerpo !== undefined) {
    try { texto = JSON.stringify(cuerpo); } catch { return fallo("definicion", "El cuerpo de la petición no se puede pasar a JSON."); }
    if (bytes(texto) > MAX_CUERPO) return fallo("enorme", `La petición pasa de ${kb(MAX_CUERPO)}: no se envía.`);
    headers["content-type"] = "application/json";
  }
  const ctl = new AbortController(), plazo = reloj.tras(tiempoMs), max = Math.min(def.maxBytes ?? MAX_BYTES, MAX_BYTES);
  const tiempo = plazo.promesa.then(() => { ctl.abort(); return "tiempo" as const; });
  const agotado = () => fallo("tiempo", `«${def.nombre}» no respondió en ${tiempoMs / 1000} s.`);
  try {
    const r = await Promise.race([f(url.toString(), { method: metodo, headers, body: texto, signal: ctl.signal, redirect: "manual" }), tiempo]);
    if (r === "tiempo") return agotado();
    if (Number(r.headers.get("content-length") ?? 0) > max) return fallo("enorme", `La respuesta de «${def.nombre}» pasa de ${kb(max)}: no se lee.`);
    const leido = await Promise.race([leerAcotado(r, max), tiempo]);
    if (leido === "tiempo") return agotado();
    if (leido === null) return fallo("enorme", `La respuesta de «${def.nombre}» pasa de ${kb(max)}: se corta.`);
    if (!r.ok) return fallo("http", `«${def.nombre}» respondió ${r.status}: ${tapar(leido).slice(0, 160)}`);
    const ms = reloj.ahora() - t0;
    o.registrar?.(`${donde()} · ${r.status} en ${ms} ms`);
    return { ok: true, estado: r.status, texto: leido, datos: json(leido), ms };
  } catch {
    return ctl.signal.aborted ? agotado() : fallo("caido", `«${def.nombre}» no contesta en 127.0.0.1:${def.puerto} (¿está arrancado?).`);
  } finally { plazo.cancelar(); }
}

/** Salud con tiempo límite corto. No exige el token (si lo hay, lo manda). */
export async function sondearServicio(def: DefinicionServicio, f: FetchLocal, o: OpcionesServicio = {}): Promise<{ vivo: boolean; ms: number; motivo: string }> {
   const r = await pedir(def, def.rutaSalud, undefined, f, o, TIEMPO_SALUD_MS, true);
   if (r.ok) {
     return { vivo: true, ms: r.ms, motivo: `«${def.nombre}» responde (${r.ms} ms).` };
   } else {
     // r.ok is false, so r has a motivo property
     return { vivo: false, ms: r.ms, motivo: (r as { motivo: string }).motivo };
   }
}
/** GET sin cuerpo, POST JSON con él; con límites de tamaño y tiempo y errores en español. */
export const llamarServicio = (def: DefinicionServicio, ruta: string, cuerpo: unknown, f: FetchLocal, o: OpcionesServicio = {}): Promise<ResultadoServicio> =>
  pedir(def, ruta, cuerpo, f, o, def.tiempoMs ?? TIEMPO_MS, false);

/* ── Lanzador nativo: lista blanca CERRADA; el id lo traduce a ejecutable la app nativa, nunca una ruta de aquí ── */
export const BINARIOS_PERMITIDOS: Readonly<Record<string, string>> = Object.freeze({ blender: "Blender", krita: "Krita", gimp: "GIMP", inkscape: "Inkscape",
  kdenlive: "Kdenlive", audacity: "Audacity", ardour: "Ardour", "obs-studio": "OBS Studio", freecad: "FreeCAD", ffmpeg: "FFmpeg", comfyui: "ComfyUI", ollama: "Ollama", rare: "Rare" });
export interface ContextoLanzamiento { rol: Rol | null; origen: Origen; ambito: Ambito; appNativa: boolean; confirmado?: boolean; ahora: number }
export interface SolicitudLanzamiento { tipo: "lanzar-externo"; binarioId: string; nombre: string; origen: Origen; confirmadoEn: number }
export type ResultadoLanzamiento = { estado: "rechazado" | "proximamente"; motivo: string } | { estado: "confirmar"; motivo: string; pregunta: string }
  | { estado: "solicitud"; motivo: string; solicitud: SolicitudLanzamiento };

export function pedirLanzamiento(binarioId: string, ctx: ContextoLanzamiento): ResultadoLanzamiento {
  if (!Object.prototype.hasOwnProperty.call(BINARIOS_PERMITIDOS, binarioId)) return { estado: "rechazado", motivo: `«${binarioId.slice(0, 40)}» no está en la lista blanca de programas que el OS puede pedir abrir.` };
  const nombre = BINARIOS_PERMITIDOS[binarioId];
  const d = decidir({ rol: ctx.rol, origen: ctx.origen, ambito: ctx.ambito, accion: "lanzar-externo", nativo: true });
  if (!d.permitido) return { estado: "rechazado", motivo: d.motivo };
  if (!ctx.appNativa) return { estado: "proximamente", motivo: "próximamente: no hay app nativa conectada" };
  if (ctx.confirmado !== true) return { estado: "confirmar", motivo: d.motivo, pregunta: `¿Abrir ${nombre} en esta neurona? Correrá fuera del aislamiento del navegador.` };
  return { estado: "solicitud", motivo: `${nombre}: solicitud lista para la app nativa (este módulo no arranca procesos).`, solicitud: { tipo: "lanzar-externo", binarioId, nombre, origen: ctx.origen, confirmadoEn: ctx.ahora } };
}
