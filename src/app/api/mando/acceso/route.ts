/**
 * GET /api/mando/acceso — ¿esta instancia abre el Puente de Mando del PROYECTO?
 * ─────────────────────────────────────────────────────────────────────────────
 * `/mando` tiene dos versiones:
 *   · el Mando del PROYECTO (consola de desarrollo de StarSeed OS), de acceso
 *     único del equipo: solo en la Mac del proyecto o su túnel privado;
 *   · «Mi Puente de Mando», el panel de cualquier persona para controlar su
 *     propio sistema.
 * La página necesita saber cuál mostrar SIN intentar cargar la consola (que en
 * el despliegue público responde 404 y dejaba una pantalla rota). Esta ruta
 * responde SIEMPRE 200 con un único booleano: la misma decisión que toma
 * `guardianMando` para el resto de `/api/mando/*`. No expone por qué, ni
 * variables de entorno, ni si hay sesión: solo sí o no.
 */

import { guardianMando } from "@/lib/mando/guardian";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
    let proyecto = false;
    try {
        proyecto = (await guardianMando(req)) === null;
    } catch {
        // Ante cualquier fallo, la respuesta segura es «no»: se ve el panel personal.
        proyecto = false;
    }
    return Response.json(
        { proyecto },
        { status: 200, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
}
