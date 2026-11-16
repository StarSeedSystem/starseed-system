import { protegerMarcas, restaurarMarcas } from "../traduccion/motor";

export interface EntradaTraductor {
  texto?: string;
  textos?: string[];
  origen?: "auto" | string;
  destino: string;
  tono?: "neutro" | "formal" | "cercano";
  contexto?: "chat" | "documento" | "voz";
}

export interface MotorService {
  traducir(textos: string[], origen: string, destino: string): Promise<string[]>;
}

export const descripcionHerramienta = {
  nombre: "Astraura Translator",
  descripcion: "Traducción masiva con la API de Astraura, protege marcas y bloques de código.",
  esquema: {
    type: "object",
    properties: {
      texto: { type: "string" },
      textos: { type: "array", items: { type: "string" }, maxItems: 20 },
      origen: { type: ["string", "null", "undefined"] },
      destino: { type: "string" },
      tono: { type: "string", enum: ["neutro", "formal", "cercano"] },
      contexto: { type: "string", enum: ["chat", "documento", "voz"] },
    },
    required: ["destino"],
    anyOf: [{ required: ["texto"] }, { required: ["textos"] }],
  } as const,
};

export async function ejecutarTraductor(
  entrada: EntradaTraductor,
  servicio: MotorService
): Promise<
  | { traducciones: string[]; origenDetectado: string | null; motor: string; local: boolean; aviso?: string }
  | { error: string }
> {
  // Validación de entrada
  const textos = entrada.texto ? [entrada.texto] : entrada.textos ?? [];
  if (textos.length === 0 || (entrada.texto && entrada.textos?.length)) {
    return { error: "Entrada inválida: debe proporcionar exactamente uno de texto o textos." };
  }
  if (textos.length > 20) {
    return { error: "Entrada inválida: máximo 20 textos." };
  }
  const totalChars = textos.reduce((s, t) => s + t.length, 0);
  if (totalChars > 5000) {
    return { error: "Entrada inválida: total de caracteres excede 5000." };
  }

  const origen = entrada.origen ?? "auto";
  const destino = entrada.destino;

  // Si el idioma origen y destino son iguales, devuelve el mismo texto sin traducción
  if (origen === destino && textos.length === 1) {
    return {
      traducciones: [textos[0]],
      origenDetectado: null,
      motor: "local",
      local: true,
      aviso: "idioma origen y destino son iguales; no se tradujo.",
    };
  }

  // Protección de marcas y bloqueo de código
  const marcados = textos.map((t) => protegerMarcas(t));
  const marcadosTextos = marcados.map((m) => m.texto);

  try {
    const traduc = await servicio.traducir(marcadosTextos, origen, destino);
    const resultados = traduc.map((t, i) => restaurarMarcas(t, marcados[i].marcas));
    return {
      traducciones: resultados,
      origenDetectado: null,
      motor: "astraura",
      local: true,
    };
  } catch {
    return { error: "Error del servicio de traducción." };
  }
}
