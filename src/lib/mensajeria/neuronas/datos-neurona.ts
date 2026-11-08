/**
 * Datos de cualquier formato con una neurona (NEU1107A · 2026-11-07) — decisiones PURAS.
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Petición de Alex (07-11): los chats de neuronas no son solo texto; llevan archivos de cualquier
 * formato, llamadas de voz y vídeo, pantalla compartida y transmisiones de datos en tiempo real,
 * por la malla o por cualquier medio, según los ajustes de medio de cada chat.
 *
 * Módulo PURO (sin red, sin DOM, sin `node:*`). Decide:
 *  · qué lleva cada medio HOY (`LLEVA`, `motivoNoLleva`): Bluetooth y LoRa no llevan archivos ni
 *    vídeo, el relé solo mensajes; se dice en la interfaz, no se esconde;
 *  · por dónde sale un archivo o un flujo (`planParaDatos`), reutilizando `mediosParaEnviar`;
 *  · cómo se llama a una neurona (`planLlamada`): enlace local sin internet o sistema de llamadas;
 *  · cómo se enseña un archivo recibido (`vistaPrevia`, `tipoSeguroPara`, `urlAdjuntoSegura`);
 *  · qué se acepta de la red (`leerAdjunto`, `leerLlamada`, `nombreArchivoSeguro`).
 * Nada se inventa: lo que no se midió es «sin medir».
 */

import { mediosParaEnviar, medioDeEnlace, normalizarPreferencias, servidorDeMedio } from "@/lib/mensajeria/medios/medios";
import {
    INFO_MEDIOS,
    type CandidatoMedio,
    type DescarteMedio,
    type MedioTransmision,
    type PlanEnvio,
    type PreferenciasMedio,
    type TipoChatMedio,
    type ViaMensaje,
} from "@/lib/mensajeria/medios/tipos";

export type ClaseDato = "mensaje" | "archivo" | "llamada" | "flujo";

/** Tope del almacenamiento de la cuenta por archivo (`MAX_UPLOAD_BYTES` de `os-files.ts`). */
export const MAX_SERVIDOR_BYTES = 50 * 1024 * 1024;
/** Tope del motor de archivos P2P (`limiteMaxBytes` por defecto de `archivos-malla.ts`). */
export const MAX_P2P_BYTES = 4 * 1024 * 1024 * 1024;

/**
 * Qué lleva cada medio HOY. La llamada con internet no viaja por la malla de la cuenta: abre su
 * propia conexión WebRTC (señalizada por el servidor), por eso cuenta como «servidor».
 */
export const LLEVA: Record<MedioTransmision, Record<ClaseDato, boolean>> = {
    local: { mensaje: true, archivo: true, llamada: true, flujo: true },
    "wifi-local": { mensaje: true, archivo: true, llamada: false, flujo: true },
    bluetooth: { mensaje: true, archivo: false, llamada: false, flujo: false },
    lora: { mensaje: true, archivo: false, llamada: false, flujo: false },
    "p2p-internet": { mensaje: true, archivo: true, llamada: false, flujo: true },
    turn: { mensaje: true, archivo: true, llamada: false, flujo: true },
    rele: { mensaje: true, archivo: false, llamada: false, flujo: false },
    servidor: { mensaje: true, archivo: true, llamada: true, flujo: true },
    correo: { mensaje: true, archivo: false, llamada: false, flujo: false },
};

const NOMBRE_CLASE: Record<ClaseDato, string> = {
    mensaje: "mensajes",
    archivo: "archivos",
    llamada: "voz ni vídeo",
    flujo: "transmisiones en vivo",
};

/** Frase honesta de por qué un medio no lleva esa clase de datos (null si sí la lleva). */
export function motivoNoLleva(medio: MedioTransmision, clase: ClaseDato): string | null {
    if (LLEVA[medio]?.[clase]) return null;
    switch (medio) {
        case "bluetooth":
            return clase === "mensaje"
                ? "aún no hay enlace Bluetooth en el navegador (llegará con la app nativa)"
                : "Bluetooth no lleva archivos, vídeo ni transmisiones: solo mensajes cortos, y aún no hay enlace Bluetooth en el navegador";
        case "lora":
            return "LoRa solo lleva mensajes cortos (≤ 200 B): ni archivos, ni voz, ni vídeo, ni transmisiones";
        case "rele":
            return "el relé cifrado del servidor solo lleva mensajes";
        case "correo":
            return "el buzón @star.seed solo lleva mensajes";
        case "wifi-local":
        case "p2p-internet":
        case "turn":
            return clase === "llamada"
                ? "la malla de la cuenta no lleva audio ni vídeo: la llamada con internet abre su propia conexión"
                : `este canal no lleva ${NOMBRE_CLASE[clase]}`;
        default:
            return `${INFO_MEDIOS[medio]?.corto ?? medio} no lleva ${NOMBRE_CLASE[clase]}`;
    }
}

/** Texto corto para la interfaz con lo que no lleva cada medio (los límites dichos, no escondidos). */
export const AVISO_LIMITES_MEDIOS =
    "Bluetooth y LoRa no llevan archivos, voz, vídeo ni transmisiones (LoRa: solo mensajes de hasta 200 B); el relé cifrado, solo mensajes.";

/* ══════════════════════════ Enlaces reales → candidatos por clase ══════════════════════════ */

/** Lo mínimo de un `EnlaceDisponible` del transporte universal (solo tipos). */
export interface EnlaceParaDatos {
    id: string;
    tipo: string;
    etiqueta: string;
    abierto: boolean;
    ruta?: string | null;
    rttMs?: number | null;
    capacidadKbps?: number | null;
    admite?: { mensaje?: boolean; archivo?: boolean; flujo?: boolean };
}

/** Candidato con lo que admite ESE enlace concreto (un vínculo puede no tener permiso de archivos). */
export interface CandidatoDato extends CandidatoMedio {
    admite?: { mensaje?: boolean; archivo?: boolean; flujo?: boolean };
}

/** Traduce los enlaces reales a candidatos (sin descartar: la decisión los descarta con motivo). */
export function candidatosDatosDesdeEnlaces(
    enlaces: EnlaceParaDatos[],
    llega: (e: EnlaceParaDatos) => boolean,
    motivoNoLlega?: (e: EnlaceParaDatos) => string | undefined,
): CandidatoDato[] {
    const out: CandidatoDato[] = [];
    const vistos = new Set<string>();
    for (const e of enlaces) {
        if (vistos.has(e.id)) continue;
        vistos.add(e.id);
        const medio = medioDeEnlace({ tipo: e.tipo, ruta: e.ruta ?? null });
        if (!medio) continue;
        const alcanza = llega(e);
        out.push({
            enlaceId: e.id,
            medio,
            etiqueta: e.etiqueta,
            abierto: !!e.abierto,
            llega: alcanza,
            ...(alcanza ? {} : { motivoNoLlega: motivoNoLlega?.(e) }),
            rttMs: typeof e.rttMs === "number" && Number.isFinite(e.rttMs) ? e.rttMs : null,
            ruta: e.ruta ?? null,
            ...(e.admite ? { admite: { ...e.admite } } : {}),
        });
    }
    return out;
}

/** El almacenamiento/servidor de la cuenta como candidato para archivos o flujos. */
export interface ServidorParaDatos {
    /** Hay internet y sesión. */
    abierto: boolean;
    /** Llega a este destino (p. ej. el canal de la cuenta solo llega a tus neuronas). */
    llega: boolean;
    motivoNoLlega?: string;
    /** Tope por envío (archivos: 50 MB). */
    maxBytes?: number;
    etiqueta?: string;
}

function tamanoCorto(bytes: number): string {
    return tamanoLegible(bytes);
}

/**
 * planParaDatos — por qué medios (y en qué orden) sale un ARCHIVO o un FLUJO, con el motivo de cada
 * descarte. Reutiliza `mediosParaEnviar` (mismos ajustes de medio del chat) y añade lo propio de la
 * clase: medios que no la llevan, enlaces sin permiso y el tope del servidor. Pura y determinista.
 * Un flujo en vivo no puede esperar: si no hay camino, se avisa (nunca «en espera»).
 */
export function planParaDatos(
    preferencias: PreferenciasMedio,
    candidatos: CandidatoDato[],
    opciones: { clase: "archivo" | "flujo"; tipo?: TipoChatMedio; bytes?: number; servidor?: ServidorParaDatos | null },
): PlanEnvio {
    const { clase } = opciones;
    const tipo = opciones.tipo ?? "neurona";
    const bytes = Math.max(0, opciones.bytes ?? 0);
    const marcados: CandidatoMedio[] = [];
    for (const c of candidatos) {
        const noLleva = motivoNoLleva(c.medio, clase);
        let motivo: string | undefined = noLleva ?? undefined;
        if (!motivo && c.admite && c.admite[clase] === false) {
            motivo = clase === "archivo" ? "este enlace no tiene permiso para archivos" : "este enlace no lleva datos en vivo";
        }
        if (!motivo && clase === "archivo" && bytes > limiteArchivo(c.medio)) {
            motivo = `el archivo (${tamanoCorto(bytes)}) supera el tope de ${INFO_MEDIOS[c.medio]?.corto ?? c.medio} (${tamanoCorto(limiteArchivo(c.medio))})`;
        }
        const { admite: _admite, ...base } = c;
        void _admite;
        marcados.push(
            motivo ? { ...base, llega: false, motivoNoLlega: noLleva ?? (c.llega ? motivo : c.motivoNoLlega ?? motivo) } : base,
        );
    }
    const s = opciones.servidor;
    if (s) {
        const pasa = typeof s.maxBytes !== "number" || bytes <= s.maxBytes;
        const llega = s.llega && pasa;
        marcados.push({
            enlaceId: "servidor",
            medio: "servidor",
            etiqueta: s.etiqueta ?? (clase === "archivo" ? "Almacenamiento de tu cuenta" : "Canal de tu cuenta"),
            abierto: s.abierto,
            llega,
            ...(llega
                ? {}
                : {
                      motivoNoLlega: !s.llega
                          ? s.motivoNoLlega ?? "no llega a este destino"
                          : `el archivo (${tamanoCorto(bytes)}) supera el tope del almacenamiento de tu cuenta (${tamanoCorto(s.maxBytes ?? 0)})`,
                  }),
            rttMs: null,
            ruta: null,
        });
    }
    const base = mediosParaEnviar(preferencias, marcados, { tipo });
    // Los medios elegidos que no llevan esta clase lo dicen con su motivo (no «no hay enlace»).
    const descartados: DescarteMedio[] = base.descartados.map((d) => {
        const noLleva = motivoNoLleva(d.medio, clase);
        return noLleva && !d.enlaceId ? { ...d, motivo: noLleva } : d;
    });
    const siNinguno = clase === "flujo" ? "avisar" : base.siNinguno;
    let aviso = base.aviso;
    if (base.sinCamino) {
        const que = clase === "archivo" ? "este archivo" : "una transmisión en vivo";
        aviso =
            siNinguno === "esperar"
                ? `Ningún medio permitido puede llevar ${que} ahora: espera en esta pestaña y sale solo en cuanto haya uno.`
                : `Ningún medio permitido puede llevar ${que} ahora.`;
    }
    return { ...base, descartados, siNinguno, ...(aviso ? { aviso } : {}) };
}

/* ══════════════════════════ Llamadas ══════════════════════════ */

export type ViaLlamada = "enlace-local" | "sistema-llamadas";

export interface PlanLlamada {
    via: ViaLlamada | null;
    enlaceId?: string;
    /** Frase de por qué se eligió esa vía. */
    motivo?: string;
    descartados: DescarteMedio[];
    /** Frase honesta cuando no hay cómo llamar. */
    aviso?: string;
}

/**
 * planLlamada — cómo se llama a una neurona. PURA.
 *  1 · enlace local sin internet (emparejado en persona): llamada directa, sin servidores;
 *  2 · con internet y sesión: el sistema de llamadas del chat (WebRTC, señalizado por el servidor,
 *      con los enlaces locales como canal directo si los hay) y el timbre por el chat de la neurona.
 * Respeta los medios elegidos del chat. Bluetooth, LoRa y el relé no llevan voz ni vídeo.
 */
export function planLlamada(entrada: {
    preferencias: PreferenciasMedio;
    enlaceLocal: { id: string; etiqueta: string } | null;
    internet: boolean;
    sesion: boolean;
}): PlanLlamada {
    const prefs = normalizarPreferencias(entrada.preferencias);
    const permitido = (m: MedioTransmision) => prefs.modo === "auto" || prefs.elegidos.includes(m);
    const descartados: DescarteMedio[] = [];
    if (prefs.modo === "elegidos") {
        for (const m of prefs.elegidos) {
            const no = motivoNoLleva(m, "llamada");
            if (no && m !== "wifi-local" && m !== "p2p-internet" && m !== "turn") descartados.push({ medio: m, motivo: no });
        }
    }
    let elegido: PlanLlamada | null = null;
    if (!entrada.enlaceLocal) {
        descartados.push({ medio: "local", motivo: "no hay enlace sin internet con esta neurona (vinculadlas con «Vincular sin internet»)" });
    } else if (!permitido("local")) {
        descartados.push({ medio: "local", enlaceId: entrada.enlaceLocal.id, etiqueta: entrada.enlaceLocal.etiqueta, motivo: "no está entre tus medios elegidos" });
    } else {
        elegido = { via: "enlace-local", enlaceId: entrada.enlaceLocal.id, motivo: "llamada directa por el enlace sin internet (sin servidores)", descartados };
    }
    const internetPermitido = permitido("servidor") || permitido("p2p-internet") || permitido("turn");
    if (!elegido) {
        if (!internetPermitido) {
            descartados.push({ medio: "servidor", motivo: "ni el servidor ni el P2P por internet están entre tus medios elegidos" });
        } else if (!entrada.internet) {
            descartados.push({ medio: "servidor", motivo: "no hay internet ahora" });
        } else if (!entrada.sesion) {
            descartados.push({ medio: "servidor", motivo: "inicia sesión para llamar por internet" });
        } else {
            elegido = { via: "sistema-llamadas", motivo: "sistema de llamadas (WebRTC señalizado por el servidor)", descartados };
        }
    }
    if (elegido) return elegido;
    return {
        via: null,
        descartados,
        aviso: `No hay cómo llamar a esta neurona ahora: hace falta un enlace sin internet o internet con sesión. ${AVISO_LIMITES_MEDIOS}`,
    };
}

/* ══════════════════════════ Vista previa segura ══════════════════════════ */

export type VistaPrevia = "imagen" | "audio" | "video" | "pdf" | "texto" | "descarga";

const EXT: Record<string, VistaPrevia> = {
    png: "imagen", jpg: "imagen", jpeg: "imagen", gif: "imagen", webp: "imagen", avif: "imagen", bmp: "imagen", svg: "imagen",
    mp3: "audio", wav: "audio", ogg: "audio", oga: "audio", m4a: "audio", aac: "audio", flac: "audio", opus: "audio",
    mp4: "video", webm: "video", mov: "video", m4v: "video", ogv: "video",
    pdf: "pdf",
    txt: "texto", md: "texto", csv: "texto", json: "texto", log: "texto", xml: "texto", yml: "texto", yaml: "texto", tsv: "texto",
};

function extension(nombre: string): string {
    const i = nombre.lastIndexOf(".");
    return i >= 0 ? nombre.slice(i + 1).toLowerCase() : "";
}

/** Cómo se enseña un archivo recibido. El tipo lo declara quien lo manda: nunca se ejecuta (ni HTML). */
export function vistaPrevia(tipoMime: string | null | undefined, nombre = ""): VistaPrevia {
    const t = (tipoMime ?? "").toLowerCase().split(";")[0].trim();
    if (t.startsWith("image/")) return "imagen";
    if (t.startsWith("audio/")) return "audio";
    if (t.startsWith("video/")) return "video";
    if (t === "application/pdf") return "pdf";
    if (t === "text/html" || t === "application/xhtml+xml") return "texto";
    if (t.startsWith("text/") || t === "application/json" || t === "application/xml") return "texto";
    return EXT[extension(nombre)] ?? "descarga";
}

/** Tipo con el que se vuelve a envolver el archivo antes de enseñarlo (nunca HTML ejecutable). */
export function tipoSeguroPara(vista: VistaPrevia, tipoMime?: string | null): string {
    const t = (tipoMime ?? "").toLowerCase().split(";")[0].trim();
    switch (vista) {
        case "imagen":
            return t.startsWith("image/") ? t : "image/png";
        case "audio":
            return t.startsWith("audio/") ? t : "audio/mpeg";
        case "video":
            return t.startsWith("video/") ? t : "video/mp4";
        case "pdf":
            return "application/pdf";
        case "texto":
            return "text/plain;charset=utf-8";
        default:
            return "application/octet-stream";
    }
}

/** URL de un adjunto que llegó en un mensaje: solo https y, si se dan, solo de esos servidores. */
export function urlAdjuntoSegura(url: unknown, hostsPermitidos: string[] = []): string | null {
    if (typeof url !== "string" || url.length > 2048) return null;
    let u: URL;
    try {
        u = new URL(url);
    } catch {
        return null;
    }
    if (u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    if (hostsPermitidos.length && !hostsPermitidos.includes(u.host)) return null;
    return u.toString();
}

/** «1,2 MB», «640 KB», «12 B». */
export function tamanoLegible(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "—";
    if (bytes < 1024) return `${Math.round(bytes)} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2).replace(".", ",")} GB`;
}

/* ══════════════════════════ Lo que viaja en el mensaje ══════════════════════════ */

/** Un archivo anunciado en un mensaje de neurona. */
export interface AdjuntoNeurona {
    /** Id de la transferencia P2P (`arch_…`) o del archivo en el almacenamiento. */
    id: string;
    nombre: string;
    tipo: string;
    tamano: number;
    /** «p2p»: trozos por la malla (motor de archivos); «servidor»: almacenamiento de la cuenta. */
    modo: "p2p" | "servidor";
    /** Solo «servidor»: enlace https al archivo. */
    url?: string;
    /** Solo «servidor»: SHA-256 (hex) del archivo entero, para verificarlo al bajarlo. */
    sha256?: string;
}

/** Una llamada anunciada (timbre) en un mensaje de neurona. */
export interface LlamadaNeurona {
    /** Sesión del sistema de llamadas (solo por internet); vacío si fue por el enlace local. */
    sesion?: string;
    tipo: "audio" | "video";
    pantalla?: boolean;
    via: ViaLlamada;
}

/** Una transmisión en vivo anunciada en un mensaje de neurona. */
export interface FlujoNeuronaRef {
    id: string;
    nombre: string;
    /** «medios» (GRP1107A): audio/vídeo en vivo por canal de datos (`flujo-medios.ts`). */
    formato: "texto" | "json" | "binario" | "medios";
}

/** Nombre de archivo que viene de otro aparato: sin rutas, sin caracteres de control, ≤ 180. */
export function nombreArchivoSeguro(x: unknown): string {
    const s = typeof x === "string" ? x : "";
    // eslint-disable-next-line no-control-regex
    const limpio = s.replace(/[\u0000-\u001f\u007f]/g, "").split(/[\\/]/).pop()?.trim() ?? "";
    const sinPuntos = limpio.replace(/^\.+/, "");
    return (sinPuntos || "archivo").slice(0, 180);
}

function texto(x: unknown, max: number): string | null {
    return typeof x === "string" && x.length > 0 && x.length <= max ? x : null;
}

export function leerAdjunto(x: unknown): AdjuntoNeurona | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    const id = texto(o.id, 80);
    const modo = o.modo === "p2p" || o.modo === "servidor" ? o.modo : null;
    const tamano = typeof o.tamano === "number" && Number.isFinite(o.tamano) && o.tamano >= 0 && o.tamano <= MAX_P2P_BYTES ? o.tamano : null;
    if (!id || !modo || tamano === null) return null;
    const tipo = (texto(o.tipo, 120) ?? "application/octet-stream").toLowerCase();
    const adj: AdjuntoNeurona = { id, nombre: nombreArchivoSeguro(o.nombre), tipo, tamano, modo };
    if (modo === "servidor") {
        const url = urlAdjuntoSegura(o.url);
        if (!url) return null;
        adj.url = url;
        if (typeof o.sha256 === "string" && /^[0-9a-f]{64}$/.test(o.sha256)) adj.sha256 = o.sha256;
    }
    return adj;
}

export function leerLlamada(x: unknown): LlamadaNeurona | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    const tipo = o.tipo === "audio" || o.tipo === "video" ? o.tipo : null;
    const via = o.via === "enlace-local" || o.via === "sistema-llamadas" ? o.via : null;
    if (!tipo || !via) return null;
    const sesion = texto(o.sesion, 80);
    if (via === "sistema-llamadas" && !sesion) return null;
    return { tipo, via, ...(sesion ? { sesion } : {}), ...(o.pantalla === true ? { pantalla: true } : {}) };
}

export function leerFlujoRef(x: unknown): FlujoNeuronaRef | null {
    if (!x || typeof x !== "object") return null;
    const o = x as Record<string, unknown>;
    const id = texto(o.id, 80);
    const formato = o.formato === "texto" || o.formato === "json" || o.formato === "binario" || o.formato === "medios" ? o.formato : null;
    if (!id || !formato) return null;
    // eslint-disable-next-line no-control-regex
    return { id, formato, nombre: (texto(o.nombre, 80) ?? "Transmisión").replace(/[\u0000-\u001f\u007f]/g, "") || "Transmisión" };
}

/** Texto de la burbuja de una llamada («Llamada de vídeo · pantalla compartida»). */
export function textoLlamada(ll: LlamadaNeurona, dir: "sale" | "entra"): string {
    const base = ll.pantalla ? "Pantalla compartida" : ll.tipo === "video" ? "Videollamada" : "Llamada de voz";
    return `${base} ${dir === "sale" ? "saliente" : "entrante"}${ll.via === "enlace-local" ? " · sin internet" : ""}`;
}

/* ══════════════════════════ Límites por medio ══════════════════════════ */

/** Medios P2P (canal de datos entre aparatos, sin servidor que guarde nada). */
export const MEDIOS_P2P: readonly MedioTransmision[] = ["local", "wifi-local", "p2p-internet", "turn"];

export function esMedioP2P(m: MedioTransmision): boolean {
    return MEDIOS_P2P.includes(m);
}

/** Tope de un mensaje por LoRa (`LORA_MAX_BYTES` de `eleccion-enlace.ts`). */
export const MAX_LORA_BYTES = 200;

/**
 * Tope por ARCHIVO según el medio (0 = ese medio no lleva archivos). P2P: el motor de archivos
 * (trozos de 16 KB a disco, nunca el archivo entero en memoria); servidor: el almacenamiento de
 * la cuenta; relé, LoRa, Bluetooth y correo: no llevan archivos.
 */
export const LIMITE_ARCHIVO_BYTES: Record<MedioTransmision, number> = {
    local: MAX_P2P_BYTES,
    "wifi-local": MAX_P2P_BYTES,
    "p2p-internet": MAX_P2P_BYTES,
    turn: MAX_P2P_BYTES,
    servidor: MAX_SERVIDOR_BYTES,
    bluetooth: 0,
    lora: 0,
    rele: 0,
    correo: 0,
};

export function limiteArchivo(medio: MedioTransmision): number {
    return LIMITE_ARCHIVO_BYTES[medio] ?? 0;
}

/** ¿Cabe un archivo de `bytes` por ese medio? Con el motivo si no. Pura. */
export function cabeArchivo(medio: MedioTransmision, bytes: number): { cabe: boolean; motivo?: string } {
    const no = motivoNoLleva(medio, "archivo");
    if (no) return { cabe: false, motivo: no };
    const tope = limiteArchivo(medio);
    if (bytes > tope) return { cabe: false, motivo: `supera el tope de ${INFO_MEDIOS[medio]?.corto ?? medio} (${tamanoLegible(tope)})` };
    return { cabe: true };
}

/**
 * ¿Hay que forzar UN enlace para el archivo, o puede el transporte repartirlo por todos los
 * enlaces P2P al mismo aparato (multitrayecto)? Se reparte solo si ninguno de los enlaces P2P
 * que llegan quedó fuera por los ajustes del chat; si no, va solo por el primer paso P2P del plan.
 * Devuelve el `enlaceId` que forzar, o null para dejar elegir (y repartir) al transporte. Pura.
 */
export function enlaceForzadoParaArchivo(plan: PlanEnvio, candidatos: CandidatoMedio[]): string | null {
    const primero = plan.pasos.find((p) => esMedioP2P(p.medio));
    if (!primero) return null;
    const enPlan = new Set(plan.pasos.map((p) => p.enlaceId));
    const utiles = candidatos.filter((c) => esMedioP2P(c.medio) && c.llega && c.abierto);
    return utiles.every((c) => enPlan.has(c.enlaceId)) ? null : primero.enlaceId;
}

/** Un enlace por el que salió un archivo o un flujo (lo que devuelve el transporte). */
export interface EnlaceUsado {
    id: string;
    tipo: string;
    etiqueta: string;
    ruta?: string | null;
    rttMs?: number | null;
}

/**
 * Vía de un archivo o de un flujo que sale por la malla: el medio del enlace principal y, si se
 * repartió por varios (multitrayecto), cuáles. Sin confirmar hasta que el otro aparato lo verifica.
 * Nada se inventa: sin RTT medido, la latencia queda «sin medir». Pura.
 */
export function viaDeEnlaces(
    enlaces: EnlaceUsado[],
    opciones: { clase: "archivo" | "flujo"; descartados?: DescarteMedio[]; en: number },
): ViaMensaje | null {
    const primero = enlaces[0];
    if (!primero) return null;
    const medio = medioDeEnlace({ tipo: primero.tipo, ruta: primero.ruta ?? null }) ?? "p2p-internet";
    const rtt = typeof primero.rttMs === "number" && Number.isFinite(primero.rttMs) ? primero.rttMs : null;
    const que = opciones.clase === "archivo" ? "archivo" : "transmisión en vivo";
    const motivo =
        enlaces.length > 1
            ? `${que} repartido por ${enlaces.length} enlaces al mismo aparato (multitrayecto)`
            : `${que} por la malla P2P (sin servidor que lo guarde)`;
    return {
        medio,
        direccion: "sale",
        enlace: enlaces.map((e) => e.etiqueta).join(" + "),
        enlaceId: primero.id,
        servidor: servidorDeMedio(medio),
        ruta: primero.ruta ?? null,
        latenciaMs: rtt,
        latenciaFuente: rtt !== null ? "enlace" : null,
        confirmado: false,
        confirmadoPor: null,
        motivo,
        ...(opciones.descartados?.length ? { descartados: opciones.descartados } : {}),
        en: opciones.en,
    };
}

/* ══════════════════════════ Estados de una transferencia ══════════════════════════ */

/** Fases del motor de archivos (`FaseTransferencia` de `archivos-malla.ts`, sin importarlo). */
export type FaseMotorArchivo =
    | "pendiente-aceptar"
    | "esperando-aceptacion"
    | "transfiriendo"
    | "reintentando"
    | "verificando"
    | "completada"
    | "rechazada"
    | "cancelada"
    | "error";

/** Fase de un archivo de un chat de neurona (lo que se guarda con el mensaje). */
export type FaseArchivoNeurona =
    | "preparando"
    | "subiendo"
    | "ofrecido"
    | "por-aceptar"
    | "transfiriendo"
    | "reintentando"
    | "verificando"
    | "verificado"
    | "disponible"
    | "interrumpido"
    | "rechazado"
    | "cancelado"
    | "error";

const TERMINALES: ReadonlySet<FaseArchivoNeurona> = new Set(["verificado", "disponible", "rechazado", "cancelado", "error"]);

export function faseArchivoTerminal(f: FaseArchivoNeurona): boolean {
    return TERMINALES.has(f);
}

/**
 * (ARC1108A) Por qué camino fue un archivo, en palabras: distingue los dos que la pastilla llama
 * igual («Red local (app nativa)»): el canal TCP 47071 y el enlace WebRTC que abren solas las dos apps.
 * Puro.
 */
export function rutaDeArchivo(via: Pick<ViaMensaje, "enlaceId" | "enlace" | "medio"> | null | undefined, enlaces?: readonly string[] | null): string {
    const id = via?.enlaceId ?? "";
    let ruta: string;
    if (id.startsWith("nativo:")) ruta = "Red local (app nativa) · canal TCP 47071";
    else if (id.startsWith("local:nativo-")) ruta = "Red local (app nativa) · enlace directo WebRTC";
    else if (id.startsWith("local:")) ruta = "Enlace directo sin internet (emparejado con código)";
    else if (id.startsWith("cuenta:")) ruta = "Malla de tu cuenta (WebRTC)";
    else if (id.startsWith("par:")) ruta = "Vínculo entre cuentas (P2P)";
    else if (id === "servidor" || via?.medio === "servidor") ruta = "Almacenamiento de tu cuenta";
    else ruta = via?.medio ? INFO_MEDIOS[via.medio]?.nombre ?? "sin dato" : "sin dato";
    const hacia = (enlaces ?? []).filter(Boolean).slice(0, 3).join(", ") || via?.enlace || "";
    return hacia ? `${ruta} — hacia ${hacia}` : ruta;
}

const CODIGOS_ERROR_ARCHIVO: Record<string, string> = {
    "hash-no-coincide": "la verificación de integridad (SHA-256) no coincide: lo que llegó no es idéntico al original",
    "faltan-trozos": "no llegaron todos los trozos",
    "almacen-receptor": "no pudo guardar o releer los trozos en su almacenamiento",
    "fallo-verificacion": "falló al verificar el archivo",
    "sin-confirmacion": "no confirmó la verificación a tiempo",
};

/**
 * (ARC1108A) El motivo de un archivo, legible: las burbujas guardadas antes de ARC1108A tienen el
 * código suelto («hash-no-coincide»); se traduce y se dice en qué lado falló. Lo demás, tal cual. Puro.
 */
export function motivoArchivoLegible(motivo: string | null | undefined, dir: "sale" | "entra"): string | undefined {
    if (!motivo) return undefined;
    const t = motivo.trim();
    const desc = CODIGOS_ERROR_ARCHIVO[t];
    if (!desc) return t;
    return dir === "sale" ? `Falló en el receptor: ${desc}.` : `Falló en este aparato (receptor): ${desc}.`;
}

/** Traduce la fase del motor P2P a la del chat. Pura. */
export function faseDesdeMotor(fase: FaseMotorArchivo): FaseArchivoNeurona {
    switch (fase) {
        case "pendiente-aceptar":
            return "por-aceptar";
        case "esperando-aceptacion":
            return "ofrecido";
        case "transfiriendo":
            return "transfiriendo";
        case "reintentando":
            return "reintentando";
        case "verificando":
            return "verificando";
        case "completada":
            return "verificado";
        case "rechazada":
            return "rechazado";
        case "cancelada":
            return "cancelado";
        default:
            return "error";
    }
}

/** Al volver a abrir el OS, lo que estaba a medias ya no tiene motor: queda «interrumpido». Pura. */
export function faseTrasRecarga(f: FaseArchivoNeurona | undefined): FaseArchivoNeurona | undefined {
    if (!f) return f;
    return faseArchivoTerminal(f) ? f : "interrumpido";
}

export interface ConfirmacionesArchivo {
    /** Salió de este aparato (la oferta o la subida). */
    enviado: boolean;
    /** El otro aparato lo aceptó y lo está recibiendo, o ya lo tiene. */
    recibido: boolean;
    /** Verificado con SHA-256 por quien lo recibió. */
    verificado: boolean;
}

/** Confirmaciones de un archivo según su fase y su sentido. Pura. */
export function confirmacionesArchivo(f: FaseArchivoNeurona, dir: "sale" | "entra"): ConfirmacionesArchivo {
    const verificado = f === "verificado";
    if (dir === "entra") {
        const recibido = verificado || f === "verificando" || f === "disponible";
        return { enviado: true, recibido, verificado };
    }
    const enviado = f !== "preparando" && f !== "subiendo" && f !== "error";
    const recibido = verificado || f === "transfiriendo" || f === "reintentando" || f === "verificando";
    return { enviado, recibido, verificado };
}

/** Texto corto del estado de un archivo («Esperando que lo acepte», «Verificado (SHA-256)»…). Pura. */
export function textoFaseArchivo(f: FaseArchivoNeurona, dir: "sale" | "entra", porcentaje?: number | null): string {
    const pct = typeof porcentaje === "number" && Number.isFinite(porcentaje) ? ` · ${Math.max(0, Math.min(100, Math.round(porcentaje)))} %` : "";
    switch (f) {
        case "preparando":
            return "Preparando (calculando SHA-256)";
        case "subiendo":
            return `Subiendo al almacenamiento de tu cuenta${pct}`;
        case "ofrecido":
            return "Ofrecido: espera que lo acepte";
        case "por-aceptar":
            return "Te lo ofrece: acéptalo para recibirlo";
        case "transfiriendo":
            return `${dir === "sale" ? "Enviando" : "Recibiendo"}${pct}`;
        case "reintentando":
            return `Reintentando${pct}`;
        case "verificando":
            return "Verificando SHA-256";
        case "verificado":
            return "Verificado (SHA-256)";
        case "disponible":
            return dir === "sale" ? "Subido: disponible con el enlace" : "Disponible para bajar";
        case "interrumpido":
            return dir === "sale" ? "Interrumpido: reanuda desde donde quedó" : "Interrumpido: se reanuda cuando lo reenvíen";
        case "rechazado":
            return "Rechazado";
        case "cancelado":
            return "Cancelado";
        default:
            return "Error";
    }
}

/** Porcentaje de una transferencia (null si no aplica). Pura. */
export function porcentajeTransferencia(progreso: number, trozos: number): number | null {
    if (!Number.isFinite(progreso) || !Number.isFinite(trozos) || trozos <= 0) return null;
    return Math.max(0, Math.min(100, (progreso / trozos) * 100));
}

/* ══════════════════════════ Registro de una llamada ══════════════════════════ */

export type FaseRegistroLlamada = "sonando" | "en-curso" | "terminada" | "perdida" | "rechazada" | "fallida";

export interface RegistroLlamada {
    fase: FaseRegistroLlamada;
    /** Epoch ms en que se contestó. */
    inicio?: number;
    /** Epoch ms en que acabó. */
    fin?: number;
    motivo?: string;
}

export type EventoRegistroLlamada =
    | { t: "contestada"; en: number }
    | { t: "colgada"; en: number; motivo?: string }
    | { t: "rechazada"; en: number; motivo?: string }
    | { t: "sin-respuesta"; en: number }
    | { t: "fallo"; en: number; motivo: string };

/**
 * Avanza el registro de una llamada de un chat de neurona (lo que dice la burbuja). Pura: un
 * evento que no aplica en esa fase deja el registro igual (nunca retrocede una llamada acabada).
 */
export function avanzarRegistroLlamada(r: RegistroLlamada, ev: EventoRegistroLlamada): RegistroLlamada {
    const acabada = r.fase !== "sonando" && r.fase !== "en-curso";
    if (acabada) return r;
    switch (ev.t) {
        case "contestada":
            return r.fase === "sonando" ? { fase: "en-curso", inicio: ev.en } : r;
        case "colgada":
            return r.fase === "en-curso"
                ? { ...r, fase: "terminada", fin: ev.en, ...(ev.motivo ? { motivo: ev.motivo } : {}) }
                : { fase: "perdida", fin: ev.en, ...(ev.motivo ? { motivo: ev.motivo } : {}) };
        case "rechazada":
            return r.fase === "sonando" ? { fase: "rechazada", fin: ev.en, ...(ev.motivo ? { motivo: ev.motivo } : {}) } : r;
        case "sin-respuesta":
            return r.fase === "sonando" ? { fase: "perdida", fin: ev.en, motivo: "nadie contestó" } : r;
        case "fallo":
            return r.fase === "en-curso"
                ? { ...r, fase: "terminada", fin: ev.en, motivo: ev.motivo }
                : { fase: "fallida", fin: ev.en, motivo: ev.motivo };
        default:
            return r;
    }
}

/** Al volver a abrir el OS, una llamada que sonaba o seguía ya no existe: se cierra su registro. Pura. */
export function registroTrasRecarga(r: RegistroLlamada | undefined): RegistroLlamada | undefined {
    if (!r) return r;
    if (r.fase === "sonando") return { ...r, fase: "perdida" };
    if (r.fase === "en-curso") return { ...r, fase: "terminada" };
    return r;
}

/** «0:42», «12:05», «1:02:03». Pura. */
export function duracionLegible(ms: number): string {
    if (!Number.isFinite(ms) || ms < 0) return "0:00";
    const s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const ss = String(s % 60).padStart(2, "0");
    return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/** Línea de estado de una llamada («En curso», «3:12», «Perdida», «Rechazada»). Pura. */
export function textoRegistroLlamada(r: RegistroLlamada | undefined, dir: "sale" | "entra"): string {
    if (!r) return dir === "sale" ? "Llamando…" : "Sonó aquí";
    switch (r.fase) {
        case "sonando":
            return dir === "sale" ? "Llamando…" : "Sonando";
        case "en-curso":
            return "En curso";
        case "terminada":
            return r.inicio && r.fin ? `Duró ${duracionLegible(r.fin - r.inicio)}` : "Terminada";
        case "perdida":
            return dir === "sale" ? "Sin respuesta" : "Sin contestar";
        case "rechazada":
            return "Rechazada";
        default:
            return r.motivo ? `No se pudo: ${r.motivo}` : "No se pudo";
    }
}

export type { PlanEnvio };
