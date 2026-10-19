// src/lib/modelos/plan-instalacion.ts
/**
 * Plan de instalación de modelos por neurona.
 * Con las capacidades medidas de la neurona, sus preferencias por capa y el catálogo,
 * calcula qué instalar, actualizar o quitar por área, dentro del presupuesto de disco.
 */

import type { UsoLicencia } from "@/lib/avatares/adn/adn";
import { Licencias, CapasPrefs, Contexto, ResultadoPreferencias } from "./preferencias-capas";

/**
 * Información de la neurona con capacidades medidas.
 */
export interface NeuronaVigia {
  /** Medio de acceso: web, pwa, tauri, android, ios, servidor, etc. */
  medio: string;
  /** RAM disponible en MB. */
  ramMB: number;
  /** Espacio libre en disco en MB. */
  discoLibreMB: number;
  /** GPU disponible: nvidia, amd, apple, ninguna. */
  gpu?: "nvidia" | "amd" | "apple" | "ninguna";
  /** VRAM disponible en MB (si gpu es nvidia, amd o apple). */
  vramMB?: number;
  /** Indica si el dispositivo es de Apple. */
  apple?: boolean;
  /** Sistema operativo: macos, windows, linux, etc. */
  sistema: string;
}

/**
 * Entrada del catálogo de modelos para un área.
 * Compatible con ModeloImagen de imágenes para no romper tipos existentes.
 */
export interface Entrada {
  id: string;
  nombre: string;
  licencia: string; // Licencia original (ej: "Apache-2.0", "Qwen Research License")
  uso: UsoLicencia; // De adn.ts: "libre" | "atribucion" | "condicionado" | "no-comercial" | "restringido-region"
  /** VRAM orientativa en GB. */
  vramGB: number;
  /** RAM orientativa en GB. */
  ramGB: number;
  /** Motores que pueden ejecutar el modelo. */
  motores: string[];
  /** Indica si es necesario aceptar términos con cuenta de Hugging Face. */
  gated: boolean;
  /** Identificador en Hugging Face. */
  hf: string;
  /** Tamaño del repositorio en Hugging Face (GB). */
  repoGB?: number;
  /** Número de pasos por defecto (para difusión). */
  pasos?: number;
  /** Resolución por defecto (para imágenes). */
  resolucion?: number;
  /** Capacidades del modelo. */
  capacidades?: string[];
}

/**
 * Resultado de la evaluación de preferencias efectivas.
 * Reutilizado de preferencias-capas.ts.
 */
export type ResultadoPreferenciasVigia = ResultadoPreferencias;

/**
 * Resultado del plan de instalación por área.
 */
export interface PlanArea {
  /** Modelos que se deben instalar. */
  instalar: Entrada[];
  /** Modelos que se deben actualizar (misma id, versión nueva). */
  actualizar: Entrada[];
  /** Modelos que se deben quitar. */
  quitar: Entrada[];
  /** Indica si el modelo se debe obtener de otra neurona en la malla. */
  desdeLaMalla: boolean;
  /** Motivo de la decisión. */
  motivo: string;
}

/**
 * Función pura que calcula el plan de instalación por área.
 * @param neurona - Capacidades medidas de la neurona.
 * @param catalogo - Catálogo de modelos por área.
 * @param preferencias - Preferencias por capa de conciencia.
 * @param instalados - IDs de modelos actualmente instalados en la neurona.
 * @returns Plan de instalación por área.
 */
export function planInstalacion(
  neurona: NeuronaVigia,
  catalogo: Record<string, Entrada[]>,
  preferencias: CapasPrefs,
  instalados: string[]
): Record<string, PlanArea> {
  // TODO: Implementar lógica
  return {};
}