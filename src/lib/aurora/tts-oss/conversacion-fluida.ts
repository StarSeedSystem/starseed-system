/**
 * CONVERSACIÓN FLUIDA · VZR1011D · Ola 1011I
 * El motor se elige por la latencia MEDIDA en ESTA neurona (≤ 0,8 s al primer
 * sonido y RTF ≤ 1), no por la ficha. Capas: aparato › otra neurona de la
 * cuenta › malla del grupo › Spaces › sistema; lo que no llega al presupuesto
 * pasa a la siguiente. Lectura/narración manda calidad. Habla la primera frase
 * mientras el LLM escribe y sintetiza la siguiente mientras suena la anterior;
 * si la persona habla, corta al instante. Puro: relojes y motores simulados.
 */
import { trocearTexto } from "@/lib/voces/trocear";

export const PRESUPUESTO_PRIMER_SONIDO_MS = 800;
export const INTERRUPCION_MAX_MS = 100;
export const TROZO_CONVERSACION_MAX = 160;

export type CapaVoz = "aparato" | "neurona-cuenta" | "malla-grupo" | "spaces" | "sistema";
export const ORDEN_CAPAS: readonly CapaVoz[] = ["aparato", "neurona-cuenta", "malla-grupo", "spaces", "sistema"];
export type ContextoVoz = "conversacion" | "lectura" | "narracion";
export interface CandidatoVoz { id: string; capa: CapaVoz; calidad?: number; orden?: number }
export interface MedidaMotor { primerSonidoMs: number; factorTiempoReal?: number }
export type MedidasPorMotor = Readonly<Record<string, MedidaMotor | undefined>>;
export interface RegistroMedida { motor: string; tipo: string; valor: number }
export interface MotorElegido { motor: CandidatoVoz; medida: MedidaMotor | null; dentroPresupuesto: boolean; motivo: string }
export interface TrozoVoz { texto: string; duracionAudioMs: number }
export interface TramoTimeline { i: number; texto: string; inicioSintesisMs: number; inicioAudioMs: number; finAudioMs: number; silencioAntesMs: number; hablado: boolean }
export interface PlanCharla { tramos: TramoTimeline[]; primerSonidoMs: number; silencioMaximoMs: number; interrumpidoEnMs: number | null; latenciaInterrupcionMs: number | null; dentroPresupuesto: boolean }
const num = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v > 0;
const indice = (c: CapaVoz): number => ORDEN_CAPAS.indexOf(c);
const lat = (m?: MedidaMotor): number => (m ? m.primerSonidoMs : Number.POSITIVE_INFINITY);
const difLat = (a?: MedidaMotor, b?: MedidaMotor): number => (lat(a) === lat(b) ? 0 : lat(a) - lat(b));
const rtf = (m?: MedidaMotor): number => m?.factorTiempoReal ?? 0;
const cumple = (m: MedidaMotor | null | undefined, p: number): boolean =>
  !!m && m.primerSonidoMs <= p && (m.factorTiempoReal === undefined || m.factorTiempoReal <= 1);
function mediana(v: number[]): number | undefined {
  const o = [...v].sort((a, b) => a - b), m = Math.floor(o.length / 2);
  return !o.length ? undefined : o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}
/** Medidas de ESTA neurona por motor: mediana de primer sonido y RTF. Nunca la ficha. */
export function medidasPorMotor(registros: readonly RegistroMedida[]): MedidasPorMotor {
  const g = new Map<string, { p: number[]; r: number[] }>();
  for (const x of registros) {
    if (!x || typeof x.motor !== "string" || !x.motor.trim() || !num(x.valor)) continue;
    const e = g.get(x.motor) ?? { p: [], r: [] };
    if (x.tipo === "primer-sonido") e.p.push(x.valor);
    else if (x.tipo === "tiempo-real-voz") e.r.push(x.valor);
    g.set(x.motor, e);
  }
  const out: Record<string, MedidaMotor> = {};
  for (const [m, e] of g) {
    const p = mediana(e.p);
    if (p === undefined) continue;
    const r = mediana(e.r);
    out[m] = { primerSonidoMs: p, ...(r !== undefined ? { factorTiempoReal: r } : {}) };
  }
  return out;
}
/** En conversación: cumple presupuesto → capa → latencia medida. Lectura: calidad. Pura. */
export function ordenarMotores(candidatos: readonly CandidatoVoz[], medidas: MedidasPorMotor, contexto: ContextoVoz = "conversacion", presupuestoMs = PRESUPUESTO_PRIMER_SONIDO_MS): CandidatoVoz[] {
  return [...candidatos].sort((a, b) => {
    const ma = medidas[a.id], mb = medidas[b.id], empate = (a.orden ?? 0) - (b.orden ?? 0);
    if (contexto !== "conversacion")
      return (b.calidad ?? 0) - (a.calidad ?? 0) || indice(a.capa) - indice(b.capa) || difLat(ma, mb) || empate;
    const da = cumple(ma, presupuestoMs), db = cumple(mb, presupuestoMs);
    if (da !== db) return da ? -1 : 1;
    if (da) return indice(a.capa) - indice(b.capa) || difLat(ma, mb) || rtf(ma) - rtf(mb) || empate;
    return difLat(ma, mb) || indice(a.capa) - indice(b.capa) || rtf(ma) - rtf(mb) || empate;
  });
}
/** Si ninguno cumple el presupuesto devuelve el más rápido medido y lo dice. Pura. */
export function elegirMotor(candidatos: readonly CandidatoVoz[], medidas: MedidasPorMotor, opciones: { contexto?: ContextoVoz; presupuestoMs?: number } = {}): MotorElegido | null {
  const contexto = opciones.contexto ?? "conversacion";
  const presupuesto = opciones.presupuestoMs ?? PRESUPUESTO_PRIMER_SONIDO_MS;
  const motor = ordenarMotores(candidatos, medidas, contexto, presupuesto)[0];
  if (!motor) return null;
  const medida = medidas[motor.id] ?? null;
  const dentro = contexto !== "conversacion" || cumple(medida, presupuesto);
  const motivo = !medida ? "sin medidas en esta neurona: no se inventa latencia"
    : dentro ? `medida aquí: ${Math.round(medida.primerSonidoMs)} ms al primer sonido` +
      (medida.factorTiempoReal !== undefined ? ` · RTF ${medida.factorTiempoReal.toFixed(2)}` : "")
    : `ningún motor llega a ${presupuesto} ms; habla el más rápido medido`;
  return { motor, medida, dentroPresupuesto: dentro, motivo };
}
/** Trocea para voz con la MISMA función pura del OS (`voces/trocear.ts`). */
export const trozosDeConversacion = (texto: string): string[] => trocearTexto(texto, TROZO_CONVERSACION_MAX);

/**
 * Línea de tiempo sin relojes ni motores reales: la síntesis del trozo i+1
 * arranca cuando empieza a sonar el i; en `interrumpirEnMs` el audio se corta
 * en ese instante. Devuelve el peor silencio para compararlo con el presupuesto.
 */
export function planificarCharla(trozos: readonly TrozoVoz[], medida: MedidaMotor, opciones: { presupuestoMs?: number; interrumpirEnMs?: number | null } = {}): PlanCharla {
  const presupuesto = opciones.presupuestoMs ?? PRESUPUESTO_PRIMER_SONIDO_MS;
  const corte = opciones.interrumpirEnMs ?? null;
  const primer = Math.max(0, medida.primerSonidoMs);
  const factor = Math.max(0, medida.factorTiempoReal ?? 0);
  const tramos: TramoTimeline[] = [];
  let fin: number | null = null, peor = primer, cortado: number | null = null;
  for (let i = 0; i < trozos.length && cortado === null; i++) {
    const t = trozos[i], dura = Math.max(0, t.duracionAudioMs);
    const inicioSintesis = i === 0 ? 0 : tramos[i - 1].inicioAudioMs;
    const inicioAudio = Math.max(fin ?? 0, i === 0 ? primer : inicioSintesis + primer + dura * factor);
    const silencio = fin === null ? inicioAudio : Math.max(0, inicioAudio - fin);
    peor = Math.max(peor, silencio);
    if (corte !== null && corte < inicioAudio) { cortado = corte; break; }
    const final = inicioAudio + dura;
    const finCorte = corte !== null && corte < final ? corte : null;
    if (finCorte !== null) cortado = finCorte;
    tramos.push({ i, texto: t.texto, inicioSintesisMs: inicioSintesis, inicioAudioMs: inicioAudio,
      finAudioMs: finCorte ?? final, silencioAntesMs: silencio, hablado: finCorte === null || finCorte > inicioAudio });
    fin = finCorte ?? final;
  }
  return { tramos, primerSonidoMs: primer, silencioMaximoMs: peor, interrumpidoEnMs: cortado,
    latenciaInterrupcionMs: cortado === null ? null : 0,
    dentroPresupuesto: primer <= presupuesto && peor <= presupuesto };
}
