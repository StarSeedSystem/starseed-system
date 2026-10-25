// Puerta local del demonio de voz hacia VoiceStudio (Ola 1018V).
// VoiceStudio (motor Electron/Python) vive en 127.0.0.1:3900 y se anuncia en
// `GET /.well-known/voicestudio-speech`. Este módulo es puro: el fetch, el
// reloj y la caché de detección son inyectables, así que la prueba no toca
// red, reloj ni procesos.

const VOICESTUDIO_URL = "http://127.0.0.1:3900";
const RUTA_DESCUBRIMIENTO = "/.well-known/voicestudio-speech";

// Sólo estas tres rutas de VoiceStudio se reenvían; cualquier otra → 404.
const RUTAS_PERMITIDAS = {
  "/v1/audio/speech": "POST",
  "/v1/audio/transcriptions": "POST",
  "/v1/audio/voices": "GET",
};

// Máximo una comprobación de descubrimiento cada 60 s (vidas compartidas).
const CADENCIA_DETECTAR_MS = 60000;

let cache = null; // { vivo: boolean, cuando: número }

/** Borra la caché de detección (para pruebas y para forzar una re-medición). */
export const limpiarCache = () => {
  cache = null;
};

/**
 * ¿Está VoiceStudio activo? Consulta el descubrimiento como mucho cada
 * 60 s; entre medias responde de la caché. Si no está, se aparta con false.
 */
export const detectar = async (fetcher = fetch, fecha = Date.now) => {
  if (cache && fecha() - cache.cuando < CADENCIA_DETECTAR_MS) return cache.vivo;
  let vivo = false;
  try {
    const res = await fetcher(`${VOICESTUDIO_URL}${RUTA_DESCUBRIMIENTO}`);
    vivo = Boolean(res && res.ok);
  } catch {
    vivo = false;
  }
  cache = { vivo, cuando: fecha() };
  return vivo;
};

/**
 * Reenvía a VoiceStudio solo `/v1/audio/speech`, `/v1/audio/transcriptions`
 * (POST, cuerpo JSON) y `/v1/audio/voices` (GET). La voz de una persona jamás
 * sale de aquí hacia otra ruta. Devuelve `{ status, data }` (JSON) o
 * `{ status, audio }` (binario); lo que no esté vivo responde con error.
 */
export const reenviar = async (ruta, cuerpo, fetcher = fetch) => {
  const metodo = RUTAS_PERMITIDAS[ruta];
  if (!metodo) return { status: 404, error: "ruta no permitida por el proxy de VoiceStudio" };
  const opciones =
    metodo === "GET"
      ? { method: "GET" }
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) };
  try {
    const res = await fetcher(`${VOICESTUDIO_URL}${ruta}`, opciones);
    const tipo = res && res.headers && res.headers.get ? String(res.headers.get("content-type")) : "";
    if (tipo.includes("application/json")) {
      return { status: res.status, data: await res.json() };
    }
    return { status: res.status, audio: await res.arrayBuffer() };
  } catch {
    return { status: 502, error: "VoiceStudio no responde en esta neurona" };
  }
};

/** Línea de salud para /status del demonio: «voicestudio: vivo | ausente». */
export const estado = async (fetcher = fetch, fecha = Date.now) =>
  `voicestudio: ${(await detectar(fetcher, fecha)) ? "vivo" : "ausente"}`;
