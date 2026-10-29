/** Protomolécula · TRANSPORTE de la sesión (F3). Contrato: `architecture/protomolecula.md` §6.
 * Canal inyectable (sin red): confirmaciones como `ElementoSala`, gestos efímeros y presencia P0.
 * Sin enlace la sesión queda «solo en este aparato». */
import type { Cambio, Molecula, Operacion, ParametroRef, Sesion, ValorParametro } from "./tipos";
import type { ElementoSala } from "@/lib/salas/sincronia-sala";
import type { DestinoTransporte } from "@/lib/malla/eleccion-enlace";
import type { EstadoReloj } from "@/lib/estaciones/reloj-comun";
import { elementoDeOperacion, moleculaDesdeElementos } from "./sesion-sincronia";
export const CANAL_PROTOMOLECULA = "protomolecula";
const MIN_MUESTRAS = 3;
export interface RelojDeSesion { readonly id?: string; ahora(): number; estado(): EstadoReloj }
export interface ResultadoEnvioSesion { ok: boolean; enlace?: { id: string; tipo: string; etiqueta: string } | null; motivo?: string }
export type EnviarSesion = (destino: DestinoTransporte, canal: string, cuerpo: unknown) => Promise<ResultadoEnvioSesion>;
export type RecibirSesion = (canal: string, cb: (m: { id: string; cuerpo: unknown }) => void) => () => void;
export interface PresenciaSesion { de: string; ref: ParametroRef | null; t: number }
export interface GestoRecibido extends PresenciaSesion { valor: ValorParametro }
export interface EstadoLatencia { muestras: number; p50Ms: number | null; p95Ms: number | null; texto: string }
export interface EstadoEnlaceSesion {
  sesionId: string; transporte: string; enlace: { id: string; tipo: string; etiqueta: string } | null; motivo: string;
  reloj: EstadoReloj; latencia: EstadoLatencia; gestos: number; presencia: PresenciaSesion[];
}
export interface OpcionesEnlaceSesion {
  sesion: Sesion; enviar: EnviarSesion; recibir: RecibirSesion; reloj: RelojDeSesion;
  molecula?: Molecula; dispositivoId?: string; destino?: DestinoTransporte; minimoMuestrasLatencia?: number;
}
export interface EnlaceSesion {
  sesionId: string; molecula(): Molecula; estado(): EstadoEnlaceSesion; presencia(): PresenciaSesion[];
  ultimoGesto(): GestoRecibido | null; ping(destino?: DestinoTransporte): Promise<ResultadoEnvioSesion>; cerrar(): void;
  confirmar(op: Operacion, cambio: Cambio, destino?: DestinoTransporte): Promise<ResultadoEnvioSesion>;
  gesto(ref: ParametroRef, valor: ValorParametro, destino?: DestinoTransporte): Promise<ResultadoEnvioSesion>;
  anunciarPresencia(ref: ParametroRef | null, destino?: DestinoTransporte): Promise<ResultadoEnvioSesion>;
}
type Mensaje =
  | { tipo: "confirmacion"; sesionId: string; de: string; elemento: ElementoSala }
  | { tipo: "gesto"; sesionId: string; de: string; ref: ParametroRef; valor: ValorParametro; t: number }
  | { tipo: "presencia"; sesionId: string; de: string; ref: ParametroRef | null; t: number }
  | { tipo: "ping"; sesionId: string; de: string; id: string; t0: number }
  | { tipo: "pong"; sesionId: string; de: string; id: string; t0: number; t1: number };
const esMensaje = (x: unknown): x is Mensaje => { const o = x as Record<string, unknown> | null; return !!o && typeof o.tipo === "string" && typeof o.sesionId === "string" && typeof o.de === "string"; };
const moleculaVacia = (s: Sesion, ahora: number): Molecula => ({ id: s.moleculaId, titulo: "", ambito: s.ambito, capas: [], atomos: [], valores: {}, version: 0, creadaEn: ahora, actualizadaEn: ahora });
const referenciaDeClave = (id: string): ParametroRef => { const [atomoId, parametroId] = id.split("::"); return { atomoId: atomoId ?? id, parametroId: parametroId ?? "" }; };
const percentil = (o: number[], p: number): number => Math.round(o[Math.min(Math.max(0, Math.ceil(p * o.length) - 1), o.length - 1)] * 10);
/** Recompone la molécula con el elemento recibido y el mismo reloj de sesión. */
function fusionar(base: Molecula, el: ElementoSala): Molecula {
  const conReloj = moleculaDesdeElementos(base, [el]);
  const valor = el.datos?.valor;
  if (el.tipo !== "parametro" || el.borrado || valor === undefined) return conReloj;
  return { ...conReloj, valores: { ...conReloj.valores, [el.id]: valor as ValorParametro }, version: Math.max(base.version, conReloj.version) + 1, actualizadaEn: Math.max(base.actualizadaEn, el.actualizadoEn, conReloj.actualizadaEn) };
}
/** Enlace de una sesión sobre el canal «protomolecula». Sin enlace, la sesión queda local. */
export function crearEnlaceSesion(op: OpcionesEnlaceSesion): EnlaceSesion {
  const { sesion, enviar, recibir, reloj } = op;
  const dispositivo = op.dispositivoId ?? reloj.id ?? sesion.anfitrion;
  const destinoBase: DestinoTransporte = op.destino ?? {};
  const minimo = Math.max(1, op.minimoMuestrasLatencia ?? MIN_MUESTRAS);
  let actual = op.molecula ?? moleculaVacia(sesion, reloj.ahora());
  let ultimoEnlace: EstadoEnlaceSesion["enlace"] = null;
  let motivo = "solo en este aparato";
  let gestos = 0;
  let ultimoGesto: GestoRecibido | null = null;
  let n = 0;
  const presencia = new Map<string, PresenciaSesion>();
  const muestras: number[] = [];
  const pendientes = new Map<string, number>();
  const nuevoId = () => `${sesion.id}-${Math.round(reloj.ahora())}-${++n}`;
  async function mandar(cuerpo: Mensaje, destino = destinoBase): Promise<ResultadoEnvioSesion> {
    const r = await enviar(destino, CANAL_PROTOMOLECULA, cuerpo);
    ultimoEnlace = r.enlace ?? null;
    motivo = r.ok ? (ultimoEnlace ? `por ${ultimoEnlace.etiqueta || ultimoEnlace.tipo}` : r.motivo ?? "enviado") : r.motivo ?? "solo en este aparato";
    return r;
  }
  const dejarDeEscuchar = recibir(CANAL_PROTOMOLECULA, (m) => {
    if (!esMensaje(m.cuerpo) || m.cuerpo.sesionId !== sesion.id) return;
    const c = m.cuerpo;
    if (c.tipo === "confirmacion" && c.elemento) {
      actual = fusionar(actual, c.elemento);
      presencia.set(c.de, { de: c.de, ref: referenciaDeClave(c.elemento.id), t: reloj.ahora() });
    } else if (c.tipo === "gesto" && c.ref) {
      ultimoGesto = { de: c.de, ref: c.ref, valor: c.valor, t: c.t }; gestos += 1;
      presencia.set(c.de, { de: c.de, ref: c.ref, t: c.t });
    } else if (c.tipo === "presencia") {
      presencia.set(c.de, { de: c.de, ref: c.ref ?? null, t: c.t });
    } else if (c.tipo === "ping") {
      void mandar({ tipo: "pong", sesionId: sesion.id, de: dispositivo, id: c.id, t0: c.t0, t1: reloj.ahora() }).catch(() => {});
    } else if (c.tipo === "pong") {
      const t0 = pendientes.get(c.id);
      if (t0 === undefined) return;
      pendientes.delete(c.id); const rtt = Math.max(0, reloj.ahora() - t0); console.log("DEBUG rtt", rtt, "now", reloj.ahora(), "t0", t0); muestras.push(rtt);
    }
  });
  const estadoLatencia = (): EstadoLatencia => {
    if (muestras.length < minimo) return { muestras: muestras.length, p50Ms: null, p95Ms: null, texto: "sin medir" };
    const orden = [...muestras].sort((a, b) => a - b), p50 = percentil(orden, 0.5), p95 = percentil(orden, 0.95);
    return { muestras: orden.length, p50Ms: p50, p95Ms: p95, texto: `p50 ${p50} ms · p95 ${p95} ms` };
  };
  return {
    sesionId: sesion.id, molecula: () => actual, presencia: () => Array.from(presencia.values()), ultimoGesto: () => ultimoGesto,
    estado: () => ({
      sesionId: sesion.id, transporte: ultimoEnlace?.tipo ?? "solo-en-este-aparato", enlace: ultimoEnlace,
      motivo, reloj: reloj.estado(), latencia: estadoLatencia(), gestos, presencia: Array.from(presencia.values()),
    }),
    confirmar: (o, cambio, destino) => { const conT = { ...o, t: reloj.ahora() }, elemento = elementoDeOperacion(conT, { ...cambio, operacion: conT }); actual = fusionar(actual, elemento); return mandar({ tipo: "confirmacion", sesionId: sesion.id, de: dispositivo, elemento }, destino); },
    gesto: (ref, valor, destino) => mandar({ tipo: "gesto", sesionId: sesion.id, de: dispositivo, ref, valor, t: reloj.ahora() }, destino),
    anunciarPresencia: (ref, destino) => mandar({ tipo: "presencia", sesionId: sesion.id, de: dispositivo, ref, t: reloj.ahora() }, destino),
    ping: (destino) => { const id = nuevoId(), t0 = reloj.ahora(); pendientes.set(id, t0); return mandar({ tipo: "ping", sesionId: sesion.id, de: dispositivo, id, t0 }, destino); },
    cerrar: () => { dejarDeEscuchar(); pendientes.clear(); },
  };
}
