import {
  CAPACIDAD_MALLA_MAX_BYTES, bytesUtf8, partirEnTrozos, type Msg, type MsgCancelar,
  type MsgError, type MsgFin, type MsgPedir, type MsgTrozo, type TipoCapacidad,
} from "@/lib/network/capacidad-por-malla";
import { capacidadPrestable, type OfertaNeurona } from "./oferta";
import { permitido, type Sesion } from "./sesion-prestamo";

/** Respuesta del anfitrión; el transporte (la malla) es quien la envía. */
export type RespuestaCapacidad = MsgTrozo | MsgFin | MsgError;
export type EstadoPrestamo = "en-cola" | "en-curso" | "hecho" | "error" | "cancelado";

/** Un préstamo vivo o terminado, para «Procesos activos»: quién, qué, ms y bytes. */
export interface Prestamo {
  id: string; invitado: string; tipo: TipoCapacidad; sesionId: string;
  estado: EstadoPrestamo; inicio: number; ms: number; bytes: number; motivo?: string;
}

export type ManejadorCapacidad = (
  cuerpo: Record<string, unknown>, opts: { signal: AbortSignal },
) => unknown | Promise<unknown>;

export interface ServidorCapacidades {
  atender(mensaje: Msg): Promise<RespuestaCapacidad[]>;
  prestamos(): Prestamo[];
}

const MAX_EN_COLA = 4;
const MAX_HISTORIAL = 50;
const MARGEN_BYTES = 256;
const MOTOR_POR_TIPO: Partial<Record<TipoCapacidad, string>> = {
  imagen: "imagen", voz: "voz", oido: "oido", palabra: "palabra",
  transcodificar: "transcodificar", render: "render",
};

interface Trabajo {
  cuerpo: Record<string, unknown>; inicio: number; abort: AbortController; prestamo: Prestamo;
  resuelto: boolean; cancelado: boolean; resolver: (r: RespuestaCapacidad[]) => void;
}

const error = (id: string, estado: number, mensaje: string): MsgError =>
  ({ t: "capacidad.error", id, estado, mensaje });

/** Admisión: lo que la neurona presta de verdad según los topes de `capacidadPrestable`. */
function motivoSinAdmision(oferta: OfertaNeurona, tipo: TipoCapacidad): string | null {
  const prestable = capacidadPrestable(oferta);
  if (prestable.computo.nucleos < 1) return "Esta neurona no presta cómputo ahora mismo.";
  const motor = MOTOR_POR_TIPO[tipo];
  return motor && !prestable.computo.motores.includes(motor)
    ? `Esta neurona no tiene el motor «${motor}» entre sus capacidades prestables.` : null;
}

/** Trocea la respuesta si no cabe en un mensaje; `fin` lleva el resultado o su recuento. */
function respuestasDeResultado(id: string, resultado: unknown): { respuestas: RespuestaCapacidad[]; bytes: number } {
  let json: string;
  try { json = JSON.stringify(resultado) ?? "null"; }
  catch { return { respuestas: [error(id, 502, "El resultado no se puede serializar.")], bytes: 0 }; }
  const bytes = bytesUtf8(json), limite = CAPACIDAD_MALLA_MAX_BYTES - MARGEN_BYTES;
  if (bytes <= limite) return { respuestas: [{ t: "capacidad.fin", id, resultado }], bytes };
  const partes = partirEnTrozos(json, limite);
  return {
    respuestas: [...partes.map((texto): MsgTrozo => ({ t: "capacidad.trozo", id, texto })),
      { t: "capacidad.fin", id, resultado: { troceado: true, trozos: partes.length, bytes } }],
    bytes,
  };
}

/**
 * Lado anfitrión del relé `capacidad.*`. Puro respecto a red y disco: el reloj,
 * los manejadores y las sesiones se inyectan. Un trabajo a la vez; hasta cuatro
 * esperan en cola y al resto se le responde 429. `prestamos()` alimenta Procesos activos.
 */
export function crearServidor({ manejadores, oferta, sesiones, ahora }: {
  manejadores: Partial<Record<TipoCapacidad, ManejadorCapacidad>>;
  oferta: OfertaNeurona; sesiones: readonly Sesion[]; ahora: number | (() => number);
}): ServidorCapacidades {
  const reloj = typeof ahora === "function" ? ahora : () => ahora;
  let activo: Trabajo | null = null;
  const cola: Trabajo[] = [];
  const historial: Prestamo[] = [];

  function siguiente(): void {
    const t = cola.shift();
    if (!t) return;
    activo = t;
    t.prestamo.estado = "en-curso";
    void correr(t);
  }

  function finalizar(
    t: Trabajo, estado: EstadoPrestamo, respuestas: RespuestaCapacidad[], bytes: number, motivo?: string,
  ): void {
    if (t.resuelto) return;
    t.resuelto = true;
    Object.assign(t.prestamo, { estado, ms: Math.max(0, reloj() - t.inicio), bytes });
    if (motivo) t.prestamo.motivo = motivo;
    historial.push(t.prestamo);
    while (historial.length > MAX_HISTORIAL) historial.shift();
    if (activo === t) { activo = null; siguiente(); }
    t.resolver(respuestas);
  }

  async function correr(t: Trabajo): Promise<void> {
    const manejador = manejadores[t.prestamo.tipo];
    if (!manejador) return;
    try {
      const resultado = await manejador(t.cuerpo, { signal: t.abort.signal });
      if (t.cancelado) return;
      const { respuestas, bytes } = respuestasDeResultado(t.prestamo.id, resultado);
      const ultima = respuestas[respuestas.length - 1];
      finalizar(t, ultima.t === "capacidad.error" ? "error" : "hecho", respuestas, bytes);
    } catch (e) {
      if (t.cancelado) return;
      const motivo = e instanceof Error ? e.message : "Error al servir la capacidad.";
      finalizar(t, "error", [error(t.prestamo.id, 502, motivo)], 0, motivo);
    }
  }

  function admitir(msg: MsgPedir): Promise<RespuestaCapacidad[]> {
    const sesion = sesiones.find((s) => s.id === msg.sesionId);
    if (
      !msg.sesionId || !sesion || sesion.anfitrion !== oferta.nodoId ||
      sesion.alcance.tipo !== "capacidad" ||
      (sesion.alcance.id !== msg.tipo && sesion.alcance.id !== "*") ||
      !permitido(sesion, msg.tipo, reloj())
    ) {
      return Promise.resolve([error(msg.id, 403, "Sin sesión de préstamo válida para esta capacidad.")]);
    }
    if (!manejadores[msg.tipo]) {
      return Promise.resolve([error(msg.id, 404, `Esta neurona no ofrece la capacidad «${msg.tipo}».`)]);
    }
    const sinAdmision = motivoSinAdmision(oferta, msg.tipo);
    if (sinAdmision) return Promise.resolve([error(msg.id, 503, sinAdmision)]);
    if (activo?.prestamo.id === msg.id || cola.some((t) => t.prestamo.id === msg.id)) {
      return Promise.resolve([error(msg.id, 409, "Ya hay una petición con ese id en curso.")]);
    }
    if (activo && cola.length >= MAX_EN_COLA) {
      return Promise.resolve([error(msg.id, 429, "Cola de capacidades llena (4); inténtalo más tarde.")]);
    }
    const inicio = reloj();
    const trabajo: Trabajo = {
      cuerpo: msg.cuerpo, inicio, abort: new AbortController(), resuelto: false, cancelado: false,
      resolver: () => {},
      prestamo: {
        id: msg.id, invitado: sesion.invitado, tipo: msg.tipo, sesionId: sesion.id,
        estado: "en-cola", inicio, ms: 0, bytes: 0,
      },
    };
    return new Promise<RespuestaCapacidad[]>((resolver) => {
      trabajo.resolver = resolver;
      if (activo) { cola.push(trabajo); return; }
      activo = trabajo;
      trabajo.prestamo.estado = "en-curso";
      void correr(trabajo);
    });
  }

  function cancelar(msg: MsgCancelar): RespuestaCapacidad[] {
    const t = activo?.prestamo.id === msg.id ? activo : cola.find((c) => c.prestamo.id === msg.id);
    if (!t) return [];
    t.cancelado = true;
    t.abort.abort();
    if (t === activo) activo = null;
    else cola.splice(cola.indexOf(t), 1);
    finalizar(t, "cancelado", [error(t.prestamo.id, 499, "Préstamo cancelado.")], 0);
    if (!activo) siguiente();
    return [];
  }

  return {
    async atender(mensaje: Msg): Promise<RespuestaCapacidad[]> {
      if (mensaje.t === "capacidad.pedir") return admitir(mensaje);
      if (mensaje.t === "capacidad.cancelar") return cancelar(mensaje);
      return [];
    },
    prestamos: () => {
      const vivos = (activo ? [activo, ...cola] : [...cola]).map((t) => ({ ...t.prestamo }));
      return [...vivos, ...historial.map((p) => ({ ...p }))];
    },
  };
}
