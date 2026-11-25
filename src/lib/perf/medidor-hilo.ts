/**
 * DIR1125H · un enchufe para que quien recibe eventos de la app nativa pueda decir cuánto tarda en atenderlos, sin
 * depender del censo (que solo existe en la app nativa y puede no estar). Sin medidor puesto, todo pasa tal cual.
 * Puro: sin navegador, sin Node, sin dependencias (lo importa el puente nativo).
 */
export interface MedidorHilo {
  medir: <T>(clave: string, f: () => T) => T;
  marcar: (clave: string) => void;
}

let actual: MedidorHilo | null = null;

/** Pone (o quita, con `null`) el medidor. Lo llama el censo de tiempo al instalarse. */
export function ponerMedidorHilo(m: MedidorHilo | null): void {
  actual = m;
}

/** Ejecuta `f`; si hay medidor, apunta lo que tardó a nombre de `clave`. El resultado y las excepciones pasan tal cual. */
export function medirEnHilo<T>(clave: string, f: () => T): T {
  const m = actual;
  return m ? m.medir(clave, f) : f();
}

/** Deja dicho que `clave` acaba de pasar (por ejemplo, que llegó la respuesta de una orden nativa). Nunca lanza. */
export function marcarEnHilo(clave: string): void {
  try {
    actual?.marcar(clave);
  } catch {
    /* medir nunca rompe a quien llama */
  }
}
