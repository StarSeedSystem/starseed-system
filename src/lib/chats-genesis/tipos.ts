/**
 * Chats de Genesis · tipos compartidos (GEN1113C, architecture/astraura-chats-genesis.md §3.1 y §7.1).
 *
 * PURO: sin `node:*`, sin red y sin React. Lo importan la pestaña Genesis, Conexiones de chat, la
 * barra de Chats y el cliente de la puerta. Los nombres y formas de §3.1 y §7.1 son el contrato:
 * no se cambian sin cambiar el contrato.
 */

import type { CanalId, MensajeDirector } from "@/lib/mando/chat-director-tipos";

// ── §3.1 · vínculos y preferencias de la cuenta ──────────────────────────────────────────────

export type NivelGenesis = "genesis" | "poligenesis" | "metagenesis";
export type Bandeja = "chats" | "genesis";
export type PuenteTelegram = "hermes-avisos" | "peticiones" | "avisos-directores"; // A, B, C de §1.5

/** De dónde sale un chat. Un chat de Astraura vive en Supabase; los de MetaGenesis, en la Mac (espejo en el A1). */
export type FuenteChat =
    | { tipo: "astraura"; convId: string } // aurora_conversations.id
    | { tipo: "direccion" } // chat.jsonl fundido (vistas y filtros en la interfaz)
    | { tipo: "puente"; puente: PuenteTelegram }
    | { tipo: "telegram-sincronizado"; chatId: string }; // astraura_messages.chat_id con source telegram

export interface VinculoChat {
    v: 1;
    /** Determinista: «astraura:<convId>», «direccion», «puente:<puente>», «tg:<chatId>». */
    id: string;
    fuente: FuenteChat;
    nivel: NivelGenesis;
    /** Solo en poligenesis: id de os_pages/os_groups. */
    entidad?: string | null;
    en: Bandeja[]; // al menos una; ["chats","genesis"] = en las dos
    titulo?: string; // ≤ 120; si falta, el del origen
    creado: string;
    actualizado: string; // ISO
}

export interface PrefsChatsGenesis {
    v: 1;
    vinculos: VinculoChat[]; // ≤ 500
    conexiones: {
        genesis?: { activo: boolean; memoria: boolean };
        poligenesis?: { activo: boolean; entidades: string[] };
        metagenesis?: { activo: boolean };
    };
}

export const NIVELES: readonly NivelGenesis[] = ["genesis", "poligenesis", "metagenesis"];
/** Orden canónico de las bandejas (el campo `en` siempre sale en este orden). */
export const BANDEJAS: readonly Bandeja[] = ["chats", "genesis"];
export const PUENTES: readonly PuenteTelegram[] = ["hermes-avisos", "peticiones", "avisos-directores"];

export const MAX_VINCULOS = 500;
export const MAX_TITULO = 120;
/** Entradas (una por migración con descartes) que se guardan en `prefs.chatsGenesisDescartado`. */
export const MAX_DESCARTADO = 20;
/** Clave de primer nivel de `user_settings.prefs`. */
export const CLAVE_PREFS = "chatsGenesis";
export const CLAVE_PREFS_DESCARTADO = "chatsGenesisDescartado";
/** Copia rápida en el aparato (solo comodidad: la verdad es `prefs`). */
export const CLAVE_LOCAL = "starseed.chats-genesis.v1";

/** Lo que vale una cuenta sin nada guardado. Objeto nuevo en cada llamada. */
export function prefsVacias(): PrefsChatsGenesis {
    return { v: 1, vinculos: [], conexiones: {} };
}

// ── §7.1 · lo que viaja por la puerta del A1 ─────────────────────────────────────────────────

export type FuenteEspejo = "direccion" | "puente:hermes-avisos" | "puente:peticiones" | "puente:avisos-directores";
export const FUENTES_ESPEJO: readonly FuenteEspejo[] = ["direccion", "puente:hermes-avisos", "puente:peticiones", "puente:avisos-directores"];

/** Fuentes en las que se puede escribir (el puente C es solo lectura). */
export type FuenteEntrada = "direccion" | "puente:hermes-avisos" | "puente:peticiones";
export const FUENTES_ENTRADA: readonly FuenteEntrada[] = ["direccion", "puente:hermes-avisos", "puente:peticiones"];

export type AccionEntrada = "decir" | "responder" | "reenviar" | "orden" | "texto";
export const ACCIONES_ENTRADA: readonly AccionEntrada[] = ["decir", "responder", "reenviar", "orden", "texto"];

export type EstadoAcuse = "entregado" | "hecho" | "rechazado" | "caducado" | "fallo";

/** Lo que guarda el espejo: un MensajeDirector ya tachado (mismos campos que chat-director-tipos.ts) + su fuente. */
export interface RegistroEspejo extends MensajeDirector {
    fuente: string;
    cursor?: number;
    entregas?: Record<string, { estado: string; detalle?: string }>;
}

export interface EntradaChat {
    v: 1;
    nonce: string; // ^[A-Za-z0-9_-]{22,32}$ (≥128 bits)
    t: string; // ISO del aparato (informativo)
    fuente: FuenteEntrada;
    accion: AccionEntrada;
    texto?: string; // ≤ 8000
    modelo?: string; // ^[a-z0-9._/:-]{3,120}$ ; solo en dirección
    canales?: CanalId[]; // ⊂ CANALES ; solo en dirección
    respondeA?: string;
    reenviar?: string; // ^md-\d{10,16}-[0-9a-f]{4}$
    orden?: { nombre: string; args: string[] }; // nombre ∈ §4.4 de su fuente; ≤ 10 args de ≤ 120
}

/** Lo que entrega la puerta al destino: lo de arriba + lo que solo pone la puerta. */
export interface EntradaRecibida extends EntradaChat {
    id: number;
    cuenta: string;
    rol: "dueño" | "desarrollador";
    destino: "mac" | "a1";
    recibido: string;
}

/** Destinos de §7.1: `puente:peticiones` va al A1; todo lo demás, a la Mac. */
export function destinoDeFuente(f: FuenteEntrada): "mac" | "a1" {
    return f === "puente:peticiones" ? "a1" : "mac";
}

/** La fuente del espejo de un puente de Telegram. */
export function fuenteDePuente(p: PuenteTelegram): FuenteEspejo {
    return `puente:${p}` as FuenteEspejo;
}

// ── §4.4 · órdenes cerradas de cada fuente (la interfaz las ofrece; la puerta y la Mac deciden) ─

export const ORDENES_PUENTE_A = ["estado", "olas", "cola", "puertas", "agentes", "ayuda", "aprobar", "rechazar", "soltar", "reasignar", "decir", "a"] as const;
export const ORDENES_PUENTE_B = ["estado", "ayuda", "encargos", "pausa", "sigue", "cancela"] as const;
/** Órdenes que cambian algo: caducan a los 30 min (§4.5) y solo las da un dueño. */
export const ORDENES_QUE_CAMBIAN = ["aprobar", "rechazar", "soltar", "reasignar", "pausa", "sigue", "cancela"] as const;

export const LIMITE_TEXTO_ENTRADA = 8000;
export const RE_NONCE = /^[A-Za-z0-9_-]{22,32}$/;
export const RE_MODELO = /^[a-z0-9._/:-]{3,120}$/;
export const RE_ID_MENSAJE = /^md-\d{10,16}-[0-9a-f]{4}$/;
