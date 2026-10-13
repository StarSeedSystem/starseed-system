/**
 * Reparto del taller 3D entre neuronas (G3D1011D). Contrato: architecture/astraura-avatares-3d.md §11.
 *
 * Cada neurona publica sus capacidades del taller (`capacidadesDe(hierro)`) en el registro de
 * neuronas que ya existe (`neuron_devices.capabilities`, un JSON: SIN migración), y
 * `elegirNeurona` decide a cuál va cada encargo: primero las neuronas de la MISMA cuenta, luego
 * las que su grupo o comunidad ofreció; entre ellas, la que deja el plan `listo` con más
 * fidelidad y menos carga. Si ninguna puede, lo dice EN PALABRAS («ninguna neurona tuya tiene
 * NVIDIA ni una Mac de 32 GB»). PURO: sin red, sin disco, sin reloj.
 */
import { planificar, type Partida, type PlanAvatar } from "../adn/canalizacion";
import { capacidadesDe, planOptimizacion, type Destino3D, type Hierro } from "../adn/optimizacion";
import type { Esqueleto } from "../adn/adn";
import { REQUISITOS_3D, type Requisito3D } from "../adn/motores";

/** Una neurona vista por el reparto (la construye el cableado desde `neuron_devices` + su ficha). */
export interface NeuronaCandidata {
  id: string;
  nombre: string;
  /** Cuenta a la que pertenece la neurona. */
  cuentaId: string;
  /** Capacidades del taller publicadas (`capacidadesDe`); vacío = no puede taller. */
  capacidades: readonly Requisito3D[];
  /** Grupos o comunidades a los que esta neurona OFRECIÓ su taller. */
  ofrecidaEn?: readonly string[];
  /** Trabajos del taller que ya está haciendo (0 = libre). */
  carga?: number;
}

/** Lo que se pide generar y para quién. */
export interface EncargoTaller {
  cuentaId: string;
  destino: Destino3D;
  partida: Partida;
  esqueleto: Esqueleto;
  region: string | null;
  comercial: boolean;
  permitirDePago: boolean;
  detallar?: boolean;
  cerrada?: boolean;
  /** Grupos o comunidades de la persona que encarga (para abrir la puerta a neuronas ofrecidas). */
  grupoIds?: readonly string[];
}

export interface ResultadoReparto {
  /** La neurona elegida, o null si ninguna puede. */
  neurona: NeuronaCandidata | null;
  /** El plan del taller calculado para esa neurona (si la hay). */
  plan?: PlanAvatar;
  /** En palabras: por qué se eligió, o por qué ninguna puede. */
  motivo: string;
  /** Por qué se descartó cada neurona mirada (nombre → motivo). */
  descartes: Record<string, string>;
}

/** Estima la VRAM anunciada por las capacidades (`resolucionPara` la pide; null si no hay NVIDIA). */
export function vramDe(capacidades: readonly Requisito3D[]): number | null {
  if (capacidades.includes("cuda-16gb")) return 16;
  if (capacidades.includes("cuda-8gb")) return 8;
  return null;
}

/** ¿Esta neurona está ofrecida a ALGUNO de los grupos de quien encarga? */
export function ofrecidaAlEncargo(n: NeuronaCandidata, e: EncargoTaller): boolean {
  return n.cuentaId !== e.cuentaId && (n.ofrecidaEn ?? []).some((g) => (e.grupoIds ?? []).includes(g));
}

/** Fidelidad del plan: la del motor de «generar» (0 si esa etapa se salta o no tiene motor). */
export function fidelidadDel(plan: PlanAvatar): number {
  const paso = plan.pasos.find((p) => p.etapa === "generar");
  return paso?.motor?.fidelidad ?? 0;
}

/** El motivo por el que un plan no queda `listo` (el primer paso sin motor), en palabras. */
export function motivoNoListo(plan: PlanAvatar): string {
  const paso = plan.pasos.find((p) => !p.saltada && p.motor === null && p.etapa !== "detallar");
  if (!paso) return "plan listo";
  const porque = paso.descartes[0];
  return porque ?? `la etapa «${paso.etapa}» no tiene ningún motor disponible`;
}

/** Resumen de qué falta para que ALGUNA neurona pueda (para el mensaje final). */
function explicarImposible(descartes: Record<string, string>, propias: number): string {
  const motivos = Object.entries(descartes);
  if (motivos.length === 0) return "No hay ninguna neurona tuya ni ofrecida a tus grupos.";
  const quien = propias > 0 ? "ninguna neurona tuya" : "ninguna neurona";
  const faltan = [...new Set(motivos.map(([, m]) => m))];
  return `${quien} puede: ${faltan.join(" · ")}`;
}

/** Compara dos candidatas con plan listo: más fidelidad primero; a igualdad, la menos cargada. */
function mejor(a: { f: number; n: NeuronaCandidata }, b: { f: number; n: NeuronaCandidata }): number {
  return b.f - a.f || (a.n.carga ?? 0) - (b.n.carga ?? 0) || a.n.id.localeCompare(b.id);
}

/**
 * ¿A qué neurona va este encargo? Primero las de la misma cuenta; si ninguna queda lista,
 * las que el grupo o la comunidad ofrecieron. Devuelve el plan ya calculado o, si ninguna
 * puede, el motivo en palabras. NUNCA devuelve una neurona cuyo plan no está `listo`.
 */
export function elegirNeurona(encargo: EncargoTaller, neuronas: readonly NeuronaCandidata[]): ResultadoReparto {
  const prioridad = planOptimizacion(encargo.destino).prioridad;
  const descartes: Record<string, string> = {};
  const evaluar = (ns: readonly NeuronaCandidata[]) => {
    const aptas: { f: number; n: NeuronaCandidata; plan: PlanAvatar }[] = [];
    for (const n of ns) {
      const plan = planificar({
        partida: encargo.partida, esqueleto: encargo.esqueleto, capacidades: n.capacidades,
        region: encargo.region, comercial: encargo.comercial, permitirDePago: encargo.permitirDePago,
        detallar: encargo.detallar, cerrada: encargo.cerrada, prioridad,
      });
      if (plan.listo) aptas.push({ f: fidelidadDel(plan), n, plan });
      else descartes[n.nombre] = motivoNoListo(plan);
    }
    aptas.sort(mejor);
    return aptas;
  };
  const propias = neuronas.filter((n) => n.cuentaId === encargo.cuentaId);
  const mejores = evaluar(propias);
  if (mejores.length > 0) {
    const m = mejores[0];
    return { neurona: m.n, plan: m.plan, motivo: `La hace ${m.n.nombre} (tu neurona, plan listo).`, descartes };
  }
  const ofrecidas = neuronas.filter((n) => ofrecidaAlEncargo(n, encargo));
  const prestadas = evaluar(ofrecidas);
  if (prestadas.length > 0) {
    const m = prestadas[0];
    return { neurona: m.n, plan: m.plan, motivo: `La hace ${m.n.nombre}, que su grupo o comunidad ofreció.`, descartes };
  }
  return { neurona: null, motivo: explicarImposible(descartes, propias.length), descartes };
}

/* ── Publicación de capacidades en el registro (una vez al arrancar y cuando cambian) ── */

/** Lo que se guarda dentro de `neuron_devices.capabilities.taller3d` (JSON ya existente, sin migración). */
export interface PublicacionTaller {
  v: 1;
  capacidades: Requisito3D[];
}

/** ¿Los talleres publicados han cambiado? (para publicar solo al arrancar o cuando cambian). */
export function publicacionCambiada(actual: unknown, siguiente: PublicacionTaller): boolean {
  if (!actual || typeof actual !== "object") return true;
  const caps = (actual as { capacidades?: unknown }).capacidades;
  return !Array.isArray(caps) || caps.join(",") !== siguiente.capacidades.join(",");
}

/** El trozo a fusionar en `capabilities` al arrancar el taller: `combinarCapacidades` hace el resto. */
export function publicacionTaller(hierro: Hierro): PublicacionTaller {
  return { v: 1, capacidades: capacidadesDe(hierro) };
}

/** Lee las capacidades publicadas por otra neurona (o vacío si la fila no las tiene). */
export function capacidadesPublicadas(capabilities: unknown): Requisito3D[] {
  const t = (capabilities as { taller3d?: unknown } | null)?.taller3d;
  if (!t || typeof t !== "object") return [];
  const caps = (t as { capacidades?: unknown }).capacidades;
  return Array.isArray(caps) ? caps.filter((c): c is Requisito3D => (REQUISITOS_3D as readonly unknown[]).includes(c)) : [];
}
