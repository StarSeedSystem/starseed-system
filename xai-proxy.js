/**
 * xai-proxy.js — Proxy WebSocket server-side para la voz conversacional xAI.
 * ============================================================================
 * El navegador NO puede autenticar el WebSocket de xAI con header Bearer (xAI
 * exige un token efímero en el protocolo para clientes web, y la API key
 * compartida de StarSeed NO tiene permiso para generar ese token). Este proxy
 * abre el WebSocket a xAI USANDO LA KEY SERVER-SIDE (process.env.XAI_API_KEY)
 * y hace forwarding bidireccional con el navegador. La key NUNCA sale del
 * servidor.
 *
 * Ruta interceptada: upgrade en `/api/voice/xai/stream`.
 * Destino: wss://api.x.ai/v1/realtime?model=grok-voice-latest
 *
 * Funciona en Node/Cloud Run (standalone) y local. NO en Vercel serverless
 * (Vercel no soporta upgrade de WebSocket en Functions).
 */

const { WebSocketServer } = require("ws");
const { WebSocket } = require("ws");
const { URL } = require("url");

const XAI_REALTIME_URL = "wss://api.x.ai/v1/realtime?model=grok-voice-latest";

/**
 * Engancha el proxy al server HTTP de Next. Llama a esto UNA vez tras
 * app.prepare().
 * @param {import('http').Server} server
 */
function setupXaiProxy(server) {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    let url;
    try {
      url = new URL(req.url, "http://localhost");
    } catch {
      return; // dejar que Next maneje otros upgrades
    }
    if (url.pathname !== "/api/voice/xai/stream") return;

    wss.handleUpgrade(req, socket, head, (ws) => {
      onXaiConnection(ws);
    });
  });
}

function onXaiConnection(browserWs) {
  const serverKey = process.env.XAI_API_KEY;
  if (!serverKey) {
    browserWs.close(1011, "Falta XAI_API_KEY en el servidor.");
    return;
  }

  const xaiWs = new WebSocket(XAI_REALTIME_URL, {
    headers: { Authorization: `Bearer ${serverKey}` },
  });

  let closed = false;
  const closeAll = () => {
    if (closed) return;
    closed = true;
    try {
      browserWs.close();
    } catch {}
    try {
      xaiWs.close();
    } catch {}
  };

  xaiWs.on("open", () => {
    // El navegador ya envió session.update tras abrir (lo escuchamos abajo).
  });

  xaiWs.on("message", (data) => {
    if (browserWs.readyState === browserWs.OPEN) {
      try {
        browserWs.send(data.toString());
      } catch {}
    }
  });

  xaiWs.on("close", () => closeAll());
  xaiWs.on("error", () => closeAll());

  browserWs.on("message", (data) => {
    if (xaiWs.readyState === xaiWs.OPEN) {
      try {
        xaiWs.send(data.toString());
      } catch {}
    }
  });

  browserWs.on("close", () => closeAll());
  browserWs.on("error", () => closeAll());
}

module.exports = { setupXaiProxy };
