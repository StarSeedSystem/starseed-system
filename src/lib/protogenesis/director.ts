/**
 * ProtoGenesis · Director: intención → plan validado (PG1013F)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Contratación: architecture/protogenesis.md §2 y architecture/protomolecula.md §3·7·8.
 */

import type { Encargo, Paso, Plan, Criterio } from "./encargo";
import type { Computo } from "@/lib/protomolecula/tipos";

/**
 * Genera el prompt para el director basado en el encargo y los átomos disponibles.
 * Pide SOLO JSON {pasos: [...]} con el esquema de Paso, máximo 24,
 * criterios comprobables, en español; lista de átomos acotada a 40.
 */
export function promptDirector(
  encargo: Encargo,
  atomos: Array<{ id: string; nombre: string; entrada: string[]; salida: string[] }>
): string {
  // Limitar la lista de átomos a 40 como máximo
  const atomosLimitados = atomos.slice(0, 40);
  
  // Construir la descripción de los átomos disponibles
  const atomosDescripcion = atomosLimitados
    .map(
      (atomo) =>
        `- ${atomo.id}: ${atomo.nombre}\n  Entradas aceptadas: ${atomo.entrada.join(
          ", "
        )}\n  Salidas producidas: ${atomo.salida.join(", ")}`
    )
    .join("\n");

  return `Eres el director de ProtoGenesis. Convierte la intención en un plan de pasos sobre los átomos de la Protomolécula.

ENCARGO:
- ID: ${encargo.id}
- Intención: ${encargo.intencion}
- Ámbito: ${encargo.ambito}
- Criterios que debe cumplir el plan:
${encargo.criterios
  .map((c) => `  - ${c.tipo}: ${c.texto}`)
  .join("\n")}

ÁTOMOS DISPONIBLES (máximo 40):
${atomosDescripcion}

REGLAS DEL PLAN:
1. Debes devolver ÚNICAMENTE un objeto JSON con la propiedad "pasos" que contenga un array de pasos
2. Máximo 24 pasos
3. Cada paso debe tener:
   - id: string (identificador único del paso)
   - atomo: string (id del átomo que lo ejecuta, debe existir en la lista de átomos disponibles)
   - titulo: string (descripción breve del paso)
   - entradas: string[] (lista de formatos de entrada que necesita este paso)
   - salida: { formato: string } (formato de salida que produce este paso)
   - depende: string[] (lista de IDs de pasos de los que depende este paso, vacío si no hay dependencias)
   - criterios: Criterio[] (criterios que debe cumplir este paso, usando los mismos tipos que el encargo)
   - computo?: "navegador" | "app-nativa" | "neurona-nas" | "neurona-procesador" | "oracle-a1" | "nube" (opcional, donde debe ejecutarse el átomo)
4. El plan debe ser un grafo acíclico (sin ciclos)
5. Si un átomo no existe todavía, usa "solo-enlace" y añade un criterio de tipo "formato" con texto "próximamente: <motivo>"
6. Para cada entrada que es la salida de otro paso, verifica que exista un conversor de formato; si no existe, avisa con un criterio de tipo "formato" con texto "falta conversor de X a Y"
7. Todos los textos deben estar en español
8. Solo devuelve el JSON, nada más

FORMATO DE SALIDA ESPERADO:
{
  "pasos": [
    {
      "id": "paso1",
      "atomo": "id-del-atomo",
      "titulo": "Título del paso",
      "entradas": ["formato1", "formato2"],
      "salida": { "formato": "formato-de-salida" },
      "depende": [],
      "criterios": [{ "tipo": "formato", "texto": "descripción del criterio" }],
      "computo": "navegador"
    }
  ]
}`.trim();
}

/**
 * Planifica un encargo convirtiendo la intención en un plan válido.
 * 
 * @param encargo - El encargo a planificar
 * @param atomos - Lista de átomos disponibles
 * @param llamar - Función que llama al modelo de lenguaje con un prompt y devuelve una promesa con su respuesta
 * @param ctx - Contexto de validación (misma estructura que la de validarPlan)
 * @returns Promesa que se resuelve a {ok: true, plan: Plan, avisos: string[]} o {ok: false, motivo: string}
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
  // Intento 1: generar prompt y obtener respuesta
  const prompt = promptDirector(encargo, atomos);
  let respuesta = await llamar(prompt);
  
  // Intentamos extraer el primer bloque JSON de la respuesta
  let planResultado: { ok: boolean; plan?: Plan; avisos?: string[]; motivo?: string };
  
  // Intentamos hasta 2 veces (el intento original + 1 reintento)
  for (let intento = 0; intento < 2; intento++) {
    // Extraer el primer bloque JSON de la respuesta
    const jsonExtraido = extraerPrimerBloqueJSON(respuesta);
    
    if (!jsonExtraido) {
      // Si no se encontró JSON, preparar para reintento con mensaje de error
      if (intento === 0) {
        respuesta = await llamar(
          prompt +
            "\n\nERROR: No se encontró ningún bloque JSON en tu respuesta. " +
            "Recuerda que debes devolver ÚNICAMENTE un objeto JSON con la propiedad 'pasos'. " +
            "Inténtalo de nuevo siguiendo exactamente el formato solicitado."
        );
        continue; // Ir al siguiente intento
      } else {
        // Segundo intento fallido también
        return { ok: false, motivo: "No se encontró ningún bloque JSON en la respuesta después de 2 intentos" };
      }
    }
    
    try {
      // Intentar parsear el JSON extraído
      const objetoParsed = JSON.parse(jsonExtraido);
      
      // Validar que tenga la propiedad pasos y que sea un array
      if (
        !objetoParsed ||
        typeof objetoParsed !== "object" ||
        Array.isArray(objetoParsed) ||
        !("pasos" in objetoParsed) ||
        !Array.isArray(objetoParsed.pasos)
      ) {
        throw new Error("El JSON debe contener una propiedad 'pasos' que sea un array");
      }
      
      // Convertir a nuestro tipo Plan
      const plan: Plan = {
        encargoId: encargo.id,
        pasos: objetoParsed.pasos,
      };
      
      // Validar el plan usando la función validarPlan de encargo.ts
      // Importamos dinámicamente para evitar problemas de dependencia circular
      const { validarPlan } = await import("./encargo");
      const validacion = validarPlan(plan, ctx);
      
      if (validacion.ok) {
        // Plan válido, devolver éxito
        return { ok: true, plan, avisos: validacion.avisos };
      } else {
        // Plan no válido, preparar para reintento con los errores
        if (intento === 0) {
          const erroresMensaje = validacion.errores.join("\n");
          respuesta = await llamar(
            prompt +
              `\n\nERROR: El plan propuesto tiene los siguientes errores:\n${erroresMensaje}\n\n` +
              "Por favor, corrige estos errores y envía un nuevo plan en formato JSON siguiendo exactamente las reglas."
          );
          continue; // Ir al siguiente intento
        } else {
          // Segundo intento fallido también
          return {
            ok: false,
            motivo: `El plan no es válido después de 2 intentos: ${validacion.errores.join(
              ". "
            )}`,
          };
        }
      }
    } catch (error) {
      // Error al parsear JSON
      if (intento === 0) {
        respuesta = await llamar(
          prompt +
            `\n\nERROR: No se pudo parsear el JSON de tu respuesta: ${error.message}. ` +
            "Asegúrate de devolver un JSON válido siguiendo exactamente el formato solicitado. " +
            "Inténtalo de nuevo."
        );
        continue; // Ir al siguiente intento
      } else {
        // Segundo intento fallido también
        return {
          ok: false,
          motivo: `No se pudo parsear el JSON después de 2 intentos: ${error.message}`,
        };
      }
    }
  }
  
  // Nunca debería llegar aquí, pero por si acaso
  return { ok: false, motivo: "Error inesperado en la planificación" };
}

/**
 * Extrae el primer bloque JSON de una cadena de texto.
 * Busca entre { y } que estén balanceados.
 */
function extraerPrimerBloqueJSON(texto: string): string | null {
  const inicio = texto.indexOf("{");
  if (inicio === -1) return null;
  
  let contadorLlaves = 0;
  let fin = -1;
  
  for (let i = inicio; i < texto.length; i++) {
    const char = texto[i];
    
    if (char === "{") {
      contadorLlaves++;
    } else if (char === "}") {
      contadorLlaves--;
      
      if (contadorLlaves === 0) {
        fin = i;
        break;
      }
    }
  }
  
  if (fin === -1) return null;
  
  return texto.substring(inicio, fin + 1);
}