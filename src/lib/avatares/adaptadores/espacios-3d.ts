/**
 * Adaptador para motores 3D con Space público desde el navegador (tarea ESP1011C).
 * Contratos: architecture/astraura-avatares-3d.md §11.2 y architecture/astraura-imagenes.md §3.
 *
 * Usa el cliente de ESP1011A (`src/lib/espacios/cliente-espacios.ts`) que corre EN EL
 * NAVEGADOR de cada persona: cada quien gasta su cuota de ZeroGPU. El token, si lo
 * pone, solo vive en su aparato. Con imagen de referencia se pide permiso; fotos de
 * personas, consentimiento siempre. Si un Space está dormido, lleno, sin cuota o con
 * la API cambiada, se dice y se pasa al siguiente (Pixal3D → TRELLIS.2). Los núcleos
 * puros ya probados no se modifican.
 */
import {
  ejecutarEspacio,
  generarConRespaldo,
  motivoSinPermiso,
  type ArchivoDescargado,
  type EntradaEspacio,
  type IntentoFallido,
  type OpcionEspacio,
  type OpcionesEjecucion,
} from "@/lib/espacios/cliente-espacios";
import { procedenciaDe } from "@/lib/avatares/adn/canalizacion";
import { MOTORES_3D } from "@/lib/avatares/adn/motores";
import type { Procedencia } from "@/lib/avatares/adn/adn";
import type { Destino3D } from "@/lib/avatares/adn/optimizacion";

export const ESPACIO_PIXAL3D = "TencentARC/Pixal3D";
export const ESPACIO_TRELLIS2 = "microsoft/TRELLIS.2";

export const ENDPOINT_GENERAR_PIXAL3D = "generate_3d";
export const ENDPOINT_GENERAR_TRELLIS2 = "generate_3d";

export interface OpcionesGenerar3DEspacio {
  /** Imagen a convertir en 3D. */
  imagen: Blob;
  /** Título para guardar en la Biblioteca. */
  titulo: string;
  /** Destino para elegir optimizaciones (avatar, bot, pieza, protomolecula, impresion). */
  destino?: Destino3D;
  /** true explícito: la persona acepta que SU imagen salga a Hugging Face. */
  permisoRemoto?: boolean;
  /** La imagen contiene personas reales. */
  esFotoDePersonas?: boolean;
  /** Consentimiento de las personas fotografiadas. */
  consentimientoPersonas?: boolean;
  /** Semilla opcional si el Space la acepta. */
  semilla?: number;
  /** Datos extra por parámetro de la API real del Space. */
  datos?: Record<string, unknown>;
}

export interface ResultadoGenerar3DEspacio {
  ok: true;
  archivo: ArchivoDescargado;
  espacioId: string;
  motorId: "pixal3d-espacio" | "trellis2-espacio";
  procedencia: Procedencia[];
  segundosGpu: number;
  intentos: IntentoFallido[];
  aviso?: string;
}

export interface FalloGenerar3DEspacio {
  ok: false;
  motivo: string;
  intentos: IntentoFallido[];
}

/** Plan por defecto: Pixal3D primero, TRELLIS.2 como respaldo (decisión Alex 2026-10-11). */
export function planEspacios3D(): readonly OpcionEspacio[] {
  return [
    { espacioId: ESPACIO_PIXAL3D, endpoint: ENDPOINT_GENERAR_PIXAL3D },
    { espacioId: ESPACIO_TRELLIS2, endpoint: ENDPOINT_GENERAR_TRELLIS2 },
  ];
}

function motorIdDeEspacio(espacioId: string): "pixal3d-espacio" | "trellis2-espacio" | null {
  if (espacioId === ESPACIO_PIXAL3D) return "pixal3d-espacio";
  if (espacioId === ESPACIO_TRELLIS2) return "trellis2-espacio";
  return null;
}

function procedenciaDeEspacio(espacioId: string): Procedencia[] {
  const mid = motorIdDeEspacio(espacioId);
  if (!mid) return [];
  const m = MOTORES_3D.find((x) => x.id === mid);
  return m ? [procedenciaDe(m)] : [];
}

/** Motivo humano claro antes de llamar (permiso/consentimiento). */
export function motivoDenegacionEspacio3D(op: OpcionesGenerar3DEspacio): string | null {
  const entrada: EntradaEspacio = { imagen: op.imagen };
  const p = {
    permiso: op.permisoRemoto,
    esFotoDePersonas: op.esFotoDePersonas,
    consentimientoPersonas: op.consentimientoPersonas,
  };
  return motivoSinPermiso(entrada, p);
}

/** Genera el GLB desde el navegador con respaldo Pixal3D → TRELLIS.2. */
export async function generar3DEspacios(
  op: OpcionesGenerar3DEspacio,
  ejec: OpcionesEjecucion = {},
): Promise<ResultadoGenerar3DEspacio | FalloGenerar3DEspacio> {
  const denegado = motivoDenegacionEspacio3D(op);
  if (denegado) {
    return { ok: false, motivo: denegado, intentos: [] };
  }

  const entrada: EntradaEspacio = {
    imagen: op.imagen,
    datos: op.semilla !== undefined ? { seed: op.semilla, ...op.datos } : op.datos,
  };
  const ejecConPermiso: OpcionesEjecucion = {
    ...ejec,
    permiso: op.permisoRemoto,
    esFotoDePersonas: op.esFotoDePersonas,
    consentimientoPersonas: op.consentimientoPersonas,
  };

  const r = await generarConRespaldo(planEspacios3D(), entrada, ejecConPermiso);
  if (!r.ok) {
    // Explica de forma clara qué pasó con cada opción
    const motivos = r.intentos.map((i) => {
      if (i.tipo === "cuota") return `${i.espacioId}: sin cuota hoy`;
      if (i.tipo === "dormido") return `${i.espacioId}: dormido/arrancando`;
      if (i.tipo === "lleno") return `${i.espacioId}: cola llena`;
      if (i.tipo === "api-cambiada") return `${i.espacioId}: API cambiada`;
      if (i.tipo === "permiso") return `${i.espacioId}: falta permiso/consentimiento`;
      return `${i.espacioId}: ${i.motivo}`;
    });
    const motivo = motivos.length
      ? `No se pudo generar el GLB en ningún Space. ${motivos.join(" · ")}.`
      : "No se pudo generar el GLB en ningún Space.";
    return { ok: false, motivo, intentos: r.intentos };
  }

  const mid = motorIdDeEspacio(r.espacioId);
  if (!mid) {
    return {
      ok: false,
      motivo: `El Space ${r.espacioId} devolvió un resultado, pero no está en el plan de respaldo conocido.`,
      intentos: r.intentos,
    };
  }

  const aviso = r.espacioId === ESPACIO_TRELLIS2 && r.intentos.some((i) => i.espacioId === ESPACIO_PIXAL3D)
    ? "Pixal3D no estaba disponible o sin cuota; se usó TRELLIS.2 como respaldo."
    : undefined;

  return {
    ok: true,
    archivo: r.archivo,
    espacioId: r.espacioId,
    motorId: mid,
    procedencia: procedenciaDeEspacio(r.espacioId),
    segundosGpu: r.segundosGpu,
    intentos: r.intentos,
    aviso,
  };
}

/** Ejecuta directamente sobre un Space concreto (útil para pruebas o elección explícita). */
export async function generar3DEspacioDirecto(
  espacioId: string,
  endpoint: string,
  op: OpcionesGenerar3DEspacio,
  ejec: OpcionesEjecucion = {},
): Promise<ResultadoGenerar3DEspacio | FalloGenerar3DEspacio> {
  const denegado = motivoDenegacionEspacio3D(op);
  if (denegado) {
    return { ok: false, motivo: denegado, intentos: [] };
  }
  const entrada: EntradaEspacio = {
    imagen: op.imagen,
    datos: op.semilla !== undefined ? { seed: op.semilla, ...op.datos } : op.datos,
  };
  const ejecConPermiso: OpcionesEjecucion = {
    ...ejec,
    permiso: op.permisoRemoto,
    esFotoDePersonas: op.esFotoDePersonas,
    consentimientoPersonas: op.consentimientoPersonas,
  };
  try {
    const r = await ejecutarEspacio(espacioId, endpoint, entrada, ejecConPermiso);
    const archivo = r.archivos[0];
    if (!archivo) {
      return { ok: false, motivo: `El Space ${espacioId} terminó sin devolver ningún archivo.`, intentos: [] };
    }
    if (ejecConPermiso.alProgreso) ejecConPermiso.alProgreso({ fase: "descargando" });
    const descargado = await (await import("@/lib/espacios/cliente-espacios")).descargarArchivo(espacioId, archivo, r.base, ejecConPermiso);
    const mid = motorIdDeEspacio(espacioId);
    if (!mid) {
      return { ok: false, motivo: `El Space ${espacioId} devolvió un resultado, pero no está en el plan de respaldo conocido.`, intentos: [] };
    }
    return {
      ok: true,
      archivo: descargado,
      espacioId,
      motorId: mid,
      procedencia: procedenciaDeEspacio(espacioId),
      segundosGpu: r.segundosGpu,
      intentos: [],
    };
  } catch (e: any) {
    const intentos: IntentoFallido[] = e?.espacioId ? [{ espacioId: e.espacioId, tipo: e.tipo, motivo: e?.message ?? "Error desconocido" }] : [];
    return { ok: false, motivo: e?.message ?? "Error desconocido", intentos };
  }
}

export { ejecutarEspacio, generarConRespaldo } from "@/lib/espacios/cliente-espacios";
