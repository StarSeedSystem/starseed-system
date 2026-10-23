/**
 * GET /api/recursos-ia/detectar — la máquina por dentro para «Recursos de IA por neurona».
 * ─────────────────────────────────────────────────────────────────────────────
 * Volúmenes (también externos), chip, RAM, GPU, sistema, herramientas y servidores de IA locales
 * de ESTA neurona (`detectarMaquina`, caché 60 s; `?fresco=1` vuelve a medir).
 * Puerta: el guardián de Genesis (sin sesión solo la propia máquina; 404 en producción salvo
 * despliegue local). Nunca devuelve secretos, variables de entorno ni el home real.
 * SOP: `architecture/recursos-ia-neurona.md`. Una ruta de Next solo exporta GET/runtime/dynamic:
 * la lógica vive en `src/lib/recursos-ia/deteccion-servidor.ts`.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { detectarMaquina } from "@/lib/recursos-ia/deteccion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
    const veto = await guardianMando(request);
    if (veto) return veto;
    const fresco = new URL(request.url).searchParams.get("fresco") === "1";
    const maquina = await detectarMaquina({ fresco });
    return Response.json({ maquina }, { headers: { "Cache-Control": "no-store" } });
}
