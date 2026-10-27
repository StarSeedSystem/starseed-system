// Lado anfitrión del relé `capacidad.*` (Ola 1017A): comprueba la sesión de
// préstamo y los topes de `capacidadPrestable`, admite con cola acotada,
// permite cancelar y anota cada préstamo para «Procesos activos».
import { esMensajeCapacidadMalla, partirEnTrozos, bytesUtf8, CAPACIDAD_MALLA_MAX_BYTES, type Msg, type TipoCapacidad } from "@/lib/network/capacidad-por-malla";
import { capacidadPrestable, type OfertaNeurona } from "./oferta";
import { permitido, type Sesion } from "./sesion-prestamo";

export type EstadoPrestamo = "en-cola" | "en-curso" | "hecho" | "cancelado" | "error";
export interface Prestamo { id: string; invitado: string; tipo: TipoCapacidad; sesionId: string; estado: EstadoPrestamo; inicio: number; fin?: number; ms: number; bytes: number; motivo?: string; }
export interface ContextoManejador { signal: AbortSignal; sesion: Sesion; tipo: TipoCapacidad; }
export type ManejadorCapacidad = (cuerpo: Record<string, unknown>, ctx: ContextoManejador) => unknown | Promise<unknown>;
export interface OpcionesServidor { manejadores: Partial<Record<TipoCapacidad, ManejadorCapacidad>>; oferta: OfertaNeurona; sesiones: Sesion[]; ahora?: number | (() => number); maxEnCurso?: number; maxCola?: number; }
export interface ServidorCapacidades { atender(mensaje: unknown): Promise<Msg[]>; prestamos(): Prestamo[]; }

const TROZO_MAX = CAPACIDAD_MALLA_MAX_BYTES - 256;
const ESTADOS_FINALES: EstadoPrestamo[] = ["hecho", "cancelado", "error"];

function textoDe(resultado: unknown): string {
  if (typeof resultado === "string") return resultado;
  if (resultado === undefined) return "";
  try { return JSON.stringify(resultado) ?? String(resultado); } catch { return String(resultado); }
}
function fallo(id: string, estado: number, mensaje: string): Msg { return { t: "capacidad.error", id, estado, mensaje }; }

export function crearServidor(opciones: OpcionesServidor): ServidorCapacidades {
  const { manejadores, oferta, sesiones } = opciones;
  const reloj = opciones.ahora;
  const ahora = typeof reloj === "number" ? () => reloj : reloj ?? (() => Date.now());
  const maxEnCurso = Math.max(1, opciones.maxEnCurso ?? 1);
  const maxCola = Math.max(0, opciones.maxCola ?? 4);
  const registro = new Map<string, Prestamo>();
  const enCurso = new Set<string>();
  const abortos = new Map<string, AbortController>();
  const cola: { id: string; resolver: (hueco: boolean) => void }[] = [];

  const finalizar = (p: Prestamo, estado: EstadoPrestamo, fin: number, bytes: number, motivo?: string) => {
    if (ESTADOS_FINALES.includes(p.estado)) return;
    Object.assign(p, { estado, fin, ms: Math.max(0, fin - p.inicio), bytes, ...(motivo ? { motivo } : {}) });
  };

  const liberar = (id: string) => {
    enCurso.delete(id);
    while (cola.length > 0 && enCurso.size < maxEnCurso) {
      const siguiente = cola.shift() as (typeof cola)[number];
      enCurso.add(siguiente.id);
      siguiente.resolver(true);
    }
  };

  const esperarHueco = (id: string): "hueco" | "lleno" | Promise<boolean> => {
    if (enCurso.size < maxEnCurso) { enCurso.add(id); return "hueco"; }
    if (cola.length >= maxCola) return "lleno";
    return new Promise<boolean>((resolver) => cola.push({ id, resolver }));
  };

  const cancelar = (id: string): Msg[] => {
    const indice = cola.findIndex((espera) => espera.id === id);
    if (indice < 0) { abortos.get(id)?.abort(); return []; }
    const espera = cola.splice(indice, 1)[0];
    const p = registro.get(id);
    if (p) finalizar(p, "cancelado", ahora(), 0, "Cancelada antes de empezar.");
    espera.resolver(false);
    return [];
  };

  async function pedir(m: { id: string; tipo: TipoCapacidad; cuerpo: Record<string, unknown>; sesionId?: string }): Promise<Msg[]> {
    const previo = registro.get(m.id);
    if (previo && (previo.estado === "en-cola" || previo.estado === "en-curso"))
      return [fallo(m.id, 409, "Ya hay una petición con ese id en curso.")];
    const t = ahora();
    if (!m.sesionId) return [fallo(m.id, 401, "Falta una sesión de préstamo.")];
    const sesion = sesiones.find((s) => s.id === m.sesionId);
    if (!sesion) return [fallo(m.id, 403, "La sesión de préstamo no existe.")];
    if (sesion.anfitrion !== oferta.nodoId) return [fallo(m.id, 403, "La sesión no es de esta neurona.")];
    if (!permitido(sesion, "capacidad", t)) return [fallo(m.id, 403, "La sesión está caducada o revocada.")];
    if (sesion.alcance.tipo !== "capacidad") return [fallo(m.id, 403, "La sesión no cubre capacidades.")];
    const manejador = manejadores[m.tipo];
    if (!manejador) return [fallo(m.id, 501, `Esta neurona no ofrece «${m.tipo}».`)];
    const p = capacidadPrestable(oferta);
    if (p.computo.nucleos <= 0 && p.computo.ramLibreMb <= 0 && p.almacen.prestaMb <= 0)
      return [fallo(m.id, 503, "Esta neurona no puede prestar capacidad ahora mismo.")];
    const hueco = esperarHueco(m.id);
    if (hueco === "lleno") return [fallo(m.id, 429, `La cola de préstamos está llena (${maxCola}).`)];
    const prestamo: Prestamo = { id: m.id, invitado: sesion.invitado, tipo: m.tipo, sesionId: sesion.id,
      estado: typeof hueco === "string" ? "en-curso" : "en-cola", inicio: t, ms: 0, bytes: 0 };
    registro.set(m.id, prestamo);
    const turno = typeof hueco === "string" ? true : await hueco;
    if (!turno || prestamo.estado === "cancelado") return [];
    prestamo.estado = "en-curso";
    const abort = new AbortController();
    abortos.set(m.id, abort);
    try {
      const resultado = await manejador(m.cuerpo, { signal: abort.signal, sesion, tipo: m.tipo });
      if (abort.signal.aborted) { finalizar(prestamo, "cancelado", ahora(), 0, "Cancelada por quien pedía."); return []; }
      const texto = textoDe(resultado);
      const trozos: Msg[] = partirEnTrozos(texto, TROZO_MAX).map((parte) => ({ t: "capacidad.trozo", id: m.id, texto: parte }));
      finalizar(prestamo, "hecho", ahora(), bytesUtf8(texto));
      return [...trozos, { t: "capacidad.fin", id: m.id, resultado }];
    } catch {
      const cancelada = abort.signal.aborted;
      finalizar(prestamo, cancelada ? "cancelado" : "error", ahora(), 0, cancelada ? "Cancelada por quien pedía." : "El manejador falló.");
      return cancelada ? [] : [fallo(m.id, 502, `No se pudo servir «${m.tipo}».`)];
    } finally {
      abortos.delete(m.id);
      liberar(m.id);
    }
  }

  return {
    async atender(mensaje: unknown): Promise<Msg[]> {
      if (!esMensajeCapacidadMalla(mensaje)) return [];
      if (mensaje.t === "capacidad.cancelar") return cancelar(mensaje.id);
      return mensaje.t === "capacidad.pedir" ? pedir(mensaje) : [];
    },
    prestamos(): Prestamo[] {
      const t = ahora();
      return [...registro.values()].map((p) => ({ ...p, ms: p.fin === undefined ? Math.max(0, t - p.inicio) : p.ms })).sort((a, b) => a.inicio - b.inicio);
    },
  };
}
