"use client";

export interface EnvRecord {
  AVATARES_EXTERNOS_PERMITIDOS?: string;
  MESHY_API_KEY?: string;
}

export function externosPermitidos(env: EnvRecord) {
  const permiso = env.AVATARES_EXTERNOS_PERMITIDOS === "1";
  const clave = !!env.MESHY_API_KEY;
  const disponible = permiso && clave;
  const ids = disponible ? ["meshy"] : [];
  const motivo = !permiso ? "AVATARES_EXTERNOS_PERMITIDOS" : undefined;
  return { disponible, ids, motivo };
}

export function ofrecerClaveExterna(env: EnvRecord) {
  return !!env.MESHY_API_KEY;
}

export function claveDia(persona: string, fecha: Date): string {
  return `${persona}-${fecha.toDateString()}`;
}

export type ContadorTope = Map<string, number>;

export function topeRestante(c: ContadorTope, persona: string, fecha: Date): number {
  const clave = claveDia(persona, fecha);
  const usado = c.get(clave) ?? 0;
  return TOPE_DIARIO_POR_PERSONA - usado;
}

export function registrarUso(c: ContadorTope, persona: string, fecha: Date): boolean {
  const clave = claveDia(persona, fecha);
  const usado = c.get(clave) ?? 0;
  if (usado >= TOPE_DIARIO_POR_PERSONA) {
    return false;
  }
  c.set(clave, usado + 1);
  return true;
}

export interface ProcedenciaExterna {
  herramienta: string;
  uso: string;
  atribucion: string;
  licencia: string;
}

export function procedenciaExterna(herramienta: string): ProcedenciaExterna {
  if (herramienta === "meshy") {
    return {
      herramienta: "meshy",
      uso: "atribucion",
      atribucion: "Modelo 3D generado con Meshy",
      licencia: "CC BY 4.0",
    };
  }
  throw new Error("Herramienta desconocida");
}

export type TFetch = (url: RequestInfo, init?: RequestInit) => Promise<Response>;

export const DIA1 = new Date("2026-01-01");
export const DIA2 = new Date("2026-01-02");
export const TOPE_DIARIO_POR_PERSONA = 5;
export const MESHY_IMAGEN_A_3D = "https://api.meshy.ai/v2/image-to-3d";

const respuestaOk = new Response(JSON.stringify({ result: "tarea-123" }), { status: 200 });

export async function crearTareaMeshy(imageUrl: string, apiKey: string, fetch: TFetch): Promise<string> {
  const respuesta = await fetch(MESHY_IMAGEN_A_3D, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      image_url: imageUrl,
      target_formats: ["glb"],
    }),
  });
  if (!respuesta.ok) {
    throw new Error(String(respuesta.status));
  }
  const data = await respuesta.json();
  if (!data.result) {
    throw new Error("id de la tarea");
  }
  return data.result;
}

export async function crearTareaExterna(
  proveedor: string,
  imageUrl: string,
  apiKey: string,
  fetch: TFetch
): Promise<{ ok: boolean; tarea?: string; motivo?: string }> {
  if (proveedor !== "meshy") {
    return { ok: false, motivo: "no se pudo verificar" };
  }
  try {
    const tarea = await crearTareaMeshy(imageUrl, apiKey, fetch);
    return { ok: true, tarea };
  } catch (error: any) {
    return { ok: false, motivo: error.message };
  }
}