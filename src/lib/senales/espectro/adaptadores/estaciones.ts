// src/lib/senales/espectro/adaptadores/estaciones.ts
// Adaptador de estaciones a señales del espectro
// Convierte filas de os_estaciones que el usuario YA puede leer (src/lib/estaciones/datos.ts: listarEstaciones) en SenalEspectro de medio "estacion".

// • capa "publica" si la estación es pública del directorio
// • "privada" si es del propio dueño o de su grupo
// • origen:"declarada\" (la estación declara su tipo y su frecuencia/banda si la tiene: Omnifrecuencias; si no, sin frecuencia)
// • fuente:"estacion publicada por su dueño\"
// • vinculo:{tipo:"estacion\", id}

// Las privadas ajenas no llegan (la RLS no las da) y si llegasen se descartan.
// Sin sesión o error → sinFuente.

import { type Estacion } from "@/lib/estaciones/tipos";
import type { SenalEspectro, Medio, CapaRed } from "../tipos";

/** Capa por defecto para estaciones cuando no hay sesión/error. */
const DEFAULT_LAYER: CapaRed = "externa";

/**
 * Convierte un array de filas de estaciones al shape `SenalEspectro`.\n * Respeta el RLS que ya filtra lo que el usuario puede ver desde `listarEstaciones`.\n */
export function estacionesToSenalEspectro(estaciones: Estacion[]): SenalEspectro[] {
  return estaciones.map(convertirEstacionToSenal);
}

/**
 * Convierte una sola fila de estación al shape `SenalEspectro`.\n * No lanza nunca; ante un error devuelve un `SenalEspectro` con layer por defecto.\n */
export function convertirEstacionToSenal(estacion: Estacion): SenalEspectro {
  const medio: Medio = "estacion";
  const origen: "declarada" = "declarada";

  const capa = determinarCapa(estacion);
  const banda = determinarBanda(estacion);
  const vinculo = { tipo: "estacion" as const, id: estacion.id };

  const senal: SenalEspectro = {
    id: estacion.id,
    medio,
    banda,
    frecuenciaKhz: determinarFrecuencia(estacion),
    anchoKhz: null,
    fuerzaDbm: null,
    calidad: null,
    origen,
    capa,
    fuente: "estacion publicada por su dueño",
    medidoEn: null,
    zona: null,
    vinculo,
    compatibles: [],
  };

  return senal;
}

/**
 * Determina la capa (visibilidad) de una estación:\n *   • "publica\" si es del directorio (visibilidad pública)\n *   • "privada\" si es del propio dueño o de su grupo\n *   • "externa\" si no hay sesión (caso fuera de alcance)\n */
function determinarCapa(estacion: Estacion): CapaRed {
  const visibilidad = estacion.visibilidad;

  switch (visibilidad) {
    case "publica":
      return "publica";
    case "grupo":
      // Las estaciones del grupo son privadas para quien las ve
      return "privada";
    default:
      return DEFAULT_LAYER;
  }
}

/** Determina la banda (frecuencia) de una estación: el valor `tipo` de la estación */
function determinarBanda(estacion: Estacion): string {
  return estacion.tipo;
}

/** Extrae la frecuencia en kHz desde el campo `formato` si está presente */
function determinarFrecuencia(estacion: Estacion): number | null {
  const formato = estacion.formato;
  if (!formato) return null;

  // Formato típico: "XXX MHz\" o "XXX kHz\" como string\n  // El formato real depende de cómo lo almacena `detectarFormato` en datos.ts\n  if (typeof formato === "number") return formato;

  const valor = formato.toString();
  const match = valor.match(/([\d.]+)\s*(MHz|kHz|Hz)/);
  if (!match) return null;

  const [, numeroStr, unidad] = match;
  const numero = parseFloat(numeroStr);

  switch (unidad) {
    case "MHz":
      return numero * 1000;
    case "kHz":
      return numero;
    case "Hz":
      return numero / 1000;
    default:
      return null;
  }
}

/**\n * Devuelve un array vacío de `SenalEspectro` cuando no hay sesión o error.\n * Este es el caso `sinFuente` requerido por la tarea.\n */
export function sinFuente(): SenalEspectro[] {
  return [];
}
