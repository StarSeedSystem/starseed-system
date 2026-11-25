/**
 * DIR1125J · ¿El modo de rendimiento que manda tiene apagadas las animaciones?
 *
 * Las animaciones CSS ya se quedan quietas con «eco» y «eficiente» (regla global sobre `html[data-perf="eco"]`). Las que
 * mueve un script (framer-motion) no se enteran de esa regla: el flotado en bucle de las tarjetas seguía corriendo y mantenía
 * despierto el bucle de cuadros de framer 60 veces por segundo. Medido el 25-11 en la Maggabox: el flotado solo, 26 % del
 * hilo principal; con el orbe, 47 % frente a 36 % sin flotado.
 *
 * Esto da a esas animaciones el MISMO interruptor que usa el CSS. Solo tiempo de ejecución: lee el modo, no lo cambia.
 */
import { useEffect, useState } from "react";
import { PERF_CHANGED_EVENT, resolveApplied } from "./device-tier";
import { MODO_CHANGED_EVENT } from "./modo-rendimiento";

/** true con «eco», con «eficiente» y con «auto» cuando decide uno de los dos (lo mismo que `html[data-perf="eco"]`). */
export function animacionesEnAhorro(): boolean {
  try {
    return resolveApplied() === "eco";
  } catch {
    return false;
  }
}

/** Lo mismo, vivo: cambia en cuanto cambia el modo (elegido a mano o decidido por «auto»). En el servidor, false. */
export function useAnimacionesEnAhorro(): boolean {
  const [ahorro, setAhorro] = useState<boolean>(() => (typeof window === "undefined" ? false : animacionesEnAhorro()));
  useEffect(() => {
    const mirar = () => setAhorro(animacionesEnAhorro());
    mirar();
    window.addEventListener(PERF_CHANGED_EVENT, mirar);
    window.addEventListener(MODO_CHANGED_EVENT, mirar);
    return () => {
      window.removeEventListener(PERF_CHANGED_EVENT, mirar);
      window.removeEventListener(MODO_CHANGED_EVENT, mirar);
    };
  }, []);
  return ahorro;
}
