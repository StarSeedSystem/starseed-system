/**
 * Memoria corta de tokens ya verificados por el guardián de `/api/mando/*` (2026-10-10).
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUÉ: con MetaGenesis usado desde otra neurona, CADA lectura de la consola llega al motor
 * con `Authorization: Bearer` y el guardián hacía dos llamadas a Supabase (verificar el token y
 * `es_metagenesis()`). Con ~30 paneles sondeando eso son decenas de miles de peticiones al día,
 * y el presupuesto diario del proyecto es de 25.000 (vigia_consumo.py). Aquí se recuerda el
 * resultado como mucho 60 s y nunca más allá de la caducidad del propio token.
 *
 * SEGURIDAD: la clave es la HUELLA sha256 del token (nunca el token), en memoria del proceso,
 * acotada a 64 entradas; solo se recuerdan respuestas claras (miembro sí/no), nunca un fallo.
 * Puro salvo `huellaToken` (Web Crypto, sin `node:*`). Pruebas: `__tests__/cache-verificacion.test.ts`.
 */

export interface Verificacion {
    usuario: string;
    miembro: boolean;
}

/** Caducidad (`exp`, en segundos) de un JWT sin verificarlo; null si no se puede leer. */
export function expDelToken(token: string): number | null {
    const partes = token.split(".");
    if (partes.length !== 3) return null;
    try {
        const b64 = partes[1]!.replace(/-/g, "+").replace(/_/g, "/");
        const relleno = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
        const texto = typeof atob === "function" ? atob(relleno) : "";
        const exp = (JSON.parse(texto) as { exp?: unknown }).exp;
        return typeof exp === "number" && Number.isFinite(exp) ? exp : null;
    } catch {
        return null;
    }
}

/** Huella sha256 (hex) del token: lo único que se usa como clave. */
export async function huellaToken(token: string): Promise<string> {
    const datos = new TextEncoder().encode(token);
    const resumen = await crypto.subtle.digest("SHA-256", datos);
    return Array.from(new Uint8Array(resumen), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function crearCacheVerificaciones(opciones: { ttlMs?: number; max?: number; ahora?: () => number } = {}) {
    const ttlMs = opciones.ttlMs ?? 60_000;
    const max = Math.max(1, opciones.max ?? 64);
    const ahora = opciones.ahora ?? (() => Date.now());
    const mapa = new Map<string, { hasta: number; v: Verificacion }>();

    return {
        leer(huella: string): Verificacion | null {
            const e = mapa.get(huella);
            if (!e) return null;
            if (ahora() >= e.hasta) {
                mapa.delete(huella);
                return null;
            }
            return e.v;
        },
        /** Recuerda el resultado hasta `ttlMs` o hasta que caduque el token (lo que llegue antes). */
        guardar(huella: string, v: Verificacion, expSegundos: number | null): void {
            const t = ahora();
            const hasta = Math.min(t + ttlMs, expSegundos ? expSegundos * 1000 : t + ttlMs);
            if (hasta <= t) return;
            mapa.delete(huella);
            mapa.set(huella, { hasta, v });
            while (mapa.size > max) {
                const primera = mapa.keys().next().value;
                if (primera === undefined) break;
                mapa.delete(primera);
            }
        },
        tamano(): number {
            return mapa.size;
        },
    };
}
