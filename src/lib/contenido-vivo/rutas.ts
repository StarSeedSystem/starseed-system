/** Elección de ruta de «Contenido vivo» (CVV1028, tarea B). Módulo puro, sin red,
 * disco ni React. `conectados` y `cupoHoy` admiten el id exacto o el prefijo del servicio. */

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

export interface ComparacionRuta {
  ruta: Ruta;
  puntuacion: number;
  disponible: boolean;
  motivoNoDisponible?: string;
  razon: string;
}

const FRASES: Record<TareaViva, string> = {
  "escena-3d": "una escena interactiva",
  "fotograma-clave": "un fotograma clave",
  foto: "una foto",
  "clip-pelicula": "una película",
  "foto-viva": "una foto viva",
  "grafico-vivo": "un gráfico vivo",
  "revision-texto": "una revisión de texto",
  comprobacion: "una comprobación",
};

const estaConectada = (ruta: Ruta, conectados: string[]): boolean =>
  conectados.some((clave) => ruta.id === clave || ruta.id.startsWith(clave + "-"));

function cupoDe(ruta: Ruta, contexto: ContextoRutas): number | undefined {
  if (contexto.cupoHoy[ruta.id] !== undefined) return contexto.cupoHoy[ruta.id];
  const clave = Object.keys(contexto.cupoHoy).find((item) => ruta.id.startsWith(item + "-"));
  return clave === undefined ? undefined : contexto.cupoHoy[clave];
}
function creditosRestantes(contexto: ContextoRutas): number {
  const porTope = contexto.topeMes > 0
    ? Math.max(0, contexto.topeMes - contexto.gastadoMes)
    : contexto.creditosDisponibles;
  return Math.min(contexto.creditosDisponibles, porTope);
}

function motivoNoDisponible(ruta: Ruta, contexto: ContextoRutas): string | undefined {
  if (ruta.tipo === "externo") {
    if (!contexto.ajustes.externosPermitidos) return "Los servicios externos no están permitidos en este ámbito.";
    if (contexto.alcance === "personal") return "El alcance personal no sale de la neurona sin permiso explícito.";
    if (!estaConectada(ruta, contexto.conectados)) {
      return `Sin conectar: ${ruta.enlaceConectar ?? "falta el enlace de conexión"}.`;
    }
    const cupo = cupoDe(ruta, contexto);
    if (cupo !== undefined && cupo < ruta.creditosPorUnidad) return `Hoy no queda cupo en ${ruta.nombre}.`;
    if (ruta.creditosPorUnidad > creditosRestantes(contexto)) {
      return `No quedan créditos suficientes este mes para ${ruta.nombre}.`;
    }
    return undefined;
  }
  if (ruta.requiere.includes("gpu") && !contexto.neurona.gpu) {
    return `La neurona no tiene GPU suficiente para ${ruta.nombre}.`;
  }
  if (ruta.requiere.includes("neurona-capaz") && !contexto.neurona.capaz3d) {
    return `La neurona no es capaz de ejecutar ${ruta.nombre}.`;
  }
  return undefined;
}
function puntuacionDe(ruta: Ruta, tarea: TareaViva, contexto: ContextoRutas): number {
  const calidad = ruta.calidad[tarea] ?? 0;
  if (ruta.creditosPorUnidad <= 0) return calidad;
  const tope = contexto.topeMes > 0 ? contexto.topeMes : ruta.creditosPorUnidad;
  return calidad - Math.min(1, ruta.creditosPorUnidad / tope);
}
function razonDe(ruta: Ruta, tarea: TareaViva, disponible: boolean, motivo?: string): string {
  if (!disponible) return motivo ?? `No disponible para ${FRASES[tarea]}.`;
  if (ruta.tipo === "local") return `Local: ${ruta.nombre} basta para ${FRASES[tarea]} y no gasta créditos.`;
  const coste = ruta.creditosPorUnidad > 0
    ? `cuesta ${ruta.creditosPorUnidad} créditos por ${ruta.unidad}`
    : `no tiene coste medido por ${ruta.unidad}`;
  return `Externo: ${ruta.nombre} encaja con ${FRASES[tarea]} y ${coste}.`;
}
function evaluarRuta(ruta: Ruta, tarea: TareaViva, contexto: ContextoRutas): ComparacionRuta {
  const motivo = motivoNoDisponible(ruta, contexto);
  const disponible = motivo === undefined;
  return {
    ruta,
    puntuacion: disponible ? puntuacionDe(ruta, tarea, contexto) : 0,
    disponible,
    ...(motivo === undefined ? {} : { motivoNoDisponible: motivo }),
    razon: razonDe(ruta, tarea, disponible, motivo),
  };
}

export function compararRutas(tarea: TareaViva, contexto: ContextoRutas): ComparacionRuta[] {
  const filas = CATALOGO_RUTAS
    .filter((ruta) => ruta.tareas.includes(tarea))
    .map((ruta) => evaluarRuta(ruta, tarea, contexto));
  filas.sort((a, b) => b.puntuacion - a.puntuacion || a.ruta.nombre.localeCompare(b.ruta.nombre));
  if (contexto.ajustes.localPrimero) {
    const externa = filas.find((fila) => fila.disponible && fila.ruta.tipo === "externo");
    if (externa) {
      const indice = filas.findIndex(
        (fila) => fila.disponible && fila.ruta.tipo === "local" &&
          fila.puntuacion >= externa.puntuacion - 0.1,
      );
      if (indice > 0) filas.unshift(filas.splice(indice, 1)[0]);
    }
  }
  return filas;
}

export function elegirRuta(tarea: TareaViva, contexto: ContextoRutas): Ruta | null {
  return compararRutas(tarea, contexto).find((fila) => fila.disponible)?.ruta ?? null;
}
