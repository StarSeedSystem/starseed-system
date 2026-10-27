/**
 * transporte-protomolecula — enlace P2P de una sesión de la Protomolécula (F3).
 * Contrato: `architecture/protomolecula.md` §6 y §11.1. PURO: la red entra INYECTADA
 * (`enviar`/`recibir`); las pruebas conectan dos enlaces falsos sin red.
 * Las confirmaciones viajan como `ElementoSala` (`elementoDeOperacion`, P1) y se fusionan con
 * `moleculaDesdeElementos`. Gestos y presencia son EFÍMEROS (P0): se reenvían y NO se guardan.
 * `t` sale del reloj común, que declara su precisión o «sin muestras». La latencia es ping/pong con
 * p50/p95 solo desde un mínimo de muestras; si no, «sin medir». Sin enlace: «solo en este aparato».
 */
import type { Cambio, EstadoValores, Molecula, Operacion, ParametroRef, Sesion, ValorParametro } from "./tipos";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import { elementoDeOperacion, moleculaDesdeElementos } from "./sesion-sincronia";
import type { EstadoReloj, RelojComun } from "@/lib/estaciones/reloj-comun";
export const CANAL_PROTOMOLECULA = "protomolecula";
export const MIN_MUESTRAS_LATENCIA = 5;
const LIMITE_MUESTRAS = 60;
const ETIQUETAS: Record<string, string> = { "malla-p2p": "malla P2P", "servidor-privado": "servidor privado", "servidor-publico": "servidor público" };
type Base = { v: 1; de: string };
export type MensajeProtomolecula = Base & (
  | { tipo: "confirmacion"; elemento: ElementoSala }
  | { tipo: "gesto"; ref: ParametroRef; valor: ValorParametro; t: number }
  | { tipo: "presencia"; quien: string; que: string; t: number }
  | { tipo: "ping"; id: string; t0: number }
  | { tipo: "pong"; id: string; t0: number }
);
export interface Presencia { dispositivo: string; quien: string; que: string; t: number }
export interface Latencia { muestras: number; p50Ms: number | null; p95Ms: number | null; texto: string }
export interface EstadoEnlace {
  sesionId: string; enlace: string | null; descripcionEnlace: string; reloj: EstadoReloj;
  precisionTexto: string; presencia: Presencia[]; latencia: Latencia;
}
export interface OpcionesEnlace {
  sesion: Sesion; molecula: Molecula; reloj: RelojComun; dispositivo: string;
  enviar: (canal: string, mensaje: MensajeProtomolecula) => void;
  recibir: (canal: string, alRecibir: (mensaje: MensajeProtomolecula) => void) => () => void;
  enlace?: string | null; ahora?: () => number; minimoMuestras?: number;
}
export interface EnlaceProtomolecula {
  estado(): EstadoEnlace; suscribir(oyente: (estado: EstadoEnlace) => void): () => void;
  molecula(): Molecula; confirmar(operacion: Operacion, cambio: Cambio): ElementoSala;
  gesto(ref: ParametroRef, valor: ValorParametro): void; presencia(quien: string, que: string): void;
  medirLatencia(): string; cerrar(): void;
}
function percentil(xs: number[], p: number): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), i = (s.length - 1) * p;
  const lo = Math.floor(i), hi = Math.ceil(i);
  return Math.round((s[lo] + (s[hi] - s[lo]) * (i - lo)) * 10) / 10;
}
function medir(latencias: number[], minimo: number): Latencia {
  const p50Ms = latencias.length >= minimo ? percentil(latencias, 0.5) : null;
  const p95Ms = latencias.length >= minimo ? percentil(latencias, 0.95) : null;
  const texto = p50Ms === null || p95Ms === null ? "sin medir"
    : `p50 ${p50Ms} ms · p95 ${p95Ms} ms · ida y vuelta (${latencias.length} muestras)`;
  return { muestras: latencias.length, p50Ms, p95Ms, texto };
}
function textoPrecision(e: EstadoReloj): string {
  if (e.modo === "referencia") return "reloj de referencia";
  return e.precisionMs == null ? "reloj sin muestras: no se inventa una precisión" : `±${e.precisionMs} ms (${e.muestras} muestras)`;
}
function aplicarElemento(base: Molecula, elemento: ElementoSala): Molecula {
  const fusionada = moleculaDesdeElementos(base, [elemento]);
  const valores: EstadoValores = { ...fusionada.valores };
  if (elemento.tipo === "parametro" && !elemento.borrado && "valor" in elemento.datos) valores[elemento.id] = elemento.datos.valor as ValorParametro;
  return { ...fusionada, valores, actualizadaEn: Math.max(fusionada.actualizadaEn, elemento.actualizadoEn) };
}
export function crearEnlaceSesion(opciones: OpcionesEnlace): EnlaceProtomolecula {
  const o = opciones, ahora = o.ahora ?? (() => Date.now());
  const minimo = Math.max(1, o.minimoMuestras ?? MIN_MUESTRAS_LATENCIA);
  const enlace = o.enlace !== undefined ? o.enlace : o.sesion.transporte === "local" ? null : o.sesion.transporte;
  const descripcionEnlace = enlace ? (ETIQUETAS[enlace] ?? enlace) : "solo en este aparato";
  let mol = o.molecula, presencia: Presencia[] = [], latencias: number[] = [], cerrado = false, seq = 0;
  const pendientes = new Map<string, number>(), oyentes = new Set<(estado: EstadoEnlace) => void>();
  const estado = (): EstadoEnlace => {
    const reloj = o.reloj.estado();
    return { sesionId: o.sesion.id, enlace, descripcionEnlace, reloj, precisionTexto: textoPrecision(reloj), presencia: [...presencia], latencia: medir(latencias, minimo) };
  };
  const emitir = () => { const e = estado(); for (const f of Array.from(oyentes)) try { f(e); } catch { /* oyente roto */ } };
  const enviar = (mensaje: MensajeProtomolecula) => {
    if (cerrado) return;
    try { o.enviar(CANAL_PROTOMOLECULA, mensaje); } catch { /* canal caído: no se finge envío */ }
  };
  const alRecibir = (m: MensajeProtomolecula) => {
    if (cerrado || !m || m.v !== 1 || m.de === o.dispositivo) return;
    if (m.tipo === "confirmacion") { mol = aplicarElemento(mol, m.elemento); emitir(); }
    else if (m.tipo === "presencia") {
      presencia = [...presencia.filter((p) => p.dispositivo !== m.de), { dispositivo: m.de, quien: m.quien, que: m.que, t: m.t }];
      emitir();
    } else if (m.tipo === "ping") enviar({ v: 1, tipo: "pong", de: o.dispositivo, id: m.id, t0: m.t0 });
    else if (m.tipo === "pong") {
      const t0 = pendientes.get(m.id); if (t0 === undefined) return; pendientes.delete(m.id);
      latencias = [...latencias, Math.max(0, ahora() - t0)].slice(-LIMITE_MUESTRAS); emitir();
    }
  };
  const soltar = o.recibir(CANAL_PROTOMOLECULA, alRecibir);
  return {
    estado,
    suscribir(f) { oyentes.add(f); return () => { oyentes.delete(f); }; },
    molecula: () => mol,
    confirmar(operacion, cambio) {
      const conT: Operacion = { ...operacion, t: o.reloj.ahora() };
      const elemento = elementoDeOperacion(conT, { ...cambio, operacion: conT });
      mol = aplicarElemento(mol, elemento);
      enviar({ v: 1, tipo: "confirmacion", de: o.dispositivo, elemento });
      return elemento;
    },
    gesto(ref, valor) { enviar({ v: 1, tipo: "gesto", de: o.dispositivo, ref, valor, t: o.reloj.ahora() }); },
    presencia(quien, que) {
      const t = o.reloj.ahora();
      presencia = [...presencia.filter((p) => p.dispositivo !== o.dispositivo), { dispositivo: o.dispositivo, quien, que, t }];
      enviar({ v: 1, tipo: "presencia", de: o.dispositivo, quien, que, t }); emitir();
    },
    medirLatencia() {
      const t = ahora(), id = `ping-${++seq}-${t}`;
      pendientes.set(id, t); enviar({ v: 1, tipo: "ping", de: o.dispositivo, id, t0: t });
      return id;
    },
    cerrar() { cerrado = true; soltar(); oyentes.clear(); pendientes.clear(); },
  };
}
