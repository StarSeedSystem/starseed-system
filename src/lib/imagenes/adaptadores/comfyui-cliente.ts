/**
 * ComfyUI · CLIENTE PURO DE FLUJOS (IMG1020B). Contrato: architecture/repos-libreria-1020d.md §2.
 * Envía el GRAFO (nunca `{prompt: texto}`), sigue `/history/{id}` hasta sus `outputs`, arma `/view`
 * con `URLSearchParams`, pide `/interrupt` al agotarse el tiempo y lee checkpoints y salud. `fetch`,
 * reloj y espera van INYECTADOS, con `redirect: "manual"`. Lo no medido se dice: nada se inventa.
 */
export interface RespuestaHttp { ok: boolean; status: number; headers: { get(nombre: string): string | null }; text(): Promise<string> }
export interface PeticionHttp { method: "GET" | "POST"; headers: Record<string, string>; body?: string; signal: AbortSignal; redirect: "manual" }
export type FetchHttp = (url: string, init: PeticionHttp) => Promise<RespuestaHttp>;
export interface Reloj { ahora(): number; tras(ms: number): { promesa: Promise<void>; cancelar(): void } }
export interface OpcionesComfy { fetch?: FetchHttp; reloj?: Reloj; tiempoMs?: number; intervaloMs?: number; clienteId?: string }
export interface ImagenComfy { filename: string; subfolder: string; type: string; url: string }
export type FalloComfy = "red" | "http" | "respuesta" | "node_errors" | "tiempo";
export type ResultadoGeneracion = { ok: true; promptId: string; imagenes: ImagenComfy[]; ms: number }
  | { ok: false; fallo: FalloComfy; motivo: string; promptId?: string; ms: number };
export interface DispositivoComfy { nombre: string; tipo: string; vramTotalGB: number | null; vramLibreGB: number | null }
export type ResultadoSalud = { ok: true; dispositivos: DispositivoComfy[] } | { ok: false; motivo: string };
export const TIEMPO_MS = 120_000, INTERVALO_MS = 1_000, CLIENTE_ID = "starseed-os";
const RELOJ: Reloj = { ahora: () => Date.now(), tras: (ms) => { let id: ReturnType<typeof setTimeout> | undefined;
  return { promesa: new Promise<void>((r) => { id = setTimeout(r, ms); }), cancelar: () => clearTimeout(id) }; } };
const FETCH: FetchHttp = (url, init) => fetch(url, init);
const objeto = (x: unknown): Record<string, unknown> | null => (typeof x === "object" && x !== null ? x as Record<string, unknown> : null);
const texto = (x: unknown): string => (typeof x === "string" ? x : "");
const num = (x: unknown): number | null => (typeof x === "number" && Number.isFinite(x) ? x : null);
const gb = (b: number | null): number | null => (b === null ? null : Math.round((b / 1024 ** 3) * 10) / 10);
const lista = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
/** Motivo en español de un `error` o `node_errors` de ComfyUI; `null` si no hay ninguno. */
export function motivoDeErrores(datos: unknown): string | null {
  const o = objeto(datos); if (!o) return null;
  const partes: string[] = [], e = objeto(o.error), mensaje = texto(e?.message) || texto(o.error);
  if (mensaje) partes.push(mensaje);
  for (const [id, valor] of Object.entries(objeto(o.node_errors) ?? {})) {
    const n = objeto(valor), errores = lista(n?.errors);
    const detalle = errores.map((x) => texto(objeto(x)?.message)).filter(Boolean).join("; ");
    partes.push(`nodo ${id}${texto(n?.class_type) ? ` (${texto(n?.class_type)})` : ""}${detalle ? `: ${detalle}` : ""}`);
  }
  return partes.length ? `ComfyUI rechazó el flujo: ${partes.join(" · ")}` : null;
}
/** `{base}/view` con `URLSearchParams` a partir de la imagen que devuelve el historial. */
export function urlDeImagen(base: string, img: { filename: string; subfolder: string; type: string }): string {
  const q = new URLSearchParams({ filename: img.filename, subfolder: img.subfolder, type: img.type });
  return `${base.replace(/\/+$/, "")}/view?${q.toString()}`;
}
function imagenesDeSalidas(salidas: Record<string, unknown>, base: string): ImagenComfy[] {
  const out: ImagenComfy[] = [];
  for (const nodo of Object.values(salidas)) for (const x of lista(objeto(nodo)?.images)) {
    const filename = texto(objeto(x)?.filename); if (!filename) continue;
    const img = { filename, subfolder: texto(objeto(x)?.subfolder), type: texto(objeto(x)?.type) || "output" };
    out.push({ ...img, url: urlDeImagen(base, img) });
  }
  return out;
}
interface Leido { estado: number; ok: boolean; datos: unknown; crudo: string }
async function pideJson(url: string, init: PeticionHttp, f: FetchHttp): Promise<Leido> {
  const r = await f(url, init), crudo = await r.text(); let datos: unknown = crudo;
  try { datos = crudo ? JSON.parse(crudo) : null; } catch { datos = crudo; }
  return { estado: r.status, ok: r.ok, datos, crudo };
}
/** Carrera contra el reloj INYECTADO: al vencer aborta la petición y devuelve «tiempo». */
async function conPlazo<T>(p: Promise<T>, reloj: Reloj, ms: number, ctl: AbortController): Promise<T | "tiempo"> {
  const plazo = reloj.tras(ms), vence = plazo.promesa.then(() => { ctl.abort(); return "tiempo" as const; });
  try { return await Promise.race([p, vence]); } finally { plazo.cancelar(); }
}
/** Cancelación de ComfyUI: mejor esfuerzo; nunca tapa el fallo que la provocó. */
async function interrumpir(base: string, f: FetchHttp): Promise<void> {
  try { await f(`${base}/interrupt`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}", signal: new AbortController().signal, redirect: "manual" }); } catch { /* se ignora a propósito */ }
}
/** Envía el flujo, espera sus `outputs` con tope de tiempo y devuelve las imágenes por `/view`. */
export async function generarConComfyUI(base: string, flujo: unknown, o: OpcionesComfy = {}): Promise<ResultadoGeneracion> {
  const f = o.fetch ?? FETCH, reloj = o.reloj ?? RELOJ, t0 = reloj.ahora();
  const tiempoMs = o.tiempoMs ?? TIEMPO_MS, intervalo = o.intervaloMs ?? INTERVALO_MS, segundos = Math.round(tiempoMs / 1000);
  const raiz = base.replace(/\/+$/, ""), ctl = new AbortController(), cabeceras = { "content-type": "application/json" };
  const fallo = (fallo: FalloComfy, motivo: string, promptId?: string): ResultadoGeneracion => ({ ok: false, fallo, motivo, promptId, ms: reloj.ahora() - t0 });
  let promptId = ""; try {
    const envio = await conPlazo(pideJson(`${raiz}/prompt`, { method: "POST", headers: cabeceras,
      body: JSON.stringify({ prompt: flujo, client_id: o.clienteId ?? CLIENTE_ID }), signal: ctl.signal, redirect: "manual" }, f), reloj, tiempoMs, ctl);
    if (envio === "tiempo") { await interrumpir(raiz, f); return fallo("tiempo", `ComfyUI no aceptó el flujo en ${segundos} s.`); }
    const error = motivoDeErrores(envio.datos);
    if (error) return fallo("node_errors", error);
    if (!envio.ok) return fallo("http", `ComfyUI respondió ${envio.estado}: ${envio.crudo.slice(0, 160)}`);
    promptId = texto(objeto(envio.datos)?.prompt_id);
    if (!promptId) return fallo("respuesta", "ComfyUI aceptó la petición pero no devolvió un prompt_id.");
    while (true) {
      const restante = tiempoMs - (reloj.ahora() - t0);
      if (restante <= 0) { await interrumpir(raiz, f); return fallo("tiempo", `El flujo ${promptId} no terminó en ${segundos} s; se interrumpió.`, promptId); }
      const hist = await conPlazo(pideJson(`${raiz}/history/${encodeURIComponent(promptId)}`, { method: "GET",
        headers: { accept: "application/json" }, signal: ctl.signal, redirect: "manual" }, f), reloj, restante, ctl);
      if (hist === "tiempo") { await interrumpir(raiz, f); return fallo("tiempo", `El flujo ${promptId} no terminó en ${segundos} s; se interrumpió.`, promptId); }
      if (!hist.ok) return fallo("http", `ComfyUI respondió ${hist.estado} al pedir el historial: ${hist.crudo.slice(0, 160)}`, promptId);
      const salidas = objeto(objeto(objeto(hist.datos)?.[promptId])?.outputs);
      if (salidas && Object.keys(salidas).length) return { ok: true, promptId, imagenes: imagenesDeSalidas(salidas, raiz), ms: reloj.ahora() - t0 };
      await reloj.tras(Math.min(intervalo, Math.max(0, restante))).promesa;
    }
  } catch { return fallo("red", `No se pudo hablar con ComfyUI en ${raiz} (¿está arrancado?).`, promptId || undefined); }
  finally { ctl.abort(); }
}
/** Checkpoints que la instancia declara en `input.required.ckpt_name[0]`; si no consta, lista vacía. */
export async function checkpointsDisponibles(base: string, o: OpcionesComfy = {}): Promise<string[]> {
  const f = o.fetch ?? FETCH, raiz = base.replace(/\/+$/, ""); try {
    const r = await pideJson(`${raiz}/object_info/CheckpointLoaderSimple`, { method: "GET",
      headers: { accept: "application/json" }, signal: new AbortController().signal, redirect: "manual" }, f);
    if (!r.ok) return [];
    const requerido = objeto(objeto(objeto(objeto(r.datos)?.input)?.required)?.ckpt_name);
    if (!Array.isArray(requerido)) return [];
    return lista(requerido[0]).filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch { return []; }
}
/** Dispositivos y VRAM (GB) de `GET /system_stats`; una instancia caída se dice, no se finge. */
export async function salud(base: string, o: OpcionesComfy = {}): Promise<ResultadoSalud> {
  const f = o.fetch ?? FETCH, raiz = base.replace(/\/+$/, ""); try {
    const r = await pideJson(`${raiz}/system_stats`, { method: "GET",
      headers: { accept: "application/json" }, signal: new AbortController().signal, redirect: "manual" }, f);
    if (!r.ok) return { ok: false, motivo: `ComfyUI respondió ${r.estado} en /system_stats.` };
    const dispositivos = lista(objeto(r.datos)?.devices).map((x): DispositivoComfy => {
      const d = objeto(x);
      return { nombre: texto(d?.name) || "dispositivo", tipo: texto(d?.type) || "desconocido", vramTotalGB: gb(num(d?.vram_total)), vramLibreGB: gb(num(d?.vram_free)) };
    });
    return { ok: true, dispositivos };
  } catch { return { ok: false, motivo: `No se pudo hablar con ComfyUI en ${raiz}.` }; }
}
