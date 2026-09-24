/**
 * resumen-ajustes-chat — Lógica PURA (sin red, sin DOM, sin localStorage) para
 * el menú rediseñado «Configuración del chat · Astraura IA»
 * (`src/components/aurora/chat-config-menu.tsx`).
 *
 * Este módulo NO lee ni inventa ningún dato: cada función recibe los valores
 * YA resueltos desde las fuentes reales del sistema (config del chat en
 * `aurora_conversations.meta.config`, personalidades, proveedores, sentidos,
 * capacidades, conexiones…) y solo decide DOS cosas, siempre en español y en
 * lenguaje llano:
 *
 *   1) el ALCANCE del ajuste — ¿es de ESTE CHAT, de TU CUENTA (sincronizado
 *      con `settings-sync.ts`/tablas propias), de ESTE DISPOSITIVO (solo este
 *      navegador) o un valor PREDETERMINADO de fábrica (aún sin personalizar,
 *      no vive en ningún almacén)?
 *   2) el RESUMEN de una frase que describe el valor efectivo de cada fila.
 *
 * Honestidad por diseño: si no hay dato real, las funciones lo dicen tal cual
 * ("sin configurar", "no disponible aquí") en vez de rellenar con algo vistoso.
 */

// ── Alcance de un ajuste ──────────────────────────────────────────────────────

export type AlcanceAjuste = "chat" | "cuenta" | "dispositivo" | "predeterminado";

export interface InsigniaAlcance {
  alcance: AlcanceAjuste;
  /** Etiqueta corta para la insignia de la fila. */
  etiqueta: string;
  /** Explicación de una frase (para title/aria-label). */
  descripcion: string;
}

const INSIGNIAS: Record<AlcanceAjuste, InsigniaAlcance> = {
  chat: {
    alcance: "chat",
    etiqueta: "Este chat",
    descripcion: "Se fijó solo para esta conversación; no afecta a tus demás chats.",
  },
  cuenta: {
    alcance: "cuenta",
    etiqueta: "Tu cuenta · sincronizado",
    descripcion: "Se sincroniza con tu cuenta StarSeed: mismo valor en cualquier dispositivo donde inicies sesión.",
  },
  dispositivo: {
    alcance: "dispositivo",
    etiqueta: "Este dispositivo",
    descripcion: "Vive solo en este navegador/dispositivo; no se sincroniza con tu cuenta.",
  },
  predeterminado: {
    alcance: "predeterminado",
    etiqueta: "Valor de fábrica",
    descripcion: "Todavía no se ha personalizado en ningún sitio; es el valor por defecto del sistema.",
  },
};

/** Insignia legible para un alcance dado. */
export function insigniaAlcance(alcance: AlcanceAjuste): InsigniaAlcance {
  return INSIGNIAS[alcance];
}

/**
 * Decide el alcance de una fila cuando puede haber un valor fijado POR ESTE
 * CHAT que, de no existir, cae a un alcance de respaldo (cuenta/dispositivo/
 * predeterminado) — el patrón que siguen casi todas las filas del menú.
 */
export function alcanceConRespaldo(
  tieneValorDeChat: boolean,
  alcanceDeRespaldo: AlcanceAjuste,
): AlcanceAjuste {
  return tieneValorDeChat ? "chat" : alcanceDeRespaldo;
}

// ── Resúmenes de una frase, por sección ───────────────────────────────────────

/** Personalidad activa (Adenda 63 · perfiles de personalidad). */
export function resumenPersonalidad(args: {
  nombre: string | null;
  matiz?: string | null;
  esDeEsteChat: boolean;
}): string {
  if (!args.nombre) return "Sin personalidad configurada todavía.";
  const conMatiz = args.matiz ? `${args.nombre} (${args.matiz})` : args.nombre;
  return args.esDeEsteChat
    ? `Este chat usa: ${conMatiz}.`
    : `Hereda la de tu cuenta: ${conMatiz}.`;
}

/** Motor de modelos (proveedor/modelo) elegido para responder. */
export function resumenModelo(args: {
  etiqueta: string | null;
  esDeEsteChat: boolean;
}): string {
  if (!args.etiqueta) {
    return "Automático: Astraura elige el mejor motor gratuito disponible.";
  }
  return args.esDeEsteChat
    ? `Este chat usa: ${args.etiqueta}.`
    : `Motor activo en este dispositivo: ${args.etiqueta}.`;
}

/** Memorias accesibles por el chat (alcance de memoria: personal/compartida/…). */
export function resumenMemorias(args: {
  alcanceMemoria: string;
  esDeEsteChat: boolean;
}): string {
  return args.esDeEsteChat
    ? `Este chat solo usa memorias: ${args.alcanceMemoria}.`
    : `Por defecto usa memorias: ${args.alcanceMemoria}.`;
}

/** Sentidos activos (micrófono, cámara, ubicación…). */
export function resumenSentidos(args: { activos: number; total: number }): string {
  if (args.total === 0) return "No hay sentidos disponibles en este entorno.";
  if (args.activos === 0) return "Ningún sentido activo: Astraura no ve, oye ni ubica nada del entorno.";
  if (args.activos === args.total) return `Los ${args.total} sentidos están activos.`;
  return `${args.activos} de ${args.total} sentidos activos.`;
}

/** Capacidades del entorno/dispositivo (micrófono, voz, visión, web…). */
export function resumenCapacidades(args: { activas: number; total: number }): string {
  if (args.total === 0) return "Sin datos de capacidades para este dispositivo.";
  if (args.activas === args.total) return `Las ${args.total} capacidades están disponibles y activas.`;
  return `${args.activas} de ${args.total} capacidades activas en este dispositivo.`;
}

/** Habilidades (skills) de Astraura activas para el chat. */
export function resumenHabilidades(args: { activas: number; total: number }): string {
  if (args.total === 0) return "Sin habilidades instaladas.";
  if (args.activas === 0) return "Ninguna habilidad activa para este chat.";
  if (args.activas === args.total) return `Las ${args.total} habilidades están activas.`;
  return `${args.activas} de ${args.total} habilidades activas.`;
}

/** Conexiones a servicios del ecosistema (OSS) en uso por el chat. */
export function resumenConexiones(args: {
  enUso: number;
  conectados: number;
  total: number;
}): string {
  if (args.conectados === 0) return "Ningún servicio externo conectado todavía.";
  if (args.enUso === args.conectados) {
    return `${args.conectados} servicio${args.conectados === 1 ? "" : "s"} conectado${args.conectados === 1 ? "" : "s"} en uso (de ${args.total} disponibles).`;
  }
  return `${args.enUso} de ${args.conectados} servicios conectados en uso (de ${args.total} disponibles).`;
}

const ETIQUETA_MODO_INTERNET: Record<string, string> = {
  public: "red pública",
  private: "servidores privados",
  local: "solo malla local",
  account: "solo tu cuenta",
};

/** Conectividad (malla/internet/privacidad) efectiva del chat. */
export function resumenConectividad(args: {
  internetMode: string;
  meshEnabled: boolean;
  esDeEsteChat: boolean;
}): string {
  const modo = ETIQUETA_MODO_INTERNET[args.internetMode] ?? args.internetMode;
  const malla = args.meshEnabled ? "malla local activa" : "malla local apagada";
  return args.esDeEsteChat
    ? `Este chat usa: ${modo}, ${malla}.`
    : `Valor por defecto: ${modo}, ${malla}.`;
}

/** Interruptor simple (voz de Aurora / registro persistente) del chat. */
export function resumenInterruptor(args: {
  etiquetaEncendido: string;
  etiquetaApagado: string;
  encendido: boolean;
  esDeEsteChat: boolean;
}): string {
  const estado = args.encendido ? args.etiquetaEncendido : args.etiquetaApagado;
  return args.esDeEsteChat ? `Este chat: ${estado}.` : `Por defecto: ${estado}.`;
}

// ── Agrupación de las 8 secciones en tarjetas temáticas ───────────────────────

export interface GrupoAjustesChat {
  id: string;
  titulo: string;
  /** Explicación de una frase de qué reúne el grupo. */
  descripcion: string;
  /** Claves de `SECTION_DEFS` (chat-config-menu.tsx) que reúne este grupo, en orden. */
  claves: readonly string[];
}

/** Las 8 secciones existentes, agrupadas por tema (ninguna se pierde). */
export const GRUPOS_AJUSTES_CHAT: readonly GrupoAjustesChat[] = [
  {
    id: "quien-es",
    titulo: "Quién es Astraura",
    descripcion: "Su carácter en esta conversación y lo que recuerda de ti.",
    claves: ["personalidad", "memorias"],
  },
  {
    id: "como-piensa",
    titulo: "Cómo piensa",
    descripcion: "Qué motor responde y qué sabe hacer en este chat.",
    claves: ["modelos", "capacidades", "habilidades"],
  },
  {
    id: "como-percibe",
    titulo: "Cómo percibe y se conecta",
    descripcion: "Qué puede ver, oír o ubicar, y con qué servicios habla.",
    claves: ["sentidos", "conexiones", "conectividad"],
  },
] as const;

// ── Búsqueda/filtro de filas ───────────────────────────────────────────────────

export interface FilaAjusteBuscable {
  etiqueta: string;
  resumen: string;
}

/** ¿Coincide esta fila (nombre o resumen) con la consulta de búsqueda? */
export function filaCoincideBusqueda(fila: FilaAjusteBuscable, consulta: string): boolean {
  const q = consulta.trim().toLowerCase();
  if (!q) return true;
  return fila.etiqueta.toLowerCase().includes(q) || fila.resumen.toLowerCase().includes(q);
}
