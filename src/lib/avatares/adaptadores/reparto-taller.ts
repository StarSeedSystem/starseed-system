/**
 * Taller 3D · REPARTO ENTRE NEURONAS (G3D1011D). Contrato: architecture/astraura-avatares-3d.md §11.1.
 *
 * Cada neurona (medio de MetaGenesis) publica sus capacidades del taller —`capacidadesDe(hierro)`— UNA vez
 * al arrancar y cuando cambian, en el campo JSON `datos.capacidades_taller` de su latido (`mg_latido`, el
 * registro de neuronas que ya existe: sin migraciones). Dado un encargo, `elegirNeurona` planifica con la
 * capacidad de cada una y la `prioridad` de `planOptimizacion(destino)`, y elige: primero las de la misma
 * cuenta, luego las que su grupo o comunidad ofreció; entre las que dejan el plan `listo`, la de más
 * fidelidad y menos carga. Si ninguna puede, lo dice en palabras. El envío reutiliza el préstamo de
 * tareas de MetaGenesis (orden `mg_orden` del bus; ver scripts/puente/nodo_metagenesis_logica.py). PURO.
 */
import type { Esqueleto } from "../adn/adn";
import { planificar, type Partida, type PlanAvatar } from "../adn/canalizacion";
import { capacidadesDe, planOptimizacion, type Destino3D, type Hierro } from "../adn/optimizacion";

/** Versión del bloque de capacidades publicado en el latido (para leerlo siempre igual). */
export const VERSION_CAPACIDADES_TALLER = 1;

/** Lo que la neurona publica en `datos.capacidades_taller` de su latido. */
export interface CapacidadesTaller {
  version: number;
  hierro: Hierro;
  capacidades: readonly string[];
}

/** Una neurona del registro de MetaGenesis, con su parte del taller ya leída. */
export interface NeuronaTaller {
  /** Id del nodo (`nodo` del latido). */
  id: string;
  /** Cuenta dueña de la neurona (null si se desconoce). */
  cuenta: string | null;
  /** Grupos o comunidades que ofrecieron esta neurona para trabajos del taller. */
  ofrecidaPor: readonly string[];
  /** El hierro publicado; null si el latido no trae `capacidades_taller` (aún no la ha escrito). */
  hierro: Hierro | null;
  /** Trabajos del taller en curso (0 = libre). */
  carga: number;
  /** Ha latido dentro de su tiempo de gracia. */
  viva: boolean;
}

/** Lo que se pide al taller: una generación u optimización para un destino. */
export interface EncargoTaller {
  destino: Destino3D;
  partida: Partida;
  esqueleto: Esqueleto;
  region: string | null;
  comercial: boolean;
  /** Malla cerrada (imprimir, física de XR). */
  cerrada?: boolean;
  /** Cuenta que encarga (para «primero las mías»). */
  cuenta?: string | null;
  /** Grupos o comunidades de quien encarga (para «luego las ofrecidas»). */
  grupos?: readonly string[];
}

/** El trabajo listo para viajar por el préstamo de MetaGenesis (bus `mg_orden`). */
export interface OrdenTaller {
  bus: "mg_orden";
  accion: "taller_3d";
  /** Neurona elegida que debe ejecutarlo. */
  para: string;
  encargo: EncargoTaller;
}

export interface EleccionTaller {
  neurona: NeuronaTaller | null;
  plan: PlanAvatar | null;
  orden: OrdenTaller | null;
  /** En palabras: a quién se lo damos y por qué, o por qué ninguna neurona puede. */
  motivo: string;
}

/** El bloque que la neurona publica UNA vez al arrancar (y cuando cambia su hierro). */
export function capacidadesParaRegistro(hierro: Hierro): CapacidadesTaller {
  return { version: VERSION_CAPACIDADES_TALLER, hierro, capacidades: capacidadesDe(hierro) };
}

function esRegistroCapacidades(v: unknown): v is CapacidadesTaller {
  if (typeof v !== "object" || v === null) return false;
  const r = v as Record<string, unknown>;
  return r.version === VERSION_CAPACIDADES_TALLER && typeof r.hierro === "object" && r.hierro !== null
    && Array.isArray(r.capacidades);
}

/** Lee `datos.capacidades_taller` de un latido; null si no está o no es de esta versión. */
export function capacidadesDeRegistro(datosLatido: Record<string, unknown> | null | undefined): CapacidadesTaller | null {
  const v = datosLatido?.capacidades_taller;
  return esRegistroCapacidades(v) ? { ...v, hierro: v.hierro as Hierro } : null;
}

const GENERA = new Set<Partida>(["imagen", "texto"]);

/** Fidelidad total del plan (para comparar neuronas que sí pueden). */
export function fidelidadDelPlan(plan: PlanAvatar): number {
  return plan.pasos.reduce((s, p) => s + (p.motor?.fidelidad ?? 0), 0);
}

/** Qué le falta a la neurona, en palabras (el paso de generar suele ser el que no sale). */
function queFalta(plan: PlanAvatar): string {
  const paso = plan.pasos.find((p) => !p.saltada && p.motor === null && p.etapa !== "detallar");
  if (!paso) return "algo del plan no sale";
  const necesita = paso.descartes.find((d) => d.includes("necesita"));
  return necesita ?? paso.motivo;
}

// ─── Conexión con el registro de neuronas que ya existe ──────────────────────

/** Lo que el registro (`neuron_devices.capabilities`, ver `src/lib/neurons/neurons.ts`) mide de verdad. */
export interface HierroMedido {
  platform?: string;
  gpuVendor?: string;
  gpuRenderer?: string;
  /** `navigator.deviceMemory`: en el navegador está topada a 8 GB; 0/sin dato = no medida. */
  memoryGb?: number;
}

const txtHierro = (v: unknown): string => (typeof v === "string" ? v.toLowerCase() : "");

/**
 * Traduce lo MEDIDO a un `Hierro` sin inventar nada («basta de ilusiones»): el navegador no ve la VRAM
 * ni Blender, así que salen `null`/`false`; sin señal de NVIDIA/Apple se da el hierro más modesto (`ninguna`),
 * que nunca promete generar. El permiso de Space (§5 del contrato) solo lo activa la app cuando la persona
 * lo ha dado; aquí queda en falso.
 */
export function hierroDeCapacidades(caps: HierroMedido): Hierro {
  const gpu = `${txtHierro(caps.gpuVendor)} ${txtHierro(caps.gpuRenderer)}`;
  return {
    gpu: gpu.includes("nvidia") ? "nvidia"
      : gpu.includes("apple") && txtHierro(caps.platform).includes("mac") ? "apple"
      : "ninguna",
    ramGB: typeof caps.memoryGb === "number" && Number.isFinite(caps.memoryGb) ? Math.max(0, caps.memoryGb) : 0,
    vramGB: null, blender: false, permiteEspacioHf: false, claveExterna: false,
  };
}

/** El hierro medido ya explicado: sus `capacidadesDe(hierro)` y, en palabras, si puede generar y por qué. */
export function analizarCapacidades(caps: HierroMedido): { hierro: Hierro; capacidades: readonly string[]; motivo: string } {
  const hierro = hierroDeCapacidades(caps);
  const capacidades = capacidadesDe(hierro);
  if (capacidades.includes("cuda-16gb") || capacidades.includes("apple-silicon-32gb")) {
    return { hierro, capacidades, motivo: "puede generar aquí" };
  }
  const falta = hierro.gpu === "apple"
    ? `es Apple Silicon con ${hierro.ramGB} GB: generar pide 32 GB unificados`
    : hierro.gpu === "nvidia" ? "tiene NVIDIA pero la VRAM no está medida" : "no tiene GPU medida";
  return { hierro, capacidades, motivo: `no puede generar aquí (${falta}); sirve para remallar y optimizar` };
}

/**
 * La última `mg_latido` de un medio (bus de MetaGenesis, `remoto-nodos.ts`) traducida a `NeuronaTaller`:
 * lee `capacidades_taller` con `capacidadesDeRegistro`; null si el medio aún no publicó su bloque.
 */
export function neuronaTallerDeLatido(
  datos: Record<string, unknown> | null | undefined,
  extra: { cuenta?: string | null; ofrecidaPor?: readonly string[]; carga?: number; viva?: boolean } = {},
): NeuronaTaller | null {
  const caps = capacidadesDeRegistro(datos);
  const id = typeof datos?.nodo === "string" ? (datos.nodo as string) : "";
  if (!caps || !id) return null;
  return {
    id, cuenta: extra.cuenta ?? null, ofrecidaPor: extra.ofrecidaPor ?? [],
    hierro: caps.hierro, carga: extra.carga ?? 0, viva: extra.viva ?? true,
  };
}

/** «propia» si es de la cuenta; «ofrecida» si la ofreció un grupo o comunidad de quien encarga; si no, null. */
export function vinculo(n: NeuronaTaller, e: EncargoTaller): "propia" | "ofrecida" | null {
  if (e.cuenta && n.cuenta === e.cuenta) return "propia";
  if (n.ofrecidaPor.some((g) => (e.grupos ?? []).includes(g))) return "ofrecida";
  return null;
}

/** El plan que haría esta neurona con este encargo, con la prioridad que pide su destino. */
export function planParaNeurona(n: NeuronaTaller, e: EncargoTaller): PlanAvatar | null {
  if (!n.hierro) return null;
  const prioridad = planOptimizacion(e.destino, n.hierro.vramGB).prioridad;
  return planificar({
    partida: e.partida, esqueleto: e.esqueleto, capacidades: capacidadesDe(n.hierro),
    region: e.region, comercial: e.comercial, permitirDePago: n.hierro.claveExterna,
    prioridad, cerrada: e.cerrada ?? (e.destino === "impresion" || e.destino === "bot" || e.destino === "pieza"),
  });
}

/**
 * Elige la neurona que hará el encargo. Orden: vivas → de tu cuenta u ofrecidas por tus grupos →
 * plan `listo` → más fidelidad → menos carga; «propia» siempre por delante de «ofrecida».
 * Si ninguna puede, `motivo` lo explica en palabras (basta de ilusiones: se dice por qué).
 */
export function elegirNeurona(e: EncargoTaller, neuronas: readonly NeuronaTaller[]): EleccionTaller {
  const vivas = neuronas.filter((n) => n.viva);
  if (vivas.length === 0) return { neurona: null, plan: null, orden: null, motivo: "No hay ninguna neurona viva en el registro." };

  const candidatas: { n: NeuronaTaller; v: "propia" | "ofrecida"; plan: PlanAvatar }[] = [];
  const faltas: string[] = [];
  let sinAlcance = 0;
  for (const n of vivas) {
    const v = vinculo(n, e);
    if (!v) { sinAlcance++; continue; }
    const plan = planParaNeurona(n, e);
    if (!plan) { faltas.push(`${n.id} aún no publicó sus capacidades del taller.`); continue; }
    if (!plan.listo) { faltas.push(`${n.id}: ${queFalta(plan)}`); continue; }
    candidatas.push({ n, v, plan });
  }

  if (candidatas.length === 0) {
    let motivo: string;
    if (faltas.length === 0 && sinAlcance > 0) {
      motivo = "Ninguna neurona viva es de tu cuenta ni la ofreció tu grupo o comunidad.";
    } else {
      const resume = [...new Set(faltas.map((f) => f.replace(/^\S+:\s*/, "").replace(/\.$/, "")))];
      motivo = `Ninguna neurona puede con este encargo: ${resume.join("; ")}.`;
    }
    return { neurona: null, plan: null, orden: null, motivo };
  }

  candidatas.sort((a, b) =>
    (a.v === "propia" ? 0 : 1) - (b.v === "propia" ? 0 : 1)
    || fidelidadDelPlan(b.plan) - fidelidadDelPlan(a.plan)
    || a.n.carga - b.n.carga);
  const elegida = candidatas[0];
  const parentesco = elegida.v === "propia" ? "es de tu cuenta" : "la ofreció tu grupo o comunidad";
  return {
    neurona: elegida.n,
    plan: elegida.plan,
    orden: { bus: "mg_orden", accion: "taller_3d", para: elegida.n.id, encargo: e },
    motivo: `Se lo lleva ${elegida.n.id}: ${parentesco}, el plan sale listo${GENERA.has(e.partida) ? "" : " (no hace falta generar)"} y es la de mayor fidelidad y menor carga.`,
  };
}
