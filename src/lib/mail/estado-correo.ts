"use client";

/**
 * ESTADO REAL DEL CORREO DE LA RED (Adenda 206 · 2026-09-01)
 * ─────────────────────────────────────────────────────────────────────────────
 * Una sola fuente de verdad para que TODAS las áreas del OS —Correos, la
 * configuración inicial, las notificaciones— digan lo mismo y digan la verdad:
 *
 *   · `recibe`  → hay dominio público configurado (Cloudflare Email Routing
 *                 entrega `usuario@<dominio>` en la bandeja de la red).
 *   · `envia`   → además hay proveedor de envío verificado, así que el correo
 *                 SALE de verdad a Gmail, Outlook o donde sea.
 *
 * Se consulta al servidor una vez por sesión y se cachea: la respuesta depende
 * del despliegue, no del usuario. Nunca lanza; ante cualquier fallo se asume lo
 * más conservador (no promete lo que no puede cumplir).
 */

import { dominioPublico } from "@/lib/mail/direccion-publica";

export interface EstadoCorreo {
    /** Puede RECIBIR de todo internet en la dirección pública. */
    recibe: boolean;
    /** Puede ENVIAR a todo internet desde la dirección pública. */
    envia: boolean;
    /** Dominio público (`star.seed.dpdns.org`), o "" si no hay. */
    dominio: string;
    /** Proveedor de envío activo, para diagnóstico. */
    proveedor: string | null;
}

const CONSERVADOR: EstadoCorreo = { recibe: false, envia: false, dominio: "", proveedor: null };

let cache: EstadoCorreo | null = null;
let enVuelo: Promise<EstadoCorreo> | null = null;

/** Estado del correo de la red. Cacheado por sesión; nunca lanza. */
export async function estadoCorreo(): Promise<EstadoCorreo> {
    if (cache) return cache;
    if (enVuelo) return enVuelo;

    enVuelo = (async () => {
        const dom = dominioPublico();
        try {
            const r = await fetch("/api/mail/enviar", { method: "GET" });
            const j = (await r.json()) as { disponible?: boolean; proveedor?: string | null; dominio?: string | null };
            cache = {
                recibe: !!(j?.dominio || dom),
                envia: !!j?.disponible,
                dominio: (j?.dominio || dom || "").trim(),
                proveedor: j?.proveedor ?? null,
            };
        } catch {
            // Sin respuesta del servidor: solo afirmamos lo que sabemos en cliente.
            cache = { ...CONSERVADOR, recibe: !!dom, dominio: dom };
        } finally {
            enVuelo = null;
        }
        return cache!;
    })();

    return enVuelo;
}

/** Versión síncrona con lo ya cacheado (o el estado conservador). */
export function estadoCorreoCacheado(): EstadoCorreo {
    return cache ?? { ...CONSERVADOR, recibe: !!dominioPublico(), dominio: dominioPublico() };
}

/**
 * Frase única que describe el estado, para no escribir tres versiones distintas
 * del mismo hecho en tres pantallas.
 */
export function fraseEstadoCorreo(e: EstadoCorreo): string {
    if (e.envia && e.recibe) {
        return `Recibes y envías correo con todo internet en @${e.dominio}.`;
    }
    if (e.recibe) {
        return `Ya recibes correo de todo internet en @${e.dominio}. El envío desde el OS aún no está activado en este despliegue.`;
    }
    return "Tu dirección @star.seed funciona dentro de la red StarSeed. La dirección para todo internet se activará en cuanto la red conecte su dominio público.";
}
