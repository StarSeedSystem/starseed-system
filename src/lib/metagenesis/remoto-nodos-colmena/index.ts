import { AccionOrden, FichaAccion } from "@/lib/metagenesis/remoto-nodos";

const RE_COLA = /^cola-[A-Za-z0-9._-]{1,80}$/;
const RE_VALOR = /^[\p{L}\p{N}_ .:/@+,()-]{0,200}$/u;
const RE_NODO = /^[a-z0-9][a-z0-9-]{1,38}$/;
const RE_NONCE = /^[A-Za-z0-9_-]{8,64}$/;

// ACCIONES includes all actions including desconectar y contenedor
type AccionOrdenColmena = AccionOrden | "desconectar" | "contenedor" | "reiniciar";
export const ACCIONES: Record<AccionOrdenColmena, FichaAccion> = {
  continuar: { etiqueta: "Seguir ahora", explica: "Si hay trabajo listo y nadie lo coge, los directores lo arrancan ya.", args: [] },
  revisar_bloqueadas: {
    etiqueta: "Revisar bloqueadas",
    explica: "El revisor automático pasa por cada tarea quieta y la reencola, la adapta o la reasigna.",
    args: [],
  },
  buscar_capacidad: { etiqueta: "Buscar capacidad", explica: "Mide todos los medios y enciende los que pueden trabajar.", args: [] },
  reactivar: { etiqueta: "Reactivar directores", explica: "Revive los servicios caídos del medio y repasa todo.", args: [] },
  buscar_trabajo: {
    etiqueta: "Buscar trabajo",
    explica: "Si no queda nada en cola, rescata lo que se quedó sin hacer en las colas archivadas.",
    args: [],
  },
  lanzar_cola: { etiqueta: "Lanzar cola", explica: "Pone una cola a trabajar en un medio.", args: ["cola", "trabajadores", "tareas_sha"] },
  detener_cola: { etiqueta: "Detener cola", explica: "Para el orquestador de una cola.", confirmar: true, args: ["cola"] },
  pausar: { etiqueta: "Pausar autonomía", explica: "El líder deja de decidir solo hasta que la reanudes.", confirmar: true, args: [] },
  reanudar: { etiqueta: "Reanudar autonomía", explica: "El líder vuelve a decidir solo.", args: [] },
  ceder: { etiqueta: "Cambiar de líder", explica: "El líder cede el mando 30 min y lo toma el siguiente medio.", confirmar: true, args: [] },
  desconectar: { etiqueta: "Desconectar", explica: "Desconectar el nodo de la red.", confirmar: true, args: [] },
  contenedor: { etiqueta: "Usar como contenedor", explica: "Usar el nodo como contenedor para otros trabajadores.", args: ["activo", "trabajadores"] },
  reiniciar: { etiqueta: "Reiniciar", explica: "Reiniciar el nodo.", args: ["nodo"] },
};

// ACCIONES_DEL_LIDER excludes desconectar y contenedor (van en la tarjeta de cada neurona)
export const ACCIONES_DEL_LIDER: Record<AccionOrden | "reiniciar", FichaAccion> = {
  continuar: { etiqueta: "Seguir ahora", explica: "Si hay trabajo listo y nadie lo coge, los directores lo arrancan ya.", args: [] },
  revisar_bloqueadas: {
    etiqueta: "Revisar bloqueadas",
    explica: "El revisor automático pasa por cada tarea quieta y la reencola, la adapta o la reasigna.",
    args: [],
  },
  buscar_capacidad: { etiqueta: "Buscar capacidad", explica: "Mide todos los medios y enciende los que pueden trabajar.", args: [] },
  reactivar: { etiqueta: "Reactivar directores", explica: "Revive los servicios caídos del medio y repasa todo.", args: [] },
  buscar_trabajo: {
    etiqueta: "Buscar trabajo",
    explica: "Si no queda nada en cola, rescata lo que se quedó sin hacer en las colas archivadas.",
    args: [],
  },
  lanzar_cola: { etiqueta: "Lanzar cola", explica: "Pone una cola a trabajar en un medio.", args: ["cola", "trabajadores", "tareas_sha"] },
  detener_cola: { etiqueta: "Detener cola", explica: "Para el orquestador de una cola.", confirmar: true, args: ["cola"] },
  pausar: { etiqueta: "Pausar autonomía", explica: "El líder deja de decidir solo hasta que la reanudes.", confirmar: true, args: [] },
  reanudar: { etiqueta: "Reanudar autonomía", explica: "El líder vuelve a decidir solo.", args: [] },
  ceder: { etiqueta: "Cambiar de líder", explica: "El líder cede el mando 30 min y lo toma el siguiente medio.", confirmar: true, args: [] },
  reiniciar: { etiqueta: "Reiniciar", explica: "Reiniciar el nodo.", args: ["nodo"] },
};

// Re-export the constants from the original file
export { RE_VALOR, RE_COLA, RE_NODO, RE_NONCE };

// Export validarArgs function that uses our ACCIONES object
export function validarArgs(accion: string, args: unknown): string | null {
  const a = (args ?? {}) as Record<string, unknown>;
  if (typeof a !== "object" || Array.isArray(a)) return "argumentos no válidos";
  if (!Object.hasOwnProperty.call(ACCIONES, accion)) return "acción no admitida";
  const accionKey = accion as keyof typeof ACCIONES;
  const permitidos = new Set(ACCIONES[accionKey].args);
  for (const [k, v] of Object.entries(a)) {
    if (!permitidos.has(k)) return `argumento no admitido: ${k}`;
    if (typeof v === "boolean" || (Number.isInteger(v as number) && Math.abs(v as number) < 1e6)) continue;
    if (typeof v !== "string" || !RE_VALOR.test(v)) return `valor no admitido en ${k}`;
  }
  if ((accionKey === "lanzar_cola" || accionKey === "detener_cola") && !(typeof a.cola === "string" && RE_COLA.test(a.cola))) {
    return "nombre de cola no válido";
  }
  if ("trabajadores" in a) {
    const num = a.trabajadores as number;
    if (typeof a.activo === "boolean" && !a.activo) {
      // Cuando activo es false, esperamos que trabajadores sea 0
      if (!(Number.isInteger(num) && num === 0)) {
        return "trabajadores fuera de 1–4";
      }
    } else {
      // Por defecto: esperamos entre 1 y 4
      if (!(Number.isInteger(num) && num >= 1 && num <= 4)) {
        return "trabajadores fuera de 1–4";
      }
    }
  }
  return null;
}