/**
 * Interrupción por voz (Ola 1015V · contrato `architecture/voz-fusionada-astraura.md`):
 * si la persona habla más de `minimoMs` (250 ms) mientras Astraura habla, Astraura
 * calla al instante (el motor llama a su `interrupt()`).
 *  · `decidirInterrupcion` — detector PURO por energía con histéresis: sin red,
 *    sin micrófono y sin reloj propio; las muestras traen su marca de tiempo.
 *  · `crearInterruptorVoz` — montaje: micro con `echoCancellation` y
 *    `noiseSuppression`, dBFS por sondeo y un disparo UNA sola vez; nada lanza.
 * El eco propio no se corta: no se arma hasta pasado `ventanaEcoMs` de
 * `anti-bucle-voz.ts`, y el llamador puede marcar eco (`esEco`/`esEcoAhora`,
 * de `esEcoPropio` con transcripción concurrente).
 */

import { ventanaEcoMs } from "@/lib/aurora/anti-bucle-voz";

export interface MuestraMicro { ahoraMs: number; nivelDb: number }

/** Estado acumulado del detector entre tandas de muestras. */
export interface EstadoInterrupcion { altaDesdeMs: number | null }

/** Umbral e histéresis (dBFS), cadena mínima sostenida y ventana de eco. */
export interface OpcionesInterrupcion { umbralDb?: number; histeresisDb?: number; minimoMs?: number; armadoDesdeMs?: number; esEco?: boolean }

export interface OpcionesMontaje {
  alInterrumpir: () => void;
  movil?: boolean;
  latenciaSalidaMs?: number;
  esEcoAhora?: () => boolean;
}
export interface InterruptorVoz { detener: () => void }

const UMBRAL_DEFECTO_DB = -40;
const HISTERESIS_DEFECTO_DB = 8;
const MINIMO_DEFECTO_MS = 250;
const PASO_SONDEO_MS = 60;

export function estadoInicialInterrupcion(): EstadoInterrupcion { return { altaDesdeMs: null }; }

/** Histéresis: sube de `umbralDb` → cuenta; baja de `umbralDb - histeresisDb` → limpia; en medio ni arranca ni limpia. */
export function decidirInterrupcion(
  muestras: MuestraMicro[],
  estado: EstadoInterrupcion,
  opciones: OpcionesInterrupcion = {},
): { interrumpir: boolean; estado: EstadoInterrupcion } {
  if (opciones.esEco) return { interrumpir: false, estado }; // eco evidenciado: no corta
  const activacion = opciones.umbralDb ?? UMBRAL_DEFECTO_DB;
  const vuelta = activacion - (opciones.histeresisDb ?? HISTERESIS_DEFECTO_DB);
  const minimo = opciones.minimoMs ?? MINIMO_DEFECTO_MS;
  const armado = opciones.armadoDesdeMs ?? 0;
  let altaDesde = estado.altaDesdeMs;
  let interrumpir = false;
  for (const m of [...muestras].sort((a, b) => a.ahoraMs - b.ahoraMs)) {
    if (m.ahoraMs < armado) continue; // ventana de eco: aún no se arma
    if (m.nivelDb >= activacion) {
      if (altaDesde === null) altaDesde = m.ahoraMs;
      if (m.ahoraMs - altaDesde >= minimo) interrumpir = true;
    } else if (m.nivelDb < vuelta) altaDesde = null; // silencio claro
  }
  return { interrumpir, estado: { altaDesdeMs: altaDesde } };
}

function pararPistas(flujo: MediaStream): void {
  try {
    flujo.getTracks().forEach((p) => {
      try { p.stop(); } catch { /* */ }
    });
  } catch {
    /* */
  }
}

/** El montaje: lee el micro mientras Astraura habla, decide con histéresis y
 * llama a `alInterrumpir()` UNA sola vez si no hay eco propio. */
export function crearInterruptorVoz(opciones: OpcionesMontaje): InterruptorVoz {
  let limpiar: () => void = () => {};
  let pedida = false;
  const detener = () => { pedida = true; limpiar(); };
  void (async () => {
    try {
      if (typeof window === "undefined") return;
      const md = navigator.mediaDevices ?? null;
      if (!md) return;
      const flujo = await md.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: false }, video: false });
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AC = w.AudioContext || w.webkitAudioContext;
      if (!AC) { pararPistas(flujo); return; }
      const ctx = new AC();
      try { if (ctx.state === "suspended") await ctx.resume(); } catch { /* */ }
      const analizador = ctx.createAnalyser();
      analizador.fftSize = 1024;
      ctx.createMediaStreamSource(flujo).connect(analizador);
      const tambor = new Float32Array(analizador.fftSize);
      let estado = estadoInicialInterrupcion();
      let disparado = false;
      // Respeta `ventanaEcoMs`: la salida de Astraura en el micro no interrumpe.
      const armadoDesdeMs = Date.now() + ventanaEcoMs({ movil: opciones.movil ?? false, latenciaSalidaMs: opciones.latenciaSalidaMs });
      const sondeo = window.setInterval(() => {
        try {
          analizador.getFloatTimeDomainData(tambor);
          let suma = 0;
          for (let i = 0; i < tambor.length; i++) suma += tambor[i] * tambor[i];
          const nivelDb = 20 * Math.log10(Math.max(Math.sqrt(suma / tambor.length), 1e-9));
          const veredicto = decidirInterrupcion([{ ahoraMs: Date.now(), nivelDb }], estado, { armadoDesdeMs });
          estado = veredicto.estado;
          if (!veredicto.interrumpir || disparado || opciones.esEcoAhora?.()) return;
          disparado = true;
          opciones.alInterrumpir();
        } catch { /* */ }
      }, PASO_SONDEO_MS);
      limpiar = () => {
        window.clearInterval(sondeo);
        pararPistas(flujo);
        void ctx.close().catch(() => {});
      };
      if (pedida) limpiar(); // «detener» llegó durante el arranque del micro
    } catch { limpiar = () => {}; }
  })();
  return { detener };
}
