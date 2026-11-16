import { abrirEdicion, anadirPendiente, paqueteEnEdicion, cerrarEdicion, publicarBorrador } from "./editor";

// Simula la interacción con el editor de paquetes de idioma.
export function demoEditor(): void {
  // Inicia edición
  abrirEdicion('cod-123', 'Ejemplo Español');
  if (!paqueteEnEdicion()) return;

  // Añade un pendiente
  anadirPendiente('Hola mundo');

  // Traduce
  publicarBorrador();

  // Cierra edición
  cerrarEdicion();
}
