// Servidor WebSocket para el rele de estaciones en vivo
// Maneja conexiones individuales y proporciona respuestas de hora uno a uno
import { WebSocketServer } from "ws";
import { entrar, salir, difundir, getPresencia } from "./salas.mjs";

const PUERTO = process.env.PUERTO || 8787;
const wss = new WebSocketServer({ port: PUERTO });

// Contador de mensajes por minuto
let mensajesPorMinuto = 0;
setInterval(() => {
  if (mensajesPorMinuto > 0) {
    console.log(`[${new Date().toISOString()}] Mensajes recibidos en el último minuto: ${mensajesPorMinuto}`);
  }
  mensajesPorMinuto = 0;
}, 60 * 1000);

wss.on("connection", (ws, req) => {
  // Obtener tema de la URL
  const url = new URL(req.url, `http://${req.headers.host}`);
  const tema = url.searchParams.get("tema");
  if (!tema) {
    ws.close(1008, "Tema no proporcionado");
    return;
  }

  // Intentar entrar en la sala
  if (!entrar(ws, tema)) {
    ws.close(1008, "No se pudo entrar en la sala");
    return;
  }

  // Enviar mensaje de presencia al entrar (después de entrar)
  const presencia = getPresencia(tema);
  const mensajePresencia = JSON.stringify({ t: "rele", n: presencia - 1 });
  difundir(tema, mensajePresencia);

  // Manejar mensajes entrantes
  ws.on("message", (mensaje) => {
    mensajesPorMinuto++;
    // Reenviar a todos en la sala
    difundir(tema, mensaje);
  });

  // Manejar cierre de conexión
  ws.on("close", () => {
    salir(ws, tema);
    // Enviar mensaje de presencia al salir
    const presencia = getPresencia(tema);
    const mensajePresencia = JSON.stringify({ t: "rele", n: presencia - 1 });
    difundir(tema, mensajePresencia);
  });

  // Configurar ping/pong para detectar conexiones muertas
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
});

// Ping cada 30 segundos
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30 * 1000);

console.log(`Servidor de estaciones en vivo escuchando en puerto ${PUERTO}`);