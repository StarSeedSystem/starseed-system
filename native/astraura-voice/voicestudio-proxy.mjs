/**
 * Puente del demonio de voz local hacia VoiceStudio (Ola 1018V · tarea VST1018Gc).
 *
 * VoiceStudio (antes «OmniVoice-Studio») sirve su motor en `127.0.0.1:3900` con
 * una API compatible con OpenAI y un punto de descubrimiento por máquina:
 * `GET /.well-known/voicestudio-speech`. Este módulo es la puerta del demonio
 * (`native/astraura-voice/daemon.mjs`, `127.0.0.1:4444`) hacia él:
 *
 *  - `detectar(fetcher, ahora)` — comprueba el descubrimiento; la caché sirve
 *    el resultado durante 60 s (JUEGO_DETECCION_MS) para no sondear en bucle.
 *    Red y reloj inyectables: las pruebas no tocan la red.
 *  - `reenviar(ruta, cuerpo, fetcher)` — SOLO reenvía las tres rutas de voz con
 *    contrato (`speech`/`transcriptions` POST, `voices` GET); cualquier otra
 *    ruta devuelve 404 aquí mismo, sin salir de la máquina por accidente.
 *  - `estado(fetcher, ahora)` — la línea de salud para `/voicestudio/salud`.
 *
 * Si VoiceStudio no está, todo cae con 502 y el demonio se aparta: la voz
 * local de Astraura (OmniVoice, 127.0.0.1:4500+n) sigue siendo la de siempre.
 * Contrato: `architecture/voz-voicestudio.md` §1 y §3.
 */

export const VOICE_STUDIO_URL = "http://127.0.0.1:3900";
export const RUTA_DESCUBRIMIENTO = "/.well-known/voicestudio-speech";
export const JUEGO_DETECCION_MS = 60_000;

/** Únicas rutas que atraviesan la puerta, con su método del contrato (§1). */
const RUTAS_PERMITIDAS = {
  "/v1/audio/speech": "POST",
  "/v1/audio/transcriptions": "POST",
  "/v1/audio/voices": "GET",
};

/** Última detección módulo: { en: instante, viva: boolean }. */
let deteccion = { en: null, viva: false };

/** Reabre la caché de detección (las pruebas la usan para ser deterministas). */
export function reiniciarDeteccion() {
  deteccion = { en: null, viva: false };
}

export const detectar = async (fetcher = fetch, ahora = Date.now) => {
  const momento = ahora();
  if (deteccion.en !== null && momento - deteccion.en < JUEGO_DETECCION_MS) {
    return deteccion.viva;
  }
  let viva = false;
  try {
    const res = await fetcher(`${VOICE_STUDIO_URL}${RUTA_DESCUBRIMIENTO}`, {
      method: "GET",
      signal: AbortSignal.timeout(4_000),
    });
    viva = !!res.ok;
  } catch {
    viva = false;
  }
  deteccion = { en: momento, viva };
  return viva;
};

export const reenviar = async (ruta, cuerpo, fetcher = fetch) => {
  const metodo = typeof ruta === "string" ? RUTAS_PERMITIDAS[ruta] : undefined;
  if (metodo === undefined) {
    return { status: 404, error: "No encontrado" };
  }
  try {
    const res = await fetcher(`${VOICE_STUDIO_URL}${ruta}`, {
      method: metodo,
      headers: metodo === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: metodo === "POST" ? JSON.stringify(cuerpo ?? {}) : undefined,
      signal: AbortSignal.timeout(120_000),
    });
    const tipo = String(res.headers?.get?.("content-type") || "");
    if (tipo.includes("application/json")) {
      return { status: res.status, data: await res.json() };
    }
    // `speech` contesta audio binario: se pasa tal cual, sin decodificar.
    return { status: res.status, audio: await res.arrayBuffer(), mime: tipo || "application/octet-stream" };
  } catch {
    return { status: 502, error: "VoiceStudio no está respondiendo" };
  }
};

export const estado = async (fetcher = fetch, ahora = Date.now) => {
  const viva = await detectar(fetcher, ahora);
  return `voicestudio: ${viva ? "vivo" : "ausente"}`;
};
