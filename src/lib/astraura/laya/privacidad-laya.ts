import { describe, it, expect } from "vitest";



export function privacidadEfectiva(params: {
  marcada: "persona" | "ámbito";
  reglas: string;
  laya: { answer_confidence: number } | null;
  umbral?: number;
}): { nivel: "público" | "ámbito" | "privado"; motivo: string } {
  const { marcada, reglas, laya, umbral = 0.5 } = params;

  // Map marcada to level
  const marcaLevel = marcada === "persona" ? 2 : 1; // "persona" -> 2 (privado), "ámbito" -> 1 (ámbito)

  // Map reglas to level: we assume reglas is one of "privado", "ámbito", "publico"
  let reglasLevel: number;
  switch (reglas) {
    case "privado":
      reglasLevel = 2;
      break;
    case "ámbito":
      reglasLevel = 1;
      break;
    case "publico":
      reglasLevel = 0;
      break;
    default:
      // If we don't recognize the string, we treat it as publico (0) as a safe default
      reglasLevel = 0;
  }

  // Base level is the maximum of the two (since privacy can only increase)
  let level = Math.max(marcaLevel, reglasLevel);

  // If Laya did not provide a result, we cannot change the level
  if (laya === null) {
    return {
      nivel: levelToString(level),
      motivo: "Laya no proporcionó un resultado concluyente",
    };
  }

  const { answer_confidence } = laya;

  // If the confidence is below the threshold, we do not increase the level
  if (answer_confidence < umbral) {
    return {
      nivel: levelToString(level),
      motivo: `La confianza de Laya (${answer_confidence.toFixed(2)}) está por debajo del umbral (${umbral.toFixed(2)})`,
    };
  }

  // If the confidence is above or equal to the threshold, we try to increase the level by one (but not beyond 2)
  const newLevel = Math.min(level + 1, 2);

  // If we couldn't increase (because we were already at the maximum), we stay at the same level
  if (newLevel === level) {
    return {
      nivel: levelToString(level),
      motivo: `Ya está en el nivel máximo de privacidad (${levelToString(level)}). La confianza de Laya (${answer_confidence.toFixed(2)}) no puede aumentar más el nivel.`,
    };
  }

  // We increased the level
  return {
    nivel: levelToString(newLevel),
    motivo: `Se aumentó el nivel de privacidad de ${levelToString(level)} a ${levelToString(newLevel)} por confianza de Laya (${answer_confidence.toFixed(2)})`,
  };
}

// Helper function to convert level number to string
function levelToString(level: number): "público" | "ámbito" | "privado" {
  switch (level) {
    case 2:
      return "privado";
    case 1:
      return "ámbito";
    case 0:
      return "público";
    default:
      // This should not happen
      return "público";
  }
}