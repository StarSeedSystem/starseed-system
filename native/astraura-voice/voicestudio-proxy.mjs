/**
 * StarSeed OS — PUERTA LOCAL hacia VoiceStudio (Ola 1018V · G).
 * ============================================================================
 * VoiceStudio (el estudio de voz local de la fusión) vive como motor aparte,
 * sólo en la máquina, en 127.0.0.1:3900. El daemon de voz (127.0.0.1:4444) lo
 * DETECTA por su descubrimiento (`/.well-known/voicestudio-speech`) y REENVÍA
 * por esta puerta sólo su API compatible con OpenAI; si no está, la puerta se
 * APARTA (404) y el daemon sigue con su voz propia. Nadie más tiene que saber
 * que existe.
 *
 * Contrato: architecture/voz-voicestudio.md §1-4.
 * Módulo puro: la red (`fetcher`) y el reloj (`ahora`) llegan inyectados; el
 * único estado es la CACHÉ de detección — un ping al descubrimiento como mucho
 * cada 60 s para que el /status (que pregunta mucho) no la tumbe.
 */

// Motor de VoiceStudio: sólo loopback (su guía lo dice: nunca en red abierta).
export const RAIZ_VOICESTUDIO = "http://127.0.0.1:3900";

// Descubrimiento: es lo que VoiceStudio expone para que el demonio lo huela.
export const URL_DESCUBRIMIENTO = `${RAIZ_VOICESTUDIO}/.well-known/voicestudio-speech`;

// Únicas rutas que la puerta reenvía: la API compatible con OpenAI (§1).
export const RUTAS_REENVIO = {
  "/v1/audio/speech": "POST",
  "/v1/audio/transcriptions": "POST",
  "/v1/audio/voices": "GET",
};

// Como mucho UN ping de descubrimiento cada 60 s (se pregunta mucho en /salud).
const INTERVALO_MS = 60_000;
let cacheDeteccion = null;

/** Olvida la caché de detección (útil en pruebas y tras dormir la neurona). */
export function resetearDeteccion() {
  cacheDeteccion = null;
}

// ── Detección (con caché de 60 s) ────────────────────────────────────────────

 /**
 * ¿Está vivo VoiceStudio? GET del descubrimiento, como mucho una vez cada 60 s
 * con la caché interna. Nunca lanza: sin estudio devuelve `false` y la puerta
 * se aparta.
 */
export async function detectar(fetcher = fetch, ahora = Date.now()) {
  if (cacheDeteccion && ahora - cacheDeteccion.en < INTERVALO_MS) {
    return cacheDeteccion.vivo;
  }
  let vivo = false;
  try {
    const res = await fetcher(URL_DESCUBRIMIENTO);
    vivo = Boolean(res?.ok) && Boolean(res?.status === undefined || res.status < 400);
  } catch {
    vivo = false;
  }
  cacheDeteccion = { vivo, en: ahora };
  return vivo;
}

// ── Reenvío del API compatible con OpenAI ────────────────────────────────────

/**
 * Reenvía a VoiceStudio y devuelve SU resultado tal cual (candidato, sin
 * transformar): `{ status, tipo, datos }` para JSON, `{ status, tipo, audio }`
 * para binario (la voz viene en audio/wav), `{ status, error }` ante ruta no
 * permitida (404) o estudio que no responde (502). `cuerpo` puede ser la
 * cadena cruda del cliente (JSON ya serializado o multipart del oído) o un
 * objeto (se serializa).
 */
export async function reenviar(ruta, cuerpo, fetcher = fetch) {
  const metodo = RUTAS_REENVIO[ruta];
  if (!metodo) {
    return { status: 404, error: "ruta no permitida" };
  }
  const crudo = typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo ?? {});
  try {
    const res = await fetcher(`${RAIZ_VOICESTUDIO}${ruta}`, {
      method: metodo,
      headers: metodo === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: metodo === "POST" ? crudo : undefined,
    });
    const respuesta = { status: res.status, tipo: tipoDe(res) };
    if (respuesta.tipo.includes("application/json")) {
      respuesta.datos = await res.json();
    } else {
      respuesta.audio = await res.arrayBuffer();
    }
    return respuesta;
  } catch {
    return { status: 502, error: "voicestudio no responde" };
  }
}

/** Content-type de la respuesta sin saber nada de la pila de fetch real. */
function tipoDe(res) {
  try {
    return res?.headers?.get?.("content-type") || "";
  } catch {
    return "";
  }
}
// ── Estado para la salud del daemon ──────────────────────────────────────────

/**
 * La línea de /status del daemon: `voicestudio: vivo | ausente`. Usa la misma
 * detección (y su caché de 60 s), así que preguntar la salud N veces no son N
 * pings.
 */
export async function estado(fetcher = fetch) {
  const vivo = await detectar(fetcher);
  return `voicestudio: ${vivo ? "vivo" : "ausente"}`;
}
