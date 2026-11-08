/**
 * Avisos de mensajes nuevos — lógica PURA (NOT1108A · 2026-11-08).
 * ═══════════════════════════════════════════════════════════════════════════════════
 * Contrato: architecture/avisos-mensajes.md.
 *
 * Qué aviso merece un mensaje nuevo según dónde está la persona:
 *   · en ESE chat, con la app a la vista → ninguno (ya lo está leyendo);
 *   · en otra sección del OS, con la app a la vista → aviso dentro del OS (toast con «Abrir») y centro;
 *   · con la app oculta, minimizada, sin foco o en segundo plano → notificación del SISTEMA y centro;
 *   · chat silenciado (o «Mensajes» sin notificaciones) → nada (el contador sí sube).
 * Además: la ruta que abre cada chat y el texto del aviso. Sin DOM, sin red, sin React.
 */

export type TipoChat = "neurona" | "chat-malla" | "dm";

export interface MensajeEntrante {
    /** Id del mensaje (el mismo por cualquier camino: así no se avisa dos veces). */
    id: string;
    /** Clave del chat: `n:<neurona>`, `c:<cuenta>` (neuronas) o `dm:<hilo>` (chats y grupos). */
    clave: string;
    tipo: TipoChat;
    /** Quién lo manda (nombre legible). */
    titulo: string;
    /** El texto (o una descripción: «Te manda «foto.jpg»»). */
    texto: string;
}

export interface Situacion {
    /** El documento está visible (`document.visibilityState === "visible"`). */
    visible: boolean;
    /** La ventana tiene el foco (`document.hasFocus()`). */
    enfocado: boolean;
    /** La clave del chat que la persona tiene abierto ahora (o null). */
    chatAbierto: string | null;
    /** Ese chat está silenciado (ajustes del chat o silencio global de Mensajes). */
    silenciado: boolean;
    /** «Mensajes» puede escribir en el centro de notificaciones (Ajustes → Notificaciones). */
    centroPermitido: boolean;
    /** «Mensajes» puede mostrar avisos emergentes. */
    popupsPermitidos: boolean;
    /** Hay notificaciones del sistema disponibles y concedidas en este medio. */
    sistemaDisponible: boolean;
}

export interface DecisionAviso {
    toast: boolean;
    centro: boolean;
    sistema: boolean;
    /** Por qué (para «Probar notificaciones» y las pruebas). */
    motivo: "leyendo" | "silenciado" | "a-la-vista" | "en-segundo-plano";
}

/** Decide los avisos de un mensaje nuevo. Pura. */
export function decidirAviso(m: Pick<MensajeEntrante, "clave">, s: Situacion): DecisionAviso {
    if (s.silenciado) return { toast: false, centro: false, sistema: false, motivo: "silenciado" };
    const aLaVista = s.visible && s.enfocado;
    if (aLaVista && s.chatAbierto === m.clave) return { toast: false, centro: false, sistema: false, motivo: "leyendo" };
    if (aLaVista) return { toast: s.popupsPermitidos, centro: s.centroPermitido, sistema: false, motivo: "a-la-vista" };
    // Oculta, minimizada, sin foco o en segundo plano: el sistema (y el centro, para verlo al volver).
    return { toast: false, centro: s.centroPermitido, sistema: s.sistemaDisponible && s.popupsPermitidos, motivo: "en-segundo-plano" };
}

/** La ruta de la web que abre ese chat (la misma regla que `ruta_chat` de avisos_mensajes.rs). */
export function rutaChat(clave: string): string {
    if (clave.startsWith("dm:")) return `/messages?vista=mensajes&hilo=${encodeURIComponent(clave.slice(3))}`;
    return `/messages?vista=neuronas&neurona=${encodeURIComponent(clave)}`;
}

/** Una ruta interna de la web y nada más (nunca otra web ni un esquema raro). */
export function rutaValida(r: unknown): r is string {
    return typeof r === "string" && r.startsWith("/") && !r.startsWith("//") && !r.includes("\\") && r.length <= 400 && !/[\u0000-\u001f]/.test(r);
}

/** Título y cuerpo del aviso (cuerpo recortado a una línea legible). */
export function textoAviso(m: Pick<MensajeEntrante, "titulo" | "texto" | "tipo">): { titulo: string; cuerpo: string } {
    const titulo = (m.titulo || "").trim().slice(0, 80) || (m.tipo === "neurona" ? "Una neurona" : "Mensaje nuevo");
    const limpio = (m.texto || "").replace(/\s+/g, " ").trim();
    const cuerpo = limpio.length > 180 ? `${limpio.slice(0, 177)}…` : limpio || "Mensaje nuevo.";
    return { titulo, cuerpo };
}

/** ¿El texto de un mensaje de neurona es solo un archivo, una llamada o un flujo? Su descripción. */
export function describirNeurona(c: { txt: string; adj?: { nombre?: string } | null; fd?: { nombre?: string } | null; ll?: unknown }): string {
    if (c.ll) return "Te está llamando.";
    if (c.adj) return `Te manda «${c.adj.nombre || "un archivo"}».${c.txt?.trim() ? ` ${c.txt.trim()}` : ""}`;
    if (c.fd) return `Empezó una transmisión en vivo («${c.fd.nombre || "sin nombre"}»).`;
    return c.txt || "";
}

/** Ids ya avisados (con tope): `apuntar` devuelve si era nuevo. */
export class Vistos {
    private cola: string[] = [];
    constructor(private readonly tope = 500) {}
    contiene(id: string): boolean {
        return this.cola.includes(id);
    }
    apuntar(id: string): boolean {
        if (this.cola.includes(id)) return false;
        this.cola.push(id);
        if (this.cola.length > this.tope) this.cola.splice(0, this.cola.length - this.tope);
        return true;
    }
}

/** Una ruta pendiente de una notificación pulsada caduca a los 10 min. */
export const PENDIENTE_VALIDA_MS = 10 * 60_000;

/** ¿La URL actual ya es la de esa ruta? (para no volver a navegar). */
export function mismaRuta(actual: { pathname: string; search: string }, ruta: string): boolean {
    try {
        const u = new URL(ruta, "http://x");
        if (u.pathname !== actual.pathname) return false;
        const a = new URLSearchParams(actual.search);
        for (const [k, v] of u.searchParams) if (a.get(k) !== v) return false;
        return true;
    } catch {
        return false;
    }
}
