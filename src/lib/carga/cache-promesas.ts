// src/lib/carga/cache-promesas.ts
// ─────────────────────────────────────────────────────────────────────────────
// Caché genérica de PROMESAS DE CARGA (modelos, texturas, datos remotos…).
//
// El fallo que evita: guardar la promesa antes de que termine y dejar que una
// RECHAZADA (timeout, red, 429/402) se quede en la caché. Entonces cada intento
// posterior recibe el mismo rechazo viejo en vez de reintentar.
//
// Reglas:
//   · Mientras está en vuelo, las llamadas con la misma clave comparten la promesa.
//   · Si RESUELVE, se conserva para reutilizarla (no se vuelve a descargar).
//   · Si RECHAZA, se evicta en el acto: la próxima llamada reintenta de verdad.
//   · `maxFallos` limita los reintentos consecutivos para no agotar créditos;
//     `olvidar` / `limpiar` reabren la carga cuando la causa ya no está.
// ─────────────────────────────────────────────────────────────────────────────

export interface OpcionesCachePromesas {
  /** Fallos consecutivos antes de dejar de reintentar. `0` (por defecto) = sin límite. */
  maxFallos?: number;
}

export interface CachePromesas<T> {
  /** Devuelve la promesa cacheada o lanza la carga nueva. */
  obtener(clave: string, cargar: () => Promise<T>): Promise<T>;
  /** ¿Hay una carga en vuelo o resuelta para esta clave? */
  tiene(clave: string): boolean;
  /** Fallos consecutivos acumulados para esta clave. */
  fallosDe(clave: string): number;
  /** Olvida una clave y su contador de fallos (permite reintentar ya). */
  olvidar(clave: string): void;
  /** Vacía toda la caché y todos los contadores. */
  limpiar(): void;
}

export function crearCachePromesas<T>(opciones: OpcionesCachePromesas = {}): CachePromesas<T> {
  const maxFallos = Math.max(0, Math.floor(opciones.maxFallos ?? 0));
  const enVuelo = new Map<string, Promise<T>>();
  const fallos = new Map<string, number>();

  function obtener(clave: string, cargar: () => Promise<T>): Promise<T> {
    const ya = enVuelo.get(clave);
    if (ya) return ya;
    if (maxFallos > 0 && (fallos.get(clave) ?? 0) >= maxFallos) {
      return Promise.reject(
        new Error(`Demasiados fallos cargando «${clave}»; se deja de reintentar para no agotar créditos.`),
      );
    }

    let promesa: Promise<T>;
    try {
      promesa = Promise.resolve(cargar());
    } catch (e) {
      promesa = Promise.reject(e);
    }
    enVuelo.set(clave, promesa);

    void promesa.then(
      () => {
        fallos.delete(clave);
      },
      () => {
        if (enVuelo.get(clave) === promesa) enVuelo.delete(clave);
        fallos.set(clave, (fallos.get(clave) ?? 0) + 1);
      },
    );
    return promesa;
  }

  return {
    obtener,
    tiene: (clave) => enVuelo.has(clave),
    fallosDe: (clave) => fallos.get(clave) ?? 0,
    olvidar: (clave) => {
      enVuelo.delete(clave);
      fallos.delete(clave);
    },
    limpiar: () => {
      enVuelo.clear();
      fallos.clear();
    },
  };
}
