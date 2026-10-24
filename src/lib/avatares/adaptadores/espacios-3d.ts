/**
 * Adaptador de los motores «espacio» del taller 3D (Pixal3D y TRELLIS.2) para la
 * Ola ESP1011. Contrato: architecture/astraura-avatares-3d.md §11.2.
 *
 * Los Spaces se llaman DESDE EL NAVEGADOR de cada persona con el cliente de
 * ESP1011A (`src/lib/espacios/cliente-espacios.ts`): cada quien gasta SU cuota
 * de ZeroGPU. Nada va por nuestros servidores: la ruta de G3D1011F queda como
 * respaldo de validación y ya no alimenta a este adaptador. El token de HF, si
 * existe, solo viaja a Hugging Face.
 *
 * «Basta de ilusiones»: los pasos vienen de la API que cada Space publica.
 * APIs REALES leídas en `/gradio_api/info` el 2026-10-24:
 *  · TencentARC/Pixal3D: /preprocess (image) → /generate_3d (image, seed,
 *    resolution —los tres SIN valor por defecto—) → /extract_glb_api
 *    (state_path, decimation_target, texture_size, sin defecto). Valores
 *    publicados por el propio Space (G3D1011F): seed 1234, resolución 1024,
 *    decimación 120000 y textura 1024.
 *  · microsoft/TRELLIS.2: /start_session → /preprocess_image (input) →
 *    /image_to_3d (image; seed/resolution con defecto) → /extract_glb
 *    (decimation_target y texture_size con defecto; el estado vive en la
 *    sesión).
 *
 * Si Pixal3D falla o se agota la cuota, se prueba TRELLIS.2 y se dice qué pasó
 * con cada intento. La malla cerrada y los LOD los encarga a la neurona que
 * pueda con el reparto de G3D1011D (`reparto-taller.ts`): la A1 remalla con
 * vóxeles de Blender y optimiza en CPU. PURO: la red va inyectada.
 */
import type { Procedencia } from "../adn/adn";
import { MOTORES_3D } from "../adn/motores";
import { planOptimizacion, type Destino3D } from "../adn/optimizacion";
import { elegirNeurona, type EleccionTaller, type EncargoTaller, type NeuronaTaller } from "./reparto-taller";
import {
  DECIMACION_POR_DEFECTO,
  ESPACIO_HF_ID,
  RESOLUCION_POR_DEFECTO,
  TEXTURA_POR_DEFECTO,
  statePathDeResultado,
} from "./espacio-hf";
import {
  ErrorEspacio,
  agotadoHoy,
  descargarArchivo,
  ejecutarEspacio,
  motivoSinPermiso,
  type FalloEspacio,
  type FileDataGradio,
} from "@/lib/espacios/cliente-espacios";

/* ── El plan de cada Space: sus funciones reales, en el orden del propio flujo ── */

export const MOTORES_ESPACIO_3D = ["pixal3d-espacio", "trellis2-espacio"] as const;
export type MotorEspacio3D = (typeof MOTORES_ESPACIO_3D)[number];

/** Para cada paso: sube la imagen nueva, pasa el resultado ANTERIOR del paso anterior o no lleva nada. */
export interface Paso3d {
  endpoint: string;
  entrada: "nueva" | "anterior" | "nada";
  /** Cómo se pasa el resultado anterior: como archivo (FileData) o como su ruta (state_path). */
  valor?: "archivo" | "ruta";
  /** Nombre del parámetro por el que va el resultado anterior (lo publica el propio Space). */
  nombre?: string;
  /** Valores fijos; si el Space no da defecto (Pixal3D), van los que él mismo publica. */
  datos?: Record<string, unknown>;
}

export interface PlanEspacio3d {
  motor: MotorEspacio3D;
  espacioId: string;
  pasos: readonly Paso3d[];
  /** Día en que se leyó la API real del Space (basta de ilusiones). */
  verificado: string;
}

export const PLAN_PIXAL3D: PlanEspacio3d = {
  motor: "pixal3d-espacio",
  espacioId: ESPACIO_HF_ID,
  verificado: "2026-10-24",
  pasos: [
    { endpoint: "preprocess", entrada: "nueva" },
    { endpoint: "generate_3d", entrada: "anterior", valor: "archivo", nombre: "image", datos: { seed: 1234, resolution: RESOLUCION_POR_DEFECTO } },
    { endpoint: "extract_glb_api", entrada: "anterior", valor: "ruta", nombre: "state_path", datos: { decimation_target: DECIMACION_POR_DEFECTO, texture_size: TEXTURA_POR_DEFECTO } },
  ],
};

export const PLAN_TRELLIS2: PlanEspacio3d = {
  motor: "trellis2-espacio",
  espacioId: "microsoft/TRELLIS.2",
  verificado: "2026-10-24",
  pasos: [
    { endpoint: "start_session", entrada: "nada" },
    { endpoint: "preprocess_image", entrada: "nueva" },
    { endpoint: "image_to_3d", entrada: "anterior", valor: "archivo", nombre: "image" },
    { endpoint: "extract_glb", entrada: "nada" },
  ],
};

/** Pixal3D primero (más fidelidad); TRELLIS.2 de respaldo (§11.2). */
export const PLANES_3D: readonly PlanEspacio3d[] = [PLAN_PIXAL3D, PLAN_TRELLIS2];

/** El orden que pide el momento: el motor preferido primero (por defecto, Pixal3D). */
export function ordenDePlanes(preferido?: MotorEspacio3D): readonly PlanEspacio3d[] {
  return [...PLANES_3D].sort((a, b) => (a.motor === preferido ? 0 : 1) - (b.motor === preferido ? 0 : 1));
}

/* ── Lo que se inyecta: el cliente de ESP1011A corre en el navegador de cada persona ── */

/** Una llamada terminada a un endpoint del Space (la firma real de `ejecutarEspacio`). */
export interface Llamada3d {
  datos: unknown[];
  archivos: FileDataGradio[];
  segundosGpu: number;
  base: { host: string; apiPrefix: string };
}

export interface OpcionesRed3d {
  permiso?: boolean;
  esFotoDePersonas?: boolean;
  consentimientoPersonas?: boolean;
  token?: string | null;
}

export interface Cliente3d {
  llamar: (espacioId: string, endpoint: string, entrada: { imagen?: Blob; datos?: Record<string, unknown> }, op: OpcionesRed3d) => Promise<Llamada3d>;
  bajar: (espacioId: string, archivo: FileDataGradio, base: { host: string; apiPrefix: string }, op: OpcionesRed3d) => Promise<{ blob: Blob; tipo: "imagen" | "glb" | "otro"; nombre: string }>;
}

/** El cliente real: la cuota, el token y los errores de «basta de ilusiones» los cuenta ESP1011A. */
export const clienteNavegador: Cliente3d = {
  llamar: (espacioId, endpoint, entrada, op) => ejecutarEspacio(espacioId, endpoint, entrada, op),
  bajar: (espacioId, archivo, base, op) => descargarArchivo(espacioId, archivo, base, op),
};

export interface DependenciasEspacios3d {
  cliente: Cliente3d;
  /** ¿El Space ya dijo hoy que se acabó la cuota? Por defecto, lo contado en el aparato. */
  agotado?: (espacioId: string) => boolean;
}

export const dependenciasNavegador: DependenciasEspacios3d = {
  cliente: clienteNavegador,
  agotado: (espacioId) => agotadoHoy(espacioId),
};

export interface OpcionesGlb3d extends OpcionesRed3d {
  /** Motor preferido (por defecto Pixal3D; si falla o no hay cuota, TRELLIS.2). */
  motor?: MotorEspacio3D;
}

/** Qué pasó con cada Space que se probó (para decirlo todo, nada de ilusiones). */
export interface IntentoEspacio3d {
  espacioId: string;
  tipo: FalloEspacio;
  motivo: string;
}

export type FalloGeneracion3d = "sin-memoria" | "lento" | "otro";

export type ResultadoGlb3d =
  | { ok: true; motor: MotorEspacio3D; espacioId: string; glb: Blob; segsGpu: number; intentos: IntentoEspacio3d[]; procedencia: Procedencia[]; lods: number[] }
  | { ok: false; fallo: FalloGeneracion3d; motivo: string; intentos: IntentoEspacio3d[] };

/* ── Ayudantes puros ── */

/** Procedencia del motor del taller (`motores.ts`): licencia, uso y atribución viajan con el GLB. */
export function procedenciaDeMotor(motor: MotorEspacio3D): Procedencia {
  const m = MOTORES_3D.find((x) => x.id === motor);
  return {
    herramienta: m?.nombre ?? motor,
    licencia: m?.licencia ?? "sin declarar",
    uso: m?.uso ?? "condicionado",
    ...(m?.atribucion ? { atribucion: m.atribucion } : {}),
    ...(m?.regionesExcluidas?.length ? { regionesExcluidas: m.regionesExcluidas } : {}),
  };
}

/** Del resultado, el GLB del Space. Cuidado: puede llegar antes un vídeo de muestra. */
function eligeGlb(archivos: readonly FileDataGradio[]): FileDataGradio | null {
  return archivos.find((a) => /\.glb$/i.test(a.orig_name ?? "") || /\.glb$/i.test(a.path) || /gltf-binary/i.test(a.mime_type ?? "")) ?? null;
}

/**
 * Ejecuta el plan de UN Space paso a paso con el cliente de ESP1011A. Cada paso
 * vale por la API que el propio Space publica; un fallo corta y sube.
 */
async function glbDePlan(plan: PlanEspacio3d, imagen: Blob, op: OpcionesGlb3d, cliente: Cliente3d): Promise<{ glb: Blob; segsGpu: number; procedencia: Procedencia[]; lods: number[] }> {
  let archivo: FileDataGradio | null = null;
  let ruta = "";
  let segs = 0;
  let ultimo: Llamada3d | null = null;
  for (const paso of plan.pasos) {
    const entrada: { imagen?: Blob; datos?: Record<string, unknown> } = { ...paso.datos };
    if (paso.entrada === "nueva") entrada.imagen = imagen;
    if (paso.entrada === "anterior") {
      if (!archivo) {
        throw new ErrorEspacio("api-cambiada", plan.espacioId, `El paso ${paso.endpoint} de ${plan.espacioId} necesita el resultado del paso anterior y no hay ninguno.`);
      }
      entrada.datos = { [paso.nombre ?? "image"]: paso.valor === "archivo" ? archivo : ruta || archivo.path, ...entrada.datos };
    }
    const r = await cliente.llamar(plan.espacioId, paso.endpoint, entrada, op);
    ultimo = r;
    segs += r.segundosGpu;
    archivo = r.archivos[0] ?? archivo;
    ruta = statePathDeResultado(r.datos) ?? ruta;
  }
  const elegido = ultimo ? eligeGlb(ultimo.archivos) : null;
  if (!elegido) {
    throw new ErrorEspacio("api-cambiada", plan.espacioId, `El Space ${plan.espacioId} terminó sin devolver un GLB.`);
  }
  const a = await cliente.bajar(plan.espacioId, elegido, ultimo.base, op);
  if (a.tipo !== "glb") {
    throw new ErrorEspacio("api-cambiada", plan.espacioId, `Lo que devolvió ${plan.espacioId} no es un modelo GLB (llegó «${a.nombre}»).`);
  }
  return { glb: a.blob, segsGpu: segs, procedencia: [procedenciaDeMotor(plan.motor)], lods: [] };
}

/**
 * Genera el GLB desde el navegador de la persona: Pixal3D primero y, si falla o
 * no queda cuota, TRELLIS.2 — y se dice qué pasó en cada intento. Los LOD quedan
 * vacíos: los encarga a la neurona que remalla y optimiza (la A1).
 */
export async function generarGlb3d(imagen: Blob, op: OpcionesGlb3d = {}, deps: DependenciasEspacios3d = dependenciasNavegador): Promise<ResultadoGlb3d> {
  const sinPermiso = motivoSinPermiso({ imagen }, op);
  if (sinPermiso) return { ok: false, fallo: "otro", motivo: sinPermiso, intentos: [] };
  const agotado = deps.agotado ?? (() => false);
  const intentos: IntentoEspacio3d[] = [];
  for (const plan of ordenDePlanes(op.motor)) {
    if (agotado(plan.espacioId)) {
      intentos.push({ espacioId: plan.espacioId, tipo: "cuota", motivo: `Hoy ya se acabó tu cuota en ${plan.espacioId}; se pasa a la siguiente opción sin gastar otra llamada.` });
      continue;
    }
    try {
      const r = await glbDePlan(plan, imagen, op, deps.cliente);
      return { ok: true, motor: plan.motor, espacioId: plan.espacioId, ...r, intentos };
    } catch (e) {
      const tipo: FalloEspacio = e instanceof ErrorEspacio ? e.tipo : "error";
      intentos.push({ espacioId: plan.espacioId, tipo, motivo: e instanceof Error ? e.message : `Fallo inesperado con ${plan.espacioId}.` });
      if (tipo === "permiso") break;
    }
  }
  const resumen = intentos.map((i) => i.motivo).join(" ");
  return { ok: false, fallo: "otro", motivo: `Ningún Space pudo generar el modelo. ${resumen || "No hay planes de Spaces para 3D."}`.trim(), intentos };
}

/* ── Conexiones con el resto de la ola ── */

/** La forma EXACTA que pide el diálogo de G3D1011E (`Dependencias3D[«espacio»]`): conectable tal cual. */
export type RespuestaDialogo3d =
  | { ok: true; glb: Blob; lods: number[]; procedencia: Procedencia[] }
  | { ok: false; fallo: FalloGeneracion3d; motivo: string };

export async function espacioDesdeNavegador(
  img: Blob,
  op: { permisoRemoto: boolean; esFotoDePersonas: boolean; consentimientoPersonas: boolean },
  deps: DependenciasEspacios3d = dependenciasNavegador,
): Promise<RespuestaDialogo3d> {
  const r = await generarGlb3d(img, { permiso: op.permisoRemoto, esFotoDePersonas: op.esFotoDePersonas, consentimientoPersonas: op.consentimientoPersonas }, deps);
  return r.ok ? { ok: true, glb: r.glb, lods: r.lods, procedencia: r.procedencia } : { ok: false, fallo: r.fallo, motivo: r.motivo };
}

/** Los niveles de detalle que pide el destino (los hará la neurona del cierre). */
export const lodsDeDestino = (destino: Destino3D): number[] => planOptimizacion(destino).lods;

/**
 * El cierre del plan (malla cerrada u optimización) viaja a la neurona que pueda
 * con el reparto de G3D1011D: partiendo de la malla ya generada (partida
 * «malla»), la A1 la remalla con vóxeles de Blender y la optimiza en CPU.
 */
export function encargoCierre(
  destino: Destino3D,
  cerrada: boolean,
  neuronas: readonly NeuronaTaller[],
  extra: { cuenta?: string | null; grupos?: readonly string[]; region?: string | null; comercial?: boolean } = {},
): EleccionTaller {
  const encargo: EncargoTaller = {
    destino, partida: "malla", esqueleto: "ninguno", region: extra.region ?? null,
    comercial: extra.comercial ?? false, cerrada, cuenta: extra.cuenta, grupos: extra.grupos,
  };
  return elegirNeurona(encargo, neuronas);
}
