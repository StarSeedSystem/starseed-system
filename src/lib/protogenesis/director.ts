/**
 * ProtoGenesis · Director: intención → plan validado (PG1013F)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Contratación: architecture/protogenesis.md §2 y architecture/protomolecula.md §3·7·8.
 */

import type { Encargo } from "./encargo";
import type { Plan, Paso, validarPlan } from "./encargo";
import type { Ambito, Computo } from "@/lib/protomolecula/tipos";
import { validarPlan as validarPlanFunc } from "./encargo";

/**
 * Crea el prompt para el director que convierte la intención en un plan.
 * Pide SOLO JSON {pasos: [...]} con el esquema de Paso, máximo 24,
 * criterios comprobables, en español; lista de átomos acotada a 40.
 */
export function promptDirector(
  encargo: Encargo,
  atomos: Array<{ id: string; nombre: string; entrada: string[]; salida: string[] }>
): string {
  // Limitar la lista de átomos a 40 como se especifica
  const atomosLimitados = atomos.slice(0, 40);
  
  // Construir la descripción de los átomos disponibles
  const atomosDescripcion = atomosLimitados
    .map(
      (atomo) =>
        `- ${atomo.nombre} (id: ${atomo.id}):\n  Entradas aceptadas: ${atomo.entrada.join(
          ", "
        )}\n  Salidas producidas: ${atomo.salida.join(", ")}`
    )
    .join("\n");

  return `Eres el Director de ProtoGenesis. Convierte la intención en un plan de pasos sobre los átomos de la Protomolécula.

Encargo:
- ID: ${encargo.id}
- Molécula ID: ${encargo.moleculaId}
- Ámbito: ${encargo.ambito}
- Intención: ${encargo.intencion}
- Criterios que debe cumplir el plan:
${encargo.criterios
  .map(
    (c) =>
      `  - Tipo: ${c.tipo}${c.valor !== undefined ? `, Valor: ${c.valor}` : ""}: ${c.texto}`
  )
  .join("\n")}

Átomos disponibles (máximo 40):
${atomosDescripcion}

Devuelve SOLO un objeto JSON con la siguiente estructura:
{
  "pasos": [
    {
      "id": "string (identificador único del paso)",
      "atomo": "string (id del átomo a usar)",
      "titulo": "string (descripción legible del paso)",
      "entradas": ["string (referencias a salidas de otros pasos o entradas iniciales)"],
      "salida": { "formato": "string (formato de la salida del paso)" },
      "depende": ["string (ids de pasos de los que depende este paso)"],
      "criterios": [
        {
          "tipo": "formato|duracion-max|tamano-max|sin-secretos|capas-presentes|persona",
          "valor?": "string|number",
          "texto": "string (descripción del criterio en español)"
        }
      ],
      "computo?": "navegador|app-nativa|neurona-nas|neurona-procesador|oracle-a1|nube"
    }
  ]
}

Reglas:
- Máximo 24 pasos
- Los IDs de los pasos deben ser únicos
- El campo "depende" solo puede referirse a IDs de pasos definidos en el mismo plan
- No se permiten ciclos en las dependencias
- El átomo especificado debe existir en la lista de átomos disponibles
- Cada paso debe tener al menos un criterio comprobable
- Todo el texto debe estar en español
- El campo "computo" es opcional

No incluyas ningún texto adicional, solo el JSON.`;
}

/**
 * Planifica un encargo intentando obtener un plan válido del modelo.
 * Extrae el primer bloque JSON de la respuesta, valida con validarPlan;
 * si hay errores, UN reintento con los errores en el prompt;
 * si vuelve a fallar, ok false con los errores.
 * Nunca evalúa código de la respuesta.
 */
export async function planificarEncargo(
  encargo: Encargo,
  atomos: Array<{ id: string; nombre: string; entrada: string[]; salida: string[] }>,
  llamar: (prompt: string) => Promise<string>,
  ctx: {
    existeAtomo: (id: string) => "si" | "solo-enlace" | "no";
    hayConversion: (de: string, a: string) => boolean;
    formatoDe: (entrada: string) => string | null;
  }
): Promise<
  | { ok: true; plan: Plan; avisos: string[] }
  | { ok: false; motivo: string }
> {
  // Primer intento
  const prompt = promptDirector(encargo, atomos);
  let respuesta = await llamar(prompt);
  
  // Extraer el primer bloque JSON
  const jsonExtraido = extraerPrimerBloqueJSON(respuesta);
  if (!jsonExtraido) {
    return { ok: false, motivo: "No se encontró JSON válido en la respuesta" };
  }
  
  // Intentar parsear el JSON
  let planParsed: unknown;
  try {
    planParsed = JSON.parse(jsonExtraido);
  } catch (error) {
    return { ok: false, motivo: `Error al parsear JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  
  // Validar el plan
  const resultadoValidacion = validarPlanFunc(planParsed, ctx);
  if (resultadoValidacion.ok) {
    return { ok: true, plan: planParsed as Plan, avisos: resultadoValidacion.avisos };
  }
  
  // Segundo intento con los errores en el prompt
  const errores = resultadoValidacion.errores.join(". ");
  const promptReintento = `${prompt}

INTENTO PREVIO FALLIDO:
Los siguientes errores fueron encontrados en el plan propuesto:
${errores}

Por favor, corrige estos errores y proporciona un plan válido que siga todas las reglas especificadas.`;
  
  let respuestaReintento = await llamar(promptReintento);
  const jsonExtraidoReintento = extraerPrimerBloqueJSON(respuestaReintento);
  if (!jsonExtraidoReintento) {
    return { ok: false, motivo: "No se encontró JSON válido en la respuesta del reintento" };
  }
  
  let planParsedReintento: unknown;
  try {
    planParsedReintento = JSON.parse(jsonExtraidoReintento);
  } catch (error) {
    return { ok: false, motivo: `Error al parsear JSON en el reintento: ${error instanceof Error ? error.message : String(error)}` };
  }
  
  const resultadoValidacionReintento = validarPlanFunc(planParsedReintento, ctx);
  if (resultadoValidacionReintento.ok) {
    return { ok: true, plan: planParsedReintento as Plan, avisos: resultadoValidacionReintento.avisos };
  }
  
  // Ambos intentos fallaron
  const erroresReintento = resultadoValidacionReintento.errores.join(". ");
  return { ok: false, motivo: `Errores en ambos intentos: ${erroresReintento}` };
}

/**
 * Extrae el primer bloque JSON de una respuesta de texto.
 * Busca entre { y } o [ y ] y devuelve el primer bloque completo encontrado.
 */
function extraerPrimerBloqueJSON(texto: string): string | null {
  // Buscar el primer {
  let inicioObjeto = texto.indexOf("{");
  let inicioArray = texto.indexOf("[");
  
  // Determinar cuál viene primero
  let inicio = -1;
  let esObjeto = false;
  
  if (inicioObjeto !== -1 && inicioArray !== -1) {
    inicio = Math.min(inicioObjeto, inicioArray);
    esObjeto = inicioObjeto < inicioArray;
  } else if (inicioObjeto !== -1) {
    inicio = inicioObjeto;
    esObjeto = true;
  } else if (inicioArray !== -1) {
    inicio = inicioArray;
    esObjeto = false;
  } else {
    return null; // No se encontró ni { ni [
  }
  
  // Contador de llaves o corchetes para encontrar el cierre
  let contador = 0;
  let fin = -1;
  
  for (let i = inicio; i < texto.length; i++) {
    const char = texto[i];
    
    if (esObjeto) {
      if (char === "{") contador++;
      if (char === "}") contador--;
    } else {
      if (char === "[") contador++;
      if (char === "]") contador--;
    }
    
    if (contador === 0) {
      fin = i;
      break;
    }
  }
  
  if (fin === -1) {
    return null; // No se encontró el cierre correspondiente
  }
  
  return texto.substring(inicio, fin + 1);
}