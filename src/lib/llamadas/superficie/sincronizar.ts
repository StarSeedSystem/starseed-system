/**
 * Sincroniza la máquina de la superficie con lo que dice el motor (la vista). PURO: dado el estado actual
 * de la superficie y la vista nueva, da los eventos a aplicar. El motor manda; la superficie solo añade
 * lo suyo (tamaño, resumen, cronómetro sin espera).
 */
import type { EstadoSuperficie, EventoSuperficie, Superficie } from "./maquina";
import type { VistaLlamada } from "./vista";

export function eventosParaVista(s: Superficie, v: Pick<VistaLlamada, "estado" | "tipo" | "fin" | "medioUsado">, ahora: number): EventoSuperficie[] {
  const out: EventoSuperficie[] = [];
  const quiere: EstadoSuperficie = v.estado;
  if (quiere === s.estado) {
    if (s.estado !== "inactiva" && s.estado !== "terminada" && v.tipo !== s.tipo) out.push({ t: "tipo-cambiado", tipo: v.tipo });
    return out;
  }
  switch (quiere) {
    case "inactiva":
      // El resumen de una llamada terminada se queda hasta que se descarta.
      return s.estado === "terminada" || s.estado === "inactiva" ? [] : [{ t: "terminar", fin: "colgada", ahora }, { t: "descartar" }];
    case "entrante":
      return s.estado === "inactiva" || s.estado === "terminada" ? [{ t: "descartar" }, { t: "sonar", tipo: v.tipo }] : [];
    case "saliente":
      return s.estado === "inactiva" || s.estado === "terminada" ? [{ t: "descartar" }, { t: "llamar", tipo: v.tipo }] : [];
    case "conectada":
      // Montada con la llamada ya conectada (p. ej. al recargar la vista): se recorre el camino entero.
      if ((s.estado as EstadoSuperficie) === "inactiva" || (s.estado as EstadoSuperficie) === "terminada") return [{ t: "descartar" }, { t: "llamar", tipo: v.tipo }, { t: "conectar", ahora }];
      if (s.estado === "entrante" || s.estado === "saliente") out.push({ t: "conectar", ahora });
      else if (s.estado === "en-espera") out.push({ t: "reanudar", ahora });
      else if (s.estado === "reconectando") out.push({ t: "enlace-recuperado" });
      if (v.tipo !== s.tipo && s.estado !== "inactiva" && s.estado !== "terminada") out.push({ t: "tipo-cambiado", tipo: v.tipo });
      return out;
    case "en-espera":
      return s.estado === "conectada" ? [{ t: "en-espera", ahora }] : [];
    case "reconectando":
      return s.estado === "conectada" || s.estado === "en-espera" ? [{ t: "enlace-perdido" }] : [];
    case "terminada": {
      const fin = v.fin ?? (s.estado === "entrante" ? "perdida" : "colgada");
      return [{ t: "terminar", fin, ahora, medio: v.medioUsado ?? null }];
    }
  }
}
