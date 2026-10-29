/**
 * Protomolécula · TRANSPORTE DE SESIÓN (F3B, contrato §6). Confirmaciones P1 con
 * `elementoDeOperacion`, gestos efímeros P0 que no se guardan, presencia («quién mueve qué») y
 * medidor de latencia honesto por ping/pong. Canal `protomolecula`; envío, recepción y reloj se
 * INYECTAN: aquí no hay red ni hardware.
 */
import type { EstadoReloj } from "@/lib/estaciones/reloj-comun";
import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";
import type { Cambio, Molecula, Operacion, ParametroRef, Sesion, ValorParametro } from "./tipos";
import { elementoDeOperacion, moleculaDesdeElementos } from "./sesion-sincronia";
export const CANAL_PROTOMOLECULA = "protomolecula";
export interface RelojSesion { ahora(): number; horaLocal(): number; estado(): EstadoReloj }
export interface PresenciaSesion { de: string; moviendo: ParametroRef | null; t: number }
export interface GestoRecibido { de: string; ref: ParametroRef; valor: ValorParametro; t: number }
export interface Latencia { p50Ms: number | null; p95Ms: number | null; muestras: number; texto: string }
export type MensajeProtomolecula =
  | { c: string; tipo: "confirmacion"; elemento: ElementoSala }
  | { c: string; tipo: "gesto"; de: string; ref: ParametroRef; valor: ValorParametro; t: number }
  | { c: string; tipo: "presencia"; de: string; moviendo: ParametroRef | null; t: number }
  | { c: string; tipo: "ping" | "pong"; de: string; id: string; t0?: number; para?: string };
export interface DepsEnlaceSesion {
  sesion: Sesion; enviar(m: MensajeProtomolecula): void; recibir(cb: (m: unknown) => void): () => void;
  reloj: RelojSesion; molecula?: Molecula; dispositivo?: string; minimoMuestras?: number; alGesto?(g: GestoRecibido): void;
}
export interface EstadoEnlace {
  canal: string; enlace: string; transporte: Sesion["transporte"]; reloj: EstadoReloj;
  latencia: Latencia; presencias: Record<string, PresenciaSesion>; molecula: Molecula;
}
export interface EnlaceSesion {
  obtener(): Molecula; suscribir(cb: (m: Molecula) => void): () => void; enviarConfirmacion(op: Operacion, cambio: Cambio): Operacion;
  enviarGesto(ref: ParametroRef, valor: ValorParametro): void; enviarPresencia(moviendo: ParametroRef | null): void;
  ping(): string; medirLatencia(): Latencia; estado(): EstadoEnlace; cerrar(): void;
}
export const describirEnlace = (t: Sesion["transporte"]): string =>
  t === "local" ? "solo en este aparato" : t === "malla-p2p" ? "malla P2P" : t === "servidor-privado" ? "servidor privado" : "servidor público";
const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object";
const esValor = (x: unknown): x is ValorParametro => typeof x === "string" || typeof x === "boolean" || (typeof x === "number" && Number.isFinite(x));
const esMensaje = (x: unknown): x is MensajeProtomolecula => esObjeto(x) && x.c === CANAL_PROTOMOLECULA && typeof x.tipo === "string";
const redondear = (n: number): number => Math.round(n * 10) / 10;
const percentil = (orden: number[], p: number): number => orden[Math.min(orden.length - 1, Math.max(0, Math.ceil((p / 100) * orden.length) - 1))];
export function crearEnlaceSesion(deps: DepsEnlaceSesion): EnlaceSesion {
  const { sesion, enviar, reloj } = deps;
  const yo = deps.dispositivo ?? sesion.anfitrion;
  const minimo = Math.max(1, deps.minimoMuestras ?? 5);
  let mol: Molecula = deps.molecula ? { ...deps.molecula } : { id: sesion.moleculaId, titulo: "", ambito: sesion.ambito, capas: [], atomos: [], valores: {}, version: 0, creadaEn: reloj.ahora(), actualizadaEn: reloj.ahora() };
  let elementos: Record<string, ElementoSala> = {};
  for (const [id, valor] of Object.entries(mol.valores)) elementos[id] = { id, tipo: "parametro", datos: { valor }, actualizadoEn: mol.actualizadaEn, porDispositivo: yo, borrado: false };
  const presencias: Record<string, PresenciaSesion> = {}, oyentes = new Set<(m: Molecula) => void>();
  const pendientes = new Map<string, number>(), muestras: number[] = [];
  let secuencia = 0;
  const aplicar = (lista: ElementoSala[]): void => {
    const remoto: EstadoSala = { salaId: mol.id, elementos: Object.fromEntries(lista.map((e) => [e.id, e])), reloj: reloj.ahora() };
    const local: EstadoSala = { salaId: mol.id, elementos, reloj: mol.actualizadaEn };
    const { resultado } = fusionarEstados(local, remoto, "");
    elementos = resultado.elementos;
    const base = moleculaDesdeElementos(mol, lista), valores = { ...base.valores };
    for (const [id, e] of Object.entries(elementos)) {
      if (e.tipo === "parametro" && !e.borrado && esValor(e.datos.valor)) valores[id] = e.datos.valor;
    }
    mol = { ...base, valores, version: mol.version + 1, actualizadaEn: Math.max(base.actualizadaEn, resultado.reloj) };
    for (const cb of Array.from(oyentes)) cb(mol);
  };
  const enviarConfirmacion = (op: Operacion, cambio: Cambio): Operacion => {
    const conT = { ...op, t: reloj.ahora() };
    const elemento = elementoDeOperacion(conT, { ...cambio, operacion: conT });
    aplicar([elemento]);
    enviar({ c: CANAL_PROTOMOLECULA, tipo: "confirmacion", elemento });
    return conT;
  };
  const enviarGesto = (ref: ParametroRef, valor: ValorParametro): void =>
    enviar({ c: CANAL_PROTOMOLECULA, tipo: "gesto", de: yo, ref, valor, t: reloj.ahora() });
  const enviarPresencia = (moviendo: ParametroRef | null): void => {
    const t = reloj.ahora(); presencias[yo] = { de: yo, moviendo, t };
    enviar({ c: CANAL_PROTOMOLECULA, tipo: "presencia", de: yo, moviendo, t });
  };
  const ping = (): string => {
    const id = `${yo}:${++secuencia}`, t0 = reloj.horaLocal();
    pendientes.set(id, t0);
    enviar({ c: CANAL_PROTOMOLECULA, tipo: "ping", de: yo, id, t0 });
    return id;
  };
  const medirLatencia = (): Latencia => {
    if (muestras.length < minimo) return { p50Ms: null, p95Ms: null, muestras: muestras.length, texto: "sin medir" };
    const orden = [...muestras].sort((a, b) => a - b), p50 = redondear(percentil(orden, 50)), p95 = redondear(percentil(orden, 95));
    return { p50Ms: p50, p95Ms: p95, muestras: orden.length, texto: `p50 ${p50} ms · p95 ${p95} ms (${orden.length} muestras)` };
  };
  const recibido = (raw: unknown): void => {
    if (!esMensaje(raw)) return;
    switch (raw.tipo) {
      case "confirmacion": if (esObjeto(raw.elemento) && typeof raw.elemento.id === "string") aplicar([raw.elemento as ElementoSala]); return;
      case "gesto": if (esObjeto(raw.ref) && esValor(raw.valor)) deps.alGesto?.({ de: raw.de, ref: raw.ref as ParametroRef, valor: raw.valor, t: raw.t }); return;
      case "presencia": presencias[raw.de] = { de: raw.de, moviendo: esObjeto(raw.moviendo) ? (raw.moviendo as ParametroRef) : null, t: raw.t }; return;
      case "ping": enviar({ c: CANAL_PROTOMOLECULA, tipo: "pong", de: yo, para: raw.de, id: raw.id }); return;
      case "pong": {
        const t0 = raw.para === yo ? pendientes.get(raw.id) : undefined;
        if (t0 === undefined) return;
        pendientes.delete(raw.id);
        const rtt = reloj.horaLocal() - t0;
        if (Number.isFinite(rtt) && rtt >= 0) muestras.push(rtt);
        return;
      }
    }
  };
  const cerrar = deps.recibir(recibido);
  return {
    obtener: () => mol,
    suscribir(cb) { oyentes.add(cb); return () => void oyentes.delete(cb); },
    enviarConfirmacion, enviarGesto, enviarPresencia, ping, medirLatencia, cerrar,
    estado: () => ({
      canal: CANAL_PROTOMOLECULA, enlace: describirEnlace(sesion.transporte), transporte: sesion.transporte,
      reloj: reloj.estado(), latencia: medirLatencia(), presencias: { ...presencias }, molecula: mol,
    }),
  };
}
