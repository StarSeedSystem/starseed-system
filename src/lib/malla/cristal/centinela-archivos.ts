/*
 * centinela-archivos — Decisión de entrada de archivos basada en análisis y resonancia (Ola 1012Q).
 * ═════════════════════════════════════════════════════════════════════════════
 * Implementa la lógica de decisión para aceptar, rechazar o avisar sobre archivos
 * entrantes en la malla de sílice amorfa (SiO₂).
 */

import type { Nivel, ResultadoAnalisis } from "./centinela";
import type { DecisionResonancia, ResultadoResonancia } from "./resonancias";

/**
 * Resultado de la decisión de entrada de archivo.
 */
export type DecisionEntrada =
  | { accion: "aceptar-con-pregunta"; texto: string }
  | { accion: "avisar"; texto: string }
  | { accion: "rechazar"; texto: string };

/**
 * Determina la acción a tomar basada en el análisis del archivo y la resonancia de la red.
 *
 * @param analisis - Resultado del análisis local del archivo (nivel y motivos)
 * @param resonancia - Resultado de la resonancia de la red (puede ser null si no hay datos)
 * @return Decisión de entrada con acción y texto explicativo
 */
export function decidirEntrada(
  analisis: ResultadoAnalisis,
  resonancia: ResultadoResonancia | null
): DecisionEntrada {
  // Caso 1: Peligroso según análisis local O cuarentena según resonancia → rechazar
  if (
    analisis.nivel === "peligroso" ||
    (resonancia !== null && resonancia.decision === "cuarentena")
  ) {
    const motivosAnalisis = analisis.motivos.length > 0 ? analisis.motivos.join(", ") : "";
    const motivoResonancia =
      resonancia !== null && resonancia.decision === "cuarentena"
        ? resonancia.motivo
        : "";

    let texto = "Archivo rechazado: ";
    const partes = [];
    if (motivosAnalisis) partes.push(`Análisis local: ${motivosAnalisis}`);
    if (motivoResonancia) partes.push(`Red: ${motivoResonancia}`);
    texto += partes.join(" - ");

    return { accion: "rechazar", texto };
  }

  // Caso 2: Sospechoso según análisis local O aviso según resonancia → avisar con motivos
  if (
    analisis.nivel === "sospechoso" ||
    (resonancia !== null && resonancia.decision === "aviso")
  ) {
    const motivosAnalisis = analisis.motivos.length > 0 ? analisis.motivos.join(", ") : "";
    const motivoResonancia =
      resonancia !== null && resonancia.decision === "aviso"
        ? resonancia.motivo
        : "";

    let texto = "Precaución: ";
    const partes = [];
    if (motivosAnalisis) partes.push(`Análisis local: ${motivosAnalisis}`);
    if (motivoResonancia) partes.push(`Red: ${motivoResonancia}`);
    texto += partes.join(" - ");

    return { accion: "avisar", texto };
  }

  // Caso 3: Todo lo demás → preguntar (comportamiento por defecto)
  return {
    accion: "aceptar-con-pregunta",
    texto: "¿Aceptar este archivo?",
  };
}