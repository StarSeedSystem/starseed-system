import {
  bytesUtf8,
  esTipoCapacidadValido,
  partirEnTrozos,
  type MsgCancelar,
  type MsgError,
  type MsgFin,
  type MsgPedir,
  type MsgTrozo,
  type TipoCapacidad,
} from "@/lib/network/capacidad-por-malla";
import { capacidadPrestable, type OfertaNeurona } from "./oferta";
import { permitido, type Sesion } from "./sesion-prestamo";

export const MAX_COLA = 4;

const COSTE_MB: Record<TipoCapacidad, number> = {
  imagen: 512,
  voz: 256,
  oido: 256,
  palabra: 256,
  transcodificar: 384,
  render: 768,
  buscar: 32,
  construir: 64,
};

const SIN_MOTOR = new Set<TipoCapacidad>(["buscar", "construir"]);

export type ContextoManejador = { senal: AbortSignal; sesion: Sesion; tipo: TipoCapacidad };
export type ManejadorCapacidad = (
  cuerpo: Record<string, unknown>,
  ctx: ContextoManejador
) => unknown | Promise<unknown>;
export type MensajeEntrante = MsgPedir | MsgCancelar;
export type Enviar = (msg: MsgTrozo | MsgFin | MsgError) => void;
export type EstadoPrestamo = "en-cola" | "vivo" | "hecho" | "cancelado" | "error";

export interface Prestamo {
  id: string;
  invitado: string;
  tipo: TipoCapacidad;
  estado: EstadoPrestamo;
  inicio: number;
  fin?: number;
  ms: number;
  bytes: number;
}

export interface ServidorCapacidades {
  atender: (mensaje: MensajeEntrante, enviar: Enviar) => Promise<void>;
  prestamos: () => Prestamo[];
}

interface EnCurso {
  abort: AbortController;
  costoMb: number;
}

interface EnCola {
  msg: MsgPedir;
  sesion: Sesion;
  enviar: Enviar;
  prestamo: Prestamo;
  listo?: () => void;
}

export function crearServidor(args: {
  manejadores: Partial<Record<TipoCapacidad, ManejadorCapacidad>>;
  oferta: OfertaNeurona;
  sesiones: Sesion[];
  ahora?: () => number;
}): ServidorCapacidades {
  const { manejadores, oferta, sesiones } = args;
  const ahora = args.ahora ?? Date.now;
  const registro: Prestamo[] = [];
  const enCurso = new Map<string, EnCurso>();
  const cola: EnCola[] = [];

  const fallo = (enviar: Enviar, id: string, estado: number, mensaje: string): void => {
    enviar({ t: "capacidad.error", id, estado, mensaje });
  };

  const cupo = (tipo: TipoCapacidad, costoMb: number): string | null => {
    const prestable = capacidadPrestable(oferta);
    if (prestable.computo.nucleos <= 0 || prestable.computo.ramLibreMb <= 0) {
      return "Esta neurona no está prestando cómputo ahora mismo.";
    }
    if (!SIN_MOTOR.has(tipo) && !prestable.computo.motores.includes(tipo)) {
      return `Esta neurona no presta «${tipo}».`;
    }
    if (enCurso.size >= Math.floor(prestable.computo.nucleos)) return "sin-cupo";
    const usado = [...enCurso.values()].reduce((total, e) => total + e.costoMb, 0);
    if (costoMb > prestable.computo.ramLibreMb - usado) return "sin-cupo";
    return null;
  };

  const bombear = (): void => {
    while (cola.length > 0) {
      const siguiente = cola[0];
      const motivo = cupo(siguiente.msg.tipo, COSTE_MB[siguiente.msg.tipo]);
      if (motivo === "sin-cupo") return;
      cola.shift();
      if (motivo) {
        siguiente.prestamo.estado = "error";
        siguiente.prestamo.fin = ahora();
        siguiente.prestamo.ms = siguiente.prestamo.fin - siguiente.prestamo.inicio;
        fallo(siguiente.enviar, siguiente.msg.id, 503, motivo);
        siguiente.listo?.();
        continue;
      }
      void arrancar(siguiente);
      return;
    }
  };

  const arrancar = (item: EnCola): Promise<void> => {
    item.prestamo.estado = "vivo";
    item.prestamo.inicio = ahora();
    const abort = new AbortController();
    enCurso.set(item.msg.id, { abort, costoMb: COSTE_MB[item.msg.tipo] });
    const manejador = manejadores[item.msg.tipo];
    return (async () => {
      try {
        if (!manejador) throw new Error("Sin manejador");
        const valor = await manejador(item.msg.cuerpo, {
          senal: abort.signal,
          sesion: item.sesion,
          tipo: item.msg.tipo,
        });
        const resultado = valor ?? null;
        const texto = typeof resultado === "string" ? resultado : JSON.stringify(resultado);
        for (const trozo of partirEnTrozos(texto)) {
          item.enviar({ t: "capacidad.trozo", id: item.msg.id, texto: trozo });
        }
        item.enviar({ t: "capacidad.fin", id: item.msg.id, resultado });
        item.prestamo.bytes = bytesUtf8(texto);
        item.prestamo.estado = "hecho";
      } catch {
        if (!abort.signal.aborted) {
          item.prestamo.estado = "error";
          fallo(item.enviar, item.msg.id, 502, "La capacidad falló al ejecutarse.");
        }
      } finally {
        item.prestamo.fin = ahora();
        item.prestamo.ms = item.prestamo.fin - item.prestamo.inicio;
        enCurso.delete(item.msg.id);
        item.listo?.();
        bombear();
      }
    })();
  };

  const cancelar = (msg: MsgCancelar): void => {
    const vivo = enCurso.get(msg.id);
    if (vivo) {
      const prestamo = registro.find((p) => p.id === msg.id);
      if (prestamo) {
        prestamo.estado = "cancelado";
        prestamo.fin = ahora();
        prestamo.ms = prestamo.fin - prestamo.inicio;
      }
      vivo.abort.abort();
      enCurso.delete(msg.id);
      bombear();
      return;
    }
    const indice = cola.findIndex((item) => item.msg.id === msg.id);
    if (indice < 0) return;
    const [item] = cola.splice(indice, 1);
    item.prestamo.estado = "cancelado";
    item.prestamo.fin = ahora();
    item.prestamo.ms = item.prestamo.fin - item.prestamo.inicio;
    item.listo?.();
  };

  const atender = async (mensaje: MensajeEntrante, enviar: Enviar): Promise<void> => {
    if (mensaje.t === "capacidad.cancelar") {
      cancelar(mensaje);
      return;
    }
    if (!esTipoCapacidadValido(mensaje.tipo)) {
      fallo(enviar, mensaje.id, 400, "Capacidad desconocida.");
      return;
    }
    const sesion = mensaje.sesionId ? sesiones.find((s) => s.id === mensaje.sesionId) : undefined;
    if (!sesion) {
      fallo(enviar, mensaje.id, 401, "Falta una sesión de préstamo válida.");
      return;
    }
    if (sesion.anfitrion !== oferta.nodoId) {
      fallo(enviar, mensaje.id, 403, "La sesión no pertenece a esta neurona.");
      return;
    }
    if (!permitido(sesion, "capacidad", ahora())) {
      fallo(enviar, mensaje.id, 403, "La sesión está revocada o ha caducado.");
      return;
    }
    if (sesion.alcance.tipo !== "capacidad" || (sesion.alcance.id !== "*" && sesion.alcance.id !== mensaje.tipo)) {
      fallo(enviar, mensaje.id, 403, "La sesión no cubre esta capacidad.");
      return;
    }
    if (!manejadores[mensaje.tipo]) {
      fallo(enviar, mensaje.id, 501, `Sin manejador para «${mensaje.tipo}».`);
      return;
    }
    if (registro.some((p) => p.id === mensaje.id)) {
      fallo(enviar, mensaje.id, 409, "Ya hay una petición con ese identificador.");
      return;
    }

    const prestamo: Prestamo = {
      id: mensaje.id,
      invitado: sesion.invitado,
      tipo: mensaje.tipo,
      estado: "en-cola",
      inicio: ahora(),
      ms: 0,
      bytes: 0,
    };
    registro.push(prestamo);
    const item: EnCola = { msg: mensaje, sesion, enviar, prestamo };
    const motivo = cupo(mensaje.tipo, COSTE_MB[mensaje.tipo]);
    if (!motivo) {
      await arrancar(item);
      return;
    }
    if (motivo !== "sin-cupo") {
      prestamo.estado = "error";
      prestamo.fin = ahora();
      prestamo.ms = prestamo.fin - prestamo.inicio;
      fallo(enviar, mensaje.id, 503, motivo);
      return;
    }
    if (cola.length >= MAX_COLA) {
      prestamo.estado = "error";
      prestamo.fin = ahora();
      prestamo.ms = prestamo.fin - prestamo.inicio;
      fallo(enviar, mensaje.id, 429, "La cola de préstamos está llena; reintenta más tarde.");
      return;
    }
    await new Promise<void>((listo) => {
      cola.push({ ...item, listo });
    });
  };

  return {
    atender,
    prestamos: () => registro.map((p) => ({ ...p })),
  };
}
