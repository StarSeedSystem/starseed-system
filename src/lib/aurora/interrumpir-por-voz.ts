/*
 * Interrupción por voz (Ola 1015V · Plática): si la persona habla > 250 ms
 * mientras Astraura habla, Astraura calla al instante (voz-fusionada-astraura.md
 * §4). Detector PURO (muestras y tiempo por parámetro); el montaje del micro no
 * lanza nunca: la voz no puede romperse aquí (aurora-voz-motores.md §0). Anti-eco
 * (anti-bucle-voz.ts): sin abrir el tramo antes de pasar `ventanaEcoMs()` desde
 * que empezó a hablar, y sin cortar si el oído ya marcó el texto `esEcoPropio`.
 */import { esEcoPropio, ventanaEcoMs } from "@/lib/aurora/anti-bucle-voz";

export const UMBRAL_DB_POR_DEFECTO = -30; // apertura en dBFS (RMS): voz cerca del micro, no fondo
export const MARGEN_DB_POR_DEFECTO = 5; // histéresis: cerrar por debajo de umbral - margen
export const MINIMO_MS_INTERRUPCION = 250; // contrato de la fusión: 250 ms de habla para cortar

/** abierta: histéresis abierta · msVoz: habla contada · disparado: ya cortó este tramo · ultimo: instante previo. */
export interface EstadoInterrupcion { abierta: boolean; msVoz: number; disparado: boolean; ultimo: number | null; }

/** Estado inicial del detector: puerta cerrada y nada contado. */
export function estadoInterrupcionNuevo(): EstadoInterrupcion { return { abierta: false, msVoz: 0, disparado: false, ultimo: null }; }

/** `inicioHabla` gaguea dentro de la ventana de eco; `textoOido` (parcial del oído), si ya es eco propio, no corta. */
export interface OpcionesInterrupcion {
  ahora: number; umbralDb?: number; margenDb?: number; minimoMs?: number;
  inicioHabla?: number | null; movil?: boolean; latenciaSalidaMs?: number; textoOido?: string | null;
}

/** El veredicto por tramo, con el estado nuevo para la siguiente llamada. */
export interface VeredictoInterrupcion { interrumpir: boolean; hablaronMs: number; nivelDb: number; estado: EstadoInterrupcion; }

/** Nivel del tramo en dBFS (RMS): -100 si es mudo. Puro, nunca lanza. */
export function nivelDbTramo(muestras: ArrayLike<number>): number {
  let suma = 0;
  for (let i = 0; i < muestras.length; i++) suma += muestras[i] * muestras[i];
  const rms = Math.sqrt(suma / (muestras.length || 1));
  return Math.max(-100, 20 * Math.log10(rms + 1e-12));
}

/** ¿Aún no pasó la ventana de eco desde que Astraura empezó a hablar? */
export function enVentanaEco(inicioHabla: number, ahora: number, opciones: { movil?: boolean; latenciaSalidaMs?: number }): boolean {
  return ahora - inicioHabla < ventanaEcoMs({ movil: opciones.movil ?? false, latenciaSalidaMs: opciones.latenciaSalidaMs });
}

/** Detector por energía con histéresis: una llamada por cada tramo del micro. */
export function decidirInterrupcion(muestras: ArrayLike<number>, estadoAnterior: EstadoInterrupcion, opciones: OpcionesInterrupcion): VeredictoInterrupcion {
  const ahora = opciones.ahora;
  const umbral = opciones.umbralDb ?? UMBRAL_DB_POR_DEFECTO;
  const margen = opciones.margenDb ?? MARGEN_DB_POR_DEFECTO;
  const minimo = opciones.minimoMs ?? MINIMO_MS_INTERRUPCION;
  const nivel = nivelDbTramo(muestras);
  // Ventana de eco o eco propio: el tramo se descarta y arranca de cero.
  const enVentana = opciones.inicioHabla != null && enVentanaEco(opciones.inicioHabla, ahora, opciones);
  const bloqueado = enVentana || (!!opciones.textoOido && esEcoPropio(opciones.textoOido, ahora));
  if (bloqueado) {
    return { interrumpir: false, hablaronMs: 0, nivelDb: nivel, estado: { abierta: false, msVoz: 0, disparado: false, ultimo: ahora } };
  }
  const estado: EstadoInterrupcion = { ...estadoAnterior };
  estado.ultimo = ahora;
  const dt = estadoAnterior.ultimo === null ? 0 : Math.max(0, Math.min(1000, ahora - estadoAnterior.ultimo));
  // Histéresis: se abre por ARRIBA del umbral y se cierra por DEBAJO de umbral - margen; entre ambos, nada.
  if (estado.abierta && nivel < umbral - margen) {
    estado.abierta = false; estado.msVoz = 0; estado.disparado = false;
  } else if (!estado.abierta && nivel >= umbral) {
    estado.abierta = true; estado.msVoz = 0;
  }
  if (estado.abierta) estado.msVoz += dt;
  const interrumpir = estado.abierta && estado.msVoz >= minimo && !estado.disparado;
  if (interrumpir) estado.disparado = true;
  return { interrumpir, hablaronMs: estado.msVoz, nivelDb: nivel, estado };
}

/** `soltar()` libera el micro; es idempotente. */
export interface MontajeInterrupcion { soltar: () => void; }
/** Opciones del montaje: quién corta (el `interrupt()` del motor) y el arranque del habla. */
interface OpcionesMontaje { alInterrumpir: () => void; movil?: boolean; inicioHabla?: number; }

/** Abre el micro (echoCancellation + noiseSuppression), mide con `decidirInterrupcion` y corta al cumplir el mínimo. */
export async function montarInterrupcionPorVoz(opciones: OpcionesMontaje): Promise<MontajeInterrupcion | null> {
  try {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : null;
    const pedir = md?.getUserMedia?.bind(md);
    if (!pedir) return null; // sin permiso: se interrumpe como siempre, tocando la orbe
    const flujo = await pedir({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const Ctx = window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const pararFlujo = () => flujo.getTracks().forEach((t) => t.stop());
    const fuente = ctx.createMediaStreamSource(flujo);
    const procesador = ctx.createScriptProcessor ? ctx.createScriptProcessor(2048, 1, 1) : null;
    if (!procesador) { void ctx.close(); pararFlujo(); return null; }
    fuente.connect(procesador);
    // Sumidero MUDO: Chrome corta el procesador sin destino conectado.
    const mudo = ctx.createGain();
    mudo.gain.value = 0;
    procesador.connect(mudo);
    mudo.connect(ctx.destination);
    let estado = estadoInterrupcionNuevo();
    procesador.onaudioprocess = (ev) => {
      try {
        const veredicto = decidirInterrupcion(ev.inputBuffer.getChannelData(0), estado, {
          ahora: Date.now(), movil: opciones.movil, inicioHabla: opciones.inicioHabla ?? null,
        });
        estado = veredicto.estado;
        if (veredicto.interrumpir) {
          try { opciones.alInterrumpir(); } catch { /* el corte nunca tumba el montaje */ }
        }
      } catch { /* una trama rota no tumba el montaje */ }
    };
    let soltado = false;
    const soltar = (): void => {
      if (soltado) return; // puede soltarlo interrupt() y también el fin del turno
      soltado = true;
      procesador.onaudioprocess = null;
      try { fuente.disconnect(); } catch { /* */ }
      try { procesador.disconnect(); } catch { /* */ }
      try { void ctx.close(); } catch { /* */ }
      try { pararFlujo(); } catch { /* */ }
    };
    return { soltar };
  } catch {
    return null; // sin micro en esta neurona: la voz manda igual
  }
}