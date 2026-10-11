// Import WebSocketServer from ws
import { WebSocketServer } from "ws";
// Import the salas module
import { crearSalas } from "./salas.mjs";

// Create the salas instance with default parameters
const salas = crearSalas();

// Get the port from environment variable or default to 8787
const puerto = process.env.PUERTO || 8787;

// Create a WebSocket server
const wss = new WebSocketServer({ port: puerto });

console.log(`Servidor de estaciones en vivo escuchando en el puerto ${puerto}`);

// Handle new connections
wss.on("connection", (ws, req) => {
  // Parse the URL to get the query parameter 'tema'
  const url = new URL(req.url, `http://${req.headers.host}`);
  const tema = url.searchParams.get("tema");
  
  // If no tema is provided, close the connection with code 1008 and reason
  if (!tema) {
    ws.close(1008, "Se requiere el parámetro 'tema'");
    return;
  }
  
  // Validate the tema format (as per salas.mjs: /^estacion-(vivo|p):[A-Za-z0-9_:-]{8,80}$/)
  const temaRegex = /^estacion-(vivo|p):[A-Za-z0-9_:-]{8,80}$/;
  if (!temaRegex.test(tema)) {
    ws.close(1008, "Tema inválido");
    return;
  }
  
  // Attempt to enter the room
  const resultadoEntrada = salas.entrar(tema, ws);
  if (!resultadoEntrada.ok) {
    ws.close(1008, resultadoEntrada.motivo);
    return;
  }
  
  // Set up ping/pong to detect dead connections
  ws.isAlive = true;
  ws.on("pong", () => {
    ws.isAlive = true;
  });
  
  // Handle incoming messages
  ws.on("message", (message) => {
    // We assume the message is a string or buffer, convert to string
    const texto = message.toString();
    // Use salas.difundir to get the list of connections to send to (excluding the sender)
    const destinatarios = salas.difundir(ws, texto);
    // Send the same message to each destinatario
    for (const destinatario of destinatarios) {
      if (destinatario.readyState === WebSocket.OPEN) {
        destinatario.send(texto);
      }
    }
  });
  
  // Handle connection close
  ws.on("close", () => {
    // Remove the connection from the room
    salas.salir(ws);
    // Note: We would like to send a presence update here, but we cannot get the list of connections in the room.
    // This is a limitation of the current salas.mjs interface.
  });
  
  // Handle errors
  ws.on("error", (error) => {
    console.error(`Error en la conexión: ${error}`);
  });
});

// Set up interval to check for dead connections (every 30 seconds)
const intervalo = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping(() => {});
  });
}, 30000);

// Clean up interval when the server closes
wss.on("close", () => {
  clearInterval(intervalo);
});