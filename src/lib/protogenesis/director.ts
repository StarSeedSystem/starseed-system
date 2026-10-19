/**
 * ProtoGenesis · director: intención → plan validado (PG1013F)
 * Módulo puro: sin node:, sin Supabase, sin window.
 * Contratación: architecture/protogenesis.md §2 y architecture/protomolecula.md §3·7·8.
 */

import type { Encargo } = from "./encargo";
import type { Plan } = from "./encargo";
import type { Ambito, Computo } = from "@/lib/protomolecula/tipos";
import { validarPlan, Criterio } = from "./encargo";

/**
 * Crea el prompt para el director (LLM) que convierte un encargo en un plan de pasos.
 * @param encargo - El encargo con intención y criterios.
 * @param atomos - Lista de átomos disponibles (id, nombre, entradas, salidas).
 * @returns Un prompt en español que pide un JSON {pasos: [...]} con el esquema de Paso.
 */
export function promptDirector(
  encargo: Encargo,
  atomos: Array<{ id: string; nombre: string; entrada: string[]; salida: string[] }>
): string {
  // Resumir átomos (máx 40)
  const resumenAtomos = atomos
    .slice(0, 40)
    .map(a => `${a.id}:${a.nombre}(${a.entrada.join(",")}=>${a.salida.join(",")})`)
    .join(" | ");

  // Resumir criterios
  const resumenCriterios = encargo.criterios
    .map(c => `${c.tipo}:${c.valor??""}:${c.texto}`)
    .join("; ");

  return `Eres el director de ProtoGenesis. Convierte el encargo en un plan de pasos (JSON {pasos:[]}) sobre los átomos.

Encargo: ${encargo.id} - ${encargo.intencion}
Criterios: ${resumenCriterios}
Ámbito: ${encargo.ambito}
Átomos: ${resumenAtomos}

Reglas:
- JSON válido solo, sin texto extra.
- Máximo 24 pasos.
- Cada paso: {id, atomo, titulo, entradas[], salida:{formato}, depende[], criterios[], computo?}.
- Átomo debe ser de la lista o 'solo-enlace'.
- Entradas: formato de capa o salida de otro paso.
- Dependencias: IDs de pasos.
- Criterios: tipo, valor opcional, texto en español.
- DAG, sin ciclos.
- Escribe en español.

Devuelve solo el JSON.`;
}

/**
 * Planifica un encargo usando un LLM (función llamar) y valida el plan.
 * @param encargo - El encargo a planificar.
 * @param atomos - Lista de átomos disponibles.
 * @param llamar - Función que llama al LLM con un prompt y devuelve una respuesta.
 * @param ctx - Contexto para validarPlan (existeAtomo, hayConversion, formatoDe).
 * @returns Una promesa que resuelve a {ok: true, plan, avisos} o {ok: false, motivo}.
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
  let respuesta = await llamar(promptDirector(encargo, atomos));
  let resultado = extraerYValidarPlan(respuesta, ctx);
  if (resultado.ok) {
    return resultado;
  }

  // Segundo intento con los errores en el prompt
  const errores = resultado.errores.join(". ");
  const promptConErrores = `
El intento anterior produjo el siguiente error: ${errores}.
Por favor, corrige el JSON según las reglas y vuelve a intentarlo.
${promptDirector(encargo, atomos)}
`;
  respuesta = await llamar(promptConErrores);
  resultado = extraerYValidarPlan(respuesta, ctx);
  if (resultado.ok) {
    return resultado;
  }

  // Ambos intentos fallaron
  return { ok: false, motivo: resultado.errores.join(". ") };
}

/**
 * Extrae el primer bloque JSON de una respuesta y lo valida con validarPlan.
 * @param respuesta - Respuesta cruda del LLM.
 * @param ctx - Contexto para validarPlan.
 * @returns Objeto con ok, plan, avisos o errores.
 */
function extraerYValidarPlan(
  respuesta: string,
  ctx: {
    existeAtomo: (id: string) => "si" | "solo-enlace" | "no";
    hayConversion: (de: string, a: string) => boolean;
    formatoDe: (entrada: string) => string | null;
  }
) {
  const jsonMatch = respuesta.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return { ok: false, errores: ["No se encontró JSON en la respuesta"] };
  let plan;
  try { plan = JSON.parse(jsonMatch[0]); }
  catch (e) { return { ok: false, errores: [`JSON inválido: ${e.message}`] }; }
  const v = validarPlan(plan, ctx);
  if (v.ok) return { ok: true, plan: plan as Plan, avisos: v.avisos, errores: [] };
  return { ok: false, errores: v.errores };
}