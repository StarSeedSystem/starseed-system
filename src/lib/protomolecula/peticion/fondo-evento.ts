/**
 * Petición a la Protomolécula · aviso «aplica este cambio al fondo» (Ola 1026P · P3).
 * Solo la constante y el tipo del detalle: el proveedor de apariencia (`AppearanceProvider`) escucha este evento y lo
 * atiende con `preventDefault()` (mismo gesto que el aviso de la orbe); quien lo lanza ve así si alguien lo atendió.
 * Sin importar nada pesado: lo importa el proveedor de apariencia, que vive en el árbol de todas las rutas.
 */
export const EVENTO_APLICAR_FONDO = "starseed:protomolecula-aplicar-fondo";

/** Recibe las capas de fondo actuales y devuelve las nuevas. Pura: el proveedor decide cómo guardarlas (con deshacer). */
export interface DetalleAplicarFondo {
  aplicar: (capas: ReadonlyArray<Record<string, unknown>>) => Array<Record<string, unknown>>;
}
