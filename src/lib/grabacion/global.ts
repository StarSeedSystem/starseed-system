/**
 * La grabadora única del navegador (una por pestaña).
 * ─────────────────────────────────────────────────────────────────────────────
 * El controlador vive aquí, no en un componente: la grabación sigue aunque se cambie de sección,
 * se cierre el panel del Centro de Control o se navegue a otra página del OS. Al terminar con el
 * panel cerrado se avisa con un aviso emergente. Mientras se graba, el navegador pregunta antes de
 * cerrar o recargar la pestaña (se perdería lo grabado).
 *
 * Cargar este módulo no toca ninguna API del navegador: todo ocurre en `controladorGlobal()`,
 * que solo se llama desde el cliente.
 */

import { crearControlador, type Controlador, type DepsControlador } from "./controlador";
import { crearLatido } from "./latido";
import { entornoDelNavegador } from "./soporte";
import { estaGrabando } from "./maquina";
import { INSTANTANEA_INICIAL, type Instantanea } from "./tipos";

let unica: Controlador | null = null;

export function depsDelNavegador(): DepsControlador {
  return {
    entorno: entornoDelNavegador(),
    ahora: () => (typeof performance !== "undefined" ? performance.now() : Date.now()),
    fecha: () => new Date(),
    crearFlujo: (pistas) => new MediaStream(pistas),
    crearElemento: (tag) => document.createElement(tag),
    crearUrl: (blob) => URL.createObjectURL(blob),
    revocarUrl: (url) => URL.revokeObjectURL(url),
    latido: (cb, fps) => crearLatido(cb, fps),
    temporizador: {
      setInterval: (fn, ms) => window.setInterval(fn, ms),
      clearInterval: (id) => window.clearInterval(id as number),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id as number),
    },
  };
}

export function controladorGlobal(): Controlador {
  if (unica) return unica;
  const c = crearControlador(depsDelNavegador());
  unica = c;
  engancharAvisos(c);
  return c;
}

/** Para las vistas en el servidor: la grabadora siempre está inactiva. */
export const instantaneaDelServidor = (): Instantanea => INSTANTANEA_INICIAL;

function engancharAvisos(c: Controlador): void {
  let anterior = c.obtener();
  const antesDeCerrar = (e: BeforeUnloadEvent) => {
    e.preventDefault();
    // Algunos navegadores exigen asignar returnValue para mostrar el aviso.
    e.returnValue = "";
  };
  let guardia = false;

  c.suscribir(() => {
    const ahora = c.obtener();
    const grabando = estaGrabando(ahora);
    if (grabando && !guardia && typeof window !== "undefined") {
      window.addEventListener("beforeunload", antesDeCerrar);
      guardia = true;
    } else if (!grabando && guardia && typeof window !== "undefined") {
      window.removeEventListener("beforeunload", antesDeCerrar);
      guardia = false;
    }
    // Terminó y nadie miraba (panel cerrado): que la persona lo sepa.
    const termino = anterior.fase !== "lista" && ahora.fase === "lista";
    const fallo = anterior.fase !== "error" && ahora.fase === "error" && (anterior.fase === "grabando" || anterior.fase === "pausada");
    anterior = ahora;
    if ((termino || fallo) && c.observadores() === 1) {
      // El único oyente es este mismo enganche: el panel está cerrado.
      void import("sonner")
        .then(({ toast }) => {
          if (termino) toast.success("Tu grabación está lista. Ábrela en Centro de Control › Grabar.");
          else toast.error(ahora.error ?? "La grabación se interrumpió.");
        })
        .catch(() => {});
    }
  });
}
