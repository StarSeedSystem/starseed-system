// Lado anfitrión del relé `capacidad.*` (§6 de apps-en-la-malla.md, Ola 1017A); puro, con manejadores y reloj inyectados.
import { capacidadPrestable, type OfertaNeurona } from "./oferta";
import { permitido, type Sesion } from "./sesion-prestamo";
export const CAPACIDAD_NS = "capacidad.";
export const TOPE_MENSAJE_BYTES = 16 * 1024;
export const MAX_COLA = 4;
const MARGEN_TROZO = 256;
export type TipoCapacidad = "imagen" | "voz" | "oido" | "palabra" | "transcodificar" | "render" | "buscar" | "construir";
export interface MsgCapacidadPedir { t: "capacidad.pedir"; id: string; sesion: string; tipo: TipoCapacidad; cuerpo?: unknown }
export interface MsgCapacidadTrozo { t: "capacidad.trozo"; id: string; datos: string }
export interface MsgCapacidadFin { t: "capacidad.fin"; id: string; bytes: number }
export interface MsgCapacidadError { t: "capacidad.error"; id: string; estado: number; mensaje: string; reintentarEnS?: number; ocupado?: boolean }
export interface MsgCapacidadCancelar { t: "capacidad.cancelar"; id: string }
export type MsgCapacidad = MsgCapacidadPedir | MsgCapacidadTrozo | MsgCapacidadFin | MsgCapacidadError | MsgCapacidadCancelar;
export type ManejadorCapacidad = (peticion: MsgCapacidadPedir, opts: { signal: AbortSignal }) => Promise<string>;
export interface Prestamo { id: string; invitado: string; tipo: TipoCapacidad; estado: "en-cola" | "en-curso" | "hecho" | "cancelado" | "error"; inicio: number; fin?: number; ms: number; bytes: number }
export interface ServidorCapacidades { atender(mensaje: unknown): Promise<MsgCapacidad[]>; cancelar(id: string): boolean; prestamos(): Prestamo[] }
export interface DepsServidorCapacidades {
  manejadores: Partial<Record<TipoCapacidad, ManejadorCapacidad>>;
  oferta: OfertaNeurona; sesiones: Sesion[]; ahora: () => number;
  maxCola?: number; topeTrozoBytes?: number;
}
type Recurso = "computo" | "almacen" | "red";
const RECURSO: Record<TipoCapacidad, Recurso> = {
  imagen: "computo", voz: "computo", oido: "computo", palabra: "computo", transcodificar: "computo",
  render: "computo", construir: "computo", buscar: "red",
};
const TIPOS = Object.keys(RECURSO) as TipoCapacidad[];
function esObjeto(x: unknown): x is Record<string, unknown> { return !!x && typeof x === "object"; }
function recursoDisponible(tipo: TipoCapacidad, oferta: OfertaNeurona): boolean {
  const p = capacidadPrestable(oferta);
  if (RECURSO[tipo] === "computo") return p.computo.nucleos > 0 && p.computo.ramLibreMb > 0;
  if (RECURSO[tipo] === "almacen") return p.almacen.prestaMb > 0;
  return (p.enlaces.subidaKbps ?? 0) > 0 || p.computo.nucleos > 0;
}
export function esMensajeCapacidad(x: unknown): x is MsgCapacidad {
  if (!esObjeto(x) || typeof x.t !== "string" || !x.t.startsWith(CAPACIDAD_NS)) return false;
  if (typeof x.id !== "string" || !x.id) return false;
  switch (x.t) {
    case "capacidad.pedir": return typeof x.sesion === "string" && typeof x.tipo === "string" && TIPOS.includes(x.tipo as TipoCapacidad);
    case "capacidad.trozo": return typeof x.datos === "string";
    case "capacidad.fin": return typeof x.bytes === "number";
    case "capacidad.error": return typeof x.estado === "number" && typeof x.mensaje === "string";
    case "capacidad.cancelar": return true;
    default: return false;
  }
}
export function pesoBytes(texto: string): number { return new TextEncoder().encode(texto).length; }
export function partirRespuesta(texto: string, maxBytes = TOPE_MENSAJE_BYTES - MARGEN_TROZO): string[] {
  if (!texto) return [];
  const partes: string[] = [];
  let actual = "";
  for (const ch of texto) {
    if (actual && pesoBytes(actual + ch) > maxBytes) { partes.push(actual); actual = ch; } else actual += ch;
  }
  if (actual) partes.push(actual);
  return partes;
}
interface Tarea { msg: MsgCapacidadPedir; abort: AbortController; cancelado: boolean; prestamo: Prestamo; resolver: (m: MsgCapacidad[]) => void }
export function crearServidor(deps: DepsServidorCapacidades): ServidorCapacidades {
  const maxCola = deps.maxCola ?? MAX_COLA, tope = deps.topeTrozoBytes ?? TOPE_MENSAJE_BYTES - MARGEN_TROZO;
  const cola: Tarea[] = []; const registro = new Map<string, Prestamo>(); let enCurso: Tarea | null = null;
  const errorDe = (id: string, estado: number, mensaje: string, ocupado = false): MsgCapacidad[] => [{ t: "capacidad.error", id, estado, mensaje, ...(ocupado ? { ocupado: true, reintentarEnS: 5 } : {}) }];
  const ejecutar = async (t: Tarea): Promise<void> => {
    const salida: MsgCapacidad[] = [];
    try {
      const texto = await (deps.manejadores[t.msg.tipo] as ManejadorCapacidad)(t.msg, { signal: t.abort.signal });
      if (t.cancelado) throw new Error("cancelado");
      for (const parte of partirRespuesta(texto, tope)) salida.push({ t: "capacidad.trozo", id: t.msg.id, datos: parte });
      const bytes = pesoBytes(texto);
      salida.push({ t: "capacidad.fin", id: t.msg.id, bytes });
      Object.assign(t.prestamo, { estado: "hecho", bytes });
    } catch {
      const cancelado = t.cancelado || t.abort.signal.aborted;
      t.prestamo.estado = cancelado ? "cancelado" : "error";
      salida.push(...errorDe(t.msg.id, cancelado ? 499 : 502, cancelado ? "Préstamo cancelado por el anfitrión." : "La capacidad falló al servir la petición."));
    } finally {
      const fin = (t.prestamo.fin = deps.ahora()); t.prestamo.ms = Math.max(0, fin - t.prestamo.inicio);
      t.resolver(salida);
    }
  };
  const bombear = (): void => {
    if (enCurso || cola.length === 0) return;
    const t = (enCurso = cola.shift() as Tarea);
    t.prestamo.estado = "en-curso"; t.prestamo.inicio = deps.ahora();
    void ejecutar(t).finally(() => { enCurso = null; bombear(); });
  };
  const cancelar = (id: string): boolean => {
    const i = cola.findIndex((t) => t.msg.id === id);
    if (i >= 0) {
      const [t] = cola.splice(i, 1);
      t.cancelado = true;
      Object.assign(t.prestamo, { estado: "cancelado", fin: deps.ahora(), ms: 0 });
      t.resolver(errorDe(id, 499, "Préstamo cancelado antes de empezar."));
      return true;
    }
    if (enCurso && enCurso.msg.id === id) { enCurso.cancelado = true; enCurso.abort.abort(); return true; }
    return false;
  };
  const atender = async (mensaje: unknown): Promise<MsgCapacidad[]> => {
    if (!esMensajeCapacidad(mensaje)) return [];
    if (mensaje.t === "capacidad.cancelar") { cancelar(mensaje.id); return []; }
    if (mensaje.t !== "capacidad.pedir") return [];
    const tipo = mensaje.tipo; const sesion = deps.sesiones.find((s) => s.id === mensaje.sesion);
    if (!sesion) return errorDe(mensaje.id, 401, "Sin sesión de préstamo para esta capacidad.");
    if (sesion.alcance.tipo !== "capacidad" || sesion.alcance.id !== tipo) return errorDe(mensaje.id, 403, "La sesión de préstamo no cubre esta capacidad.");
    if (!permitido(sesion, `${CAPACIDAD_NS}${tipo}`, deps.ahora())) return errorDe(mensaje.id, 401, "La sesión de préstamo venció o fue revocada.");
    if (!deps.manejadores[tipo]) return errorDe(mensaje.id, 501, `Esta neurona no sirve la capacidad «${tipo}».`);
    if (!recursoDisponible(tipo, deps.oferta)) return errorDe(mensaje.id, 503, "Los topes de préstamo no permiten servir esta capacidad ahora.");
    if (registro.has(mensaje.id)) return errorDe(mensaje.id, 409, "Ya hay un préstamo con ese identificador.");
    if (enCurso && cola.length >= maxCola) return errorDe(mensaje.id, 429, "Cola de préstamos llena; reintenta en unos segundos.", true);
    const t: Tarea = { msg: mensaje, abort: new AbortController(), cancelado: false, prestamo: { id: mensaje.id, invitado: sesion.invitado, tipo, estado: "en-cola", inicio: deps.ahora(), ms: 0, bytes: 0 }, resolver: () => undefined };
    const salida = new Promise<MsgCapacidad[]>((resolver) => { t.resolver = resolver; });
    registro.set(mensaje.id, t.prestamo);
    cola.push(t);
    bombear();
    return salida;
  };
  return { atender, cancelar, prestamos: () => [...registro.values()].map((p) => ({ ...p })) };
}
