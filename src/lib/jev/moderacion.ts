// Moderador de publicaciones usando decisiones Jev en el servidor.
import { PLAZO_DECISION_MS, moderar } from "@/lib/astraura/decisiones";
import {
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
    return { veredicto: "revisar", motivos: ["Respuesta ilegible o incompleta de Jev"], probabilidades: {} };
  }

  const decisionPermitida = respuesta.permitida;
  let p = -1;
  if (typeof decisionPermitida.valor === "number" && Number.isFinite(decisionPermitida.valor)) {
    p = decisionPermitida.valor;
  } else if (typeof decisionPermitida.probabilidades?.yes === "number") {
    p = decisionPermitida.probabilidades.yes;
  }

  if (p < 0 || p > 1 || !Number.isFinite(p)) {
    return { veredicto: "revisar", motivos: ["Respuesta ilegible de Jev"], probabilidades: {} };
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

  if (v === "si") return { veredicto: "publicar", motivos: [], probabilidades: probs };
  if (v === "no") return { veredicto: "rechazar", motivos: ["Alta probabilidad de incumplimiento de normas"], probabilidades: probs };
  return { veredicto: "revisar", motivos: ["Zona intermedia de confianza, requiere revisión"], probabilidades: probs };
}

export async function moderarPublicacion(
  texto: string,
  opciones?: OpcionesModeracion
): Promise<ResultadoModeracion> {
  const fallbackInseguro: ResultadoModeracion = { veredicto: "revisar", motivos: ["Jev no disponible"], probabilidades: {} };

  if (process.env.JEV_MODERACION === "0" || process.env.STARSEED_JEV === "0") return fallbackInseguro;

  if (!texto || !texto.trim()) return fallbackInseguro;

  let temporizador: ReturnType<typeof setTimeout> | undefined;

  try {
    const plazo = new Promise<null>((resolver) => {
      temporizador = setTimeout(
        () => resolver(null),
        opciones?.timeoutMs ?? PLAZO_DECISION_MS
      );
    });
    const decision = await Promise.race([moderar(texto), plazo]);
    if (!decision?.decidio || !decision.veredicto) return fallbackInseguro;
    return {
      veredicto: decision.veredicto,
      motivos: [],
      probabilidades: { [decision.veredicto]: decision.confianza },
    };
  } catch {
    return fallbackInseguro;
  } finally {
    if (temporizador !== undefined) clearTimeout(temporizador);
  }
}
