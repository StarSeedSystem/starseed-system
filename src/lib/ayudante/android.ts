import { COMANDOS_AYUDANTE } from "./ordenes";

export function esOrdenPermitidaAndroid(nombre: string): boolean {
  const comando = COMANDOS_AYUDANTE.find((c) => c.nombre === nombre);
  if (!comando) return false;
  
  // Regla: sin root no hay nivel administrador.
  if (comando.requiereAdminCompleto) return false;
  
  // Basado en el contrato, solo permitimos almacenes de lectura (estado, verificar, salud)
  const permitidas = ["almacen-estado", "almacen-salud", "almacen-verificar"];
  return permitidas.includes(nombre);
}

export function obtenerMensajeAndroid(nombre: string): string {
  const comando = COMANDOS_AYUDANTE.find((c) => c.nombre === nombre);
  if (comando?.requiereAdminCompleto) {
    return "Esta orden requiere privilegios de administrador, no disponibles en Android sin root.";
  }
  return "Esta orden no está disponible en Android.";
}
