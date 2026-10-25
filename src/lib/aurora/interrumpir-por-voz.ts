/**
 * Interrupción por voz (Ola 1015V · tarea N · architecture/voz-fusionada-astraura.md §4):
 * si la persona habla más de «minimoMs» (250 ms) mientras Astraura habla, ella
 * calla al instante. Dos piezas:
 *  · `decidirInterrupcion` — detector PURO por energía con histéresis, sin DOM,
 *    sin micro, sin reloj: las pruebas lo ejercitan con muestras sintéticas.
 *  · `montarInterrupcionPorVoz` — abre el micro con `echoCancellation: true` y
 *    `noiseSuppression: true` mientras ella habla y llama a `interrupt()` UNA vez.
 *
 * Contra el eco propio (que nunca se corte a sí misma, anti-bucle-voz.ts):
 *  · la captura pide cancelación de eco y supresión de ruido al navegador;
 *  · la energía de los primeros `ventanaEcoMs` ms del turno se descarta (es el
 *    residuo de su propia voz entrando por el micro con retraso);
 *  · si hay transcripción parcial y `esEcoPropio` la delata, se veta el corte
 *    (capa de texto: el diccionario ya se alimenta con `registrarDicho`).
 */

import { esEcoPropio, ventanaEcoMs } from "@/lib/aurora/anti-bucle-voz";

/** Umbral por defecto de voz sobre silencio, en dBFS (0 = saturación). */
const UMBRAL_DEFECTO = -34;
/** Racha mínima por defecto (regla de la tarea: 250 ms de voz humana). */
const MINIMO_DEFECTO_MS = 250;
/** Salto máximo que una sola muestra puede sumar a la racha. */
const PASO_MAX_MS = 120;

export interface MuestraVoz {
  /** Milisegundos desde que empezó la escucha del turno. */
  ms: number;
  /** Energía instantánea en dBFS (más negativo = más silencio). */
  db: number;
}

export interface EstadoInterrupcion {
  /** Voz seguida acumulada sobre el umbral, en ms. */
  rachaMs: number;
  /** Marca temporal de la última muestra vista (continuidad entre lotes). */
  ultMs: number | null;
  /** Ya se decidió cortar en este turno (el corte es de UNA vez). */
  fuego: boolean;
}

export interface OpcionesInterrupcion {
  umbralDb: number;
  minimoMs?: number;
  /** Los primeros «ventanaEcoMs» ms del turno se descartan (eco propio). */
  ventanaEcoMs?: number;
}

export interface VeredictoInterrupcion {
  /** Es «true» SOLO en la muestra en que la racha alcanza el mínimo. */
  interrumpir: boolean;
  estado: EstadoInterrupcion;
}

export interface MonitorInterrupcion {
  /** `interrupt()` del motor: lo que corta su voz al momento. */
  interrumpir: () => void;
  /** Transcripción parcial del oído; si la hay, se mira con `esEcoPropio`. */
  textoAhora?: () => string | null;
  /** ¿Equipo móvil? Alarga la ventana de eco (`ventanaEcoMs`). */
  movil?: boolean;
}

/**
 * Monta la escucha del micro MIENTRAS Astraura habla. Devuelve la soltadora
 * (libera el micro al callar ella); es idempotente. Sin micro/permiso, no
 * interrumpe y no lanza nunca: la voz de Aurora sigue normal.
 */
export function montarInterrupcionPorVoz(opts: MonitorInterrupcion): () => void {
  const estado = estadoNuevo();
  const ventana = ventanaEcoMs({ movil: opts.movil ?? false });
  let soltado = false;
  let raf: number | null = null;
  let pararLista: (() => void) | null = null;
  let cerrarAudio: (() => void) | null = null;
  const soltar = () => {
    if (soltado) return;
    soltado = true;
    if (raf !== null) cancelAnimationFrame(raf);
    try { pararLista?.(); cerrarAudio?.(); } catch { /* ya cerrado */ }
  };
  void (async () => {
    try {
      const lista = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (soltado) { lista.getTracks().forEach((t) => t.stop()); return; }
      const ctx = new AudioContext();
      const fuente = ctx.createMediaStreamSource(lista);
      const tubo = ctx.createAnalyser();
      tubo.fftSize = 1024;
      fuente.connect(tubo);
      const buf = new Float32Array(tubo.fftSize);
      const t0 = performance.now();
      pararLista = () => lista.getTracks().forEach((t) => t.stop());
      cerrarAudio = () => { void ctx.close().catch(() => { /* ya cerrado */ }); };
      const paso = () => {
        const ms = performance.now() - t0;
        let db = -100;
        try {
          tubo.getFloatTimeDomainData(buf);
          let suma = 0;
          for (const v of buf) suma += v * v;
          const rms = Math.sqrt(suma / buf.length);
          if (rms > 0) db = Math.max(-100, 20 * Math.log10(rms));
        } catch { /* sin datos: silencio */ }
        const texto = opts.textoAhora?.() ?? null;
        const esEco = texto !== null && texto.trim().length > 0 && esEcoPropio(texto, Date.now());
        if (!esEco) {
          const v = decidirInterrupcion([{ ms, db }], estado, {
            umbralDb: UMBRAL_DEFECTO,
            ventanaEcoMs: ventana,
          });
          if (v.interrumpir) opts.interrumpir();
        }
        if (!soltado) raf = requestAnimationFrame(paso);
      };
      raf = requestAnimationFrame(paso);
    } catch { /* sin permiso de micro: la interrupción queda desactivada */ }
  })();
  return soltar;
}

export function estadoNuevo(): EstadoInterrupcion {
  return { rachaMs: 0, ultMs: null, fuego: false };
}

/**
 * Procesa un lote de muestras y decide. Histéresis: la racha de voz sobre el
 * umbral se acumula entre llamadas (el estado viaja), se pone a cero con una
 * muestra de silencio y corta cuando alcanza «minimoMs». Las muestras dentro
 * de la ventana de eco no suman nada.
 */
export function decidirInterrupcion(
  muestras: readonly MuestraVoz[],
  estado: EstadoInterrupcion,
  opciones: OpcionesInterrupcion
): VeredictoInterrupcion {
  const minimoMs = opciones.minimoMs ?? MINIMO_DEFECTO_MS;
  const ventana = opciones.ventanaEcoMs ?? 0;
  const est: EstadoInterrupcion = { rachaMs: estado.rachaMs, ultMs: estado.ultMs, fuego: estado.fuego };
  for (const m of muestras) {
    const delta = est.ultMs === null ? 0 : Math.min(PASO_MAX_MS, Math.max(0, m.ms - est.ultMs));
    est.ultMs = m.ms;
    if (m.ms < ventana || m.db <= opciones.umbralDb) {
      est.rachaMs = 0;
      continue;
    }
    est.rachaMs += delta;
    if (!est.fuego && est.rachaMs >= minimoMs) {
      est.fuego = true;
      return { interrumpir: true, estado: est };
    }
  }
  return { interrumpir: false, estado: est };
}
