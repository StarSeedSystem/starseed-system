/**
 * StarSeed OS — PUERTA LOCAL HACIA VOICESTUDIO (Ola 1018V · VST1018Gc).
 * ============================================================================
 * VoiceStudio (el estudio de voz local de la fusión) sirve su motor aparte, sólo
 * en la máquina, en `127.0.0.1:3900`, con un descubrimiento por máquina
 * (`GET /.well-known/voicestudio-speech`) y una API compatible con OpenAI.
 *
 * Este módulo es la puerta del demonio de voz (`127.0.0.1:4444`) hacia él:
 *   · `detectar(fetcher, ahora)` — huele el descubrimiento como MUCHO una vez
 *     cada 60 s (caché) para que la salud no sondee en bucle.
 *   · `reenviar(ruta, cuerpo, fetcher, opciones)` — SÓLO las tres rutas con
 *     contrato; cualquier otra devuelve 404 sin salir de la máquina.
 *   · `estado(fetcher, ahora)` — la línea «voicestudio: vivo | ausente».
 *
 * Red y reloj inyectables (pruebas sin red). Si no está, se aparta (502) y el
 * demonio sigue con su voz propia. Contrato: `architecture/voz-voicestudio.md`.
 */

// Motor de VoiceStudio: sólo loopback (su propia guía lo exige).
export const VOICE_STUDIO_URL = "http://127.0.0.1:3900";
export const RUTA_DESCUBRIMIENTO = "/.well-known/voicestudio-speech";
export const CACHE_DETECCION_MS = 60_000;

// Únicas rutas que atraviesan la puerta, con el método de su contrato (§1).
export const RUTAS_PERMITIDAS = Object.freeze({
  "/v1/audio/speech": "POST",
  "/v1/audio/transcriptions": "POST",
  "/v1/audio/voices": "GET",
});
let deteccion = { en: null, vivo: false };
/** Reabre la caché de detección (pruebas y re-medición a mano). */
export function reiniciarDeteccion() {
  deteccion = { en: null, vivo: false };
}

/** AbortSignal con plazo, sin romper en runtimes que no lo traen. */
const senalDeTiempo = (ms) =>
  typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(ms) : undefined;

/** ¿Está vivo VoiceStudio? Nunca lanza: si no contesta, se aparta con false. */
export async function detectar(fetcher = fetch, ahora = Date.now()) {
  if (deteccion.en !== null && ahora - deteccion.en < CACHE_DETECCION_MS) {
    return deteccion.vivo;
  }
  let vivo = false;
  try {
    const res = await fetcher(`${VOICE_STUDIO_URL}${RUTA_DESCUBRIMIENTO}`, {
      method: "GET",
      signal: senalDeTiempo(1_500),
    });
    const estadoHttp = Number(res?.status);
    vivo = res?.ok === true || (res?.ok === undefined && estadoHttp >= 200 && estadoHttp < 400);
  } catch {
    vivo = false;
  }
  deteccion = { en: ahora, vivo };
  return vivo;
}

/** ¿La ruta existe y el método es el suyo? (la puerta no reenvía otra cosa). */
export function metodoPermitido(ruta, metodo) {
  return RUTAS_PERMITIDAS[ruta] === metodo;
}

/**
 * Reenvía a VoiceStudio y devuelve su respuesta SIN transformarla: `{ status,
 * data }` si contesta JSON, `{ status, audio, mime }` si contesta binario
 * (la voz), y `{ status, error }` para ruta no permitida (404) o estudio caído
 * (502). El cuerpo puede llegar ya serializado (JSON o multipart crudo) o como
 * objeto; si es crudo se conserva el `Content-Type` original.
 */
export async function reenviar(ruta, cuerpo, fetcher = fetch, opciones = {}) {
  const metodo = RUTAS_PERMITIDAS[ruta];
  if (!metodo) return { status: 404, error: "ruta de VoiceStudio no permitida" };

  const cabeceras = {};
  let cuerpoFinal;
  if (metodo === "POST") {
    if (typeof cuerpo === "string" || cuerpo instanceof Uint8Array) {
      cuerpoFinal = cuerpo;
      if (opciones.contentType) cabeceras["Content-Type"] = opciones.contentType;
    } else {
      cuerpoFinal = JSON.stringify(cuerpo ?? {});
      cabeceras["Content-Type"] = "application/json";
    }
  }

  try {
    const res = await fetcher(`${VOICE_STUDIO_URL}${ruta}`, {
      method: metodo,
      ...(metodo === "POST" ? { headers: cabeceras, body: cuerpoFinal } : {}),
      signal: opciones.signal || senalDeTiempo(opciones.timeoutMs || 120_000),
    });
    const estadoHttp = Number.isFinite(Number(res?.status)) ? Number(res.status) : (res?.ok ? 200 : 502);
    const tipo = String(res?.headers?.get?.("content-type") || "");
    const tieneJson = typeof res?.json === "function";
    const tieneBinario = typeof res?.arrayBuffer === "function";
    if (tipo.includes("application/json") || (tieneJson && !tipo)) {
      return { status: estadoHttp, data: await res.json() };
    }
    if (tieneBinario) {
      return {
        status: estadoHttp,
        audio: await res.arrayBuffer(),
        mime: tipo || "application/octet-stream",
      };
    }
    if (tieneJson) return { status: estadoHttp, data: await res.json() };
    return { status: estadoHttp, data: null };
  } catch {
    // Sin IP ni ruta en el mensaje: se registra en la salud, no se filtra.
    return { status: 502, error: "VoiceStudio no responde" };
  }
}

/** Línea de la salud del demonio: «voicestudio: vivo | ausente». */
export async function estado(fetcher = fetch, ahora = Date.now()) {
  const vivo = await detectar(fetcher, ahora);
  return `voicestudio: ${vivo ? "vivo" : "ausente"}`;
}
