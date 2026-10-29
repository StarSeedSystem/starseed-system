/**
 * Transporte P2P de una sesión de Protomolécula (contrato §6). Canal «protomolecula»; todo va
 * inyectado para poder probarlo sin red ni `node:*`.
 */
import type { Cambio, EstadoValores, Molecula, Operacion, ParametroRef, Sesion, ValorParametro } from "./tipos";
import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";
import { elementoDeOperacion, moleculaDesdeElementos } from "./sesion-sincronia";

export const CANAL_PROTOMOLECULA = "protomolecula";
export const MIN_MUESTRAS_LATENCIA = 8;

export interface RelojSesion { ahora(): number; estado(): { modo: string; precisionMs: number | null; cotaMs: number | null; muestras: number } }
export interface EnlaceInfo { id: string; tipo: string; etiqueta: string }
export interface ResultadoEnvioSesion { ok: boolean; enlace?: EnlaceInfo | null; motivo?: string }
export interface MensajeProtomolecula { v: 1; tipo: "confirmacion" | "gesto" | "presencia" | "ping" | "pong"; de: string; t: number; elemento?: ElementoSala; ref?: ParametroRef; valor?: ValorParametro; id?: string }
export interface OpcionesEnlaceSesion { sesion: Sesion; enviar: (m: MensajeProtomolecula) => ResultadoEnvioSesion | void | Promise<ResultadoEnvioSesion | void>; recibir: (cb: (m: unknown) => void) => () => void; reloj: RelojSesion; molecula?: Molecula; dispositivo?: string; nuevoId?: () => string }
export interface PresenciaSesion { de: string; ref: ParametroRef; valor: ValorParametro; t: number }
export interface GestoSesion { ref: ParametroRef; valor: ValorParametro; t: number }
export interface EstadoEnlaceSesion { conectado: boolean; descripcion: string; enlace: EnlaceInfo | null }
export interface PrecisionRelojSesion { modo: string; muestras: number; precisionMs: number | null; cotaMs: number | null; texto: string }
export interface MedicionLatencia { medido: boolean; muestras: number; p50Ms: number | null; p95Ms: number | null; texto: string }

const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object";
const esRef = (x: unknown): x is ParametroRef => esObjeto(x) && typeof x.atomoId === "string" && typeof x.parametroId === "string";
const valorValido = (x: unknown): x is ValorParametro => typeof x === "number" || typeof x === "boolean" || typeof x === "string";
const esElemento = (x: unknown): x is ElementoSala => {
  const e = (x ?? {}) as Record<string, unknown>;
  return esObjeto(x) && typeof e.id === "string" && typeof e.tipo === "string" && esObjeto(e.datos) && typeof e.actualizadoEn === "number" && typeof e.porDispositivo === "string";
};
const percentil = (v: number[], p: number): number => [...v].sort((a, b) => a - b)[Math.min(v.length - 1, Math.max(0, Math.ceil((p / 100) * v.length) - 1))];

export function crearEnlaceSesion(o: OpcionesEnlaceSesion) {
  const dispositivo = o.dispositivo ?? o.sesion.anfitrion;
  let n = 0; const nuevoId = o.nuevoId ?? (() => `${dispositivo}-${++n}`);
  let mol: Molecula = o.molecula ?? { id: o.sesion.moleculaId, titulo: "", ambito: o.sesion.ambito, capas: [], atomos: [], valores: {}, version: 0, creadaEn: o.reloj.ahora(), actualizadaEn: o.reloj.ahora() };
  let elementos: Record<string, ElementoSala> = {};
  const presencias = new Map<string, PresenciaSesion>(), gestos = new Map<string, GestoSesion>();
  const pings = new Map<string, number>(), latencias: number[] = [];
  let info: EnlaceInfo | null = null, conectado = false, descripcion = "solo en este aparato";
  const resultado = (r: ResultadoEnvioSesion | void): void => {
    if (!r) return;
    conectado = r.ok; info = r.ok ? r.enlace ?? null : null;
    descripcion = r.ok ? (info ? `Va por ${info.etiqueta} (${info.tipo})` : "Va por un enlace de la malla") : "solo en este aparato";
  };
  const mandar = (m: MensajeProtomolecula): void => {
    try {
      const r = o.enviar(m);
      if (r && typeof (r as Promise<ResultadoEnvioSesion>).then === "function") void (r as Promise<ResultadoEnvioSesion>).then(resultado, () => resultado({ ok: false })); else resultado(r as ResultadoEnvioSesion | void);
    } catch { resultado({ ok: false }); }
  };
  const absorber = (el: ElementoSala, propio: boolean): void => {
    const local: EstadoSala = { salaId: mol.id, elementos, reloj: mol.actualizadaEn }, remoto: EstadoSala = { salaId: mol.id, elementos: { [el.id]: el }, reloj: el.actualizadoEn };
    elementos = fusionarEstados(local, remoto, propio ? "" : dispositivo).resultado.elementos;
    const valores: EstadoValores = { ...mol.valores };
    for (const x of Object.values(elementos)) if (x.tipo === "parametro") {
      if (x.borrado) delete valores[x.id]; else if (valorValido(x.datos.valor)) valores[x.id] = x.datos.valor;
    }
    const lista = Object.values(elementos);
    mol = { ...moleculaDesdeElementos(mol, lista), valores, actualizadaEn: Math.max(mol.actualizadaEn, ...lista.map((x) => x.actualizadoEn)) };
  };
  const enviarConfirmacion = (op: Operacion, cambio: Cambio): Operacion => {
    const marcada: Operacion = { ...op, t: o.reloj.ahora() };
    const el: ElementoSala = { ...elementoDeOperacion(marcada, cambio), porDispositivo: dispositivo };
    absorber(el, true); mandar({ v: 1, tipo: "confirmacion", de: dispositivo, t: marcada.t, elemento: el });
    return marcada;
  };
  const enviarGesto = (ref: ParametroRef, valor: ValorParametro): void => {
    const t = o.reloj.ahora();
    const el: ElementoSala = { id: `mano:${ref.atomoId}::${ref.parametroId}`, tipo: "mano", datos: { ref, valor }, actualizadoEn: t, porDispositivo: dispositivo };
    gestos.set(el.id, { ref, valor, t }); mandar({ v: 1, tipo: "gesto", de: dispositivo, t, elemento: el });
  };
  const moverPresencia = (ref: ParametroRef, valor: ValorParametro): void => {
    const t = o.reloj.ahora();
    presencias.set(`${dispositivo}|${ref.atomoId}::${ref.parametroId}`, { de: dispositivo, ref, valor, t });
    mandar({ v: 1, tipo: "presencia", de: dispositivo, t, ref, valor });
  };
  const ping = (): string => {
    const id = nuevoId(), t = o.reloj.ahora();
    pings.set(id, t); if (pings.size > 64) pings.delete(pings.keys().next().value as string);
    mandar({ v: 1, tipo: "ping", de: dispositivo, t, id });
    return id;
  };
  const recibirMensaje = (bruto: unknown): void => {
    if (!esObjeto(bruto) || bruto.v !== 1 || typeof bruto.tipo !== "string" || typeof bruto.de !== "string" || !Number.isFinite(bruto.t)) return;
    const m = bruto as unknown as MensajeProtomolecula;
    if (m.tipo === "ping" && typeof m.id === "string") { mandar({ v: 1, tipo: "pong", de: dispositivo, t: o.reloj.ahora(), id: m.id }); return; }
    if (m.tipo === "pong" && typeof m.id === "string") {
      const t0 = pings.get(m.id); if (t0 === undefined) return;
      pings.delete(m.id); latencias.push(Math.max(0, o.reloj.ahora() - t0)); if (latencias.length > 64) latencias.shift(); return;
    }
    if (m.de === dispositivo) return;
    if (m.tipo === "confirmacion" && esElemento(m.elemento)) absorber(m.elemento, false);
    else if (m.tipo === "gesto" && esElemento(m.elemento) && esRef(m.elemento.datos.ref) && valorValido(m.elemento.datos.valor)) gestos.set(m.elemento.id, { ref: m.elemento.datos.ref, valor: m.elemento.datos.valor, t: m.t });
    else if (m.tipo === "presencia" && esRef(m.ref) && valorValido(m.valor)) presencias.set(`${m.de}|${m.ref.atomoId}::${m.ref.parametroId}`, { de: m.de, ref: m.ref, valor: m.valor, t: m.t });
  };
  const latencia = (): MedicionLatencia => {
    const total = latencias.length;
    if (total < MIN_MUESTRAS_LATENCIA) return { medido: false, muestras: total, p50Ms: null, p95Ms: null, texto: "sin medir" };
    const p50 = percentil(latencias, 50), p95 = percentil(latencias, 95);
    return { medido: true, muestras: total, p50Ms: p50, p95Ms: p95, texto: `p50 ${Math.round(p50)} ms · p95 ${Math.round(p95)} ms (${total} muestras)` };
  };
  const precisionReloj = (): PrecisionRelojSesion => {
    const e = o.reloj.estado();
    if (e.modo === "referencia") return { modo: e.modo, muestras: 0, precisionMs: 0, cotaMs: 0, texto: "reloj de referencia (hora común)" };
    const sin = e.precisionMs == null || e.muestras <= 0;
    return { modo: e.modo, muestras: e.muestras, precisionMs: sin ? null : e.precisionMs, cotaMs: e.cotaMs,
      texto: sin ? "sin muestras: no se inventa la precisión" : `precisión ±${e.precisionMs} ms (cota ${e.cotaMs ?? "?"} ms)` };
  };
  let baja = (() => undefined) as () => void; try { baja = o.recibir((m) => recibirMensaje(m)); } catch { baja = () => undefined; }
  return {
    canal: CANAL_PROTOMOLECULA, molecula: () => mol, elementos: () => Object.values(elementos),
    valores: () => ({ ...mol.valores }), presencias: () => Array.from(presencias.values()), gestos: () => Array.from(gestos.values()),
    enviarConfirmacion, enviarGesto, moverPresencia, ping, latencia, precisionReloj,
    enlace: () => ({ conectado, descripcion, enlace: info }), recibirMensaje,
    cerrar: () => { try { baja(); } catch { /* ya cerrado */ } },
  };
}

export type EnlaceSesion = ReturnType<typeof crearEnlaceSesion>;
