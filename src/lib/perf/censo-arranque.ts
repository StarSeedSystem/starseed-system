/**
 * DIR1125H · pone el censo de tiempo nada más cargar la página EN LA APP NATIVA, antes de que se monte nada: así también
 * ve los relojes que la página arranca al montarse (el refresco de 15 s del mapa de Señales, por ejemplo). Puesto más
 * tarde, esos relojes ya existirían y no se medirían. En la web normal y en el servidor no hace nada.
 */
import { esAppNativa } from "@/lib/nativa/puente";
import { iniciarCensoTiempo } from "./censo-tiempo";

let puesto = false;

/** Devuelve true si lo puso ahora. Se puede llamar las veces que haga falta: solo lo pone una. */
export function arrancarCensoSiNativa(): boolean {
  if (puesto || typeof window === "undefined") return false;
  try {
    if (!esAppNativa()) return false;
    try {
      // Freno de mano: con `starseed.censo` = «no» en el almacenamiento de la app, el censo no se pone.
      if (window.localStorage.getItem("starseed.censo") === "no") return false;
    } catch {
      /* sin almacenamiento: se pone */
    }
    iniciarCensoTiempo();
    puesto = true;
    return true;
  } catch {
    return false; // sin censo: como antes
  }
}
