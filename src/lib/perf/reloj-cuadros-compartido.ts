/**
 * SEN1126B · un solo reloj de cuadros para toda la página.
 *
 * El mapa de Señales tenía varios bucles a la vez (la escena 3D, las etiquetas y las
 * capas del mapa), cada uno con su propio `requestAnimationFrame`: 270–315 cuadros por
 * segundo medidos el 25-11. Aquí hay UN reloj compartido: todos los oyentes corren en el
 * mismo cuadro, con el tope del modo de rendimiento (eficiente 10, eco 30), y el reloj se
 * detiene con la pestaña oculta. Los dibujos puntuales se piden con `unaVez` y se agrupan:
 * cien eventos del mapa no piden cien cuadros.
 */
import { crearRitmoCuadros, fpsDelModo, type DepsRitmo } from "./ritmo-cuadros";
import { energiaActualMedida } from "./device-tier";

export type Cuadro = (t: number) => void;

export interface DepsRelojCuadros extends DepsRitmo {
  visible: () => boolean;
  alCambiarVisibilidad: (cb: () => void) => () => void;
}

export interface RelojCuadrosCompartido {
  /** Un bucle que corre en cada cuadro mientras siga suscrito. */
  suscribir(cb: Cuadro): () => void;
  /** Un dibujo puntual, agrupado con los demás del mismo cuadro. Devuelve cómo cancelarlo. */
  unaVez(cb: Cuadro): () => void;
  /** Cuántos oyentes hay (pruebas y censo). */
  oyentes(): number;
  /** Cuántos cuadros se han ejecutado (pruebas y censo). */
  cuadros(): number;
}

export function crearRelojCuadrosCompartido(deps: DepsRelojCuadros): RelojCuadrosCompartido {
  const continuos = new Set<Cuadro>();
  const unicos = new Set<Cuadro>();
  const ritmo = crearRitmoCuadros(deps);
  let pedido = false;
  let hechos = 0;
  let soltarVisibilidad: (() => void) | null = null;

  const seguro = (cb: Cuadro, t: number) => {
    try { cb(t); } catch { /* un oyente roto no para a los demás */ }
  };

  function tick(t: number): void {
    pedido = false;
    hechos += 1;
    const pendientes = [...unicos];
    unicos.clear();
    for (const cb of pendientes) seguro(cb, t);
    for (const cb of [...continuos]) seguro(cb, t);
    programar();
  }

  function programar(): void {
    if (pedido || !deps.visible()) return;
    if (continuos.size === 0 && unicos.size === 0) return;
    pedido = true;
    ritmo.pedir(tick);
  }

  const alCambiarVisibilidad = () => {
    if (!deps.visible()) {
      ritmo.cancelar();
      pedido = false;
    } else {
      programar();
    }
  };

  const vigilar = () => {
    if (!soltarVisibilidad) soltarVisibilidad = deps.alCambiarVisibilidad(alCambiarVisibilidad);
  };

  const soltarSiVacio = () => {
    if (continuos.size > 0 || unicos.size > 0) return;
    ritmo.cancelar();
    pedido = false;
    soltarVisibilidad?.();
    soltarVisibilidad = null;
  };

  return {
    suscribir(cb) {
      continuos.add(cb);
      vigilar();
      programar();
      return () => { continuos.delete(cb); soltarSiVacio(); };
    },
    unaVez(cb) {
      unicos.add(cb);
      vigilar();
      programar();
      return () => { unicos.delete(cb); soltarSiVacio(); };
    },
    oyentes: () => continuos.size + unicos.size,
    cuadros: () => hechos,
  };
}

function depsReales(): DepsRelojCuadros {
  return {
    raf: (cb) => requestAnimationFrame(cb),
    caf: (id) => cancelAnimationFrame(id),
    poner: (f, ms) => setTimeout(f, ms),
    quitar: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    ahora: () => (typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()),
    fps: fpsDelModo,
    energia: energiaActualMedida,
    visible: () => typeof document === "undefined" || document.visibilityState !== "hidden",
    alCambiarVisibilidad: (cb) => {
      if (typeof document === "undefined") return () => {};
      document.addEventListener("visibilitychange", cb);
      return () => document.removeEventListener("visibilitychange", cb);
    },
  };
}

/** El reloj de toda la página. `unaVez` para dibujos puntuales y `suscribir` para animaciones. */
export const relojCuadrosCompartido = crearRelojCuadrosCompartido(depsReales());
