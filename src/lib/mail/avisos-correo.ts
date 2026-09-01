"use client";

/**
 * AVISOS DE CORREO EN EL CENTRO DE NOTIFICACIONES (Adenda 206 · 2026-09-01)
 * ─────────────────────────────────────────────────────────────────────────────
 * Ahora que `@star.seed.dpdns.org` recibe Y envía a todo internet, el correo
 * deja de vivir solo dentro de su sección: cada mensaje que sale y cada uno
 * que entra deja su rastro en el centro de notificaciones del OS, con enlace
 * directo al hilo.
 *
 * Reglas:
 *   · Un aviso por mensaje: la clave de deduplicación es el hilo o el id del
 *     proveedor, así que reabrir Correos no repite avisos viejos.
 *   · Solo se avisa de lo que ENTRÓ estando el usuario dentro; el histórico no
 *     se vuelca de golpe al centro la primera vez.
 *   · Nunca lanza: un fallo del centro de notificaciones jamás debe impedir
 *     que un correo se envíe o se lea.
 */

import { notifyFromApp } from "@/lib/notifications/app-notify";

const APP_ID = "correos";
const MARCA_VISTOS = "starseed.correos.avisados.v1";
/** Cuántos ids recordamos para no volver a avisar (ventana suficiente). */
const TOPE_VISTOS = 200;

function vistos(): string[] {
    try {
        const raw = window.localStorage.getItem(MARCA_VISTOS);
        const arr = raw ? (JSON.parse(raw) as unknown) : [];
        return Array.isArray(arr) ? (arr as string[]) : [];
    } catch {
        return [];
    }
}

function marcarVisto(id: string): boolean {
    try {
        const lista = vistos();
        if (lista.includes(id)) return false;
        lista.push(id);
        window.localStorage.setItem(MARCA_VISTOS, JSON.stringify(lista.slice(-TOPE_VISTOS)));
        return true;
    } catch {
        // Sin almacenamiento: mejor avisar que callar.
        return true;
    }
}

/** Aviso de correo EXTERNO enviado con éxito desde la dirección pública. */
export function avisarCorreoEnviado(params: { para: string; asunto: string; desde?: string; threadId?: string }): void {
    if (typeof window === "undefined") return;
    try {
        notifyFromApp({
            appId: APP_ID,
            title: `Correo enviado a ${params.para}`,
            body: params.desde
                ? `«${params.asunto}» salió desde ${params.desde}.`
                : `«${params.asunto}» salió de tu dirección StarSeed.`,
            level: "success",
            dedupeKey: `enviado::${params.threadId || `${params.para}::${params.asunto}`}`,
            icon: "Send",
            actions: params.threadId ? [{ label: "Ver en Correos", href: "/correos" }] : undefined,
        });
    } catch { /* el centro de notificaciones nunca bloquea el correo */ }
}

/** Aviso de correo entrante. `id` debe ser estable (id del hilo o del mensaje). */
export function avisarCorreoRecibido(params: { de: string; asunto: string; id: string; externo?: boolean }): void {
    if (typeof window === "undefined") return;
    if (!marcarVisto(params.id)) return; // ya avisado antes
    try {
        notifyFromApp({
            appId: APP_ID,
            title: params.externo ? `Correo de ${params.de}` : `Mensaje de ${params.de}`,
            body: params.asunto || "(sin asunto)",
            level: "info",
            dedupeKey: `recibido::${params.id}`,
            icon: "Mail",
            actions: [{ label: "Abrir Correos", href: "/correos" }],
        });
    } catch { /* idem */ }
}

/**
 * Marca como ya avisados los ids que existían ANTES de empezar a vigilar, para
 * que la primera carga no vuelque el histórico entero al centro.
 */
export function sembrarAvisados(ids: string[]): void {
    if (typeof window === "undefined" || !ids.length) return;
    try {
        const lista = vistos();
        const union = Array.from(new Set([...lista, ...ids]));
        window.localStorage.setItem(MARCA_VISTOS, JSON.stringify(union.slice(-TOPE_VISTOS)));
    } catch { /* sin almacenamiento */ }
}
