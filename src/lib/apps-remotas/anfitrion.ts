// Lado anfitrión de la ventana transmitida (§9): fotogramas de la app nativa al lienzo,
// pista WebRTC y entradas reenviadas solo con la sesión de préstamo viva.
import { avisoAnfitrion, permitido, type Sesion, type TipoAlcance } from "../recursos/sesion-prestamo";

export type EntradaVentana = { tipo: "teclado" | "raton" | "tacto"; accion: string; x?: number; y?: number; tecla?: string; boton?: number };
export type FotogramaAnfitrion = { ancho: number; alto: number; datos?: unknown; bytes?: number };
export type OrdenVentana =
  | { comando: "capturar_ventana"; ventana: string; ancho: number; alto: number; fps: number }
  | { comando: "entrada_ventana"; ventana: string; entrada: EntradaVentana };
export type RespuestaVentana = FotogramaAnfitrion | { aceptada: boolean } | null | void;
export type PistaAnfitriona = { stop(): void };
export type Calidad = { ancho: number; alto: number; fps: number };
export type AvisoVisible = { invitado: string; recursoTipo: TipoAlcance; recursoId: string; inicio: number; duracionTranscurrida: number; texto: string };
export type EstadoAnfitrion = { transmitiendo: boolean; cuadros: number; calidad: Calidad; aviso: AvisoVisible | null };
export type Dibujar = (fotograma: FotogramaAnfitrion, calidad: Calidad) => void;
export type DepsAnfitrion = {
  ventana?: string; capturar: (orden: OrdenVentana) => RespuestaVentana | Promise<RespuestaVentana>; dibujar: Dibujar;
  crearPista: (fps: number) => PistaAnfitriona; sesion: () => Sesion; fps: number; anchoMax: number; altoMax?: number;
  medirAnchoBanda?: () => number; reloj?: () => number;
};
export type Anfitrion = {
  arrancar(ahora?: number): EstadoAnfitrion; paso(ahora?: number): Promise<boolean>; pista(): PistaAnfitriona | null;
  entrada(entrada: EntradaVentana, ahora?: number): Promise<boolean>; estado(ahora?: number): EstadoAnfitrion; parar(): void;
};

const BITS_POR_PIXEL = 0.06;
const FPS_MINIMO = 10;
const INTERVALO_MEDICION_MS = 2000;

export function ajustarCalidad(
  anchoBandaBps: number,
  opciones: { fps: number; anchoMax: number; altoMax: number }
): Calidad {
  const banda = Number.isNaN(anchoBandaBps) || anchoBandaBps <= 0 ? 0 : anchoBandaBps;
  const fpsTope = Math.max(1, Math.round(opciones.fps));
  const anchoTope = Math.max(1, Math.round(opciones.anchoMax));
  const altoTope = Math.max(1, Math.round(opciones.altoMax));
  const fpsSuelo = Math.min(fpsTope, FPS_MINIMO);
  const bitsCuadro = anchoTope * altoTope * BITS_POR_PIXEL;
  const fpsPosible = Math.floor(banda / bitsCuadro);
  if (fpsPosible >= fpsSuelo) {
    return { ancho: anchoTope, alto: altoTope, fps: Math.min(fpsTope, Math.max(fpsSuelo, fpsPosible)) };
  }
  const factor = Math.sqrt(banda / (bitsCuadro * fpsSuelo));
  return { ancho: Math.max(160, Math.round(anchoTope * factor)), alto: Math.max(90, Math.round(altoTope * factor)), fps: fpsSuelo };
}

export function crearAnfitrion(deps: DepsAnfitrion): Anfitrion {
  const reloj = deps.reloj ?? (() => Date.now());
  const medir = deps.medirAnchoBanda ?? (() => Number.POSITIVE_INFINITY);
  const ventana = deps.ventana ?? "ventana";
  const altoMax = deps.altoMax ?? Math.round((deps.anchoMax * 9) / 16);
  let transmitiendo = false, cuadros = 0, ultimaMedicion = 0;
  let calidad = ajustarCalidad(Number.POSITIVE_INFINITY, { fps: deps.fps, anchoMax: deps.anchoMax, altoMax });
  let pista: PistaAnfitriona | null = null;

  return { arrancar, paso, entrada, pista: () => pista, estado, parar };

  function vigente(ahora: number): boolean { return permitido(deps.sesion(), "anfitrion", ahora); }
  function parar(): void { transmitiendo = false; pista?.stop(); pista = null; }
  function arrancar(ahora = reloj()): EstadoAnfitrion {
    if (!vigente(ahora)) { parar(); return estado(ahora); }
    transmitiendo = true; cuadros = 0; ultimaMedicion = ahora;
    calidad = ajustarCalidad(medir(), { fps: deps.fps, anchoMax: deps.anchoMax, altoMax });
    pista?.stop(); pista = deps.crearPista(calidad.fps);
    return estado(ahora);
  }
  async function paso(ahora = reloj()): Promise<boolean> {
    if (!transmitiendo) return false;
    if (!vigente(ahora)) { parar(); return false; }
    recalcular(ahora);
    const respuesta = await deps.capturar({ comando: "capturar_ventana", ventana, ancho: calidad.ancho, alto: calidad.alto, fps: calidad.fps });
    if (!esFotograma(respuesta)) return false;
    deps.dibujar(respuesta, { ...calidad }); cuadros += 1;
    return true;
  }
  async function entrada(datos: EntradaVentana, ahora = reloj()): Promise<boolean> {
    if (!transmitiendo) return false;
    if (!vigente(ahora)) { parar(); return false; }
    await deps.capturar({ comando: "entrada_ventana", ventana, entrada: datos });
    return true;
  }
  function recalcular(ahora: number): void {
    if (ahora - ultimaMedicion < INTERVALO_MEDICION_MS) return;
    ultimaMedicion = ahora;
    const nueva = ajustarCalidad(medir(), { fps: deps.fps, anchoMax: deps.anchoMax, altoMax });
    if (nueva.ancho === calidad.ancho && nueva.alto === calidad.alto && nueva.fps === calidad.fps) return;
    pista?.stop(); calidad = nueva; pista = deps.crearPista(calidad.fps);
  }
  function aviso(ahora: number): AvisoVisible | null {
    const visto = avisoAnfitrion([deps.sesion()], ahora)[0];
    if (!visto) return null;
    const segundos = Math.max(0, Math.floor(visto.duracionTranscurrida / 1000));
    return { ...visto, texto: `${visto.invitado} está usando ${visto.recursoId} (${segundos} s)` };
  }
  function estado(ahora = reloj()): EstadoAnfitrion {
    if (transmitiendo && !vigente(ahora)) parar();
    return { transmitiendo, cuadros, calidad: { ...calidad }, aviso: aviso(ahora) };
  }
}

function esFotograma(respuesta: RespuestaVentana): respuesta is FotogramaAnfitrion {
  return typeof respuesta === "object" && respuesta !== null && "ancho" in respuesta && "alto" in respuesta;
}
