// Moderador de publicaciones usando decisiones Jev en el servidor.
import {
  construirPeticion,
  decisionesDeModeracion,
  leerRespuesta,
  umbral,
  type Decision,
} from "./decisiones";

export interface OpcionesUmbral {
  alto?: number;
  bajo?: number;
}

export interface ResultadoModeracion {
  veredicto: "publicar" | "revisar" | "rechazar";
  motivos: string[];
  probabilidades: Record<string, number>;
  gasto?: number;
}

export interface OpcionesModeracion {
  titulo?: string;
  autor?: string;
  umbrales?: OpcionesUmbral;
  maxGasto?: number;
  timeoutMs?: number;
}

export function decidirVeredicto(
  respuesta?: Record<string, Decision> | null,
  umbrales?: OpcionesUmbral
): ResultadoModeracion {
  if (!respuesta || typeof respuesta !== "object" || !respuesta.permitida) {
    return {
      veredicto: "revisar",
      motivos: ["Respuesta ilegible o incompleta de Jev"],
      probabilidades: {},
    };
  }

  const decisionPermitida = respuesta.permitida;
  let p = -1;
  if (typeof decisionPermitida.valor === "number" && Number.isFinite(decisionPermitida.valor)) {
    p = decisionPermitida.valor;
  } else if (typeof decisionPermitida.probabilidades?.yes === "number") {
    p = decisionPermitida.probabilidades.yes;
  }

  if (p < 0 || p > 1 || !Number.isFinite(p)) {
    return {
      veredicto: "revisar",
      motivos: ["Respuesta ilegible de Jev"],
      probabilidades: {},
    };
  }

  const probs: Record<string, number> = { permitida: p };
  for (const [clave, d] of Object.entries(respuesta)) {
    if (clave !== "permitida" && d && typeof d.confianza === "number") {
      probs[clave] = d.confianza;
    }
  }

  const alto = umbrales?.alto ?? 0.8;
  const bajo = umbrales?.bajo ?? 0.4;
  const v = umbral(p, alto, bajo);

  if (v === "si") {
    return { veredicto: "publicar", motivos: [], probabilidades: probs };
  }
  if (v === "no") {
    return {
      veredicto: "rechazar",
      motivos: ["Alta probabilidad de incumplimiento de normas"],
      probabilidades: probs,
    };
  }
  return {
    veredicto: "revisar",
    motivos: ["Zona intermedia de confianza, requiere revisión"],
    probabilidades: probs,
  };
}

export async function moderarPublicacion(
  texto: string,
  opciones?: OpcionesModeracion
): Promise<ResultadoModeracion> {
  const fallbackInseguro: ResultadoModeracion = {
    veredicto: "revisar",
    motivos: ["Jev no disponible"],
    probabilidades: {},
  };

  if (process.env.JEV_MODERACION === "0" || process.env.STARSEED_JEV === "0") {
    return fallbackInseguro;
  }

  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_SHARED_KEY;
  if (!apiKey || !texto || !texto.trim()) {
    return fallbackInseguro;
  }

  try {
    const preguntas = decisionesDeModeracion({
      texto,
      titulo: opciones?.titulo,
      autor: opciones?.autor,
    });
    const cuerpo = construirPeticion({ texto, titulo: opciones?.titulo }, preguntas);

    const res = await fetch("https://openrouter.ai/api/alpha/decisions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(opciones?.timeoutMs ?? 5000),
    });

    if (!res.ok) return fallbackInseguro;

    const data = (await res.json()) as { usage?: { cost?: number } };
    const gasto = typeof data.usage?.cost === "number" ? data.usage.cost : undefined;

    if (gasto !== undefined && gasto > (opciones?.maxGasto ?? 0.01)) {
      return {
        veredicto: "revisar",
        motivos: ["Límite de gasto superado"],
        probabilidades: {},
        gasto,
      };
    }

    const respuestas = leerRespuesta(data);
    const resultado = decidirVeredicto(respuestas, opciones?.umbrales);
    if (gasto !== undefined) resultado.gasto = gasto;
    return resultado;
  } catch {
    return fallbackInseguro;
  }
}
