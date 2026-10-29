/**
 * Elección de ruta del contenido vivo (CVV1028, tarea B · contrato §3).
 *
 * Módulo puro: recibe la tarea y el contexto del ámbito (alcance, conectores,
 * cupo, créditos y neurona) y devuelve la comparación ordenada de candidatos
 * con su razón escrita. No toca red, disco ni React.
 */
import { CATALOGO_RUTAS } from "./catalogo-rutas";
import type { Ruta, TareaViva } from "./tipos";

/** Ámbito desde el que se publica: de lo más privado a lo más abierto. */
export type AlcanceVivo = "personal" | "perfil" | "grupo" | "publica";

/** Lo que el ámbito pone sobre la mesa para elegir. */
export interface ContextoRutas {
  alcance: AlcanceVivo;
  conectados: string[];
  cupoHoy: Record<string, number>;
  creditosDisponibles: number;
  topeMes: number;
  gastadoMes: number;
  neurona: { gpu: boolean; capaz3d: boolean };
  ajustes: { localPrimero: boolean; externosPermitidos: boolean };
}

/** Un candidato puntuado, con la razón de su nota o de su descarte. */
export interface PuntajeRuta {
  ruta: Ruta;
  puntuacion: number;
  disponible: boolean;
  motivoNoDisponible?: string;
  razon: string;
}
/** Ventaja de la ruta local: gana si queda a 0,1 o menos de la mejor externa. */
export const EMPUJON_LOCAL = 0.1;

/** Número con coma decimal, para las frases en español. */
function numero(valor: number): string {
  return String(Math.round(valor * 100) / 100).replace(".", ",");
}

/** Nombre legible de la tarea, sin guiones. */
function etiquetaTarea(tarea: TareaViva): string {
  return tarea.replace(/-/g, " ");
}
/** Primer motivo por el que una ruta no puede usarse, o `null` si está disponible. */
function motivoNoDisponible(ruta: Ruta, contexto: ContextoRutas): string | null {
  if (ruta.tipo === "externo") {
    if (contexto.alcance === "personal") return "El alcance personal no sale de la neurona";
    if (!contexto.ajustes.externosPermitidos) return "Los servicios externos están apagados en este ámbito";
    if ((ruta.requiere.includes("conector") || ruta.requiere.includes("cuenta")) && !contexto.conectados.includes(ruta.id)) {
      const enlace = ruta.enlaceConectar ? `: conéctalo en ${ruta.enlaceConectar}` : "";
      return `No está conectado${enlace}`;
    }
  }
  if (Object.prototype.hasOwnProperty.call(contexto.cupoHoy, ruta.id) && contexto.cupoHoy[ruta.id] <= 0) {
    return "Sin cupo hoy para esta ruta";
  }
  if (ruta.requiere.includes("neurona-capaz") && !contexto.neurona.capaz3d) {
    return "La neurona actual no puede con esta tarea";
  }
  if (ruta.requiere.includes("gpu") && !contexto.neurona.gpu) {
    return "La neurona actual no tiene GPU suficiente";
  }
  if (ruta.creditosPorUnidad > 0) {
    if (ruta.creditosPorUnidad > contexto.creditosDisponibles) return "Sin créditos suficientes";
    if (contexto.topeMes > 0 && contexto.gastadoMes + ruta.creditosPorUnidad > contexto.topeMes) {
      return "Supera el tope de créditos del mes";
    }
  }
  return null;
}

/** Calidad de la tarea menos el coste relativo al tope mensual. */
function puntuacionDe(ruta: Ruta, tarea: TareaViva, contexto: ContextoRutas): number {
  const calidad = ruta.calidad[tarea] ?? 0;
  const costeRelativo = contexto.topeMes > 0 ? ruta.creditosPorUnidad / contexto.topeMes : 0;
  return Math.max(0, Math.round((calidad - costeRelativo) * 1000) / 1000);
}

/** Frase en español que explica la nota o el descarte. */
function razonDe(ruta: Ruta, tarea: TareaViva, contexto: ContextoRutas, disponible: boolean, motivo: string | null): string {
  if (!disponible) return motivo ?? "No disponible";
  const calidad = ruta.calidad[tarea] ?? 0;
  if (ruta.tipo === "local") {
    return `Local: ${ruta.nombre} basta para ${etiquetaTarea(tarea)} y no gasta créditos (calidad ${numero(calidad)})`;
  }
  return `${ruta.nombre}: calidad ${numero(calidad)} por ${ruta.creditosPorUnidad} créditos y dentro del tope de ${contexto.topeMes} al mes`;
}

/** Compara los candidatos de una tarea, de mejor a peor y con su razón. */
export function compararRutas(tarea: TareaViva, contexto: ContextoRutas): PuntajeRuta[] {
  return CATALOGO_RUTAS.filter((ruta) => ruta.tareas.includes(tarea))
    .map((ruta) => {
      const motivo = motivoNoDisponible(ruta, contexto);
      const disponible = motivo === null;
      return {
        ruta,
        puntuacion: disponible ? puntuacionDe(ruta, tarea, contexto) : 0,
        disponible,
        ...(motivo ? { motivoNoDisponible: motivo } : {}),
        razon: razonDe(ruta, tarea, contexto, disponible, motivo),
      };
    })
    .sort((a, b) => {
      const empujon = (candidato: PuntajeRuta) =>
        contexto.ajustes.localPrimero && candidato.disponible && candidato.ruta.tipo === "local" ? EMPUJON_LOCAL : 0;
      const diferencia = b.puntuacion + empujon(b) - (a.puntuacion + empujon(a));
      if (diferencia !== 0) return diferencia;
      if (a.disponible !== b.disponible) return a.disponible ? -1 : 1;
      if (a.ruta.tipo !== b.ruta.tipo) return a.ruta.tipo === "local" ? -1 : 1;
      if (a.ruta.creditosPorUnidad !== b.ruta.creditosPorUnidad) return a.ruta.creditosPorUnidad - b.ruta.creditosPorUnidad;
      return a.ruta.id.localeCompare(b.ruta.id);
    });
}

/** La primera ruta disponible de la comparación, o `null` si no hay ninguna. */
export function elegirRuta(tarea: TareaViva, contexto: ContextoRutas): PuntajeRuta | null {
  return compararRutas(tarea, contexto).find((candidato) => candidato.disponible) ?? null;
}
