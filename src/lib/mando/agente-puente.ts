import { createClient } from "@/utils/supabase/server";
import { mandoHabilitado } from "@/lib/mando/guardian";

export interface FuenteContexto {
  nombre: string;
  contenido: string;
  fechaMs?: number;
  maxEdadMinutos?: number;
}

const PATRONES_CLAVES = [
  /sk-[a-zA-Z0-9_-]{12,}/g,
  /sbp_[a-zA-Z0-9_-]{12,}/g,
  /gsk_[a-zA-Z0-9_-]{12,}/g,
  /nvapi-[a-zA-Z0-9_-]{12,}/g,
  /key-[a-zA-Z0-9_-]{12,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{16,}/g,
];

export async function comprobarDueno(req: Request): Promise<{ ok: true; esDueno: boolean } | { ok: false; error: string; estado: 503 }> {
  const DUENO = (process.env.STARSEED_DUENO || "maggasukha@star.seed").toLowerCase();
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      const msg = (error.message || "").toLowerCase();
      const esSinSesion = msg.includes("session") || msg.includes("token") || msg.includes("jwt") || error.status === 401;
      if (!esSinSesion) return { ok: false, error: "no se pudo comprobar la identidad", estado: 503 };
    }
    if (data?.user?.email) return { ok: true, esDueno: data.user.email.toLowerCase() === DUENO };
    return { ok: true, esDueno: mandoHabilitado(req) };
  } catch {
    return { ok: false, error: "no se pudo comprobar la identidad", estado: 503 };
  }
}

export function sanearContexto(texto: string): string {
  let resultado = texto;
  for (const patron of PATRONES_CLAVES) {
    resultado = resultado.replace(patron, "[CLAVE_OCULTA]");
  }
  return resultado;
}

export function evaluarFrescura(
  fuente: FuenteContexto,
  ahoraMs: number
): { fresca: boolean; etiqueta: string } {
  if (typeof fuente.fechaMs !== "number" || !Number.isFinite(fuente.fechaMs)) {
    return { fresca: false, etiqueta: "sin fecha (posiblemente obsoleto)" };
  }
  const maxMin = fuente.maxEdadMinutos ?? 60;
  const edadMin = (ahoraMs - fuente.fechaMs) / 60000;
  if (edadMin < 0 || edadMin > maxMin) {
    const fechaISO = new Date(fuente.fechaMs).toISOString();
    return {
      fresca: false,
      etiqueta: `obsoleto (${Math.round(edadMin)} min de antigüedad, fecha: ${fechaISO})`,
    };
  }
  return {
    fresca: true,
    etiqueta: `vigente (${Math.round(edadMin)} min de antigüedad)`,
  };
}

export function construirMensajeSistema(
  fuentes: FuenteContexto[],
  ahoraMs: number = Date.now()
): string {
  const bloques = fuentes.map((f) => {
    const frescura = evaluarFrescura(f, ahoraMs);
    const contenidoLimpio = sanearContexto(f.contenido);
    const aviso = frescura.fresca
      ? ""
      : "\n[ADVERTENCIA: Bloque de contexto VIEJO u OBSOLETO. Se debe declarar si influye.]";
    return `=== FUENTE: ${f.nombre} [Estado: ${frescura.etiqueta}] ===${aviso}\n${contenidoLimpio}`;
  });

  return [
    "Eres el Agente Puente de StarSeed OS: el único agente privado de Astraura para Alex (maggasukha@star.seed).",
    "Tu rol es la administración técnica y consulta del Mando desde el chat, la orbe o Telegram.",
    "REGLAS OBLIGATORIAS:",
    "1. NUNCA devuelvas el valor real de ninguna clave de API ni secreto. Usa siempre nombres de variables.",
    "2. Si alguna fuente de contexto está obsoleta o vieja, decláralo explícitamente en tu respuesta.",
    "3. Habla siempre en español directo, técnico y con acentos.",
    "",
    "--- CONTEXTO DEL PUENTE DE MANDO ---",
    ...bloques,
  ].join("\n\n");
}
