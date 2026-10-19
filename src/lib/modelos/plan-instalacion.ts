export function planInstalacion(
  neurona: NeuronaVigia,
  catalogo: Record<string, Entrada[]>,
  preferencias: CapasPrefs,
  instalados: string[]
): Record<string, PlanArea> {
  const resultado: Record<string, PlanArea> = {};

  // Determinamos el contexto de uso para las preferencias.
  // Por defecto, asumimos contexto "publico" si no se especifica otro.
  // En una implementación real, el contexto vendría de la configuración de la neurona.
  const contexto: Contexto = "publico";

  // Iteramos sobre cada área en el catálogo
  for (const [area, entradas] of Object.entries(catalogo)) {
    const planArea: PlanArea = {
      instalar: [],
      actualizar: [],
      quitar: [],
      desdeLaMalla: false,
      motivo: "",
    };

    // Separamos las entradas en aquellas que cumplen con preferencias y hardware
    const entradasValidas: Entrada[] = [];
    const entradasNoValidas: Entrada[] = [];

    for (const entrada of entradas) {
      if (!licenciaPermitida(entrada, preferencias, contexto)) {
        entradasNoValidas.push(entrada);
        continue;
      }

      const cabeResult = cabeEnNeurona(entrada, neurona);
      if (!cabeResult.ok) {
        entradasNoValidas.push(entrada);
        continue;
      }

      // Guardamos el resultado de cabe para usarlo después
      entrada["_cabeResult"] = cabeResult;
      entradasValidas.push(entrada);
    }

    // Determinamos qué instalar: entradas válidas que no están instaladas
    for (const entrada of entradasValidas) {
      if (!instalados.includes(entrada.id)) {
        planArea.instalar.push(entrada);
      }
    }

    // Determinamos qué quitar: entradas instaladas que ya no son válidas o no están en el catálogo
    // Asumimos que instalados contiene IDs de modelos instalados en esta área.
    // En una implementación real, necesitaríamos saber a qué área pertenece cada ID instalado.
    // Por simplicidad, asumimos que si un ID está en instalados y no está en las entradas del catálogo
    // de esta área, entonces debe ser quitado de esta área.
    // Nota: Esto no es perfecto porque el mismo ID podría estar en otra área, pero asumimos que los IDs son únicos entre áreas.
    for (const idInstalado of instalados) {
      const entradaExistente = entradas.find(e => e.id === idInstalado);
      if (!entradaExistente) {
        // El modelo instalado ya no está en el catálogo de esta área: marcar para quitar
        const entradaParaQuitar: Entrada | undefined = entradas.find(e => e.id === idInstalado);
        if (entradaParaQuitar) {
          planArea.quitar.push(entradaParaQuitar);
        }
      } else if (
        !licenciaPermitida(entradaExistente, preferencias, contexto) ||
        !cabeEnNeurona(entradaExistente, neurona).ok
      ) {
        // El modelo instalado ya no cumple con preferencias o hardware
        planArea.quitar.push(entradaExistente);
      }
    }

    // Actualizar: por ahora no implementamos actualizaciones por falta de información de versión
    // En una implementación real, compararíamos versiones del mismo modelo.

    // Construimos el motivo del plan
    const motivos = [];
    if (planArea.instalar.length > 0) {
      motivos.push(`Instalar ${planArea.instalar.length} modelo(s)`);
    }
    if (planArea.actualizar.length > 0) {
      motivos.push(`Actualizar ${planArea.actualizar.length} modelo(s)`);
    }
    if (planArea.quitar.length > 0) {
      motivos.push(`Quitar ${planArea.quitar.length} modelo(s)`);
    }
    if (motivos.length === 0) {
      planArea.motivo = "No se requieren cambios.";
    } else {
      planArea.motivo = motivos.join(", ") + ".";
    }

    resultado[area] = planArea;
  }

  return resultado;
}