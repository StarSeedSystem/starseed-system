/**
 * Resumen SEGURO de la respuesta de `GET /api/llamadas/ice` (ver `ice.ts`).
 *
 * Lo usa `scripts/comprobar-turn.mjs` para comprobar si producción entrega un servidor TURN:
 * cuenta las URLs totales y las de TURN con credenciales, y solo expone el ESQUEMA y el HOST
 * de cada servidor de retransmisión — nunca usuario, credencial, puerto ni URL completa.
 * Es la gemela del clasificador embebido en el guion: si cambias una, cambia la otra.
 *
 * Puro: entrada → salida, sin red, disco ni procesos.
 */
import { normalizarIceServers } from "@/lib/llamadas/ice";

export interface ResumenIce {
    /** ¿Hay algún TURN utilizable (con usuario y credencial)? */
    turn: boolean;
    /** URLs totales (STUN + TURN), tal como las entregó la ruta. */
    urls: number;
    /** URLs de TURN con credenciales. */
    turnUrls: number;
    /** Hosts únicos de TURN, como `esquema:host` (sin puerto ni credenciales). */
    hosts: string[];
}

/** `turn:host:3478?transport=udp` → `turn:host`; `turn:[2001:db8::1]:3478` → `turn:2001:db8::1`. */
export function esquemaYHost(url: string): string | null {
    const m = /^(stun|stuns|turn|turns):([^?#/]+)/i.exec(url.trim());
    if (!m) return null;
    const corchete = /^\[([^\]]+)\]/.exec(m[2]);
    const host = corchete ? corchete[1] : m[2].split(":")[0] ?? "";
    return host ? `${m[1].toLowerCase()}:${host}` : null;
}

/** Clasifica la respuesta cruda de la ruta (JSON, array suelto, objeto suelto o `{ error }`). */
export function resumenIce(crudo: unknown): ResumenIce {
    const lista = normalizarIceServers(crudo);
    let urls = 0;
    let turnUrls = 0;
    const hosts: string[] = [];
    const vistas = new Set<string>();
    for (const s of lista) {
        const arr = Array.isArray(s.urls) ? s.urls : [s.urls];
        for (const u of arr) {
            if (typeof u !== "string") continue;
            urls++;
            if (/^turns?:/i.test(u)) {
                turnUrls++;
                const h = esquemaYHost(u);
                // Deduplica por HOST, no por esquema: turn: y turns: del mismo servidor salen una vez.
                const clave = h ? h.split(":").slice(1).join(":") : null;
                if (h && clave && !vistas.has(clave)) {
                    vistas.add(clave);
                    hosts.push(h);
                }
            }
        }
    }
    return { turn: turnUrls > 0, urls, turnUrls, hosts };
}

/** La línea exacta que imprime `scripts/comprobar-turn.mjs`. */
export function lineaResumenIce(r: ResumenIce): string {
    return `turn=${r.turn ? "si" : "no"} urls=${r.urls} turns=${r.turnUrls}`;
}
