/**
 * ProtoGenesis · Director (PG1013F)
 * Convierte un encargo en un plan validado, con un único intento de reintento.
 * Módulo puro: sin node:, sin Supabase, sin window.
 */
import type { Encargo, Plan, Paso } from "./encargo";
import { validarPlan } from "./encargo";

export interface AtomoInfo {
  id: string;
  nombre: string;
  entrada: string[];
  salida: string[];
}

export function promptDirector(
  encargo: Encargo,
  atomos: AtomoInfo[]
): string {
  const listaAtomos = atomos.slice(0, 40).map((a) => {
    return `- ${a.id} (${a.nombre}): entradas [${a.entrada.join(", ") || "ninguna"}], salidas [${a.salida.join(", ") || "ninguna"}]`;
  }).join("\n");

  return `Convierte esta intención en un plan válido para ProtoGenesis.
Intención: "${encargo.intencion}".
Criterios del encargo: ${encargo.criterios.map((c) => c.tipo + ": " + c.texto).join("; ")}.
Átomos disponibles (máximo 40 listados):
${listaAtomos}

Devuelve SOLO un bloque JSON con el esquema:
{ "pasos": [{ "id": "...", "atomo": "id-del-atomo", "titulo": "...", "entradas": ["formato"], "salida": {"formato":"..."}, "depende": ["id-paso"], "criterios": [{"tipo":"formato","texto":"..."}], "computo?: "..." }] }
Reglas: máximo 24 pasos; cada atomo debe existir en la lista; los pasos deben ser comprobables; criterios en español; sin código ejecutable.`;
}

function extraerPrimerJson(texto: string): unknown {
  const inicio = texto.indexOf("{");
  if (inicio === -1) return null;
  let nivel = 1;
  let i = inicio + 1;
  while (i < texto.length && nivel > 0) {
    if (texto[i] === "{") nivel++;
    else if (texto[i] === "}") nivel--;
    i++;
  }
  const bloque = texto.slice(inicio, i);
  try {
    return JSON.parse(bloque);
  } catch {
    return null;
  }
}

export async function planificarEncargo(
  encargo: Encargo,
  atomos: AtomoInfo[],
  llamar: (prompt: string) => Promise<string>,
  ctx: {
    existeAtomo: (id: string) => "si" | "solo-enlace" | "no";
    hayConversion: (de: string, a: string) => boolean;
    formatoDe: (entrada: string) => string | null;
  }
): Promise<{ ok: true; plan: Plan; avisos: string[] } | { ok: false; motivo: string }> {
  const prompt = promptDirector(encargo, atomos);

  const intentar = async (intento: number, erroresPrevios?: string[]): Promise<{ ok: true; plan: Plan; avisos: string[] } | { ok: false; motivo: string }> => {
    let pActual = intento === 0 ? prompt : prompt + (erroresPrevios ? "\n\nErrores del intento anterior (corrígelos, sin cambiar la intención):\n" + erroresPrevios.join("\n") : "");
    const respuesta = await llamar(pActual);
    const bloque = extraerPrimerJson(respuesta);
    if (!bloque || typeof bloque !== "object" || bloque === null) {
      if (intento === 0) {
        return await intentar(1, ["respuesta no contiene un bloque JSON válido"]);
      }
      return { ok: false, motivo: "respuesta sin bloque JSON válido tras reintento" };
    }

    if (!("pasos" in bloque)) {
      const msgFalta = "respuesta no contiene la clave 'pasos'";
      if (intento === 0) {
        return await intentar(1, [msgFalta]);
      }
      return { ok: false, motivo: msgFalta + " tras reintento" };
    }

    const validacion = validarPlan(bloque, ctx);
    if (validacion.ok) {
      return { ok: true, plan: bloque as Plan, avisos: validacion.avisos };
    }

    if (intento === 0) {
      return await intentar(1, validacion.errores);
    }
    return { ok: false, motivo: validacion.errores.join("; ") };
  };

  return intentar(0);
}
