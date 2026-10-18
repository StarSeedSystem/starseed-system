/**
 * Proveedores externos OPCIONALES de imagen → 3D: Meshy y Tripo (AV1011I). Contrato: architecture/astraura-avatares-3d.md
 * §1, §4, §5 y §10. APAGADOS por defecto: un proveedor existe solo con su clave (`MESHY_API_KEY` o `TRIPO_API_KEY`) Y
 * `AVATARES_EXTERNOS_PERMITIDOS=1` en el servidor; si no, se dice el motivo. `buscar` (fetch) y el entorno se inyectan.
 * API leída en la documentación OFICIAL el 2026-10-17 (docs.meshy.ai/openapi.yaml y developers.tripo3d.ai):
 *  - Meshy: POST /openapi/v1/image-to-3d {image_url: http(s) o data URI} → {result}; GET …/{id} → {status, progress,
 *    model_urls.glb, task_error}. Las cuentas gratis NO crean claves: la procedencia es la de la tabla (CC BY 4.0).
 *  - Tripo (global openapi.tripo3d.ai/v3): POST /files (multipart) → {code:0, data:{file_token}}; POST
 *    /generation/image-to-model {input, model} → {task_id}; GET /tasks/{id} → {status, progress, output.model_url}.
 */
import type { Procedencia } from "@/lib/avatares/adn/adn";
import { procedenciaDe } from "@/lib/avatares/adn/canalizacion";
import { MOTORES_3D, type Motor3D, type Requisito3D } from "@/lib/avatares/adn/motores";
import { MAX_IMAGEN_BYTES } from "./espacio-hf";

export type ProveedorExterno = "meshy" | "tripo";
export const PROVEEDORES_EXTERNOS: readonly ProveedorExterno[] = ["meshy", "tripo"];
export const VARIABLE_CLAVE: Record<ProveedorExterno, string> = { meshy: "MESHY_API_KEY", tripo: "TRIPO_API_KEY" };
export const VARIABLE_PERMISO = "AVATARES_EXTERNOS_PERMITIDOS";
/** Gastan créditos de pago: un tope por persona y otro total, por día (protegen la cuenta de Alex). */
export const TOPE_DIARIO = { persona: 2, total: 20 } as const;
export const MIMES_EXTERNOS = ["image/png", "image/jpeg"] as const;
export const MODELO = { meshy: "meshy-6", tripo: "v3.1-20260211" } as const;
const API_MESHY = "https://api.meshy.ai/openapi/v1/image-to-3d", API_TRIPO = "https://openapi.tripo3d.ai/v3";
const NOMBRE: Record<ProveedorExterno, string> = { meshy: "Meshy", tripo: "Tripo" };
export type Entorno = Readonly<Record<string, string | undefined>>;
export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;
export type Resultado<T> = { ok: true; valor: T } | { ok: false; motivo: string };
export interface Imagen { mime: string; bytes: Uint8Array }
export interface EstadoTarea { estado: "en-cola" | "trabajando" | "lista" | "fallida"; progreso: number; glb: string | null; motivo: string | null }
type Objeto = Record<string, unknown>;
export const esProveedor = (v: unknown): v is ProveedorExterno => v === "meshy" || v === "tripo";
const mal = (motivo: string): { ok: false; motivo: string } => ({ ok: false, motivo });
const texto = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
/** Por qué este proveedor no está disponible (o null si lo está). Solo nombra variables. */
export function motivoNoDisponible(p: ProveedorExterno, entorno: Entorno): string | null {
  if (entorno[VARIABLE_PERMISO] !== "1") return `Apagado por defecto: es de pago y falta ${VARIABLE_PERMISO}=1 (permiso de Alex).`;
  return entorno[VARIABLE_CLAVE[p]] ? null : `Falta la clave ${VARIABLE_CLAVE[p]} en el entorno del servidor.`;
}
export function estadoProveedores(entorno: Entorno): { id: ProveedorExterno; disponible: boolean; motivo: string | null }[] {
  return PROVEEDORES_EXTERNOS.map((id) => { const motivo = motivoNoDisponible(id, entorno); return { id, disponible: !motivo, motivo }; });
}
/** `clave-externa` solo se ofrece a `planificar` cuando hay clave Y permiso. */
export function capacidadesExternas(entorno: Entorno): Requisito3D[] {
  return PROVEEDORES_EXTERNOS.some((p) => !motivoNoDisponible(p, entorno)) ? ["clave-externa"] : [];
}
/** La tabla del taller sin los motores de clave externa que no estén disponibles (ni los desconocidos). */
export function motoresDisponibles(entorno: Entorno, motores: readonly Motor3D[] = MOTORES_3D): Motor3D[] {
  return motores.filter((m) => !m.necesita.includes("clave-externa") || (esProveedor(m.id) && !motivoNoDisponible(m.id, entorno)));
}
export const procedenciaExterna = (p: ProveedorExterno): Procedencia | null => { const m = MOTORES_3D.find((x) => x.id === p); return m ? procedenciaDe(m) : null; };
export function motivoImagen(img: Imagen): string | null {
  if (!(MIMES_EXTERNOS as readonly string[]).includes(img.mime)) return `Formato no admitido (solo PNG o JPEG); llegó «${img.mime}».`;
  return img.bytes.byteLength > 0 && img.bytes.byteLength <= MAX_IMAGEN_BYTES ? null : `La imagen está vacía o pesa más de ${MAX_IMAGEN_BYTES / 1048576} MB.`;
}
/** Solo descargas https desde los dominios del propio proveedor (nunca una URL cualquiera). */
export function esUrlDescarga(p: ProveedorExterno, url: unknown): url is string {
  const sufijos = p === "meshy" ? [".meshy.ai"] : [".tripo3d.ai", ".tripo3d.com"];
  try { const u = new URL(String(url)); return u.protocol === "https:" && sufijos.some((s) => u.hostname.endsWith(s)); } catch { return false; }
}

const HTTP: Record<number, string> = { 401: "rechazó la clave (no es válida o se borró)", 402: "sin créditos o el plan no incluye esta función",
  403: "sin créditos o el plan no incluye esta función", 429: "demasiadas peticiones; prueba en unos minutos" };
/** Una petición, sin reintentos. Tripo envuelve todo en {code, data}; Meshy responde el objeto tal cual. */
async function pedir(p: ProveedorExterno, entorno: Entorno, buscar: Buscar, url: string, init: RequestInit = {}): Promise<Resultado<Objeto>> {
  const headers: Record<string, string> = { Authorization: `Bearer ${entorno[VARIABLE_CLAVE[p]] ?? ""}` };
  if (typeof init.body === "string") headers["Content-Type"] = "application/json";
  const r = await buscar(url, { ...init, headers }).catch(() => null);
  if (!r) return mal(`No se pudo contactar con ${NOMBRE[p]} (sin red).`);
  if (!r.ok) return mal(`${NOMBRE[p]}: ${HTTP[r.status] ?? `respondió HTTP ${r.status}`}.`);
  const o = (await r.json().catch(() => null)) as Objeto | null;
  if (!o || typeof o !== "object") return mal(`La respuesta de ${NOMBRE[p]} no se pudo leer.`);
  if (p === "meshy") return { ok: true, valor: o };
  if (o.code !== 0) return mal(`Tripo devolvió el código ${String(o.code)}: ${String(o.message ?? "sin detalle").slice(0, 120)}`);
  return { ok: true, valor: (o.data ?? {}) as Objeto };
}
const conId = (v: unknown, p: ProveedorExterno): Resultado<string> => { const id = texto(v); return id ? { ok: true, valor: id } : mal(`${NOMBRE[p]} no devolvió el id de la tarea.`); };

/** Crea la tarea imagen → 3D y devuelve su id (Tripo: primero sube la imagen y usa su file_token). */
export async function crearTarea(p: ProveedorExterno, img: Imagen, entorno: Entorno, buscar: Buscar = fetch): Promise<Resultado<string>> {
  const no = motivoNoDisponible(p, entorno) ?? motivoImagen(img);
  if (no) return mal(no);
  if (p === "meshy") {
    const image_url = `data:${img.mime};base64,${Buffer.from(img.bytes).toString("base64")}`;
    const r = await pedir(p, entorno, buscar, API_MESHY, { method: "POST", body: JSON.stringify({ image_url, ai_model: MODELO.meshy, should_texture: true }) });
    return r.ok ? conId(r.valor.result, p) : r;
  }
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(img.bytes)], { type: img.mime }), img.mime === "image/png" ? "imagen.png" : "imagen.jpg");
  const subida = await pedir(p, entorno, buscar, `${API_TRIPO}/files`, { method: "POST", body: form });
  if (!subida.ok) return subida;
  const input = texto(subida.valor.file_token);
  if (!input) return mal("Tripo no devolvió el file_token de la imagen.");
  const r = await pedir(p, entorno, buscar, `${API_TRIPO}/generation/image-to-model`, { method: "POST", body: JSON.stringify({ input, model: MODELO.tripo }) });
  return r.ok ? conId(r.valor.task_id, p) : r;
}

const ESTADOS: Record<string, EstadoTarea["estado"]> = {
  PENDING: "en-cola", IN_PROGRESS: "trabajando", SUCCEEDED: "lista", FAILED: "fallida", CANCELED: "fallida",
  queued: "en-cola", running: "trabajando", success: "lista", failed: "fallida", cancelled: "fallida", banned: "fallida",
};
/** UNA consulta del estado: quien llama decide cuándo volver a preguntar (aquí no hay sondeo). */
export async function consultarTarea(p: ProveedorExterno, id: string, entorno: Entorno, buscar: Buscar = fetch): Promise<Resultado<EstadoTarea>> {
  const no = motivoNoDisponible(p, entorno) ?? (/^[\w-]{1,80}$/.test(id) ? null : "El id de la tarea no es válido.");
  if (no) return mal(no);
  const r = await pedir(p, entorno, buscar, p === "meshy" ? `${API_MESHY}/${id}` : `${API_TRIPO}/tasks/${id}`);
  if (!r.ok) return r;
  const v = r.valor, estado = ESTADOS[String(v.status)];
  if (!estado) return mal(`${NOMBRE[p]} devolvió un estado que no conozco («${String(v.status).slice(0, 40)}»).`);
  const progreso = typeof v.progress === "number" ? Math.min(100, Math.max(0, v.progress)) : 0;
  const salida = ((p === "meshy" ? v.model_urls : v.output) ?? {}) as Objeto;
  const error = p === "meshy" ? ((v.task_error ?? {}) as Objeto).message : v.error_message;
  const glb = p === "meshy" ? salida.glb : salida.model_url;
  const fin = (e: EstadoTarea["estado"], motivo: string | null, url: string | null = null): Resultado<EstadoTarea> => ({ ok: true, valor: { estado: e, progreso: url ? 100 : progreso, glb: url, motivo } });
  if (estado === "fallida") return fin(estado, texto(error)?.slice(0, 160) ?? `${NOMBRE[p]} no pudo generar el modelo.`);
  if (estado !== "lista") return fin(estado, null);
  return esUrlDescarga(p, glb) ? fin(estado, null, glb) : fin("fallida", `Terminó sin un GLB descargable del propio ${NOMBRE[p]}.`);
}
