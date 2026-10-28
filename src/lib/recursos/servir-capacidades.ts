/**
 * servir-capacidades — lado ANFITRIÓN del relé `capacidad.*` (Ola 1017A · F).
 * Admite peticiones con la sesión de préstamo (sesion-prestamo.ts) y los topes
 * de `capacidadPrestable` (oferta.ts); si el cupo va lleno, encola (máx. 4);
 * corre el manejador, trocea la respuesta (capacidad-por-malla.ts), anota cada
 * préstamo (quién, qué, ms y bytes, para «Cerebro › Procesos activos») y
 * permite cancelar. Puro: reloj inyectado, nada de red, disco ni procesos.
 * Contrato: architecture/apps-en-la-malla.md §6.
 */
import {
  cabeEnMensajeCapacidad,
  bytesUtf8,
  esMensajeCapacidadMalla,
  partirEnTrozos,
  type Msg,
  type TipoCapacidad,
} from "../network/capacidad-por-malla";
import { capacidadPrestable, type OfertaNeurona } from "./oferta";
import { permitido, type Sesion } from "./sesion-prestamo";

/** Máximo de peticiones que esperan en cola cuando el cupo va lleno. */
export const MAX_EN_COLA = 4;

export type ManejadorCapacidad = (cuerpo: Record<string, unknown>) => Promise<unknown>;
export type ManejadoresCapacidad = Partial<Record<TipoCapacidad, ManejadorCapacidad>>;
export type EstadoPrestamo = "enCola" | "vivo" | "hecho" | "cancelado" | "error";

/** Un préstamo anotado: quién, qué, cuánto duró y cuántos bytes sirvió. */
export interface Prestamo {
  id: string;
  sesionId: string;
  invitado: string;
  tipo: TipoCapacidad;
  estado: EstadoPrestamo;
  ms: number;
  bytes: number;
  trozos: number;
  motivo?: string;
}

export interface OpcionesServir {
  /** Lo que esta neurona sabe servir, por tipo de capacidad. */
  manejadores: ManejadoresCapacidad;
  /** Oferta con sus topes: `capacidadPrestable` fija el cupo de préstamos. */
  oferta: OfertaNeurona;
  /** Sesiones de préstamo; se leen frescas en cada comprobación (revocables). */
  sesiones: Sesion[];
  /** Reloj inyectado: nada aquí mira el reloj del sistema. */
  ahora: () => number;
}

export interface ServidorCapacidades {
  /** Atiende un mensaje del relé; manda trozos/fin/error por `enviar`. */
  atender(mensaje: Msg, enviar: (salida: Msg) => boolean): Promise<void>;
  /** Préstamos vivos y hechos, para «Procesos activos». */
  prestamos(): Prestamo[];
  /** Cuántas peticiones esperan en cola ahora mismo. */
  cola(): number;
}

/** Cupo de préstamos a la vez según los topes: cada núcleo prestable, un potro. */
export function cupoDePrestamos(oferta: OfertaNeurona): number {
  return Math.max(0, Math.floor(capacidadPrestable(oferta).computo.nucleos));
}

interface Registro {
  id: string;
  sesionId: string;
  invitado: string;
  tipo: TipoCapacidad;
  cuerpo: Record<string, unknown>;
  estado: EstadoPrestamo;
  inicio: number;
  ms: number;
  bytes: number;
  trozos: number;
  motivo?: string;
  cancelada: boolean;
}

/** Comprueba la sesión de préstamo: existe, es de esta neurona, de esta capacidad y sigue viva. */
function pasaSesion(
  sesiones: Sesion[],
  nodoId: string,
  sesionId: string,
  tipo: TipoCapacidad,
  ya: number,
): { ok: true; sesion: Sesion } | { ok: false; estado: number; motivo: string } {
  const s = sesiones.find((x) => x.id === sesionId);
  if (!s) return { ok: false, estado: 403, motivo: "Sesión de préstamo desconocida." };
  if (s.anfitrion !== nodoId)
    return { ok: false, estado: 403, motivo: "La sesión de préstamo no pertenece a esta neurona." };
  if (s.alcance.tipo !== "capacidad" || s.alcance.id !== tipo)
    return { ok: false, estado: 403, motivo: `La sesión es para la capacidad «${s.alcance.id}», no para «${tipo}».` };
  if (!permitido(s, "capacidad", ya))
    return { ok: false, estado: 403, motivo: "Sesión de préstamo caducada o revocada." };
  return { ok: true, sesion: s };
}

export function crearServidor(opciones: OpcionesServir): ServidorCapacidades {
  const { manejadores, oferta, sesiones, ahora } = opciones;
  const maxConcurrentes = cupoDePrestamos(oferta);
  const registros = new Map<string, Registro>();
  const colaIds: string[] = [];
  const vivos = () => [...registros.values()].filter((r) => r.estado === "vivo").length;

  function rechazar(id: string, estado: number, motivo: string, enviar: (salida: Msg) => boolean): void {
    enviar({ t: "capacidad.error", id, estado, mensaje: motivo });
  }

  /** Cierra un préstamo con su estado final (hecho, error o cancelado) y su consumo. */
  function cierra(
    reg: Registro,
    estado: EstadoPrestamo,
    bytes: number,
    trozos: number,
    motivo: string | undefined,
    enviar?: (salida: Msg) => boolean,
  ): void {
    reg.estado = estado;
    if (motivo) reg.motivo = motivo;
    reg.ms = Math.max(0, ahora() - reg.inicio);
    reg.bytes = bytes;
    reg.trozos = trozos;
    if (enviar) desencolar(enviar);
  }

  async function atender(mensaje: Msg, enviar: (salida: Msg) => boolean): Promise<void> {
    if (!esMensajeCapacidadMalla(mensaje)) return;
    if (mensaje.t === "capacidad.cancelar") { cancelar(mensaje.id); return; }
    if (mensaje.t !== "capacidad.pedir") return; // trozo/fin/error no tocan al anfitrión
    if (registros.has(mensaje.id)) return; // petición repetida: ya está anotada
    const ya = ahora();
    if (maxConcurrentes === 0)
      return rechazar(mensaje.id, 429, "Esta neurona no presta cómputo ahora mismo (topes a cero).", enviar);
    if (!manejadores[mensaje.tipo])
      return rechazar(mensaje.id, 404, `Esta neurona no presta la capacidad «${mensaje.tipo}».`, enviar);
    const puerta = pasaSesion(sesiones, oferta.nodoId, mensaje.sesionId ?? "", mensaje.tipo, ya);
    if (!puerta.ok) return rechazar(mensaje.id, puerta.estado, puerta.motivo, enviar);
    if (colaIds.length >= MAX_EN_COLA)
      return rechazar(mensaje.id, 429, `Cola de préstamos llena (máx. ${MAX_EN_COLA}): prueba más tarde.`, enviar);
    registros.set(mensaje.id, {
      id: mensaje.id,
      sesionId: mensaje.sesionId ?? "",
      invitado: puerta.sesion.invitado,
      tipo: mensaje.tipo,
      cuerpo: mensaje.cuerpo,
      estado: "enCola",
      inicio: ya,
      ms: 0,
      bytes: 0,
      trozos: 0,
      cancelada: false,
    });
    colaIds.push(mensaje.id);
    desencolar(enviar);
  }

  /** Cancela un préstamo vivo o una petición en cola; nada se envía a quien canceló. */
  function cancelar(id: string): void {
    const reg = registros.get(id);
    if (!reg) return;
    if (reg.estado === "enCola") {
      reg.estado = "cancelado";
      reg.motivo = "Cancelado mientras esperaba en la cola.";
      reg.ms = Math.max(0, ahora() - reg.inicio);
      const i = colaIds.indexOf(id);
      if (i >= 0) colaIds.splice(i, 1);
      return;
    }
    if (reg.estado === "vivo" && !reg.cancelada) reg.cancelada = true; // al volver el manejador, solo se anota
  }

  /** Saca lo que quepa de la cola: revalida la sesión a la hora de empezar. */
  function desencolar(enviar: (salida: Msg) => boolean): void {
    while (vivos() < maxConcurrentes && colaIds.length) {
      const reg = registros.get(colaIds.shift() ?? "");
      if (!reg || reg.estado !== "enCola") continue; // la cancelaron mientras esperaba
      const puerta = pasaSesion(sesiones, oferta.nodoId, reg.sesionId, reg.tipo, ahora());
      if (!puerta.ok) {
        cierra(reg, "error", 0, 0, puerta.motivo);
        rechazar(reg.id, puerta.estado, `Caducó en la cola: ${puerta.motivo}`, enviar);
        continue;
      }
      reg.estado = "vivo";
      correr(reg, enviar);
    }
  }

  function correr(reg: Registro, enviar: (salida: Msg) => boolean): void {
    const m = manejadores[reg.tipo];
    void (async () => {
      try {
        const respuesta = await m!(reg.cuerpo);
        if (reg.cancelada) {
          cierra(reg, "cancelado", reg.bytes, reg.trozos, "Cancelado por quien pidió.", enviar);
          return;
        }
        sirveRespuesta(reg, respuesta, enviar);
      } catch (e) {
        const causa = e instanceof Error ? e.message : "Fallo del manejador de la capacidad.";
        cierra(reg, "error", reg.bytes, reg.trozos, `El manejador de «${reg.tipo}» falló: ${causa}`);
        try { rechazar(reg.id, 500, `Este anfitrión falló al servir «${reg.tipo}»: ${causa}`, enviar); }
        catch { /* transporte caído: la anotación queda igual */ }
        desencolar(enviar);
      }
    })();
  }

  /** Envía la respuesta: en un `capacidad.fin` directo si cabe, troceada si no. */
  function sirveRespuesta(reg: Registro, respuesta: unknown, enviar: (salida: Msg) => boolean): void {
    const texto = typeof respuesta === "string" ? respuesta : JSON.stringify(respuesta ?? null);
    const finDirecto: Msg = { t: "capacidad.fin", id: reg.id, resultado: typeof respuesta === "undefined" ? null : respuesta };
    if (cabeEnMensajeCapacidad(JSON.stringify(finDirecto))) {
      enviar(finDirecto);
      cierra(reg, "hecho", bytesUtf8(texto), 0, undefined, enviar);
      return;
    }
    let bytes = 0;
    let n = 0;
    for (const parte of partirEnTrozos(texto)) {
      bytes += bytesUtf8(parte);
      n += 1;
      enviar({ t: "capacidad.trozo", id: reg.id, texto: parte });
    }
    enviar({ t: "capacidad.fin", id: reg.id, resultado: { trozos: n, bytes } });
    cierra(reg, "hecho", bytes, n, undefined, enviar);
  }

  /** Préstamos vivos y hechos, en orden de llegada, para «Procesos activos». */
  function prestamos(): Prestamo[] {
    const pendiente = (r: Registro) => r.estado === "enCola" || r.estado === "vivo";
    return [...registros.values()].map((r) => ({
      id: r.id,
      sesionId: r.sesionId,
      invitado: r.invitado,
      tipo: r.tipo,
      estado: r.estado,
      ms: pendiente(r) ? Math.max(0, ahora() - r.inicio) : r.ms,
      bytes: r.bytes,
      trozos: r.trozos,
      motivo: r.motivo,
    }));
  }

  return { atender, prestamos, cola: () => colaIds.length };
}
