// Lado cliente de la ventana transmitida (§9, tarea R): convierte los eventos del vídeo
// (ratón, teclado, rueda y tacto) en entradas para la ventana remota y las manda por el
// canal de datos con límite de frecuencia. Módulo puro: sin node:*, reloj inyectable,
// las coordenadas se miden del rect del vídeo y del tamaño remoto reportado.

export type Modificadores = { ctrl?: boolean; shift?: boolean; alt?: boolean; meta?: boolean };

export type EntradaRemota = {
  tipo: "teclado" | "raton" | "rueda" | "tacto";
  accion: string;
  x?: number;
  y?: number;
  tecla?: string;
  boton?: number;
  deltaY?: number;
  modificadores?: Modificadores;
};

export type RectVideo = { left: number; top: number; width: number; height: number };
export type TamanoRemoto = { ancho: number; alto: number };

export type EventoVideo =
  | { tipo: "raton"; accion: "mover" | "pulsar" | "soltar"; x: number; y: number; boton?: number }
  | { tipo: "rueda"; x: number; y: number; deltaY: number }
  | { tipo: "tacto"; accion: "empezar" | "mover" | "fin"; x: number; y: number }
  | { tipo: "teclado"; accion: "pulsar" | "soltar"; tecla: string; modificadores?: Modificadores };

export type MensajeVentana = { t: "ventana.entrada"; sesion: string; entrada: EntradaRemota };
export type Enviar = (mensaje: MensajeVentana) => boolean | void;

/** Tope de entradas continuas por segundo por el canal de datos (mueve/rueda/tacto). */
export const ENTRADAS_POR_SEGUNDO = 60;

function clamp(n: number, tope: number): number {
  return Math.max(0, Math.min(tope, n));
}
function rectContenido(rectVideo: RectVideo, tamanoRemoto: TamanoRemoto): { desdeX: number; desdeY: number; escala: number } | null {
  if (rectVideo.width <= 0 || rectVideo.height <= 0 || tamanoRemoto.ancho <= 0 || tamanoRemoto.alto <= 0) return null;
  const escala = Math.min(rectVideo.width / tamanoRemoto.ancho, rectVideo.height / tamanoRemoto.alto);
  const anchoVisible = tamanoRemoto.ancho * escala;
  const altoVisible = tamanoRemoto.alto * escala;
  return {
    desdeX: rectVideo.left + (rectVideo.width - anchoVisible) / 2,
    desdeY: rectVideo.top + (rectVideo.height - altoVisible) / 2,
    escala,
  };
}

function esContinua(entrada: EntradaRemota): boolean {
  // Goteo solo para lo que fluye en ráfaga: «mover» (ratón y tacto) y la rueda.
  return entrada.tipo === "rueda" || entrada.accion === "mover";
}

/** mapearEntrada: evento del vídeo → entrada de la ventana remota. Asume vídeo con
 * `object-contain` (corrige las bandas negras y recorta al tamaño remoto). Devuelve `null`
 * sin medida (rect vacío o tamaño remoto 0): nunca se inventa. */
export function mapearEntrada(
  evento: EventoVideo,
  rectVideo: RectVideo,
  tamanoRemoto: TamanoRemoto
): EntradaRemota | null {
  if (evento.tipo === "teclado") {
    return { tipo: "teclado", accion: evento.accion, tecla: evento.tecla, modificadores: evento.modificadores ? { ...evento.modificadores } : undefined };
  }
  const rect = rectContenido(rectVideo, tamanoRemoto);
  if (!rect) return null;
  // La rueda no lleva acción: su movimiento YA es la acción «rueda».
  const base: EntradaRemota = {
    tipo: evento.tipo,
    accion: evento.tipo === "rueda" ? "rueda" : evento.accion,
    x: clamp(Math.round((evento.x - rect.desdeX) / rect.escala), tamanoRemoto.ancho),
    y: clamp(Math.round((evento.y - rect.desdeY) / rect.escala), tamanoRemoto.alto),
  };
  if (evento.tipo === "raton" && evento.boton !== undefined) base.boton = evento.boton;
  if (evento.tipo === "rueda") base.deltaY = evento.deltaY;
  return base;
}

export type ClienteVentana = {
  entrar(evento: EventoVideo, rectVideo: RectVideo, tamanoRemoto: TamanoRemoto, ahora?: number): boolean;
  detalle(): { enviadas: number; descartadas: number };
};

/** Crea el cliente de entradas: mapea y manda con límite de frecuencia (goteo por mínimo intervalo). */
export function crearCliente({
  enviar,
  sesionId,
  reloj = Date.now,
  porSegundo = ENTRADAS_POR_SEGUNDO,
}: {
  enviar: Enviar;
  sesionId: string;
  reloj?: () => number;
  porSegundo?: number;
}): ClienteVentana {
  const intervalo = Math.max(1, Math.round(1000 / Math.max(1, porSegundo)));
  let ultimo = -Infinity;
  let enviadas = 0;
  let descartadas = 0;
  const mandar = (entrada: EntradaRemota, ahora: number): boolean => {
    if (esContinua(entrada) && ahora - ultimo < intervalo) {
      descartadas += 1;
      return false;
    }
    ultimo = ahora;
    enviadas += 1;
    enviar({ t: "ventana.entrada", sesion: sesionId, entrada });
    return true;
  };
  return {
    entrar(evento, rectVideo, tamanoRemoto, ahora = reloj()) {
      const entrada = mapearEntrada(evento, rectVideo, tamanoRemoto);
      if (!entrada) { descartadas += 1; return false; }
      return mandar(entrada, ahora);
    },
    detalle: () => ({ enviadas, descartadas }),
  };
}
