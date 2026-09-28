/**
 * Servidores ICE de las llamadas — PURO.
 *
 * STUN públicos para descubrir la ruta y, si el despliegue lo configura, un TURN propio
 * (NEXT_PUBLIC_TURN_URL/_USER/_CRED). Sin TURN, dos personas tras NAT simétrico pueden no
 * conectar: la interfaz lo dice con honestidad en vez de fingir.
 */

export interface EntornoTurn {
    url?: string | null;
    user?: string | null;
    cred?: string | null;
}

export const STUN_POR_DEFECTO: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun.cloudflare.com:3478" },
];

/** Las referencias literales a `process.env.NEXT_PUBLIC_*` las inlinea Next en el cliente. */
export function entornoTurn(): EntornoTurn {
    return {
        url: process.env.NEXT_PUBLIC_TURN_URL ?? null,
        user: process.env.NEXT_PUBLIC_TURN_USER ?? null,
        cred: process.env.NEXT_PUBLIC_TURN_CRED ?? null,
    };
}

export function servidoresIce(env: EntornoTurn = entornoTurn()): RTCIceServer[] {
    const lista: RTCIceServer[] = STUN_POR_DEFECTO.map((s) => ({ ...s }));
    const urls = (env.url ?? "")
        .split(",")
        .map((u) => u.trim())
        .filter((u) => /^turns?:/i.test(u));
    if (urls.length) {
        const turn: RTCIceServer = { urls: urls.length === 1 ? urls[0] : urls };
        if (env.user) turn.username = env.user;
        if (env.cred) turn.credential = env.cred;
        lista.push(turn);
    }
    return lista;
}

export function hayTurn(env: EntornoTurn = entornoTurn()): boolean {
    return servidoresIce(env).length > STUN_POR_DEFECTO.length;
}
