export interface FuenteContexto {
  nombre: string;
  contenido: string;
  fechaMs?: number;
  maxEdadMinutos?: number;
}

export interface MensajeAgentePuente {
  rol: "system" | "user" | "assistant";
  texto: string;
}

const PATRONES_CLAVES = [
  /sk-[a-zA-Z0-9_-]{12,}/g,
  /sbp_[a-zA-Z0-9_-]{12,}/g,
  /gsk_[a-zA-Z0-9_-]{12,}/g,
  /nvapi-[a-zA-Z0-9_-]{12,}/g,
  /key-[a-zA-Z0-9_-]{12,}/g,
  /Bearer\s+[a-zA-Z0-9._-]{16,}/g,
];

export function sanearContexto(texto: string): string {
  let resultado = texto;
  for (const patron of PATRONES_CLAVES) {
    resultado = resultado.replace(patron, "[CLAVE_OCULTA]");
  }
  return resultado
    .replace(
      /(\b[A-Z][A-Z0-9_]*(?:KEY|TOKEN|SECRET|PASSWORD)\b\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
      "$1[CLAVE_OCULTA]",
    )
    .replace(/\/Users\/[^/\s]+\/[^\s"'`]+/g, "[RUTA_LOCAL_OCULTA]")
    .replace(/\/home\/[^/\s]+\/[^\s"'`]+/g, "[RUTA_LOCAL_OCULTA]")
    .replace(/\/private\/(?:tmp|var)\/[^\s"'`]+/g, "[RUTA_LOCAL_OCULTA]");
}

export function evaluarFrescura(
  fuente: FuenteContexto,
  ahoraMs: number
): { fresca: boolean; etiqueta: string } {
  if (typeof fuente.fechaMs !== "number" || !Number.isFinite(fuente.fechaMs) || fuente.fechaMs <= 0) {
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
    etiqueta: `vigente (${Math.round(edadMin)} min; fecha: ${new Date(fuente.fechaMs).toISOString()})`,
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
    "2. NUNCA reveles rutas locales del disco ni confirmes este agente a personas no autorizadas.",
    "3. Si alguna fuente está obsoleta o vieja, decláralo explícitamente en tu respuesta.",
    "4. Habla siempre en español directo, técnico y con acentos.",
    "",
    "--- CONTEXTO DEL PUENTE DE MANDO ---",
    ...bloques,
  ].join("\n\n");
}

/** La pregunta no se sanea: solo las fuentes internas pueden contener secretos. */
export function construirTurnoModelo(
  sistema: string,
  historial: readonly MensajeAgentePuente[],
  pregunta: string,
): MensajeAgentePuente[] {
  return [
    { rol: "system", texto: sistema },
    ...historial.map((mensaje) => ({ ...mensaje })),
    { rol: "user", texto: pregunta },
  ];
}
