import { NextResponse, type NextRequest } from "next/server";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";
import { entornoIceServidor, generarIceServidor, peticionDeOtroSitio } from "@/lib/llamadas/ice-servidor";

/**
 * GET /api/llamadas/ice — servidores ICE (STUN + TURN si está configurado) para las llamadas.
 *
 * Responde `{ iceServers, fuente, ttl }` (ver `src/lib/llamadas/ice-servidor.ts`). Abierta a
 * invitados sin cuenta (los enlaces públicos de llamada también necesitan TURN), pero:
 *  · nunca se guarda en caché (credenciales de corta duración, una por petición);
 *  · límite por IP en memoria (primera barrera; ver `@/lib/security/rate-limit`);
 *  · no se sirve a otras webs (`Sec-Fetch-Site: cross-site` / `Origin` ajeno).
 * Los secretos del proveedor solo viajan servidor → proveedor; aquí solo salen URLs y el
 * usuario/credencial temporales que el navegador necesita.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SIN_CACHE = { "Cache-Control": "no-store, max-age=0", Pragma: "no-cache" } as const;
const LIMITE_POR_MINUTO = 20;

export async function GET(req: NextRequest) {
    if (peticionDeOtroSitio(req.headers)) {
        return NextResponse.json({ error: "Solo para las llamadas de este OS." }, { status: 403, headers: SIN_CACHE });
    }
    const rl = rateLimit(`llamadas-ice:${clientIp(req)}`, LIMITE_POR_MINUTO, 60_000);
    if (!rl.allowed) {
        return NextResponse.json(
            { error: "Demasiadas peticiones seguidas. Espera un momento y vuelve a intentarlo." },
            { status: 429, headers: { ...SIN_CACHE, "Retry-After": String(rl.retryAfterSec) } },
        );
    }
    const respuesta = await generarIceServidor(entornoIceServidor());
    return NextResponse.json(respuesta, { headers: SIN_CACHE });
}
