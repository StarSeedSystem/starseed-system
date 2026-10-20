"use client";

/**
 * Habilidades para agentes de Genesis y PoliGenesis
 * ---------------------------------------------------
 * Selecciona las habilidades útiles para un papel o director por routing y etiquetas
 * en tamaño tarjeta, resumen o completo según la capa del modelo elegido
 * 
 * @param papel - El papel que realiza la tarea (escritor, revisor, chat, visión, voz, imagen, código)
 * @param ambito - El ámbito de ejecución (cuenta, neurona, perfil, grupo, página, etc.)
 * @param opciones - Opciones que incluyen capacidades y habilidades desactivadas
 * @returns Array de IDs de habilidades seleccionadas
 */
export function habilidadesPara(
  papel: string,
  ambito: string,
  opciones: {
    capacidades: import("@/ai/astraura/skills.ts").SkillCapability[];
    desactivadas: string[];
  }
): string[] {
  const { capacidades, desactivadas } = opciones;
  const habilidadesSeleccionadas: string[] = [];

  // Filtrar habilidades desactivadas
  const habilidadesActivas = capacidades.filter(
    (habilidad) => !desactivadas.includes(habilidad.id)
  );

  // Seleccionar habilidades según el papel
  for (const habilidad of habilidadesActivas) {
    // Verificar si la habilidad tiene el routing o etiquetas apropiadas para este papel
    const deberíaIncluir = evaluarHabilidadParaPapel(
      habilidad,
      papel,
      ambito
    );

    if (deberíaIncluir) {
      habilidadesSeleccionadas.push(habilidad.id);
    }
  }

  return habilidadesSeleccionadas;
}

/**
 * Evalúa si una habilidad es apropiada para un papel específico
 */
function evaluarHabilidadParaPapel(
  habilidad: import("@/ai/astraura/skills.ts").SkillCapability,
  papel: string,
  ambito: string
): boolean {
  // Si no hay routing definido, incluir por defecto
  if (!habilidad.routing) {
    return true;
  }

  const routing = habilidad.routing;

  // Verificar routing para el papel específico
  switch (papel) {
    case "escritor":
      // Los escritores pueden usar habilidades con preferStrong o web
      if (routing.preferStrong || routing.web) {
        return true;
      }
      break;

    case "revisor":
      // Los revisores pueden usar habilidades con preferStrong
      if (routing.preferStrong) {
        return true;
      }
      break;

    case "chat":
      // Los chats pueden usar habilidades con preferStrong, web o planning
      if (routing.preferStrong || routing.web || routing.planning) {
        return true;
      }
      break;

    case "visión":
      // Los de visión pueden usar habilidades con vision o preferStrong
      if (routing.vision || routing.preferStrong) {
        return true;
      }
      break;

    case "voz":
      // Los de voz pueden usar cualquier habilidad (la voz es específica del modelo)
      return true;

    case "imagen":
      // Los de imagen pueden usar habilidades con preferStrong
      if (routing.preferStrong) {
        return true;
      }
      break;

    case "código":
      // Los de código pueden usar habilidades con preferStrong, web o planning
      if (routing.preferStrong || routing.web || routing.planning) {
        return true;
      }
      break;

    default:
      // Para roles no reconocidos, incluir si hay routing.preferStrong
      if (routing.preferStrong) {
        return true;
      }
      break;
  }

  // Si no hay coincidencia específica con el papel, incluir si hay routing.web
  if (routing.web) {
    return true;
  }

  return false;
}