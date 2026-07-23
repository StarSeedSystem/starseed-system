/**
 * server.js — Custom server de StarSeed OS (standalone · Cloud Run / local).
 * ============================================================================
 * Arranca Next.js Y, además, intercepta el upgrade de WebSocket en
 * `/api/voice/xai/stream` para hacer de PROXY server-side hacia xAI
 * (grok-voice). Esto permite usar la API de StarSeed GRATUITA por defecto sin
 * exponer la API key en el navegador (xAI no da ephemeral tokens a la key
 * compartida; el proxy usa la key server-side con header Bearer).
 *
 * En Vercel este archivo NO se usa (Vercel usa su propio runtime). Allí xAI
 * funciona para usuarios con su PROPIA xAI key vía ephemeral token
 * (/api/voice/xai/token). Para la key de StarSeed en Vercel, el cliente informa
 * honestamente que requiere el proxy (deploy en Cloud Run).
 *
 * SSR-safe y defensivo: solo arranca el proxy si `ws` está disponible.
 */

const { createServer } = require("http");
const { parse } = require("url");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// Solo cargamos el proxy si no estamos en Vercel (donde el runtime no lo soporta).
const IS_VERCEL = !!process.env.VERCEL;

async function main() {
  await app.prepare();

  const server = createServer((req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      handle(req, res, parsedUrl);
    } catch (err) {
      console.error("Error handling request", err);
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  });

  if (!IS_VERCEL) {
    try {
      const { setupXaiProxy } = require("./xai-proxy");
      setupXaiProxy(server);
      console.log("[xai-proxy] Proxy WebSocket de voz xAI activado en /api/voice/xai/stream");
    } catch (e) {
      console.warn("[xai-proxy] No se pudo activar el proxy xAI:", String(e));
    }
  }

  server.listen(port, hostname, () => {
    console.log(`> StarSeed OS listo en http://${hostname}:${port}`);
  });
}

main().catch((err) => {
  console.error("Fallo al arrancar el servidor:", err);
  process.exit(1);
});
