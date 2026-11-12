/**
 * LLA1112B · ¿La cámara recién elegida da una imagen USABLE? — decisión pura + medida en el navegador.
 * ═══════════════════════════════════════════════════════════════════════════════════════════════════
 * Prueba 39: al elegir «Cámara del iPhone (Continuidad)» sin iPhone cerca, WebKit abrió la pista (viva, sin error) pero
 * nunca entregó un cuadro; la imagen de la Mac quedó en negro y nadie dijo nada. La regla desde esa ronda: una cámara que no
 * da imagen usable en unos segundos NO se queda; la llamada vuelve a la anterior y lo dice con palabras.
 *
 * Qué se puede saber desde la página:
 *   · llegan cuadros (cuenta de `requestVideoFrameCallback`, o el reloj del `<video>` si no existe);
 *   · los cuadros no son negros (brillo medio de una muestra de 16×12, el mismo `brilloDe` que usa la telemetría);
 *   · la pista no se terminó al abrirla.
 * Qué NO se puede saber: si la imagen es la que la persona espera. La tarjeta de espera de una cámara virtual («OBS sin
 * fuente», «Immersed») es una imagen real y pasa la prueba; por eso las virtuales se avisan aparte y no se guardan como
 * predeterminadas (`avisoCamaraVirtual`). Una habitación a oscuras (brillo < 4) se lee como negra: el aviso lo dice.
 */
import { brilloDe } from "./visibilidad";

export type MotivoSinImagen = "sin-cuadros" | "negra" | "terminada";
export type ResultadoImagen = { ok: true; cuadros: number; brillo: number | null } | { ok: false; motivo: MotivoSinImagen; cuadros: number; brillo: number | null };

/** Por debajo de este brillo medio (0–255) un cuadro cuenta como negro (el mismo umbral que `motivoInvisible`). */
export const UMBRAL_NEGRO = 4;
/** Cuadros que hacen falta para decir «llega imagen». */
export const CUADROS_MINIMOS = 2;
/** Cuánto se espera a una cámara antes de rendirse. */
export const PLAZO_IMAGEN_MS = 4000;

/** Decisión pura sobre lo medido hasta ahora. `null`: aún no se puede decir (sigue esperando). */
export function decidirImagen(m: { cuadros: number; brillos: ReadonlyArray<number | null>; terminada: boolean; agotado: boolean }): ResultadoImagen | null {
  const medidos = m.brillos.filter((b): b is number => b !== null);
  const mejor = medidos.length ? Math.max(...medidos) : null;
  if (m.terminada) return { ok: false, motivo: "terminada", cuadros: m.cuadros, brillo: mejor };
  if (m.cuadros >= CUADROS_MINIMOS && mejor !== null && mejor >= UMBRAL_NEGRO) return { ok: true, cuadros: m.cuadros, brillo: mejor };
  if (!m.agotado) return null;
  if (m.cuadros < CUADROS_MINIMOS) return { ok: false, motivo: "sin-cuadros", cuadros: m.cuadros, brillo: mejor };
  return { ok: false, motivo: "negra", cuadros: m.cuadros, brillo: mejor };
}

/** El texto que la ventana enseña cuando la cámara elegida no se queda. Pura. */
export function textoCamaraFallida(nombre: string, motivo: MotivoSinImagen, anterior: string | null, plazoMs = PLAZO_IMAGEN_MS): string {
  const por =
    motivo === "sin-cuadros"
      ? `no da imagen (en ${Math.round(plazoMs / 1000)} s no llegó ningún cuadro; si es la del iPhone, acércalo y desbloquéalo)`
      : motivo === "negra"
        ? "solo da imagen negra (está tapada, apagada o sin fuente)"
        : "se cerró al abrirla (otra aplicación la está usando)";
  return `La cámara «${nombre}» ${por}.${anterior ? ` Sigues con «${anterior}».` : ""}`;
}

/** Aviso de una cámara virtual que SÍ da imagen: lo que la ventana no puede comprobar. Pura. */
export function avisoCamaraVirtual(nombre: string, anterior: string | null): string {
  return `«${nombre}» es una cámara virtual: da imagen, pero la ventana no puede saber si es la tuya o una tarjeta de espera. Si ves una tarjeta, abre su programa o vuelve a${anterior ? ` «${anterior}»` : " la cámara de este aparato"}. Solo vale para esta llamada: no queda como predeterminada.`;
}

/** Medida en el navegador: abre la pista en un `<video>` fuera de pantalla y mira cuadros y brillo hasta decidir o agotar el plazo. */
export async function probarImagen(
  pista: MediaStreamTrack,
  opc: { plazoMs?: number; cadaMs?: number; ahora?: () => number } = {},
): Promise<ResultadoImagen> {
  const plazo = opc.plazoMs ?? PLAZO_IMAGEN_MS;
  const cada = opc.cadaMs ?? 200;
  const ahora = opc.ahora ?? (() => Date.now());
  if (typeof document === "undefined" || typeof MediaStream === "undefined") return { ok: true, cuadros: 0, brillo: null }; // sin dónde medir: no se inventa un fallo
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("aria-hidden", "true");
  video.style.cssText = "position:fixed;left:-9999px;top:0;width:64px;height:48px;opacity:0;pointer-events:none";
  let cuadros = 0;
  const brillos: Array<number | null> = [];
  let parar = false;
  try {
    video.srcObject = new MediaStream([pista]);
    document.body.appendChild(video);
    void video.play().catch(() => undefined);
    const rvfc = (video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number }).requestVideoFrameCallback?.bind(video);
    let tiempoAntes = -1;
    const alCuadro = () => {
      if (parar) return;
      cuadros += 1;
      brillos.push(brilloDe(video));
      rvfc?.(alCuadro);
    };
    rvfc?.(alCuadro);
    const t0 = ahora();
    for (;;) {
      await new Promise((r) => setTimeout(r, cada));
      if (!rvfc) {
        // Sin `requestVideoFrameCallback`: el reloj del vídeo avanza solo si llegan cuadros.
        if (video.readyState >= 2 && video.currentTime !== tiempoAntes) {
          tiempoAntes = video.currentTime;
          cuadros += 1;
          brillos.push(brilloDe(video));
        }
      }
      const r = decidirImagen({ cuadros, brillos, terminada: pista.readyState === "ended", agotado: ahora() - t0 >= plazo });
      if (r) return r;
    }
  } catch {
    return { ok: true, cuadros, brillo: null }; // si la medida misma falla no se culpa a la cámara
  } finally {
    parar = true;
    try {
      video.pause();
      video.srcObject = null;
      video.remove();
    } catch {
      /* noop */
    }
  }
}
