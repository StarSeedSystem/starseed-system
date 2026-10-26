/**
 * GENESIS · ESCALERA DE CANDIDATOS (Ola 1019G)
 * 
 * Este módulo es PURO: no hace I/O, solo procesa los datos de entrada.
 * 
 * @param tarea - La tarea para la que se eligen candidatos.
 * @param ofertas - Ofertas disponibles en el contexto (neuronas, modelos locales, etc.).
 * @param catalogo - Catálogo unificado de opciones (modelos, proveedores, contenedores, etc.).
 * @param vinculadas - Conjunto de IDs de opciones ya vinculadas (ej. cuentas de proveedores).
 * @param preferencias - Preferencias del ámbito respecto al pago y límites.
 * @returns Lista ordenada de candidatos con su peldaño y motivo.
 */

import { OpcionCatalogo, Papel } from './catalogo-opciones';

// Definimos el tipo de la tarea
interface Tarea {
  papel: Papel;
  privado: boolean;
  tamano: number; // Asumimos que es un número (por ejemplo, tokens estimados)
}

// Definimos el tipo de una oferta del contexto
interface OfertaContexto {
  id: string; // ID único de la oferta
  nombre: string; // Nombre legible
  tipo: OpcionCatalogo['tipo']; // Tipo de opción (modelo, proveedor, contenedor, herramienta, habilidad, conector)
  papel: Papel[]; // Papeles para los que sirve esta oferta
  // Otros campos que puedan ser relevantes para la potencia o disponibilidad
  // Por ahora, dejamos la estructura abierta y la iremos completando según necesitemos.
  [key: string]: unknown;
}

// Definimos el tipo de las preferencias
interface Preferencias {
  permitirPago: boolean;
  topeDiario: number | null; // En alguna unidad (por ejemplo, USD o tokens)
  prohibidos: string[]; // IDs de opciones prohibidas
}

// Definimos el tipo de la salida
interface Candidato {
  candidatoId: string;
  peldano: 1 | 2 | 3 | 4 | 5 | 6;
  motivo: string;
}

/**
 * Determina si una opción está disponible en el paso 1 (Astraura en el propio contexto).
 */
function isAvailableAtStep1(option: OpcionCatalogo, tarea: Tarea, ofertas: OfertaContexto[]): boolean {
  // Para simplificar, consideramos que una opción de tipo "modelo" y con id que contiene "astraura-158" está disponible en el paso 1 si está en las ofertas.
  // En una implementación real, verificaríamos si es una instancia local de Astraura 1.58 de la cuenta o de los servidores del cerebro.
  if (option.tipo !== 'modelo') {
    return false;
  }
  // Verificamos si la opción está en las ofertas (disponible localmente)
  const isInOfertas = ofertas.some(oferta => oferta.id === option.id);
  if (!isInOfertas) {
    return false;
  }
  // Además, verificamos que el papel de la tarea esté entre los papeles de la opción
  const papelMatch = option.papeles.includes(tarea.papel);
  if (!papelMatch) {
    return false;
  }
  // Por ahora, omitimos la verificación de potencia basada en tamano y medidas.
  return true;
}

/**
 * Determina si una opción está disponible en el paso 2 (Otros modelos locales del contexto).
 */
function isAvailableAtStep2(option: OpcionCatalogo, tarea: Tarea, ofertas: OfertaContexto[]): boolean {
  // Para el paso 2, consideramos otros modelos locales (no Astraura 1.58) que estén en las ofertas.
  if (option.tipo !== 'modelo') {
    return false;
  }
  // Excluimos las opciones de Astraura 1.58 (asumimos que tienen id que contiene "astraura-158")
  if (option.id.includes('astraura-158')) {
    return false;
  }
  // Verificamos si la opción está en las ofertas (disponible localmente)
  const isInOfertas = ofertas.some(oferta => oferta.id === option.id);
  if (!isInOfertas) {
    return false;
  }
  // Verificamos coincidencia de papel
  const papelMatch = option.papeles.includes(tarea.papel);
  if (!papelMatch) {
    return false;
  }
  // Omitimos verificación de potencia por ahora.
  return true;
}

/**
 * Determina si una opción está disponible en el paso 3 (Bolsa de la malla).
 */
function isAvailableAtStep3(option: OpcionCatalogo, tarea: Tarea, preferencias: Preferencias): boolean {
  // El paso 3 está prohibido para tareas privadas.
  if (tarea.privado) {
    return false;
  }
  // Consideramos modelos y proveedores que sean gratuitos y no prohibidos.
  if (option.tipo !== 'modelo' && option.tipo !== 'proveedor') {
    return false;
  }
  // Verificamos que sea gratuito (gratis no nulo)
  if (option.gratis === null) {
    return false;
  }
  // Verificamos que no esté prohibido (usando la lista de preferencias)
  if (preferencias.prohibidos.includes(option.id)) {
    return false;
  }
  // Omitimos otros factores como confianza y capacidad pública por ahora.
  return true;
}

/**
 * Determina si una opción está disponible en el paso 4 (Contenedores gratuitos del contexto).
 */
function isAvailableAtStep4(option: OpcionCatalogo, tarea: Tarea, preferencias: Preferencias): boolean {
  // Consideramos solo contenedores que sean gratuitos.
  if (option.tipo !== 'contenedor') {
    return false;
  }
  // Verificamos que sea gratuito
  if (option.gratis === null) {
    return false;
  }
  // Omitimos verificación de disponibilidad local de contenedores por ahora.
  return true;
}

/**
 * Determina si una opción está disponible en el paso 5 (Proveedores gratuitos en la nube vinculados).
 */
function isAvailableAtStep5(option: OpcionCatalogo, tarea: Tarea, vinculadas: Set<string>, preferencias: Preferencias): boolean {
  // Consideramos solo proveedores que sean gratuitos y vinculados.
  if (option.tipo !== 'proveedor') {
    return false;
  }
  // Verificamos que sea gratuito
  if (option.gratis === null) {
    return false;
  }
  // Verificamos que esté vinculado (su ID está en el conjunto de vinculadas)
  if (!vinculadas.has(option.id)) {
    return false;
  }
  // Verificamos que no esté prohibido (usando la lista de preferencias)
  if (preferencias.prohibidos.includes(option.id)) {
    return false;
  }
  return true;
}

/**
 * Determina si una opción está disponible en el paso 6 (De pago con permiso).
 */
function isAvailableAtStep6(option: OpcionCatalogo, tarea: Tarea, preferencias: Preferencias): boolean {
  // El paso 6 solo se considera si se permite el pago.
  if (!preferencias.permitirPago) {
    return false;
  }
  // Consideramos solo proveedores de pago.
  if (option.tipo !== 'proveedor') {
    return false;
  }
  // Un proveedor de pago se identifica por tener gratis: null (en el catálogo unificado, los gratuitos tienen gratis no nulo).
  if (option.gratis !== null) {
    return false;
  }
  // Verificamos que no esté prohibido (usando la lista de preferencias)
  if (preferencias.prohibidos.includes(option.id)) {
    return false;
  }
  // Verificamos el tope diario: si se especifica un tope, asumimos que podemos usarlo si el tope es mayor que 0.
  // En una implementación real, verificaríamos el uso actual contra el tope.
  if (preferencias.topeDiario !== null && preferencias.topeDiario <= 0) {
    return false;
  }
  // Omitimos verificación de papel por ahora.
  return true;
}

/**
 * Elige candidatos para una tarea siguiendo la escalera de Genesis Abierto.
 * 
 * @param params - Parámetros de entrada.
 * @returns Lista ordenada de candidatos.
 */
export function elegirCandidatos(params: {
  tarea: Tarea;
  ofertas: OfertaContexto[];
  catalogo: OpcionCatalogo[];
  vinculadas: Set<string>;
  preferencias: Preferencias;
}): Candidato[] {
  const { tarea, ofertas, catalogo, vinculadas, preferencias } = params;
  const candidatos: Candidato[] = [];

  // Para cada opción en el catálogo, determinamos el paso más alto (menor número) para el cual está disponible.
  for (const option of catalogo) {
    let peldano: 1 | 2 | 3 | 4 | 5 | 6 | null = null;
    let motivo = '';

    // Verificamos los pasos en orden de prioridad (1 es el más alto).
    if (isAvailableAtStep1(option, tarea, ofertas)) {
      peldano = 1;
      motivo = 'Astraura local disponible';
    } else if (isAvailableAtStep2(option, tarea, ofertas)) {
      peldano = 2;
      motivo = 'Modelo local disponible';
    } else if (isAvailableAtStep3(option, tarea, preferencias)) {
      peldano = 3;
      motivo = 'Disponible en la bolsa de la malla';
    } else if (isAvailableAtStep4(option, tarea, preferencias)) {
      peldano = 4;
      motivo = 'Contenedor gratuito disponible';
    } else if (isAvailableAtStep5(option, tarea, vinculadas, preferencias)) {
      peldano = 5;
      motivo = 'Proveedor gratuito vinculado disponible';
    } else if (isAvailableAtStep6(option, tarea, preferencias)) {
      peldano = 6;
      motivo = 'Proveedor de pago disponible con permiso';
    }

    // Si encontramos un peldano válido, agregamos el candidato.
    if (peldano !== null) {
      candidatos.push({
        candidatoId: option.id,
        peldano,
        motivo,
      });
    }
  }

  // Ordenamos los candidatos por peldano (ascendente) y luego por ID para determinismo.
  candidatos.sort((a, b) => {
    if (a.peldano !== b.peldano) {
      return a.peldano - b.peldano;
    }
    return a.candidatoId.localeCompare(b.candidatoId);
  });

  return candidatos;
}

export type { Tarea, OfertaContexto, Preferencias, Candidato, OpcionCatalogo };