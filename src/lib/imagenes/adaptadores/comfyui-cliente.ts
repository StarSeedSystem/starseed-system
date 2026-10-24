/**
 * Imágenes · CLIENTE DE FLUJOS DE COMFYUI (IMG1020B). Contrato: architecture/repos-libreria-1020d.md §2.
 *
 * Puro y sin `node:*`: `fetch`, reloj y espera INYECTADOS, y `redirect: "manual"` para que un 3xx no
 * saque la llamada del servidor declarado. El flujo es DATO (grafo API: nodos con `class_type` e
 * `inputs`), nunca código. Lo que el servidor no devuelve se dice como tal; nada se inventa.
 */
export interface RespuestaComfy { ok: boolean; status: number; text(): Promise<string> }
export interface PeticionComfy { method: "GET" | "POST"; headers: Record<string, string>; body?: string; signal: AbortSignal; redirect: "manual" }
export type FetchComfy = (url: string, init: PeticionComfy) => Promise<RespuestaComfy>;
export interface RelojComfy { ahora(): number; esperar(ms: number, signal: AbortSignal): Promise<void> }
export interface OpcionesComfy {
  fetch?: FetchComfy; reloj?: RelojComfy; clientId?: string; tiempoMs?: number; intervaloMs?: number;
  signal?: AbortSignal; registrar?: (linea: string) => void;
}
export interface ImagenComfy { filename: string; subfolder: string; type: string; url: string }
export interface DispositivoComfy { nombre: string; tipo: string; vramTotalMB: number; vramLibreMB: number }
export interface SaludComfy { dispositivos: DispositivoComfy[]; ramTotalMB: number | null; ramLibreMB: number | null }
export type FalloComfy = "flujo" | "conexion" | "tiempo" | "cancelado" | "http" | "vacio";
export type ResultadoFlujo = { ok: true; promptId: string; imagenes: ImagenComfy[]; ms: number }
  | { ok: false; fallo: FalloComfy; motivo: string; ms: number };

export const TIEMPO_FLUJO_MS = 15 * 60_000, INTERVALO_MS = 1_000;
const obj = (x: unknown): Record<string, unknown> | null => (typeof x === "object" && x !== null ? x as Record<string, unknown> : null);
const texto = (x: unknown): string => (typeof x === "string" ? x : "");
const json = (s: string): unknown => { try { return JSON.parse(s) as unknown; } catch { return null; } };
const limpia = (base: string): string => base.replace(/\/+$/, "");

/** Motivo en español si ComfyUI rechaza el flujo (`node_errors` o `error`); `null` si lo aceptó. */
export function errorLegible(datos: unknown): string | null {
  const raiz = obj(datos); if (!raiz) return null;
  const partes: string[] = [], e = obj(raiz.error) ?? (typeof raiz.error === "string" ? { message: raiz.error } : null);
  if (e) { const m = [texto(e.message), texto(e.details)].filter(Boolean).join(": "); if (m) partes.push(m); }
  const nodos = obj(raiz.node_errors);
  if (nodos) for (const [id, valor] of Object.entries(nodos)) {
    const n = obj(valor); if (!n) continue;
    for (const x of Array.isArray(n.errors) ? n.errors : []) {
      const err = obj(x); if (!err) continue;
      const detalle = [texto(err.message), texto(err.details)].filter(Boolean).join(" — ");
      if (detalle) partes.push(`nodo ${id} (${texto(n.class_type) || "sin tipo"}): ${detalle}`);
    }
  }
  return partes.length ? `ComfyUI rechazó el flujo: ${partes.join("; ")}` : null;
}

/** URL de descarga con `URLSearchParams`: filename, subfolder y type tal como los devolvió el servidor. */
export function urlDeImagen(base: string, img: { filename: string; subfolder: string; type: string }): string {
  const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
  return `${limpia(base)}/view?${q.toString()}`;
}

/** Imágenes `{filename, subfolder, type}` del historial de este `prompt_id` (o de todas las entradas). */
export function imagenesDeHistorial(historial: unknown, base: string, promptId?: string): ImagenComfy[] {
  const raiz = obj(historial); if (!raiz) return [];
  const imagenes: ImagenComfy[] = [];
  for (const entrada of promptId === undefined ? Object.values(raiz) : [raiz[promptId]]) {
    const salidas = obj(obj(entrada)?.outputs); if (!salidas) continue;
    for (const salida of Object.values(salidas)) {
      const lista = obj(salida)?.images; if (!Array.isArray(lista)) continue;
      for (const x of lista) {
        const i = obj(x); if (!i) continue;
        const filename = texto(i.filename), subfolder = texto(i.subfolder), type = texto(i.type) || "output";
        if (filename) imagenes.push({ filename, subfolder, type, url: urlDeImagen(base, { filename, subfolder, type }) });
      }
    }
  }
  return imagenes;
}

/** Checkpoints que ofrece el servidor: `input.required.ckpt_name[0]` de `CheckpointLoaderSimple`. */
export function parseaCheckpoints(objectInfo: unknown): string[] {
  const ckpt = obj(obj(obj(obj(objectInfo)?.CheckpointLoaderSimple)?.input)?.required)?.ckpt_name;
  if (!Array.isArray(ckpt) || !Array.isArray(ckpt[0])) return [];
  return [...new Set(ckpt[0].filter((x): x is string => typeof x === "string" && x.length > 0))];
}

const mb = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.round(x / 1024 / 1024) : null);

/** Dispositivos y VRAM de `GET /system_stats`, en MB; lo ausente queda null o 0, nunca estimado. */
export function parseaSalud(datos: unknown): SaludComfy | null {
  const raiz = obj(datos); if (!raiz) return null;
  const sistema = obj(raiz.system), dispositivos: DispositivoComfy[] = [];
  if (Array.isArray(raiz.devices)) for (const d of raiz.devices) {
    const x = obj(d); if (!x) continue;
    dispositivos.push({ nombre: texto(x.name) || texto(x.type) || "dispositivo", tipo: texto(x.type) || "desconocido",
      vramTotalMB: mb(x.vram_total) ?? 0, vramLibreMB: mb(x.vram_free) ?? 0 });
  }
  return { dispositivos, ramTotalMB: sistema ? mb(sistema.ram_total) : null, ramLibreMB: sistema ? mb(sistema.ram_free) : null };
}

const RELOJ: RelojComfy = {
  ahora: () => Date.now(),
  esperar: (ms, signal) => new Promise<void>((res) => {
    if (signal.aborted) return res();
    const corta = () => { clearTimeout(id); res(); };
    const id = setTimeout(() => { signal.removeEventListener("abort", corta); res(); }, ms);
    signal.addEventListener("abort", corta, { once: true });
  }),
};

type RespuestaTexto = { tipo: "respuesta"; status: number; texto: string }
  | { tipo: "fallo"; fallo: "conexion" | "cancelado"; motivo: string };
const FETCH: FetchComfy = (url, init) => fetch(url, init);
const http = (r: { status: number; texto: string }): string => `ComfyUI respondió ${r.status}: ${r.texto.slice(0, 200)}`;
async function pedir(url: string, metodo: "GET" | "POST", cuerpo: string | undefined, o: OpcionesComfy, signal: AbortSignal): Promise<RespuestaTexto> {
  const f = o.fetch ?? FETCH, headers: Record<string, string> = { accept: "application/json" };
  if (cuerpo !== undefined) headers["content-type"] = "application/json";
  try {
    const r = await f(url, { method: metodo, headers, body: cuerpo, signal, redirect: "manual" });
    return { tipo: "respuesta", status: r.status, texto: await r.text() };
  } catch {
    return { tipo: "fallo", fallo: signal.aborted ? "cancelado" : "conexion", motivo: "ComfyUI no contesta (¿está arrancado?)." };
  }
}

const salidasDe = (historial: unknown, promptId: string): Record<string, unknown> | null => {
  const salidas = obj(obj(obj(historial)?.[promptId])?.outputs);
  return salidas && Object.keys(salidas).length ? salidas : null;
};
async function interrumpir(base: string, promptId: string, o: OpcionesComfy): Promise<void> {
  await pedir(`${base}/interrupt`, "POST", JSON.stringify({ prompt_id: promptId }), o, new AbortController().signal);
}

/** Envía el flujo, sigue `/history/{prompt_id}` hasta que haya `outputs` y devuelve las imágenes. */
export async function ejecutarFlujo(base: string, flujo: Record<string, unknown>, o: OpcionesComfy = {}): Promise<ResultadoFlujo> {
  const reloj = o.reloj ?? RELOJ, t0 = reloj.ahora(), tiempo = o.tiempoMs ?? TIEMPO_FLUJO_MS, limite = t0 + tiempo;
  const intervalo = o.intervaloMs ?? INTERVALO_MS, b = limpia(base), ctl = new AbortController();
  if (o.signal?.aborted) ctl.abort(); else o.signal?.addEventListener("abort", () => ctl.abort(), { once: true });
  const fallo = (tipo: FalloComfy, motivo: string): ResultadoFlujo => {
    o.registrar?.(`comfyui · ${tipo}: ${motivo}`);
    return { ok: false, fallo: tipo, motivo, ms: reloj.ahora() - t0 };
  };
  const clientId = o.clientId ?? `starseed-${Math.random().toString(36).slice(2, 10)}`;
  const alta = await pedir(`${b}/prompt`, "POST", JSON.stringify({ prompt: flujo, client_id: clientId }), o, ctl.signal);
  if (alta.tipo === "fallo") return fallo(alta.fallo, alta.motivo);
  const datos = json(alta.texto), rechazo = errorLegible(datos);
  if (rechazo) return fallo("flujo", rechazo);
  if (alta.status < 200 || alta.status >= 300) return fallo("http", http(alta));
  const promptId = texto(obj(datos)?.prompt_id);
  if (!promptId) return fallo("flujo", "ComfyUI aceptó la petición pero no devolvió prompt_id.");
  let imagenes: ImagenComfy[] = [], huboSalidas = false;
  while (reloj.ahora() < limite && !ctl.signal.aborted) {
    const h = await pedir(`${b}/history/${encodeURIComponent(promptId)}`, "GET", undefined, o, ctl.signal);
    if (h.tipo === "fallo") { if (h.fallo !== "cancelado") return fallo(h.fallo, h.motivo); break; }
    if (h.status < 200 || h.status >= 300) return fallo("http", http(h));
    const historial = json(h.texto);
    if (salidasDe(historial, promptId)) { huboSalidas = true; imagenes = imagenesDeHistorial(historial, b, promptId); break; }
    await reloj.esperar(intervalo, ctl.signal);
  }
  if (imagenes.length) return { ok: true, promptId, imagenes, ms: reloj.ahora() - t0 };
  if (huboSalidas) return fallo("vacio", "ComfyUI dio el flujo por terminado pero no devolvió ninguna imagen.");
  await interrumpir(b, promptId, o);
  return ctl.signal.aborted
    ? fallo("cancelado", "Se canceló el flujo; se pidió a ComfyUI que lo interrumpiera.")
    : fallo("tiempo", `ComfyUI no terminó el flujo en ${Math.round(tiempo / 1000)} s; se pidió que lo interrumpiera.`);
}

/** Checkpoints que el servidor declara tener; `[]` si no contesta o no hay ninguno (sin inventar). */
export async function checkpointsDisponibles(base: string, o: OpcionesComfy = {}): Promise<string[]> {
  const ctl = new AbortController();
  if (o.signal?.aborted) ctl.abort(); else o.signal?.addEventListener("abort", () => ctl.abort(), { once: true });
  const r = await pedir(`${limpia(base)}/object_info/CheckpointLoaderSimple`, "GET", undefined, o, ctl.signal);
  return r.tipo === "respuesta" && r.status >= 200 && r.status < 300 ? parseaCheckpoints(json(r.texto)) : [];
}

/** Dispositivos y VRAM del servidor; `null` si no contesta (se dirá, no se estima). */
export async function salud(base: string, o: OpcionesComfy = {}): Promise<SaludComfy | null> {
  const ctl = new AbortController();
  if (o.signal?.aborted) ctl.abort(); else o.signal?.addEventListener("abort", () => ctl.abort(), { once: true });
  const r = await pedir(`${limpia(base)}/system_stats`, "GET", undefined, o, ctl.signal);
  return r.tipo === "respuesta" && r.status >= 200 && r.status < 300 ? parseaSalud(json(r.texto)) : null;
}
