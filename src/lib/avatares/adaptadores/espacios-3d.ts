/**
 * Adaptador de los Spaces públicos de Hugging Face para generación 3D (tarea
 * ESP1011C). Contrato: architecture/astraura-avatares-3d.md §11.2 · motores
 * `pixal3d-espacio` (TencentARC/Pixal3D) y `trellis2-espacio`
 * (microsoft/TRELLIS.2).
 *
 * Corre EN EL NAVEGADOR de cada persona, sobre el cliente de ESP1011A
 * (`src/lib/espacios/cliente-espacios.ts`): cada quien gasta SU cuota de
 * ZeroGPU (2 min/día sin cuenta, 5 con cuenta gratis, 40 con PRO) y la llamada
 * NUNCA pasa por nuestros servidores. La ruta de servidor de G3D1011F
 * (/api/avatares/espacio-hf) queda solo como respaldo de validación. El token
 * de Hugging Face, si la persona lo pone, vive solo en su aparato
 * (`safe-storage`) y solo viaja a Hugging Face.
 *
 * Si Pixal3D falla (dormido, lleno, sin cuota o con la API cambiada) se prueba
 * TRELLIS.2 y se dice el porqué («basta de ilusiones»). Con imagen de
 * referencia, permiso explícito; fotos de personas, siempre su consentimiento.
 * El GLB se guarda en la Biblioteca con la procedencia del motor por la vía
 * que ya existe (Dependencias3D.guardar del diálogo de G3D1011E). Y como los
 * Spaces no cierran ni optimizan: `encargoDeCierre` le encarga ese paso a la
 * neurona que pueda (la A1: vóxeles de Blender y el optimizador) con el
 * reparto de G3D1011D (`reparto-taller.ts`). PURO: la red es el `fetch`
 * inyectado del cliente.
 */
import {
  descargarArchivo,
  ejecutarEspacio,
  ErrorEspacio,
  motivoSinPermiso,
  tipoDeArchivo,
  type EntradaEspacio,
  type FileDataGradio,
  type IntentoFallido,
  type OpcionesCliente,
  type PermisosEntrada,
  type ProgresoEspacio,
} from "@/lib/espacios/cliente-espacios";
import { procedenciaDe } from "@/lib/avatares/adn/canalizacion";
import { MOTORES_3D } from "@/lib/avatares/adn/motores";
import { planOptimizacion, type Destino3D } from "../adn/optimizacion";
import type { Procedencia } from "../adn/adn";
import { MAX_IMAGEN_BYTES } from "./espacio-hf";
import { elegirNeurona, type NeuronaTaller, type OrdenTaller } from "./reparto-taller";
import type { Dependencias3D, OpcionesGenerar3D } from "./use-generar-3d";

/* ── Los dos Spaces del contrato §11.2, con su API y su motor de procedencia ── */

export interface OpcionEspacio3d {
  motorId: "pixal3d-espacio" | "trellis2-espacio";
  espacioId: string;
  /** Endpoint que genera el estado 3D a partir de la imagen. */
  generar: string;
  /** Endpoint que extrae el GLB de ese estado. */
  extraer: string;
}

export const ESPACIOS_3D: readonly OpcionEspacio3d[] = [
  { motorId: "pixal3d-espacio", espacioId: "TencentARC/Pixal3D", generar: "generate_3d", extraer: "extract_glb_api" },
  { motorId: "trellis2-espacio", espacioId: "microsoft/TRELLIS.2", generar: "image_to_3d", extraer: "extract_glb" },
];

/** Los datos del motor de la tabla del taller; null si no está (no se inventa procedencia). */
export function procedenciaDeMotor(motorId: string): Procedencia | null {
  const motor = MOTORES_3D.find((m) => m.id === motorId);
  return motor ? procedenciaDe(motor) : null;
}

/**
 * De la salida del endpoint de generar: la ruta de estado que el endpoint de
 * extraer necesita (G3D1011F la verificó: /generate_3d devuelve el estado y
 * /extract_glb_api lo pide). Primero las claves conocidas; si no, el primer
 * archivo del resultado (el Space a veces solo manda la ruta de la subida).
 */
export function estadoDeResultado(datos: unknown[], archivos: readonly FileDataGradio[] = []): string | null {
  const buscar = (v: unknown): string | null => {
    if (Array.isArray(v)) {
      for (const x of v) { const r = buscar(x); if (r) return r; }
      return null;
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      for (const k of ["state_path", "path", "state"] as const) {
        const r = o[k];
        if (typeof r === "string" && r) return r;
      }
      for (const x of Object.values(o)) { const r = buscar(x); if (r) return r; }
    }
    return null;
  };
  return buscar(datos) ?? archivos[0]?.path ?? null;
}

/* ── El flujo por Space: generar el estado, extraer el GLB y bajarlo ── */

export interface OpcionesEspacios3d extends OpcionesCliente, PermisosEntrada {
  /** Progreso de la cola de cada Space, con su nombre para saber de quién es. */
  alProgreso?: (p: ProgresoEspacio, espacioId: string) => void;
}

export type ResultadoEspacios3d =
  | { ok: true; motorId: string; espacioId: string; glb: Blob; intentos: IntentoFallido[] }
  | { ok: false; intentos: IntentoFallido[]; motivo: string };

/** Los intentos que fallaron, en una frase de la que se pueda aprender por qué. */
export function cuentaDeIntentos(intentos: readonly IntentoFallido[]): string {
  if (!intentos.length) return "No hubo ningún intento: nada se envió.";
  return intentos.map((i) => `${i.espacioId}: ${i.motivo}`).join(" · ");
}

/**
 * Genera el GLB con el Space de Pixal3D y, si falla (dormido, lleno, sin cuota
 * o con la API cambiada), con el de TRELLIS.2. Cada intento que no se llevó se
 * cuenta y se recuenta en el motivo final: nada se calla ni se simula.
 */
export async function generarGlb3d(entrada: EntradaEspacio, op: OpcionesEspacios3d = {}): Promise<ResultadoEspacios3d> {
  const intentos: IntentoFallido[] = [];
  const sinPermiso = motivoSinPermiso(entrada, op);
  if (sinPermiso) return { ok: false, intentos, motivo: sinPermiso };
  for (const o of ESPACIOS_3D) {
    const progreso = {
      ...op,
      alProgreso: (p: ProgresoEspacio) => op.alProgreso?.(p, o.espacioId),
    };
    try {
      const g = await ejecutarEspacio(o.espacioId, o.generar, entrada, progreso);
      const ruta = estadoDeResultado(g.datos, g.archivos);
      if (!ruta) {
        intentos.push({ espacioId: o.espacioId, tipo: "api-cambiada", motivo: `El Space ${o.espacioId} terminó sin devolver un estado del que extraer el GLB; su API cambió.` });
        continue;
      }
      const x = await ejecutarEspacio(o.espacioId, o.extraer, { datos: { state_path: ruta } }, progreso);
      const glbArchivo = x.archivos.find((a) => tipoDeArchivo(a.orig_name ?? a.path, a.mime_type) === "glb");
      if (!glbArchivo) {
        intentos.push({ espacioId: o.espacioId, tipo: "api-cambiada", motivo: `El Space ${o.espacioId} no devolvió un archivo GLB; su API cambió.` });
        continue;
      }
      op.alProgreso?.({ fase: "descargando" }, o.espacioId);
      const baja = await descargarArchivo(o.espacioId, glbArchivo, x.base, op);
      return { ok: true, motorId: o.motorId, espacioId: o.espacioId, glb: baja.blob, intentos };
    } catch (e) {
      if (e instanceof ErrorEspacio) {
        intentos.push({ espacioId: e.espacioId, tipo: e.tipo, motivo: e.message });
        // Sin permiso no lo arregla otro Space: se para y se dice en palabras.
        if (e.tipo === "permiso") return { ok: false, intentos, motivo: e.message };
      } else {
        intentos.push({ espacioId: o.espacioId, tipo: "error", motivo: `Fallo inesperado con ${o.espacioId}.` });
      }
    }
  }
  return { ok: false, intentos, motivo: `Ningún Space pudo generar el modelo 3D.${intentos.length ? ` ${cuentaDeIntentos(intentos)}` : ""}` };
}

/* ── Puente hacia lo que queda: Biblioteca y malla cerrada/optimización ── */

/**
 * El Space como `Dependencias3D["espacio"]` del diálogo de G3D1011E: así la
 * subida a la Biblioteca con la procedencia del motor es la `guardar` que ya
 * existe y la cuota que se gasta es la ZeroGPU de cada persona, que empieza en
 * su navegador (la ruta de servidor de G3D1011F queda como respaldo).
 */
export function espaciosComoDependencia(op: OpcionesEspacios3d = {}): NonNullable<Dependencias3D["espacio"]> {
  return async (img, og) => {
    if (img.size <= 0 || img.size > MAX_IMAGEN_BYTES) {
      return {
        ok: false, fallo: "otro",
        motivo: `La imagen no es válida o pesa más de lo permitido (${Math.floor(MAX_IMAGEN_BYTES / (1024 * 1024))} MB).`,
      };
    }
    const r = await generarGlb3d({ imagen: img }, {
      ...op,
      permiso: og.permisoRemoto === true,
      esFotoDePersonas: og.esFotoDePersonas === true,
      consentimientoPersonas: og.consentimientoPersonas === true,
    });
    if (!r.ok) return { ok: false, fallo: "otro", motivo: r.motivo };
    const procedencia = procedenciaDeMotor(r.motorId);
    if (!procedencia) {
      return { ok: false, fallo: "otro", motivo: `El motor ${r.motorId} no está en la tabla del taller: no se guarda sin su procedencia.` };
    }
    return { ok: true, glb: r.glb, lods: [], procedencia: [procedencia] };
  };
}

/* ── El paso que los Spaces no hacen: cerrar y optimizar, en la neurona que pueda ── */

export interface ContextoCierre {
  /** Cuenta que encarga (para «primero las mías»). */
  cuenta?: string | null;
  /** Grupos o comunidades de quien encarga. */
  grupos?: readonly string[];
  region: string | null;
  comercial: boolean;
}

export type Cierre3d =
  | { encargado: true; orden: OrdenTaller; motivo: string }
  | { encargado: false; orden: null; motivo: string };

/**
 * Si el destino pide malla cerrada (impresión, bot, pieza) o niveles de
 * detalle —que el Space no da—, se lo encarga a la neurona que pueda (la A1:
 * vóxeles de Blender y el optimizador) con el reparto de G3D1011D. Devuelve la
 * `OrdenTaller` lista para el bus `mg_orden` de MetaGenesis; PURO.
 */
export function encargoDeCierre(destino: Destino3D, c: ContextoCierre, neuronas: readonly NeuronaTaller[] | null): Cierre3d {
  const opt = planOptimizacion(destino, null);
  if (!opt.cerrada && opt.lods.length === 0) {
    return { encargado: false, orden: null, motivo: "El GLB del Space queda como está: este destino no pide malla cerrada ni niveles de detalle." };
  }
  if (!neuronas) {
    return { encargado: false, orden: null, motivo: "Falta cerrar y optimizar la malla (lo hace una neurona con Blender, la A1) y aquí no se leyó el registro de neuronas: queda pendiente y se dice." };
  }
  const e = elegirNeurona({
    destino, partida: "malla", esqueleto: "ninguno", region: c.region, comercial: c.comercial,
    cerrada: opt.cerrada, cuenta: c.cuenta ?? null, grupos: c.grupos,
  }, neuronas);
  if (!e.orden || !e.neurona) return { encargado: false, orden: null, motivo: `La malla cerrada y los niveles de detalle quedan pendientes: ${e.motivo}` };
  return { encargado: true, orden: e.orden, motivo: e.motivo };
}
