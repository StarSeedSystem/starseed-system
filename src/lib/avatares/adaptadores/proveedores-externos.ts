/**
 * Avatares 3D · PROVEEDORES EXTERNOS (AV1011I). Contrato: architecture/astraura-avatares-3d.md §1 y §4.
 *
 * Meshy y Tripo son servicios DE PAGO, apagados por defecto: solo funcionan si A LA VEZ hay
 * permiso (`AVATARES_EXTERNOS_PERMITIDOS=1`) y la clave del proveedor en el entorno
 * (`MESHY_API_KEY` / `TRIPO_API_KEY`). La clave jamás sale del servidor.
 *
 * - Meshy: llamada implementada con la documentación oficial (docs.meshy.ai, verificada el
 *   2026-10-12): `POST https://api.meshy.ai/openapi/v1/image-to-3d` → `{ result: "<id tarea>" }`.
 *   Plan gratis: salida CC BY 4.0 con atribución («Modelo 3D generado con Meshy»).
 * - Tripo: su documentación de API NO se pudo verificar: no hay llamada, solo «no disponible».
 *
 * Incluye el tope diario por persona y la procedencia que viaja con el avatar.
 */
import type { Procedencia } from "@/lib/avatares/adn/adn";

export type TFetch = typeof fetch;

/** Máximo de generaciones externas por persona y día (el plan gratis de Meshy da ~100 créditos/mes). */
export const TOPE_DIARIO_POR_PERSONA = 5;

export interface EntornoExternos {
  AVATARES_EXTERNOS_PERMITIDOS?: string;
  MESHY_API_KEY?: string;
  TRIPO_API_KEY?: string;
}

export interface ConfigExternos {
  /** Algún proveedor listo para usarse de verdad (permiso + clave). */
  disponible: boolean;
  /** ids con permiso y clave; `capacidades` de `planificar` solo gana "clave-externa" si hay alguno. */
  ids: string[];
  motivo: string;
}

interface InfoProveedor { id: "meshy" | "tripo"; claveEnv: keyof EntornoExternos; nombre: string }
const PROVEEDORES: readonly InfoProveedor[] = [
  { id: "meshy", claveEnv: "MESHY_API_KEY", nombre: "Meshy" },
  { id: "tripo", claveEnv: "TRIPO_API_KEY", nombre: "Tripo" },
];

/** «Solo funcionan si a la vez están el permiso y la clave» (§1, §10). */
export function externosPermitidos(entorno: EntornoExternos): ConfigExternos {
  const activos = PROVEEDORES.filter(
    (p) => Boolean(entorno[p.claveEnv]?.trim()) && entorno.AVATARES_EXTERNOS_PERMITIDOS === "1",
  ).map((p) => p.id);
  return {
    disponible: activos.length > 0,
    ids: activos,
    motivo: activos.length
      ? `Proveedores externos activos: ${activos.join(", ")}.`
      : "Proveedores externos no disponibles: falta el permiso (AVATARES_EXTERNOS_PERMITIDOS=1) o la clave del proveedor.",
  };
}

/** True si a `planificar` debe ofrecerse la capacidad "clave-externa" (ambas condiciones cumplidas). */
export function ofrecerClaveExterna(entorno: EntornoExternos): boolean {
  return externosPermitidos(entorno).disponible;
}

/** Procedencia que viaja con el avatar (§5). Meshy plan gratis: CC BY 4.0 con atribución. */
export function procedenciaExterna(proveedor: string): Procedencia {
  if (proveedor === "meshy") {
    return {
      herramienta: "meshy",
      licencia: "CC BY 4.0 en el plan gratis; privada en los de pago",
      uso: "atribucion",
      atribucion: "Modelo 3D generado con Meshy",
    };
  }
  return { herramienta: proveedor, licencia: "términos de Tripo (sin comprobar)", uso: "condicionado" };
}

/* ── Tope diario por persona (contador inyectable para poder probarlo) ── */
export type ContadorTope = Map<string, number>;

/** Clave de conteo `persona@AAAA-MM-DD` (día en UTC). */
export function claveDia(persona: string, ahora: number): string {
  return `${persona}@${new Date(ahora).toISOString().slice(0, 10)}`;
}

/** Cuántas generaciones le quedan hoy a esta persona. */
export function topeRestante(contador: ContadorTope, persona: string, ahora: number): number {
  return Math.max(0, TOPE_DIARIO_POR_PERSONA - (contador.get(claveDia(persona, ahora)) ?? 0));
}

/** Anota un uso; devuelve false si ya llegó al tope diario (y no anota). */
export function registrarUso(contador: ContadorTope, persona: string, ahora: number): boolean {
  const clave = claveDia(persona, ahora);
  const usos = contador.get(clave) ?? 0;
  if (usos >= TOPE_DIARIO_POR_PERSONA) return false;
  contador.set(clave, usos + 1);
  return true;
}

/* ── Meshy (documentación oficial verificada 2026-10-12) ── */
export const MESHY_IMAGEN_A_3D = "https://api.meshy.ai/openapi/v1/image-to-3d";

/** Crea una tarea `image-to-3d` en Meshy y devuelve el id de la tarea. Error si responde mal. */
export async function crearTareaMeshy(imagenUrl: string, clave: string, fetchFn: TFetch = fetch): Promise<string> {
  const respuesta = await fetchFn(MESHY_IMAGEN_A_3D, {
    method: "POST",
    headers: { Authorization: `Bearer ${clave}`, "Content-Type": "application/json" },
    body: JSON.stringify({ image_url: imagenUrl, should_remesh: true, should_texture: true, target_formats: ["glb"] }),
  });
  if (!respuesta.ok) throw new Error(`Meshy respondió ${respuesta.status}.`);
  const datos = (await respuesta.json()) as { result?: unknown };
  if (typeof datos.result !== "string" || !datos.result) throw new Error("Meshy no devolvió el id de la tarea.");
  return datos.result;
}

/**
 * Crea la tarea en el proveedor pedido. Tripo no tiene documentación verificable: «no disponible».
 * La clave la lee el servidor del entorno; nunca viaja al cliente.
 */
export async function crearTareaExterna(
  proveedor: string, imagenUrl: string, clave: string, fetchFn: TFetch = fetch,
): Promise<{ ok: true; tarea: string } | { ok: false; motivo: string }> {
  if (proveedor === "meshy") {
    try {
      return { ok: true, tarea: await crearTareaMeshy(imagenUrl, clave, fetchFn) };
    } catch (e) {
      return { ok: false, motivo: e instanceof Error ? e.message : "Meshy no respondió." };
    }
  }
  return {
    ok: false,
    motivo: "Tripo todavía no está disponible: su documentación oficial de API no se pudo verificar.",
  };
}
