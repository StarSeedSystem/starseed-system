// Módulo de gestión de salas para el rele de estaciones
// Mantiene un mapa de temas a conjuntos de WebSockets
const salas = new Map(); // tema => Set<WebSocket>

export function entrar(ws, tema) {
  if (!salas.has(tema)) {
    salas.set(tema, new Set());
  }
  const sala = salas.get(tema);
  sala.add(ws);
  return true;
}

export function salir(ws, tema) {
  const sala = salas.get(tema);
  if (sala) {
    sala.delete(ws);
    if (sala.size === 0) {
      salas.delete(tema);
    }
  }
}

export function difundir(tema, mensaje) {
  const sala = salas.get(tema);
  if (sala) {
    for (const ws of sala) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(mensaje);
      }
    }
  }
}

export function getPresencia(tema) {
  const sala = salas.get(tema);
  return sala ? sala.size : 0;
}