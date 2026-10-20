import { OpcionCatalogo, Papel, Privacidad } from "./catalogo-opciones";

/**
 * Tipo para los directores.
 */
export type Director = 
  | "chat" 
  | "optimizador" 
  | "diseno" 
  | "produccion" 
  | "nube" 
  | "medidores" 
  | "aprendizaje";

/**
 * Tipo para las preferencias de una asignación.
 */
export type Preferencias = {
  localPrimero: boolean;
  privacidad: Privacidad;
  presupuesto: number | null;
};

/**
 * Asignación genérica para un papel o director.
 */
export type Asignacion<K> = {
  clave: K;
  cadena: string[];
  respaldo: string[];
  preferencias: Preferencias;
};

/**
 * Devuelve las asignaciones sugeridas: comienza con las opciones locales de Astraura y continúa con las gratuitas del catálogo.
 * @param localAstraura - IDs de las opciones locales de Astraura
 * @param catalogo - Catálogo fusionado de opciones
 * @returns Array de IDs de opciones en orden sugerido
 */
export function sugeridas(
  localAstraura: string[],
  catalogo: OpcionCatalogo[]
): string[] {
  // Obtener los IDs de las opciones gratuitas del catálogo
  const gratisIds = catalogo
    .filter(opcion => opcion.gratis !== null)
    .map(opcion => opcion.id);

  // Concatenar: primero local Astraura, luego las gratuitas del catálogo
  return [...localAstraura, ...gratisIds];
}

/**
 * Fusiona las asignaciones sugeridas con las del ámbito, dando prioridad al ámbito y validando contra el catálogo.
 * @param sugeridas - IDs sugeridos por la función `sugeridas`
 * @param delAmbito - IDs asignados en el ámbito
 * @param catalogo - Catálogo fusionado de opciones para validar IDs
 * @returns Array de IDs válidos después de la fusión y validación
 */
export function fusionarConAmbito(
  sugeridas: string[],
  delAmbito: string[],
  catalogo: OpcionCatalogo[]
): string[] {
  // Paso 1: combinar con el ámbito teniendo prioridad
  // Usamos un conjunto para rastrear los IDs ya vistos en el ámbito para evitar duplicados
  const alcanceSet = new Set(delAmbito);
  // Comenzamos con las asignaciones del ámbito
  const combinado: string[] = [...delAmbito];
<<<<<<< HEAD
  // Luego añadimos las sugeridas que no estén ya en el ámbito
  for (const id of sugeridas) {
    if (!alcanceSet.has(id)) {
      combinado.push(id);
      alcanceSet.add(id); // para evitar duplicados dentro de las sugeridas también
    }
  }

  // Paso 2: validar contra el catálogo - solo mantener los IDs que existen en el catálogo
  const catalogoIds = new Set(catalogo.map(opcion => opcion.id));
  const validos: string[] = [];
  for (const id of combinado) {
    if (catalogoIds.has(id)) {
      validos.push(id);
    } else {
      // Aviso: ID desconocido descartado
      console.warn(`[genesis/conectores] fusionarConAmbito: ID "${id}" no encontrado en el catálogo, se descarta`);
    }
  }
=======
    // Luego añadimos las sugeridas que no estén ya en el ámbito
    for (const id of sugeridas) {
      if (!alcanceSet.has(id)) {
        combinado.push(id);
        alcanceSet.add(id); // para evitar duplicados dentro de las sugeridas también
      }
    }

  // Paso 2: validar contra el catálogo - solo mantener los IDs que existen en el catálogo
  const catalogoIds = new Set(catalogo.map(opcion => opcion.id));
  const validos = combinado.filter(id => catalogoIds.has(id));
>>>>>>> c333d6b1a (salvavidas · GCA1019F: trabajo del agente antes de las puertas (tsc / vitest))

  return validos;
}