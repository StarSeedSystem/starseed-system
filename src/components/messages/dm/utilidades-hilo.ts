/**
 * Utilidades puras del panel de chat (2026-09-28). Sin React ni red: nombres, fechas, grupos de
 * burbujas, búsqueda, exportación y lectura. Todo lo que aquí se decide se puede probar solo.
 */
import type { Contacto } from "@/lib/contactos/tipos";
import type { FormatoMensaje } from "@/lib/mensajeria/formato-tipos";
import type { CargaMultimedia } from "@/lib/mensajeria/ajustes-tipos";
import type { DmMessage, DmThreadSummary } from "@/lib/messages/dm";
import type { OsProfile } from "@/lib/social/os-profiles";

/** El formato enriquecido del mensaje, si lo trae (columna nueva: puede no existir aún). */
export function formatoDe(m: DmMessage): FormatoMensaje | null {
    const f = (m as DmMessage & { formato?: FormatoMensaje | null }).formato;
    return f && typeof f === "object" ? f : null;
}

/** El otro miembro de un chat de dos (o null en grupos / si no se sabe). */
export function otroMiembro(thread: Pick<DmThreadSummary, "kind" | "memberIds">, miUid: string | null): string | null {
    if (thread.kind === "group") return null;
    return thread.memberIds.find((id) => id && id !== miUid) ?? null;
}

/** Nombre con el que la persona aparece para mí: contacto > perfil > @usuario. */
export function nombrePersona(
    userId: string | null | undefined,
    perfiles: Record<string, OsProfile>,
    contacto?: Pick<Contacto, "nombre" | "apodo"> | null,
): string | null {
    const guardado = contacto?.nombre?.trim() || contacto?.apodo?.trim();
    if (guardado) return guardado;
    if (!userId) return null;
    const p = perfiles[userId];
    if (p?.displayName?.trim()) return p.displayName.trim();
    if (p?.username?.trim()) return `@${p.username.trim()}`;
    return null;
}

export interface EntradaNombreHilo {
    thread: Pick<DmThreadSummary, "kind" | "memberIds" | "title">;
    miUid: string | null;
    perfiles: Record<string, OsProfile>;
    /** Apodo propio de este chat (ajustes del hilo). */
    apodo?: string | null;
    /** Contacto guardado del otro (solo chats de dos). */
    contacto?: Pick<Contacto, "nombre" | "apodo"> | null;
}

/**
 * Nombre real del chat. Orden: apodo del hilo › (grupo: su título) › contacto › nombre del
 * perfil › @usuario › título guardado › genérico. Nunca «Conversación» si el perfil existe.
 */
export function resolverNombreHilo({ thread, miUid, perfiles, apodo, contacto }: EntradaNombreHilo): string {
    if (apodo?.trim()) return apodo.trim();
    if (thread.kind === "group") return thread.title?.trim() || "Grupo sin nombre";
    const otro = otroMiembro(thread, miUid);
    return nombrePersona(otro, perfiles, contacto) || thread.title?.trim() || "Conversación";
}

/** Primer nombre corto para listas («Ana García» → «Ana»; «@ana» se queda). */
export function nombreCorto(nombre: string): string {
    const limpio = nombre.trim();
    if (limpio.startsWith("@")) return limpio;
    return limpio.split(/\s+/)[0] || limpio;
}

/** «Ana, Luis y 3 más» (sin contarme a mí). */
export function resumenMiembros(ids: string[], miUid: string | null, nombreDe: (id: string) => string): string {
    const otros = ids.filter((id) => id && id !== miUid);
    if (otros.length === 0) return "Solo tú";
    const nombres = otros.slice(0, 2).map((id) => nombreCorto(nombreDe(id)));
    const resto = otros.length - nombres.length;
    if (resto <= 0) return nombres.length === 2 ? `${nombres[0]} y ${nombres[1]}` : nombres[0];
    return `${nombres.join(", ")} y ${resto} más`;
}

/** Texto de «escribiendo…»: en un chat de dos basta el verbo; en grupo, quién. */
export function textoEscribiendo(ids: string[], esGrupo: boolean, nombreDe: (id: string) => string): string | null {
    if (!ids.length) return null;
    if (!esGrupo) return "escribiendo…";
    if (ids.length === 1) return `${nombreCorto(nombreDe(ids[0]))} está escribiendo…`;
    if (ids.length === 2) return `${nombreCorto(nombreDe(ids[0]))} y ${nombreCorto(nombreDe(ids[1]))} están escribiendo…`;
    return `${ids.length} personas están escribiendo…`;
}

// ───────────────────────────── Fechas ─────────────────────────────

/** Clave del día local (AAAA-MM-DD). */
export function claveDia(iso: string): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "sin-fecha";
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${d.getFullYear()}-${mm}-${dd}`;
}

/** «Hoy», «Ayer», «lunes 21 de septiembre» (con el año si no es el actual). */
export function etiquetaDia(iso: string, ahora: Date = new Date()): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const hoy = claveDia(ahora.toISOString());
    const ayer = new Date(ahora);
    ayer.setDate(ayer.getDate() - 1);
    const k = claveDia(iso);
    if (k === hoy) return "Hoy";
    if (k === claveDia(ayer.toISOString())) return "Ayer";
    const opciones: Intl.DateTimeFormatOptions = { weekday: "long", day: "numeric", month: "long" };
    if (d.getFullYear() !== ahora.getFullYear()) opciones.year = "numeric";
    // «lunes 21 de septiembre» (sin la coma que añade Intl tras el día de la semana).
    return d.toLocaleDateString("es-ES", opciones).replace(/^([^\s,]+),/, "$1");
}

/** Hora del mensaje según el formato elegido. */
export function formatearHora(iso: string, formato24h: boolean): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", hour12: !formato24h });
}

/** Fecha y hora completas (visor, exportación). */
export function fechaCompleta(iso: string, formato24h = true): string {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })} · ${formatearHora(iso, formato24h)}`;
}

// ───────────────────────── Agrupación de burbujas ─────────────────────────

/** Dos mensajes seguidos del mismo remitente con menos de esto entre ellos van juntos. */
export const VENTANA_GRUPO_MS = 5 * 60 * 1000;

export interface MensajeEnLista {
    mensaje: DmMessage;
    /** Empieza un día nuevo: va un separador antes. */
    nuevoDia: boolean;
    primeroDelGrupo: boolean;
    ultimoDelGrupo: boolean;
}

function mismoAutor(a: DmMessage, b: DmMessage): boolean {
    return a.sender === b.sender && a.kind === b.kind && a.kind !== "system";
}

export function agruparMensajes(mensajes: DmMessage[]): MensajeEnLista[] {
    return mensajes.map((m, i) => {
        const prev = mensajes[i - 1];
        const next = mensajes[i + 1];
        const nuevoDia = !prev || claveDia(prev.createdAt) !== claveDia(m.createdAt);
        const pegadoAlAnterior =
            !!prev && !nuevoDia && mismoAutor(prev, m) &&
            Math.abs(new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime()) < VENTANA_GRUPO_MS;
        const pegadoAlSiguiente =
            !!next && claveDia(next.createdAt) === claveDia(m.createdAt) && mismoAutor(m, next) &&
            Math.abs(new Date(next.createdAt).getTime() - new Date(m.createdAt).getTime()) < VENTANA_GRUPO_MS;
        return { mensaje: m, nuevoDia, primeroDelGrupo: !pegadoAlAnterior, ultimoDelGrupo: !pegadoAlSiguiente };
    });
}

// ───────────────────────────── Vaciado ─────────────────────────────

/** Oculta (solo para mí) lo anterior a `vaciadoEn`. Nada se borra. */
export function mensajesVisibles(
    mensajes: DmMessage[],
    vaciadoEn: string | null,
    mostrarTodo: boolean,
): { visibles: DmMessage[]; ocultos: number } {
    if (!vaciadoEn || mostrarTodo) return { visibles: mensajes, ocultos: 0 };
    const corte = new Date(vaciadoEn).getTime();
    if (Number.isNaN(corte)) return { visibles: mensajes, ocultos: 0 };
    const visibles = mensajes.filter((m) => new Date(m.createdAt).getTime() > corte);
    return { visibles, ocultos: mensajes.length - visibles.length };
}

// ───────────────────────────── Búsqueda ─────────────────────────────

/** Minúsculas sin tildes, letra a letra (conserva las posiciones para resaltar). */
export function plegar(s: string): string {
    let out = "";
    for (const ch of s) {
        const base = ch.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
        // Conserva la longitud en unidades UTF-16 del carácter original.
        out += base.length === ch.length ? base : ch.toLowerCase().slice(0, ch.length).padEnd(ch.length, " ");
    }
    return out;
}

/** Texto donde se busca: cuerpo, nombres de adjuntos. */
export function textoBuscable(m: DmMessage): string {
    return [m.body, ...m.attachments.map((a) => a.name ?? "")].join(" \n ");
}

/** Ids de los mensajes que contienen el texto (sin distinguir tildes ni mayúsculas). */
export function buscarCoincidencias(mensajes: DmMessage[], q: string): string[] {
    const aguja = plegar(q.trim());
    if (!aguja) return [];
    return mensajes.filter((m) => !m.deleted && plegar(textoBuscable(m)).includes(aguja)).map((m) => m.id);
}

/** Parte un texto en tramos con/sin coincidencia para pintar el resaltado. */
export function partirResaltado(texto: string, q: string): { texto: string; coincide: boolean }[] {
    const aguja = plegar(q.trim());
    if (!aguja || !texto) return [{ texto, coincide: false }];
    const pajar = plegar(texto);
    const tramos: { texto: string; coincide: boolean }[] = [];
    let desde = 0;
    for (;;) {
        const i = pajar.indexOf(aguja, desde);
        if (i < 0) break;
        if (i > desde) tramos.push({ texto: texto.slice(desde, i), coincide: false });
        tramos.push({ texto: texto.slice(i, i + aguja.length), coincide: true });
        desde = i + aguja.length;
    }
    if (desde < texto.length) tramos.push({ texto: texto.slice(desde), coincide: false });
    return tramos.length ? tramos : [{ texto, coincide: false }];
}

// ───────────────────────────── Lectura ─────────────────────────────

export type EstadoLectura = "enviado" | "leido-parcial" | "leido";

/** Marcas remotas de lectura (`meta.readMarks[uid] = ISO`). */
export function marcasLectura(thread: Pick<DmThreadSummary, "meta">): Record<string, string> {
    const raw = (thread.meta as { readMarks?: unknown } | null)?.readMarks;
    return raw && typeof raw === "object" ? (raw as Record<string, string>) : {};
}

/** ¿Los demás han visto mi mensaje? (según sus marcas de lectura remotas). */
export function estadoLectura(
    m: Pick<DmMessage, "createdAt">,
    thread: Pick<DmThreadSummary, "memberIds" | "meta">,
    miUid: string | null,
): EstadoLectura {
    const otros = thread.memberIds.filter((id) => id && id !== miUid);
    if (!otros.length) return "enviado";
    const marcas = marcasLectura(thread);
    const t = new Date(m.createdAt).getTime();
    const vistos = otros.filter((id) => {
        const k = marcas[id];
        return !!k && new Date(k).getTime() >= t;
    }).length;
    if (vistos === 0) return "enviado";
    return vistos === otros.length ? "leido" : "leido-parcial";
}

// ───────────────────────────── Multimedia ─────────────────────────────

/** ¿Cargo imágenes/vídeos solos? «wifi» se respeta solo si el navegador sabe decirlo. */
export function debeCargarMultimedia(modo: CargaMultimedia): boolean {
    if (modo === "siempre") return true;
    if (modo === "nunca") return false;
    try {
        const c = (navigator as Navigator & { connection?: { type?: string; saveData?: boolean } }).connection;
        if (!c) return true;
        if (c.saveData) return false;
        if (!c.type) return true;
        return c.type === "wifi" || c.type === "ethernet";
    } catch {
        return true;
    }
}

// ───────────────────────────── Exportar ─────────────────────────────

export function exportarChatTexto(
    titulo: string,
    mensajes: DmMessage[],
    nombreDe: (m: DmMessage) => string,
    formato24h = true,
): string {
    const lineas = [`Chat: ${titulo}`, `Exportado el ${fechaCompleta(new Date().toISOString(), formato24h)}`, ""];
    for (const m of mensajes) {
        const d = new Date(m.createdAt);
        const cuando = Number.isNaN(d.getTime())
            ? ""
            : `${d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" })} ${formatearHora(m.createdAt, formato24h)}`;
        const quien = nombreDe(m);
        if (m.deleted) {
            lineas.push(`[${cuando}] ${quien}: (mensaje eliminado)`);
            continue;
        }
        lineas.push(`[${cuando}] ${quien}: ${m.body || ""}`.trimEnd());
        for (const a of m.attachments) {
            const destino = a.url && !a.url.startsWith("data:") ? ` ${a.url}` : a.route ? ` ${a.route}` : "";
            lineas.push(`    [adjunto: ${a.name || a.kind}]${destino}`);
        }
    }
    return lineas.join("\n");
}

/** Nombre de archivo seguro para descargas. */
export function nombreArchivoSeguro(base: string, extension: string): string {
    const limpio = plegar(base).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "chat";
    return `${limpio}.${extension}`;
}

// ───────────────────────────── Colores ─────────────────────────────

function hexARgb(hex: string): [number, number, number] | null {
    const h = hex.trim().replace(/^#/, "");
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    if (!/^[0-9a-f]{6}$/i.test(full)) return null;
    const n = parseInt(full, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Oscurece (t>0) o aclara (t<0) un hex. */
export function sombrear(hex: string, t: number): string {
    const rgb = hexARgb(hex);
    if (!rgb) return hex;
    const destino = t >= 0 ? 0 : 255;
    const k = Math.min(1, Math.abs(t));
    const c = rgb.map((v) => Math.round(v * (1 - k) + destino * k));
    return `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** ¿El texto sobre este color debe ser oscuro? (luminancia relativa). */
export function esColorClaro(hex: string): boolean {
    const rgb = hexARgb(hex);
    if (!rgb) return false;
    const [r, g, b] = rgb.map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45;
}

/** ¿Es un hex válido? */
export function esHex(v: string): boolean {
    return hexARgb(v) !== null;
}
