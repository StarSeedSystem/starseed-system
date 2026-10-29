/**
 * Elección de ruta de «Contenido vivo» (CVV1028, tarea B). Módulo puro.
 * Contrato: `architecture/contenido-vivo.md` §3.
 */
import type { Ruta, TareaViva } from "./tipos";
import { CATALOGO_RUTAS } from "./catalogo-rutas";
export type AlcanceVivo = "personal" | "perfil" | "grupo" | "publica";
export interface ContextoRutas {
  alcance: AlcanceVivo;
  conectados: string[];
  cupoHoy: Record<string, number>;
  creditosDisponibles: number; topeMes: number; gastadoMes: number;
  neurona: { gpu: boolean; capaz3d: boolean };
  ajustes: { localPrimero: boolean; externosPermitidos: boolean };
}
export interface RutaEvaluada {
  ruta: Ruta;
  puntuacion: number; disponible: boolean;
  motivoNoDisponible?: string;
  razon: string;
}
const DESCRIPCION: Record<TareaViva, string> = {
  "escena-3d": "una escena interactiva", "fotograma-clave": "un fotograma clave",
  foto: "una foto", "clip-pelicula": "un clip de película",
  "foto-viva": "una foto viva", "grafico-vivo": "un gráfico vivo",
  "revision-texto": "la revisión de un texto", comprobacion: "la comprobación",
};
const SERVICIOS = ["google-flow", "higgsfield", "spline"];
function servicioDeRuta(id: string): string {
  const conocido = SERVICIOS.find((servicio) => id === servicio || id.startsWith(`${servicio}-`));
  return conocido ?? id.split("-")[0];
}
function estaConectada(ruta: Ruta, contexto: ContextoRutas): boolean {
  const servicio = servicioDeRuta(ruta.id);
  return contexto.conectados.some((conectado) => conectado === ruta.id || conectado === servicio);
}

function motivoNoDisponible(ruta: Ruta, contexto: ContextoRutas): string | null {
  if (ruta.tipo === "externo") {
    const enlace = ruta.enlaceConectar ?? "los ajustes del ámbito";
    if (contexto.alcance === "personal") {
      return "El alcance personal no puede salir de la neurona sin permiso.";
    }
    if (!contexto.ajustes.externosPermitidos) {
      return "Los servicios externos no están permitidos en este ámbito.";
    }
    if (ruta.requiere.includes("conector") && !estaConectada(ruta, contexto)) {
      return `No está conectado. Conéctalo en ${enlace}.`;
    }
    const cupo = contexto.cupoHoy[ruta.id] ?? contexto.cupoHoy[servicioDeRuta(ruta.id)];
    if (typeof cupo === "number" && cupo <= 0) return `Sin cupo hoy en ${ruta.nombre}.`;
  }
  const coste = ruta.creditosPorUnidad;
  if (coste > 0 && coste > contexto.creditosDisponibles) {
    return `Sin créditos disponibles: hacen falta ${coste} y quedan ${contexto.creditosDisponibles}.`;
  }
  if (coste > 0 && contexto.topeMes > 0 && contexto.gastadoMes + coste > contexto.topeMes) {
    return `Supera el tope mensual del ámbito (${contexto.topeMes} créditos).`;
  }
  if (ruta.requiere.includes("gpu") && !contexto.neurona.gpu) {
    return "La neurona no tiene GPU suficiente para esta tarea.";
  }
  if (ruta.requiere.includes("neurona-capaz") && !contexto.neurona.capaz3d) {
    return "La neurona no es capaz de generar contenido 3D.";
  }
  return null;
}

function puntuacion(ruta: Ruta, tarea: TareaViva, contexto: ContextoRutas): number {
  const calidad = ruta.calidad[tarea] ?? 0;
  const tope = contexto.topeMes > 0 ? contexto.topeMes : 1;
  const costeRelativo = Math.min(1, ruta.creditosPorUnidad / tope);
  return Math.round(Math.max(0, calidad - costeRelativo) * 1000) / 1000;
}

function razonDe(ruta: Ruta, tarea: TareaViva, motivo: string | null): string {
  if (motivo) return motivo;
  const descripcion = DESCRIPCION[tarea];
  if (ruta.tipo === "local") {
    return `Local: ${ruta.nombre} basta para ${descripcion} y no gasta créditos.`;
  }
  const coste = ruta.creditosPorUnidad === 0 ? "sin coste medido" : `por ${ruta.creditosPorUnidad} créditos`;
  return `Externo: ${ruta.nombre} gana en ${descripcion} ${coste}.`;
}

function evaluar(ruta: Ruta, tarea: TareaViva, contexto: ContextoRutas): RutaEvaluada {
  const motivo = motivoNoDisponible(ruta, contexto);
  return {
    ruta, puntuacion: motivo ? 0 : puntuacion(ruta, tarea, contexto),
    disponible: motivo === null, ...(motivo ? { motivoNoDisponible: motivo } : {}),
    razon: razonDe(ruta, tarea, motivo),
  };
}

function ordenar(a: RutaEvaluada, b: RutaEvaluada): number {
  if (a.disponible !== b.disponible) return a.disponible ? -1 : 1;
  if (b.puntuacion !== a.puntuacion) return b.puntuacion - a.puntuacion;
  if (a.ruta.tipo !== b.ruta.tipo) return a.ruta.tipo === "local" ? -1 : 1;
  if (a.ruta.latenciaS !== b.ruta.latenciaS) return a.ruta.latenciaS - b.ruta.latenciaS;
  return a.ruta.id.localeCompare(b.ruta.id);
}

/** Compara las rutas que saben hacer la tarea, de mejor a peor y con su motivo. */
export function compararRutas(tarea: TareaViva, contexto: ContextoRutas): RutaEvaluada[] {
  const evaluadas = CATALOGO_RUTAS.filter((ruta) => ruta.tareas.includes(tarea))
    .map((ruta) => evaluar(ruta, tarea, contexto)).sort(ordenar);
  if (!contexto.ajustes.localPrimero) return evaluadas;
  const disponibles = evaluadas.filter((evaluada) => evaluada.disponible);
  const mejorLocal = disponibles.find((evaluada) => evaluada.ruta.tipo === "local");
  const mejorExterno = disponibles.find((evaluada) => evaluada.ruta.tipo === "externo");
  if (mejorLocal && mejorExterno && mejorLocal.puntuacion >= mejorExterno.puntuacion - 0.1) {
    return [mejorLocal, ...evaluadas.filter((evaluada) => evaluada !== mejorLocal)];
  }
  return evaluadas;
}

/** La primera ruta disponible, o `null` si ninguna puede usarse. */
export function elegirRuta(tarea: TareaViva, contexto: ContextoRutas): Ruta | null {
  return compararRutas(tarea, contexto).find((evaluada) => evaluada.disponible)?.ruta ?? null;
}
