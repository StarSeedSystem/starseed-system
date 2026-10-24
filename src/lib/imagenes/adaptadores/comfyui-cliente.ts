/**
 * ComfyUI · CLIENTE PURO DE FLUJOS (IMG1020B, cliente de la Ola 1020U). Contrato: architecture/repos-libreria-1020d.md §2.
 *
 * Envia el GRAFO del flujo en formato API (nodos con `class_type` e `inputs`, datos, nunca el mote
 * `{prompt: texto}` que ComfyUI real rechaza) a `POST {base}/prompt` con `{prompt, client_id}`, lee
 * `prompt_id`, sigue `GET {base}/history/{prompt_id}` hasta que haya salidas con imágenes, y arma las
 * URLs de `/view` con URLSearchParams. Al agotar el tope de tiempo pide `POST {base}/interrupt`.
 * Los checkpoints se leen de `GET /object_info/CheckpointLoaderSimple` (`input.required.ckpt_name[0]`)
 * y la salud de `GET /system_stats` (dispositivos y VRAM). `fetch`, el reloj y la espera van
 * INYECTADOS y `redirect: "manual"` (como `src/lib/protomolecula/servicio-local.ts`); los errores
 * (`error` y `node_errors`) salen como texto legible en español. Nada de `node:*`: probado sin red.
 */

export type FlujoComfy = Record<string, unknown>;

export interface PeticionHttp { method: "GET" | "POST"; headers: Record<string, string>; body?: string; redirect: "manual" }
export interface RespuestaHttp { ok: boolean; status: number; text(): Promise<string> }
export type FetchHttp = (url: string, init: PeticionHttp) => Promise<RespuestaHttp>;
export interface RelojComfy { ahora(): number; esperar(ms: number): Promise<void> }

export interface InfoImagen { filename: string; subfolder: string | null; type: string }
export type FalloComfy = "prompt" | "http" | "registro" | "json" | "tiempo" | "cae";
export type ResultadoComfy =
  | { ok: true; promptId: string; imagenes: { info: InfoImagen; url: string }[]; ms: number }
  | { ok: false; fallo: FalloComfy; motivo: string; ms: number };

export interface OpcionesFlujo { reloj?: RelojComfy; intervaloMs?: number; tiempoTopeMs?: number }

const baseLimpia = (b: string) => b.replace(/\/+$/, "");
const PEQUE = (s: string) => s.slice(0, 160);

export interface DispositivoComfy { nombre: string; tipo: string | null; vramTotalBytes: number | null; vramLibreBytes: number | null }
export interface SaludComfy { dispositivos: DispositivoComfy[] }

/** Texto legible en español para `error` y `node_errors` de /prompt; `null` si no hay nada que contar. */
export function textoErrorPrompt(datos: unknown): string | null {
  if (typeof datos !== "object" || datos === null) return null;
  const partes: string[] = [];
  const o = datos as { error?: { message?: unknown; details?: unknown } | string; node_errors?: unknown };
  if (typeof o.error === "string") partes.push(`ComfyUI rechazó el envío: ${o.error}`);
  else if (typeof o.error === "object" && o.error !== null)
    partes.push(`ComfyUI rechazó el envío: ${typeof o.error.message === "string" ? o.error.message : "sin mensaje"}${typeof o.error.details === "string" ? ` (${o.error.details})` : ""}`);
  if (typeof o.node_errors === "object" && o.node_errors !== null)
    for (const [id, ne] of Object.entries(o.node_errors as Record<string, unknown>)) {
      const e = (typeof ne === "object" && ne !== null ? ne : {}) as { errors?: unknown; class_type?: unknown };
      const clase = typeof e.class_type === "string" ? ` (${e.class_type})` : "";
      const lista = Array.isArray(e.errors) ? (e.errors as { message?: unknown; details?: unknown }[]) : [];
      if (!lista.length) partes.push(`El nodo ${id}${clase} falló: sin detalle.`);
      for (const er of lista)
        partes.push(`El nodo ${id}${clase} falló: ${typeof er?.message === "string" ? er.message : "sin mensaje"}${typeof er?.details === "string" ? ` (${er.details})` : ""}`);
    }
  return partes.length ? partes.join(" · ") : null;
}

/** Saca las imágenes de un historial `{[promptId]: {outputs: {[nodo]: {images: [...]}}}}`; vacío si no las hay aún. */
export function parseaSalidasHistorial(datos: unknown): InfoImagen[] {
  const salidas: InfoImagen[] = [];
  if (typeof datos !== "object" || datos === null) return salidas;
  for (const entrada of Object.values(datos as Record<string, unknown>)) {
    const porNodo = typeof entrada === "object" && entrada !== null ? (entrada as { outputs?: unknown }).outputs : undefined;
    if (typeof porNodo !== "object" || porNodo === null) continue;
    for (const nodo of Object.values(porNodo as Record<string, unknown>)) {
      const imgs = typeof nodo === "object" && nodo !== null ? (nodo as { images?: unknown }).images : undefined;
      if (!Array.isArray(imgs)) continue;
      for (const im of imgs) {
        const o = (typeof im === "object" && im !== null ? im : {}) as { filename?: unknown; subfolder?: unknown; type?: unknown };
        if (typeof o.filename !== "string" || !o.filename) continue;
        salidas.push({ filename: o.filename, subfolder: typeof o.subfolder === "string" && o.subfolder ? o.subfolder : null, type: typeof o.type === "string" ? o.type : "output" });
      }
    }
  }
  return salidas;
}

/** URL de `/view` con los detalles de la imagen en la cadena de búsqueda. */
export function urlView(base: string, i: InfoImagen): string {
  const p = new URLSearchParams();
  p.set("filename", i.filename);
  if (i.subfolder) p.set("subfolder", i.subfolder);
  if (i.type) p.set("type", i.type);
  return `${baseLimpia(base)}/view?${p.toString()}`;
}

/** Checkpoints de /object_info/CheckpointLoaderSimple (`input.required.ckpt_name[0]`); `[]` si no se entiende. */
export function parseaCheckpoints(datos: unknown): string[] {
  if (typeof datos !== "object" || datos === null) return [];
  for (const def of Object.values(datos as Record<string, unknown>)) {
    const req = typeof def === "object" && def !== null ? (def as { input?: { required?: { ckpt_name?: unknown } } }).input?.required : undefined;
    const lista = req?.ckpt_name;
    if (Array.isArray(lista) && Array.isArray(lista[0])) return lista[0].filter((n): n is string => typeof n === "string");
  }
  return [];
}

/** Salud de /system_stats: dispositivos con su tipo y VRAM (bytes, `null` donde el dato no llega). */
export function parseaSalud(datos: unknown): SaludComfy {
  const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : null);
  const lista = typeof datos === "object" && datos !== null ? (datos as { devices?: unknown }).devices : undefined;
  const dispositivos = Array.isArray(lista)
    ? lista.map((d) => {
        const o = (typeof d === "object" && d !== null ? d : {}) as { name?: unknown; type?: unknown; vram_total?: unknown; vram_free?: unknown };
        return { nombre: typeof o.name === "string" ? o.name : "sin nombre", tipo: typeof o.type === "string" ? o.type : null, vramTotalBytes: num(o.vram_total), vramLibreBytes: num(o.vram_free) };
      })
    : [];
  return { dispositivos };
}

/** Reloj real: solo para producción; las pruebas inyectan un reloj propio. */
export const RELOJ_COMFY: RelojComfy = { ahora: () => Date.now(), esperar: (ms) => new Promise<void>((r) => { setTimeout(r, ms); }) };

type Llamada = { ok: true; estado: number; datos: unknown } | { ok: false; fallo: FalloComfy; motivo: string };

/** Una llamada fetch con `redirect: "manual"` y el cuerpo leído entero: fallo tipado en español, sin excepciones fuera. */
async function pedirRuta(b: string, ruta: string, metodo: "GET" | "POST", cuerpo: unknown, f: FetchHttp): Promise<Llamada> {
  try {
    const r = await f(`${b}${ruta}`, {
      method: metodo,
      headers: metodo === "POST" ? { "content-type": "application/json" } : {},
      body: metodo === "POST" ? JSON.stringify(cuerpo) : undefined,
      redirect: "manual",
    });
    const texto = await r.text();
    if (!r.ok) return { ok: false, fallo: "http", motivo: `ComfyUI respondió ${r.status}: ${PEQUE(texto) || "sin cuerpo"}` };
    try { return { ok: true, estado: r.status, datos: JSON.parse(texto) }; } catch { return { ok: false, fallo: "json", motivo: "ComfyUI no contestó con JSON válido." }; }
  } catch {
    return { ok: false, fallo: "cae", motivo: `ComfyUI no contesta en ${b}${ruta} (¿está arrancado?).` };
  }
}

export async function enviarFlujo(base: string, flujo: FlujoComfy, clienteId: string, f: FetchHttp, o: OpcionesFlujo = {}): Promise<ResultadoComfy> {
  const b = baseLimpia(base), reloj = o.reloj ?? RELOJ_COMFY;
  const intervalo = Math.max(50, o.intervaloMs ?? 1_000), topeMs = Math.max(intervalo, o.tiempoTopeMs ?? 120_000), t0 = reloj.ahora();
  const mal = (fallo: FalloComfy, motivo: string): ResultadoComfy => ({ ok: false, fallo, motivo, ms: reloj.ahora() - t0 });
  const envio = await pedirRuta(b, "/prompt", "POST", { prompt: flujo, client_id: clienteId }, f);
  if (!envio.ok) return mal(envio.fallo, envio.motivo);
  const errores = textoErrorPrompt(envio.datos);
  if (errores) return mal("prompt", errores);
  const promptId = (envio.datos as { prompt_id?: unknown }).prompt_id;
  if (typeof promptId !== "string" || !promptId) return mal("registro", "ComfyUI no devolvió un prompt_id; se ignora su respuesta.");
  for (;;) {
    const h = await pedirRuta(b, `/history/${encodeURIComponent(promptId)}`, "GET", undefined, f);
    if (!h.ok) return mal(h.fallo, h.motivo);
    const salidas = parseaSalidasHistorial(h.datos);
    if (salidas.length)
      return { ok: true, promptId, imagenes: salidas.map((i) => ({ info: i, url: urlView(b, i) })), ms: reloj.ahora() - t0 };
    if (reloj.ahora() - t0 + intervalo >= topeMs) {
      await pedirInterrupcion(b, f);
      return mal("tiempo", `ComfyUI no terminó el flujo en ${Math.round(topeMs / 1000)} s; se le pidió interrumpir (POST /interrupt).`);
    }
    await reloj.esperar(intervalo);
  }
}

/** `POST {base}/interrupt`: le pide a ComfyUI deje el flujo que corre. Best-effort: devuelve si contestó. */
export async function pedirInterrupcion(base: string, f: FetchHttp): Promise<boolean> {
  try {
    const r = await f(`${baseLimpia(base)}/interrupt`, { method: "POST", headers: {}, redirect: "manual" });
    return r.ok;
  } catch { return false; }
}

export type ListadoCheckpoints = { ok: true; checkpoints: string[] } | { ok: false; motivo: string };
export async function checkpointsDisponibles(base: string, f: FetchHttp): Promise<ListadoCheckpoints> {
  const r = await pedirRuta(baseLimpia(base), "/object_info/CheckpointLoaderSimple", "GET", undefined, f);
  if (!r.ok) return { ok: false, motivo: r.motivo };
  return { ok: true, checkpoints: [...new Set(parseaCheckpoints(r.datos))] };
}

export type EstadoSalud = { ok: true; salud: SaludComfy } | { ok: false; motivo: string };
export async function salud(base: string, f: FetchHttp): Promise<EstadoSalud> {
  const r = await pedirRuta(baseLimpia(base), "/system_stats", "GET", undefined, f);
  if (!r.ok) return { ok: false, motivo: r.motivo };
  return { ok: true, salud: parseaSalud(r.datos) };
}
