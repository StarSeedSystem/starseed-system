/**
 * Avatares 3D · PLAN DEL TALLER Y LICENCIAS (AV1011). Contrato: architecture/astraura-avatares-3d.md §4–§5.
 *
 * Dado de dónde se parte (una imagen, un texto, una malla, un VRM o una plantilla), qué esqueleto se
 * quiere y qué tiene la neurona que va a trabajar, elige el motor de cada etapa o dice POR QUÉ no hay
 * ninguno. Reglas: nunca un motor sin código; de pago solo si se permite y hay clave; nunca uno cuya
 * licencia excluya tu región ni uno «no-comercial» para un uso comercial. Animar siempre tiene salida
 * (clips procedurales del navegador). PURO.
 */
import type { AdnAvatar, Esqueleto, Procedencia, UsoLicencia } from "./adn";
import { MOTORES_3D, type Etapa, type Motor3D, type Requisito3D } from "./motores";

export type Partida = "imagen" | "texto" | "malla" | "vrm" | "plantilla";

/** Países de la UE (para licencias que excluyen «EU»). */
export const PAISES_UE: readonly string[] = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU",
  "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

/** ¿La licencia excluye esta región? `region` = código ISO del país (o null si no se sabe: se trata como excluida). */
export function regionExcluida(excluidas: readonly string[] | undefined, region: string | null): boolean {
  if (!excluidas?.length) return false;
  if (!region) return true;
  const r = region.toUpperCase();
  return excluidas.includes(r) || (excluidas.includes("EU") && PAISES_UE.includes(r));
}

const PREFERENCIA: Record<UsoLicencia, number> = { libre: 0, atribucion: 1, condicionado: 2, "restringido-region": 3, "no-comercial": 4 };

export interface PeticionPlan {
  partida: Partida;
  esqueleto: Esqueleto;
  capacidades: readonly Requisito3D[];
  region: string | null;
  comercial: boolean;
  permitirDePago: boolean;
  /** Mejorar detalle es opcional: nunca bloquea. */
  detallar?: boolean;
  /** «calidad» elige el de más fidelidad; «rapidez» (por defecto) el más rápido. Lo fija el destino (`optimizacion.ts`). */
  prioridad?: "calidad" | "rapidez";
  /** Hace falta malla cerrada (imprimir, colisiones de física): solo remalladores que cierran. */
  cerrada?: boolean;
}

export interface PasoPlan { etapa: Etapa; motor: Motor3D | null; saltada: boolean; motivo: string; descartes: string[] }
export interface PlanAvatar { pasos: PasoPlan[]; listo: boolean; procedencia: Procedencia[] }

/** Por qué un motor no vale para esta petición (o null si vale). */
export function motivoDescarte(m: Motor3D, p: PeticionPlan): string | null {
  if (m.estado === "solo-articulo") return `${m.nombre}: solo hay artículo, sin código publicado.`;
  if (m.estado === "pesos-sin-codigo") return `${m.nombre}: hay pesos pero el código de inferencia aún no está publicado.`;
  if (m.estado === "de-pago" && !p.permitirDePago) return `${m.nombre}: es de pago y no está permitido.`;
  if (!m.necesita.some((r) => p.capacidades.includes(r))) return `${m.nombre}: necesita ${m.necesita.join(" o ")}.`;
  if (regionExcluida(m.regionesExcluidas, p.region)) return `${m.nombre}: su licencia no cubre tu región${p.region ? ` (${p.region})` : " (desconocida)"}.`;
  if (p.comercial && m.uso === "no-comercial") return `${m.nombre}: su licencia no permite uso comercial.`;
  if (m.etapa === "animar" && !(m.esqueletos ?? []).includes(p.esqueleto)) return `${m.nombre}: no mueve el esqueleto «${p.esqueleto}».`;
  if (m.etapa === "remallar" && p.cerrada && !m.cierra) return `${m.nombre}: no garantiza una malla cerrada.`;
  return null;
}

function saltar(etapa: Etapa, p: PeticionPlan): string | null {
  const yaRiggeado = p.partida === "vrm" || p.partida === "plantilla";
  if (etapa === "generar" && p.partida !== "imagen" && p.partida !== "texto") return "Ya hay malla: no hace falta generarla.";
  if (etapa === "remallar" && yaRiggeado) return "Un VRM o una plantilla ya tienen topología limpia.";
  if (etapa === "riggear" && yaRiggeado) return "Un VRM o una plantilla ya traen esqueleto.";
  if ((etapa === "riggear" || etapa === "animar") && p.esqueleto === "ninguno") return "Sin esqueleto: el avatar es una orbe o una figura fija.";
  if (etapa === "detallar" && !p.detallar) return "Mejorar detalle no se pidió.";
  return null;
}

/** Calidad: más fidelidad y, a igualdad, más rápido. Rapidez: más rápido y, a igualdad, más fidelidad. */
function orden(a: Motor3D, b: Motor3D, prioridad: "calidad" | "rapidez"): number {
  const fid = (b.fidelidad ?? 0) - (a.fidelidad ?? 0), min = (a.minutosAprox ?? 99) - (b.minutosAprox ?? 99);
  return prioridad === "calidad" ? fid || min : min || fid;
}

export function procedenciaDe(m: Motor3D): Procedencia {
  const out: Procedencia = { herramienta: m.id, licencia: m.licencia, uso: m.uso };
  if (m.atribucion) out.atribucion = m.atribucion;
  if (m.regionesExcluidas?.length) out.regionesExcluidas = [...m.regionesExcluidas];
  return out;
}

/** El plan completo: un paso por etapa, con el motor elegido o el motivo de que no haya. */
export function planificar(p: PeticionPlan, motores: readonly Motor3D[] = MOTORES_3D): PlanAvatar {
  const pasos: PasoPlan[] = [];
  for (const etapa of ["generar", "remallar", "riggear", "detallar", "animar"] as const) {
    const s = saltar(etapa, p);
    if (s) { pasos.push({ etapa, motor: null, saltada: true, motivo: s, descartes: [] }); continue; }
    const descartes: string[] = [];
    const validos = motores.filter((m) => m.etapa === etapa).filter((m) => {
      const d = motivoDescarte(m, p);
      if (d) descartes.push(d);
      return d === null;
    }).sort((a, b) => PREFERENCIA[a.uso] - PREFERENCIA[b.uso] || Number(a.remoto ?? false) - Number(b.remoto ?? false)
      || Number(a.estado === "de-pago") - Number(b.estado === "de-pago") || orden(a, b, p.prioridad ?? "rapidez"));
    const motor = validos[0] ?? null;
    pasos.push({ etapa, motor, saltada: false, motivo: motor ? `${motor.nombre}.` : "Ningún motor disponible en esta neurona.", descartes });
  }
  const listo = pasos.every((x) => x.saltada || x.motor !== null || x.etapa === "detallar");
  return { pasos, listo, procedencia: pasos.flatMap((x) => (x.motor ? [procedenciaDe(x.motor)] : [])) };
}

/** ¿Se puede usar este avatar así? Dice qué atribuciones hay que mostrar y qué lo impide. */
export function usoPermitido(adn: Pick<AdnAvatar, "procedencia">, uso: { region: string | null; comercial: boolean }): { ok: boolean; motivos: string[]; atribuciones: string[] } {
  const motivos: string[] = [];
  for (const p of adn.procedencia) {
    if (regionExcluida(p.regionesExcluidas, uso.region)) motivos.push(`${p.herramienta}: su licencia no cubre esta región.`);
    if (uso.comercial && p.uso === "no-comercial") motivos.push(`${p.herramienta}: no permite uso comercial.`);
  }
  const atribuciones = [...new Set(adn.procedencia.flatMap((p) => (p.atribucion ? [p.atribucion] : [])))];
  return { ok: motivos.length === 0, motivos, atribuciones };
}
