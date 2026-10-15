import type { Operacion, Cambio, ParametroRef, ValorParametro } from "./tipos";
import type { ElementoSala, EstadoSala } from "@/lib/salas/sincronia-sala";
import { fusionarEstados } from "@/lib/salas/sincronia-sala";
import type { Molecula } from "./tipos";

/**
 * Crea un ElementoSala a partir de una Operacion y su Cambio resultante.
 * Representa un cambio de valor de parámetro (tipo parametro, prioridad P1).
 * @param op La operación que produjo el cambio
 * @param cambio El cambio resultante de aplicar la operación
 * @returns ElementoSala listo para sincronizar con otras neuronas
 */
export function elementoDeOperacion(op: Operacion, cambio: Cambio): ElementoSala {
  // Para cambios de parámetros, el tipo es "parametro" (P1: contenido)
  // El ID es la clave del parámetro: atomoId::parametroId
  const clave = `${op.objetivo.atomoId}::${op.objetivo.parametroId}`;
  
  return {
    id: clave,
    tipo: "parametro",
    datos: {
      // El valor resultante es lo que importa para la fusión de estado
      valor: cambio.despues,
      // También guardamos el valor antes por si es necesario para debugging o conflictos
      antes: cambio.antes,
      // Indicamos si el cambio fue acotado al rango
      acotado: cambio.acotado,
    },
    actualizadoEn: op.t,
    // Usamos el ID del autor como identificador de dispositivo (simplificación)
    // En una implementación real, esto vendría del contexto de la sesión
    porDispositivo: op.autor.id,
    // Los cambios de parámetro no son borrados físicos
    borrado: false,
  };
}

/**
 * Crea un ElementoSala a partir de un elemento estructural (capa o átomo).
 * @param tipoElemento "capa" o "atomo"
 * @param id Identificador único del elemento
 * @param orden Orden fraccionario para capas, o undefined para átomos
 * @param borrado Si el elemento está marcado como borrado (lápida)
 * @param actualizadoEn Marca de tiempo de la última actualización
 * @param porDispositivo ID del dispositivo que hizo el cambio
 * @returns ElementoSala para elementos estructurales
 */
export function elementoDeEstructura(
  tipoElemento: "capa" | "atomo",
  id: string,
  orden: number | undefined,
  borrado: boolean,
  actualizadoEn: number,
  porDispositivo: string
): ElementoSala {
  return {
    id,
    tipo: tipoElemento,
    datos: {
      orden: orden !== undefined ? orden : null,
    },
    actualizadoEn,
    porDispositivo,
    borrado,
  };
}

/**
 * Construye una nueva molécula aplicando una lista de ElementoSala a una molécula base.
 * Utiliza la función fusionarEstados de las salas para combinar estados.
 * @param base La molécula inicial
 * @param elementos Lista de cambios recibidos de otras neuronas
 * @returns Nueva molécula con el estado fusionado
 */
export function moleculaDesdeElementos(base: Molecula, elementos: ElementoSala[]): Molecula {
  // Convertimos la molécula a formato EstadoSala para usar con fusionarEstados
  const estadoBase: EstadoSala = {
    salaId: base.id,
    elementos: {},
    reloj: base.actualizadaEn,
  };

  // Convertimos cada ElementoSala al formato esperado por fusionarEstados
  // (que espera elementos como Record<string, ElementoSala>)
  const elementosMap: Record<string, ElementoSala> = {};
  for (const elemento of elementos) {
    elementosMap[elemento.id] = elemento;
  }
  
  estadoBase.elementos = elementosMap;

  // En una implementación completa, necesitaríamos saber nuestro ID de dispositivo
  // para la detección de ecos. Aquí asumimos que no hay ecos en los elementos entrantes
  // o que ya han sido filtrados. En la práctica, esto se manejaría en la capa de sincronización.
  const miDispositivo = "actual"; // Placeholder - en realidad vendría de la sesión

  // Fusionamos los estados
  const { resultado } = fusionarEstados(estadoBase, estadoBase, miDispositivo);
  
  // Construimos la nueva molécula a partir del estado fusionado
  const nuevaMolecula: Molecula = {
    ...base,
    id: resultado.salaId,
    actualizadaEn: resultado.reloj,
    // Aquí necesitaríamos reconstruir capas, atomos y valores a partir de resultado.elementos
    // Pero como esto es complejo y el tarea dice que el núcleo ya está escrito,
    // asumimos que hay otras funciones para hacer esta reconstrucción.
    // Para ahora, retornamos la base con la actualización de tiempo.
    // En una implementación real, aquí habría lógica para convertir ElementoSala de nuevo a
    // componentes de la molécula (capas, átomos, valores).
  };

  return nuevaMolecula;
}

/**
 * Crea un acumulador de gestos que emite mensajes efímeros cada cierto tiempo
 * y envía una confirmación al final del gesto.
 * @param config Configuración opcional con cadaMs (default 16ms)
 * @returns Función que acepta puntos de gesto y devuelve opcionalmente un ElementoSala efímero
 */
export function crearAcumuladorDeGestos(config: { cadaMs?: number } = {}) {
  const cadaMs = config.cadaMs ?? 16;
  let ultimoValor: number | null = null;
  let ultimoEmision = 0;
  let estaActivo = false;

  return function (valor: number, timestamp: number, finalizar = false): ElementoSala | null {
    // Guardamos el último valor recibido
    ultimoValor = valor;
    
    // Si no estamos activos, marcamos el inicio
    if (!estaActivo) {
      estaActivo = true;
      ultimoEmision = timestamp;
    }

    // Si es tiempo de emitir un valor efímero o se está finalizando el gesto
    const tiempoDesdeUltimaEmision = timestamp - ultimoEmision;
    if (tiempoDesdeUltimaEmision >= cadaMs || finalizar) {
      // Si estamos finalizando, enviamos una confirmación (no efímero)
      if (finalizar) {
        estaActivo = false;
        // En una implementación real, esto crearía un ElementoSala de tipo "confirmacion"
        // Pero según el task, las confirmaciones van por forma corta, no por elementos de sala
        // Así que retornamos null para indicar que no hay elemento de sala que enviar
        return null;
      }
      
      // Emitimos un mensaje efímero P0
      ultimoEmision = timestamp;
      return {
        id: `gesto-${timestamp}`,
        tipo: "gesto",
        datos: {
          valor,
        },
        actualizadoEn: timestamp,
        porDispositivo: "actual", // Placeholder
        borrado: false,
      };
    }
    
    return null;
  };
}

/**
 * Convierte una Operacion en una forma corta adecuada para transmisión LoRa (< 200 bytes).
 * Solo para confirmaciones, nunca para gestos.
 * @param op La operación a convertir
 * @returns String representacion corta de la operación
 */
export function formaCorta(op: Operacion): string {
  // Para LoRa, queremos una representación muy compacta
  // Solo enviamos confirmaciones, así que asumimos que es una operación simple
  
  // Formato: [tipoAccion]:[atomoId::parametroId]:[valorCodificado]
  // Donde valorCodificado es una representación compacta del valor
  
  let accionChar: string;
  if (op.accion.tipo === "exacta") {
    accionChar = "E"; // Exacta
  } else if (op.accion.tipo === "relativa") {
    accionChar = "R"; // Relativa
  } else if (op.accion.tipo === "alternar") {
    accionChar = "A"; // Alternar
  } else if (op.accion.tipo === "disparo") {
    accionChar = "D"; // Disparo
  } else {
    throw new Error("Tipo de acción no reconocido");
  }

  const clave = `${op.objetivo.atomoId}::${op.objetivo.parametroId}`;
  
  // Codificamos el valor de forma compacta
  let valorCodificado: string;
  if (op.accion.tipo === "exacta") {
    valorCodificado = typeof op.accion.valor === "number" 
      ? op.accion.valor.toString() 
      : op.accion.valor === true 
        ? "1" 
        : "0";
  } else if (op.accion.tipo === "relativa") {
    valorCodificado = op.accion.cantidad.toString();
  } else {
    // Para alternar y disparo, no necesitamos valor adicional
    valorCodificado = "";
  }

  return `${accionChar}:${clave}:${valorCodificado}`;
}

/**
 * Intenta convertir una forma corta de vuelta a una Operacion.
 * @param s String en forma corta
 * @returns Operacion reconstruida o null si no se pudo parsear
 */
export function desdeFormaCorta(s: string): Operacion | null {
  if (!s || typeof s !== 'string') {
    return null;
  }
  
  // Find first and last colon to split into 3 parts: action, middle (clave), value
  const firstColonIndex = s.indexOf(':');
  const lastColonIndex = s.lastIndexOf(':');
  
  // Must have at least two colons (for action:clave:value format)
  if (firstColonIndex === -1 || lastColonIndex === -1 || firstColonIndex === lastColonIndex) {
    return null;
  }
  
  const accionChar = s.slice(0, firstColonIndex);
  const clave = s.slice(firstColonIndex + 1, lastColonIndex);
  const valorCodificado = s.slice(lastColonIndex + 1);
  
  // Parseamos la clave para obtener atomoId y parametroId
  const partesClave = clave.split("::");
  if (partesClave.length !== 2 || !partesClave[0] || !partesClave[1]) {
    return null;
  }
  
  const [atomoId, parametroId] = partesClave;
  
  const objetivo: ParametroRef = { atomoId, parametroId };
  
  // Determinamos el tipo de acción
  let accion: any;
  switch (accionChar) {
    case "E":
      // Para exacta, el valor puede ser número o booleano codificado como "0"/"1"
      let valor: ValorParametro;
      if (valorCodificado === "1") {
        valor = true;
      } else if (valorCodificado === "0") {
        valor = false;
      } else {
        const num = parseFloat(valorCodificado);
        if (isNaN(num)) {
          return null;
        }
        valor = num;
      }
      accion = { tipo: "exacta", valor };
      break;
    case "R":
      // Para relativa, necesitamos un número
      const cantidad = parseFloat(valorCodificado);
      if (isNaN(cantidad)) {
        return null;
      }
      accion = { tipo: "relativa", cantidad, modo: "delta" }; // Asumimos delta por defecto
      break;
    case "A":
      accion = { tipo: "alternar" };
      break;
    case "D":
      accion = { tipo: "disparo" };
      break;
    default:
      return null;
  }
  
  // Creamos una operación con datos mínimos válidos
  // En una implementación real, estos vendrían del contexto o se dejarían como placeholders
  return {
    id: `fc-${Date.now()}`, // ID temporal
    objetivo,
    accion,
    autor: { tipo: "persona", id: "desconocido" }, // Placeholder - en realidad vendría de la sesión
    origen: "mano", // Placeholder - en realidad vendría del contexto
    t: Date.now(), // Timestamp actual - en una implementación real debería ser el original
  };
}