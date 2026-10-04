/**
 * Chat Director del Mando · tipos, canales y motores (PURO · Ola 1004)
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato de `starseed_memory_root/mando/director/chat.jsonl` (append-only, una
 * línea JSON por registro: un MENSAJE o una ENTREGA). Este módulo no toca disco
 * ni red: declara la forma del registro y las derivaciones puras; el archivo lo
 * lee y escribe el servidor.
 */

export type CanalId =
    | "mando" | "claude-cowork" | "claude-mac" | "hermes"
    | "telegram" | "chatgpt" | "antigravity" | "ide" | "terminal";

export type TipoMensaje = "mensaje" | "respuesta" | "informe" | "aviso" | "actualizacion" | "uso";

export type RolMensaje = "alex" | "director" | "agente" | "sistema";

export type EstadoEntrega = "pendiente" | "entregado" | "respondido" | "fallo";

/** Cómo contesta un canal: al momento, en su revisión, dejando copia o nada. */
export type RespuestaCanal = "inmediata" | "en-revision" | "archivo" | "ninguna";

/** Consumo de la llamada que generó el mensaje, estimado por quien lo escribe. */
export interface UsoMensaje {
    tokensEntrada?: number;
    tokensSalida?: number;
    segundos?: number;
    coste?: number;
}

/** Registro MENSAJE de `chat.jsonl`: lo que alguien dice en el chat del Director. */
export interface MensajeDirector {
    /** «md-<epoch_ms>-<4 hex>», único en todo el histórico. */
    id: string;
    t: string;
    /** Quién habla: «alex», «claude-cowork», «hermes», un director… */
    de: string;
    rol: RolMensaje;
    tipo: TipoMensaje;
    /** Cuerpo del mensaje: ≤ 20000 caracteres, jamás claves. */
    texto: string;
    canal: CanalId;
    canales?: CanalId[];
    /** «motor/modelo» que lo escribió o con el que se quiere contestar. */
    modelo?: string;
    respondeA?: string;
    tarea?: string;
    uso?: UsoMensaje;
}

/** Registro ENTREGA de `chat.jsonl`: el último estado de un mensaje en un canal. */
export interface EntregaDirector {
    tipo: "entrega";
    de_id: string;
    canal: CanalId;
    estado: EstadoEntrega;
    t: string;
    detalle?: string;
}

export interface CanalDirector {
    id: CanalId;
    nombre: string;
    descripcion: string;
    respuesta: RespuestaCanal;
}

/** Los nueve canales del chat, en el orden del contrato. */
export const CANALES: readonly CanalDirector[] = [
    { id: "mando", nombre: "Este chat (Puente de Mando)", descripcion: "El chat principal, donde Alex dirige a todos los agentes a la vez.", respuesta: "ninguna" },
    { id: "claude-cowork", nombre: "Claude Opus 5.5 · dirección (Cowork)", descripcion: "La dirección en la nube: responde en su revisión y hasta entonces queda en su bandeja.", respuesta: "en-revision" },
    { id: "claude-mac", nombre: "Claude Opus 5.5 · Mac (Claude Code)", descripcion: "Claude Code en esta Mac: contesta al momento en su propio chat.", respuesta: "inmediata" },
    { id: "hermes", nombre: "Hermes", descripcion: "El agente de la casa, siempre despierto: contesta al momento.", respuesta: "inmediata" },
    { id: "telegram", nombre: "Telegram (tu móvil)", descripcion: "Llega al móvil de Alex para leerlo donde esté; nadie contesta desde aquí.", respuesta: "ninguna" },
    { id: "chatgpt", nombre: "ChatGPT (Codex)", descripcion: "ChatGPT con Codex como director: contesta al momento.", respuesta: "inmediata" },
    { id: "antigravity", nombre: "Antigravity", descripcion: "El IDE Antigravity: queda en su bandeja hasta que alguien abre el chat.", respuesta: "archivo" },
    { id: "ide", nombre: "Chat de un IDE", descripcion: "El chat de cualquier IDE: queda en su bandeja hasta que se abre.", respuesta: "archivo" },
    { id: "terminal", nombre: "Terminal", descripcion: "La terminal: deja copia en su bandeja para leerla cuando se mire.", respuesta: "archivo" },
];

/** Motor del Director por defecto. */
export const MODELO_DIRECTOR_DEFECTO = "claude-cowork/claude-opus-5-5";

/** Motores con canal propio; el resto del catálogo (`nim/…`, `xkiro/…`, `gemini/…`) va por la API. */
export const MOTORES_DIRECTOR = [
    { id: "claude-cowork/claude-opus-5-5", nombre: "Claude Opus 5.5 · dirección (Cowork)", canal: "claude-cowork" },
    { id: "claude-mac/claude-opus-5-5", nombre: "Claude Opus 5.5 · Mac (Claude Code)", canal: "claude-mac" },
    { id: "hermes/predeterminado", nombre: "Hermes", canal: "hermes" },
    { id: "codex/gpt-5.6-sol", nombre: "ChatGPT (Codex)", canal: "chatgpt" },
] as const;

/** Canal que atiende un modelo «motor/modelo»; lo que no es de un motor va por la API. */
export function motorDe(modelo: string): CanalId | "api" {
    if (modelo.startsWith("claude-cowork/")) return "claude-cowork";
    if (modelo.startsWith("claude-mac/")) return "claude-mac";
    if (modelo.startsWith("hermes/")) return "hermes";
    if (modelo.startsWith("codex/")) return "chatgpt";
    return "api";
}

/** Con qué modelo contestar: el guardado si no está vacío, si no el de la última respuesta del director, si no el de defecto. */
export function ultimoModeloDirector(mensajes: readonly MensajeDirector[], guardado?: string | null): string {
    if (typeof guardado === "string" && guardado.trim() !== "") return guardado;
    for (let i = mensajes.length - 1; i >= 0; i--) {
        const m = mensajes[i];
        if (m && m.tipo === "respuesta" && m.rol === "director" && m.modelo) return m.modelo;
    }
    return MODELO_DIRECTOR_DEFECTO;
}

/** Los canales pedidos que no contestan al momento: esperan revisión o dejan copia en bandeja. */
export function canalesQueEsperan(canales: readonly CanalId[]): CanalId[] {
    const fuera: CanalId[] = [];
    for (const id of canales) {
        const canal = CANALES.find((c) => c.id === id);
        if (!canal || (canal.respuesta !== "en-revision" && canal.respuesta !== "archivo")) continue;
        if (!fuera.includes(id)) fuera.push(id);
    }
    return fuera;
}
