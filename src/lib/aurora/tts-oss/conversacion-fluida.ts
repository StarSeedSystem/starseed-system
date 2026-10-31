/**
 * Conversación fluida · módulo PURO (VZR1011D). Elige motor por la latencia
 * MEDIDA (primer sonido y factor de tiempo real), planifica trozos (hablar la
 * primera frase mientras el LLM escribe, sintetizar la siguiente mientras suena
 * la anterior), interrumpe al instante y recorre capas sin silencios. En lectura
 * manda la calidad. Sin red, disco ni reloj propio.
 */
import { trocearTexto } from "@/lib/voces/trocear";

export type CapaVoz = "aparato" | "neurona-local" | "malla-grupo" | "spaces" | "sistema";
export type ContextoDialogo = "conversacion" | "lectura";
export const ORDEN_CAPAS: readonly CapaVoz[] = ["aparato", "neurona-local", "malla-grupo", "spaces", "sistema"];
export const PRESUPUESTO_PRIMER_SONIDO_MS = 800;
export const PRESUPUESTO_INTERRUPCION_MS = 100;

export interface MedidaMotor {
  motor: string; capa: CapaVoz;
  primerSonidoMs: number; // medido: pedir síntesis → primer audio
  factorTiempoReal: number; // medido: síntesis / audio; menor es mejor
  latenciaCorteMs?: number; // medido: orden de corte → silencio
  calidad?: number; // 0..1; manda en lectura
  disponible?: boolean; // false = caído, 429/402 o apartado
}
export interface TrozoLlm { texto: string; listoEnMs: number; duracionAudioMs: number }
export interface FraseProgramada { texto: string; inicioSintesisMs: number; inicioAudioMs: number; finAudioMs: number }
export interface PlanDialogo {
  motor: string; frases: FraseProgramada[]; primerSonidoMs: number;
  silencioMaximoMs: number; // peor hueco entre frases
  dentroDePresupuesto: boolean;
}
export interface Relevo { motor: string; capa: CapaVoz; primerSonidoMs: number; silencioMaximoMs: number }
export interface PlanConRelevo { plan: PlanDialogo; motor: MedidaMotor; relevos: Relevo[] }

const capaOrden = (c: CapaVoz): number => { const i = ORDEN_CAPAS.indexOf(c); return i < 0 ? ORDEN_CAPAS.length : i };
const disponible = (m: MedidaMotor): boolean => m.disponible !== false && Number.isFinite(m.primerSonidoMs) && m.primerSonidoMs >= 0;
const corteRapido = (m: MedidaMotor, p: number): boolean => (m.latenciaCorteMs ?? 0) <= p;

/** Candidatos disponibles, por capa y latencia MEDIDA (o calidad, en lectura). */
export function ordenarMotores(
  medidas: readonly MedidaMotor[],
  contexto: ContextoDialogo,
  presupuestoInterrupcion = PRESUPUESTO_INTERRUPCION_MS,
): MedidaMotor[] {
  const listos = medidas.filter((m) => disponible(m) && (contexto === "lectura" || corteRapido(m, presupuestoInterrupcion)));
  return [...listos].sort((a, b) => {
    if (contexto === "lectura") { const q = (b.calidad ?? 0) - (a.calidad ?? 0); if (q !== 0) return q; }
    const capa = capaOrden(a.capa) - capaOrden(b.capa);
    if (capa !== 0) return capa;
    if (contexto === "conversacion") { const lat = a.primerSonidoMs - b.primerSonidoMs; if (lat !== 0) return lat; }
    return a.factorTiempoReal - b.factorTiempoReal || a.motor.localeCompare(b.motor);
  });
}

/** Programa los trozos sobre relojes simulados: sin red ni audio. */
export function planificarDialogo(
  trozos: readonly TrozoLlm[],
  motor: Pick<MedidaMotor, "motor" | "primerSonidoMs" | "factorTiempoReal">,
  presupuestoMs = PRESUPUESTO_PRIMER_SONIDO_MS,
): PlanDialogo {
  const rtf = Number.isFinite(motor.factorTiempoReal) && motor.factorTiempoReal > 0 ? motor.factorTiempoReal : 1;
  const arranque = Math.max(0, motor.primerSonidoMs);
  const frases: FraseProgramada[] = [];
  let finSintesis = 0, finAudio = 0, silencioMaximoMs = 0;
  for (const t of trozos) {
    const duracion = Math.max(0, t.duracionAudioMs);
    const inicioSintesisMs = Math.max(0, t.listoEnMs, finSintesis);
    const inicioAudioMs = Math.max(inicioSintesisMs + arranque, finAudio);
    if (frases.length) silencioMaximoMs = Math.max(silencioMaximoMs, inicioAudioMs - finAudio);
    const finAudioMs = inicioAudioMs + duracion;
    frases.push({ texto: t.texto, inicioSintesisMs, inicioAudioMs, finAudioMs });
    finSintesis = inicioSintesisMs + arranque + duracion * rtf;
    finAudio = finAudioMs;
  }
  const primerSonidoMs = frases.length ? frases[0].inicioAudioMs : 0;
  return { motor: motor.motor, frases, primerSonidoMs, silencioMaximoMs, dentroDePresupuesto: primerSonidoMs <= presupuestoMs };
}

const aRelevo = (m: MedidaMotor, p: PlanDialogo): Relevo => ({ motor: m.motor, capa: m.capa, primerSonidoMs: p.primerSonidoMs, silencioMaximoMs: p.silencioMaximoMs });

/** Elige el plan; si un motor no llega, releva al siguiente sin silencio. */
export function planificarConRelevo(
  medidas: readonly MedidaMotor[],
  trozos: readonly TrozoLlm[],
  opciones: { contexto: ContextoDialogo; presupuestoMs?: number } = { contexto: "conversacion" },
): PlanConRelevo | null {
  const presupuestoMs = opciones.presupuestoMs ?? PRESUPUESTO_PRIMER_SONIDO_MS;
  const orden = ordenarMotores(medidas, opciones.contexto);
  if (!orden.length) return null;
  const planes = orden.map((motor) => ({ motor, plan: planificarDialogo(trozos, motor, presupuestoMs) }));
  const apto = opciones.contexto === "lectura" ? planes[0]
    : planes.find(({ plan }) => plan.primerSonidoMs <= presupuestoMs && plan.silencioMaximoMs <= presupuestoMs);
  const elegido = apto ?? planes.reduce((a, b) =>
    b.plan.primerSonidoMs < a.plan.primerSonidoMs ||
    (b.plan.primerSonidoMs === a.plan.primerSonidoMs && b.plan.silencioMaximoMs < a.plan.silencioMaximoMs) ? b : a);
  return { plan: elegido.plan, motor: elegido.motor, relevos: planes.filter((x) => x !== elegido).map(({ motor, plan }) => aRelevo(motor, plan)) };
}

export interface EstadoHabla { hablando: boolean; bufferMs?: number }
export interface ResultadoInterrupcion { cortar: boolean; latenciaCorteMs: number; dentroDePresupuesto: boolean }

/** ¿Cortar ya? Latencia = buffer irrecuperable + corte medido del motor. */
export function evaluarInterrupcion(
  estado: EstadoHabla,
  motor: Pick<MedidaMotor, "latenciaCorteMs">,
  presupuestoMs = PRESUPUESTO_INTERRUPCION_MS,
): ResultadoInterrupcion {
  if (!estado.hablando) return { cortar: false, latenciaCorteMs: 0, dentroDePresupuesto: true };
  const latenciaCorteMs = Math.max(0, (motor.latenciaCorteMs ?? 0) + Math.max(0, estado.bufferMs ?? 0));
  return { cortar: true, latenciaCorteMs, dentroDePresupuesto: latenciaCorteMs <= presupuestoMs };
}

/** Trocea con el criterio de frases del OS (`trocearTexto`) para el turno. */
export function trocearParaDialogo(texto: string, max = 200): string[] {
  return trocearTexto(texto, max);
}
