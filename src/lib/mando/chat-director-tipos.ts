/**
 * Chat Director de Genesis · tipos, canales y motores (PURO · Ola 1004)
 * ─────────────────────────────────────────────────────────────────────────────
 * Contrato de `starseed_memory_root/mando/director/chat.jsonl` (append-only, una
 * línea JSON por registro: un MENSAJE o una ENTREGA). Este módulo no toca disco
 * ni red: declara la forma del registro y las derivaciones puras; el archivo lo
 * lee y escribe el servidor.
 */

export type CanalId =
    | "mando" | "director-presidente" | "claude-cowork" | "claude-mac" | "hermes"
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
    /** Por dónde fue la llamada cuando no es el motor del canal (p. ej. «claude-code-mac»). */
    via?: string;
}

/**
 * (DIR1111G) Quién contestó de verdad una respuesta del Director presidente y por qué.
 * `proveedor` es uno de `PROVEEDORES_PRESIDENTE`; `descartes` dice por qué no contestó
 * cada proveedor que iba antes en el orden.
 */
export interface EleccionPresidente {
    proveedor: string;
    modelo: string;
    descartes?: { proveedor: string; motivo: string }[];
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
    /** (DIR1111G) Respuesta principal de un director: destaca sobre los informes de rutina. */
    sintesis?: boolean;
    /** (DIR1111G) Solo en respuestas del Director presidente: quién contestó y por qué. */
    eleccion?: EleccionPresidente;
    /** (DIR1111G) Solo en memoria: tipo crudo del evento del enjambre (`commit`, `fallo_tests`…). */
    evento?: string;
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

/** Los diez canales del chat, en el orden del contrato. */
export const CANALES: readonly CanalDirector[] = [
    { id: "mando", nombre: "Este chat (Genesis)", descripcion: "El chat principal, donde Alex dirige a todos los agentes a la vez.", respuesta: "ninguna" },
    { id: "director-presidente", nombre: "Director presidente", descripcion: "El canal principal de dirección: contesta el director que pueda ahora (Claude, Hermes o ChatGPT) con el hilo de todos.", respuesta: "inmediata" },
    { id: "claude-cowork", nombre: "Claude Opus 5.5 · dirección (Cowork)", descripcion: "La dirección (Opus 5.5): contesta al momento con Claude Code en esta Mac y la sesión de Cowork lo retoma en su revisión.", respuesta: "inmediata" },
    { id: "claude-mac", nombre: "Claude Opus 5.5 · Mac (Claude Code)", descripcion: "Claude Code en esta Mac: contesta al momento en su propio chat.", respuesta: "inmediata" },
    { id: "hermes", nombre: "Hermes", descripcion: "El agente de la casa, siempre despierto: contesta al momento.", respuesta: "inmediata" },
    { id: "telegram", nombre: "Telegram (tu móvil)", descripcion: "Llega al móvil de Alex para leerlo donde esté; nadie contesta desde aquí.", respuesta: "ninguna" },
    { id: "chatgpt", nombre: "ChatGPT (Codex)", descripcion: "ChatGPT con Codex como director: contesta al momento.", respuesta: "inmediata" },
    { id: "antigravity", nombre: "Antigravity", descripcion: "El IDE Antigravity: queda en su bandeja hasta que alguien abre el chat.", respuesta: "archivo" },
    { id: "ide", nombre: "Chat de un IDE", descripcion: "El chat de cualquier IDE: queda en su bandeja hasta que se abre.", respuesta: "archivo" },
    { id: "terminal", nombre: "Terminal", descripcion: "La terminal: deja copia en su bandeja para leerla cuando se mire.", respuesta: "archivo" },
];

/** (DIR1111G) El Director presidente: elige solo quién contesta entre los directores disponibles. */
export const MODELO_PRESIDENTE = "director-presidente/auto";

/** Motor del Director por defecto. */
// (2026-10-29, DIR1029A) La dirección iba por Hermes con el autoenrutado de MetaGenesis (Claude, a mano).
// (DIR1111G) Alex: el destinatario por defecto es el «Director presidente», que elige solo.
export const MODELO_DIRECTOR_DEFECTO = MODELO_PRESIDENTE;

/**
 * (DIR1111G) Los proveedores entre los que elige el Director presidente, en su orden de
 * preferencia. Lo usa la interfaz para nombrar a quien contestó; el cartero de Python
 * (`director_presidente.py`) tiene la misma lista y una prueba falla si se separan.
 */
export const PROVEEDORES_PRESIDENTE = [
    { id: "claude", nombre: "Claude Opus 5.5 (Mac)" },
    { id: "hermes", nombre: "Hermes" },
    { id: "chatgpt", nombre: "ChatGPT (Codex)" },
] as const;

/**
 * (DIR1111G) Autores que son DIRECTORES de conversación: se les puede escribir y contestan
 * o publican su respuesta final aquí. Los servicios automáticos que firman «director-…»
 * (revisor-bloqueadas, director-autocuracion, director-produccion…) NO lo son: medido en
 * `chat.jsonl` el 2026-11-11, son el 95 % de los registros y todos son rutina.
 */
export function esDirectorDeConversacion(de: string): boolean {
    const q = (typeof de === "string" ? de : "").toLowerCase();
    return q === "director-presidente" || q === "hermes" || q === "chatgpt" || q === "codex"
        || q === "antigravity" || q.startsWith("claude");
}

/** (DIR1111G) Canal por el que se le escribe a un director de conversación (o null). */
export function canalDeDirector(de: string): CanalId | null {
    const q = (typeof de === "string" ? de : "").toLowerCase();
    if (q === "director-presidente") return "director-presidente";
    if (q === "hermes") return "hermes";
    if (q === "chatgpt" || q === "codex") return "chatgpt";
    if (q === "claude-mac") return "claude-mac";
    if (q === "antigravity") return "antigravity";
    if (q.startsWith("claude")) return "claude-cowork";
    return null;
}

/** Motores con canal propio; el resto del catálogo (`nim/…`, `xkiro/…`, `gemini/…`) va por la API. */
export const MOTORES_DIRECTOR = [
    { id: MODELO_PRESIDENTE, nombre: "Director presidente (elige quién contesta)", canal: "director-presidente" },
    { id: "claude-cowork/claude-opus-5-5", nombre: "Claude Opus 5.5 · dirección (Cowork)", canal: "claude-cowork" },
    { id: "claude-mac/claude-opus-5-5", nombre: "Claude Opus 5.5 · Mac (Claude Code)", canal: "claude-mac" },
    { id: "hermes/predeterminado", nombre: "Hermes", canal: "hermes" },
    { id: "codex/gpt-5.6-sol", nombre: "ChatGPT (Codex)", canal: "chatgpt" },
] as const;

/** Canal que atiende un modelo «motor/modelo»; lo que no es de un motor va por la API. */
export function motorDe(modelo: string): CanalId | "api" {
    if (modelo.startsWith("director-presidente/")) return "director-presidente";
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
        if (m && m.tipo === "respuesta" && m.rol === "director" && m.modelo) {
            // (DIR1111G) Una respuesta del presidente lleva el modelo que contestó; se le vuelve a escribir al presidente.
            return m.canal === "director-presidente" ? MODELO_PRESIDENTE : m.modelo;
        }
    }
    return MODELO_DIRECTOR_DEFECTO;
}

/** Los canales pedidos que no contestan al momento: esperan revisión o dejan copia en bandeja. */
export function canalesQueEsperan(canales: readonly CanalId[]): CanalId[] {
    const fuera: CanalId[] = [];
    for (const id of canales) {
        const canal = CANALES.find((c) => c.id === id);
        // (2026-10-04) claude-cowork contesta al momento (el cartero lo atiende con Claude Code
        // en la Mac), pero su copia sigue yendo a su bandeja: la sesión de Cowork la retoma.
        const guardaCopia = canal?.id === "claude-cowork";
        if (!canal || (!guardaCopia && canal.respuesta !== "en-revision" && canal.respuesta !== "archivo")) continue;
        if (!fuera.includes(id)) fuera.push(id);
    }
    return fuera;
}
