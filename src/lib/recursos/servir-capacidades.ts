// servir-capacidades — lado ANFITRIÓN del relé `capacidad.*` (tarea F, Ola 1017A; contrato:
// architecture/apps-en-la-malla.md §6). Admite solo peticiones con sesión de préstamo válida
// (`sesion-prestamo.ts`) y dentro de los topes de `capacidadPrestable` (`oferta.ts`); si algo
// corre, encola (máx. 4) o contesta ocupado; corre el manejador, trocea la respuesta y honra
// la cancelación; anota cada préstamo para «Procesos activos». Módulo PURO: manejadores, sesiones
// y reloj inyectables; sin red, disco ni procesos.
import { permitido, type Sesion } from "./sesion-prestamo";
import { capacidadPrestable, type OfertaNeurona } from "./oferta";

/* ═══ 1) Protocolo `capacidad.*` ═══ */

export type TipoCapacidad = "imagen" | "voz" | "oido" | "palabra" | "transcodificar" | "render" | "buscar" | "construir";
/** pedir lleva el id del turno, el tipo, la sesión que el anfitrión creó (sesion-prestamo.ts) y la petición. */
export type MsgCapacidadPedir = { t: "capacidad.pedir"; id: string; tipo: TipoCapacidad; sesionId: string; peticion: string };
export type MsgCapacidadTrozo = { t: "capacidad.trozo"; id: string; texto: string };
export type MsgCapacidadFin = { t: "capacidad.fin"; id: string; bytes: number };
export type MsgCapacidadError = { t: "capacidad.error"; id: string; estado: number; mensaje: string; reintentarEnS?: number };
export type MsgCapacidadCancelar = { t: "capacidad.cancelar"; id: string };
export type MsgCapacidad = MsgCapacidadPedir | MsgCapacidadTrozo | MsgCapacidadFin | MsgCapacidadError | MsgCapacidadCancelar;
/** Lo que el anfitrión emite: trozos, cierre y errores. */
export type MsgCapacidadSalida = MsgCapacidadTrozo | MsgCapacidadFin | MsgCapacidadError;

/* ═══ 2) Guard y troceo (puros) ═══ */

const TIPOS: readonly string[] = ["imagen", "voz", "oido", "palabra", "transcodificar", "render", "buscar", "construir"];
/** ¿Es un mensaje bien formado del protocolo `capacidad.*`? */
export function esMensajeCapacidad(x: unknown): x is MsgCapacidad {
  return !!x && typeof x === "object" && typeof x.t === "string" && x.t.startsWith("capacidad.") && typeof x.id === "string" && !!x.id &&
    (x.t !== "capacidad.pedir" || (TIPOS.includes(x.tipo as string) && typeof x.sesionId === "string" && !!x.sesionId));
}
/** JSON.parse defensivo + guard. `null` si no es del protocolo. */
export function parseMensajeCapacidad(raw: string): MsgCapacidad | null {
  let obj: unknown;
  try { obj = JSON.parse(raw); } catch { return null; }
  return esMensajeCapacidad(obj) ? obj : null;
}
/** Trocea texto en partes con bytes UTF-8 ≤ maxBytes. Puro. */
function partirEnTrozos(texto: string, maxBytes: number): string[] {
  const cod = new TextEncoder();
  const partes: string[] = [];
  let actual = "", bytes = 0;
  for (const c of texto) {
    const n = cod.encode(c).length;
    if (actual && bytes + n > maxBytes) { partes.push(actual); actual = ""; bytes = 0; }
    actual += c; bytes += n;
  }
  if (actual) partes.push(actual); return partes;
}

/* ═══ 3) Servidor anfitrión: admisión, cola, cancelación y registro ═══ */

export type ManejadorCapacidad = (peticion: string, opciones: { signal: AbortSignal }) => Promise<string>;
/** Sesiones vivas (función si deben verse al momento, p. ej. tras una revocación); reloj y tamaños
 * inyectables; cola de 4 como máximo; emisor: la salida de las peticiones ENCOLADAS solo llega por aquí. */
export type OpcionesServidorCapacidad = {
  manejadores: Partial<Record<TipoCapacidad, ManejadorCapacidad>>; oferta: OfertaNeurona;
  sesiones: Sesion[] | (() => Sesion[]); ahora: () => number; maxCola?: number; tamanoTrozo?: number;
  emisor?: (mensaje: MsgCapacidadSalida) => void;
};
export type RegistroPrestamo = { id: string; tipo: TipoCapacidad; invitado: string; bytes: number; ms: number; estado: "vivo" | "hecho" | "cancelado" };

export function crearServidor(opciones: OpcionesServidorCapacidad) {
  type EnCurso = { tipo: TipoCapacidad; invitado: string; inicio: number; abort: AbortController; cancelada: boolean };
  type Hecho = { id: string; tipo: TipoCapacidad; invitado: string; bytes: number; ms: number; cancelada: boolean };
  const ahora = opciones.ahora; const maxCola = opciones.maxCola ?? 4; const tamanoTrozo = opciones.tamanoTrozo ?? 16 * 1024;
  const enCurso = new Map<string, EnCurso>(); const enCola: { mensaje: MsgCapacidadPedir; invitado: string }[] = []; const hechos: Hecho[] = [];
  const error = (id: string, estado: number, mensaje: string, extra?: { reintentarEnS?: number }): MsgCapacidadError => ({ t: "capacidad.error", id, estado, mensaje, ...extra });
  const desplegar = async (m: MsgCapacidadPedir, invitado: string): Promise<MsgCapacidadSalida[]> => {
    const estado: EnCurso = { tipo: m.tipo, invitado, inicio: ahora(), abort: new AbortController(), cancelada: false }; enCurso.set(m.id, estado);
    const salida: MsgCapacidadSalida[] = []; const salidaDe = (x: MsgCapacidadSalida) => { salida.push(x); opciones.emisor?.(x); };
    let texto = "", fallo: MsgCapacidadError | null = null, bytes = 0;
    try { texto = await opciones.manejadores[m.tipo]!(m.peticion, { signal: estado.abort.signal }); }
    catch (e) { fallo = error(m.id, 502, e instanceof Error ? e.message : "Fallo en el manejador de la capacidad."); }
    if (estado.cancelada) salidaDe(error(m.id, 499, "Préstamo cancelado.")); else if (fallo) salidaDe(fallo);
    else {
      bytes = new TextEncoder().encode(texto).length;
      for (const parte of partirEnTrozos(texto, tamanoTrozo)) salidaDe({ t: "capacidad.trozo", id: m.id, texto: parte });
      salidaDe({ t: "capacidad.fin", id: m.id, bytes });
    }
    enCurso.delete(m.id); hechos.push({ id: m.id, tipo: m.tipo, invitado, bytes, ms: ahora() - estado.inicio, cancelada: estado.cancelada });
    return salida;
  };
  const atender = async (mensaje: MsgCapacidad): Promise<MsgCapacidadSalida[]> => {
    if (!esMensajeCapacidad(mensaje)) return [error("", 400, "Mensaje del relé capacidad.* mal formado.")];
    if (mensaje.t === "capacidad.cancelar") {
      const en = enCurso.get(mensaje.id); if (en) { en.cancelada = true; try { en.abort.abort(); } catch { /* ya abortada */ } }
      const i = enCola.findIndex((q) => q.mensaje.id === mensaje.id), q = i >= 0 ? enCola.splice(i, 1)[0] : undefined;
      if (q) hechos.push({ id: q.mensaje.id, tipo: q.mensaje.tipo, invitado: q.invitado, bytes: 0, ms: 0, cancelada: true });
      return [];
    }
    if (mensaje.t !== "capacidad.pedir") return [error(mensaje.id, 400, "Solo el anfitrión emite trozos, fin y error.")];
    if (!opciones.manejadores[mensaje.tipo]) return [error(mensaje.id, 404, `Sin manejador para la capacidad "${mensaje.tipo}".`)];
    const sesion = (typeof opciones.sesiones === "function" ? opciones.sesiones() : opciones.sesiones).find((x) => x.id === mensaje.sesionId);
    if (!(sesion && sesion.alcance.tipo === "capacidad" && sesion.alcance.id === mensaje.tipo && permitido(sesion, mensaje.tipo, ahora())))
      return [error(mensaje.id, 403, "Sesión de préstamo ausente, revocada, vencida o de otro alcance.")];
    const prestable = capacidadPrestable(opciones.oferta);
    const sinPrestable = (prestable.computo.nucleos <= 0 && prestable.computo.ramLibreMb <= 0) ||
      (prestable.computo.motores.length > 0 && !prestable.computo.motores.includes(mensaje.tipo));
    if (sinPrestable) return [error(mensaje.id, 503, `Esta neurona no presta la capacidad "${mensaje.tipo}" ahora (topes del anfitrión).`, { reintentarEnS: 60 })];
    if (enCurso.size >= 1) {
      if (enCola.length >= maxCola) return [error(mensaje.id, 429, "Cola de capacidades llena en esta neurona.", { reintentarEnS: 10 })];
      enCola.push({ mensaje, invitado: sesion.invitado });
      return [];
    }
    const salida = await desplegar(mensaje, sesion.invitado);
    while (!enCurso.size && enCola.length) { const q = enCola.shift()!; salida.push(...(await desplegar(q.mensaje, q.invitado))); }
    return salida;
  };
  const prestamos = (): { vivos: RegistroPrestamo[]; hechos: RegistroPrestamo[] } => {
    const vivos: RegistroPrestamo[] = [...enCurso.entries()].map(([id, e]) =>
      ({ id, tipo: e.tipo, invitado: e.invitado, bytes: 0, ms: ahora() - e.inicio, estado: "vivo" as const }));
    for (const q of enCola) vivos.push({ id: q.mensaje.id, tipo: q.mensaje.tipo, invitado: q.invitado, bytes: 0, ms: 0, estado: "vivo" });
    return {
      vivos,
      hechos: hechos.map((h) => ({ id: h.id, tipo: h.tipo, invitado: h.invitado, bytes: h.bytes, ms: h.ms,
        estado: h.cancelada ? ("cancelado" as const) : ("hecho" as const) })),
    };
  };
  return { atender, prestamos };
}
