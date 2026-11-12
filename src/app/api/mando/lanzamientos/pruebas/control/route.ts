/**
 * POST /api/mando/lanzamientos/pruebas/control (PRB1111V)
 * ─────────────────────────────────────────────────────────────────────────────
 * Lo que Alex pide al director de pruebas desde el panel «Pruebas»: compilar, cancelar, reintentar lo que falló,
 * volver a publicar el manifiesto o pedir arreglo a la dirección. NADA se ejecuta aquí: cada pulsación escribe UNA
 * petición en `pruebas-peticiones/<id>.json` (formato de PRB1111W) y el director la lee en su próxima pasada.
 *
 * ⚠️ Solo desde la Genesis local: `guardianMando` + esta máquina + la propia página (`Sec-Fetch-Site: same-origin`).
 * Si el director no corre (sin estado, parado, ilegible o en pausa), responde 409 con el motivo y NO escribe: una
 * petición que nadie lee es una promesa falsa. Dos pulsaciones seguidas no escriben dos peticiones.
 */

import { guardianMando } from "@/lib/mando/guardian";
import { leerComprobaciones } from "@/lib/mando/lanzamientos-pruebas-fuentes";
import { peticionPendienteDe, validarControl, vistaDirector } from "@/lib/mando/pruebas-vivas";
import { escribirPeticion, leerDirectorArchivo, leerPeticiones } from "@/lib/mando/pruebas-vivas-fuentes";
import { esPeticionDeEstaMaquina } from "@/lib/seguridad/misma-maquina";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };
const error = (mensaje: string, status: number) => Response.json({ error: mensaje }, { status, headers: SIN_CACHE });

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    if (!esPeticionDeEstaMaquina(peticion) || peticion.headers.get("sec-fetch-site") !== "same-origin") {
        return error("Solo se pide al director de pruebas desde Genesis en esta Mac.", 403);
    }
    let cuerpo: unknown;
    try {
        cuerpo = await peticion.json();
    } catch {
        return error("Cuerpo JSON inválido.", 400);
    }
    const p = validarControl(cuerpo);
    if ("error" in p) return error(p.error, 400);

    const director = await leerDirectorArchivo();
    const vista = vistaDirector(director, Date.now());
    if (!vista.leePeticiones) return error(vista.texto, 409);

    if (p.accion === "pedir-arreglo") {
        const archivo = await leerComprobaciones();
        const prueba = archivo.pruebas[String(p.prueba)];
        if (p.comprobacion && !prueba?.comprobaciones.some((c) => c.id === p.comprobacion)) {
            return error(`No existe la comprobación ${p.comprobacion} de la prueba.${p.prueba}.`, 404);
        }
    }
    const previas = await leerPeticiones(director);
    const repetida = peticionPendienteDe(p.accion, previas);
    if (repetida) return error(`Ya hay una petición «${p.accion}» sin atender (${repetida.id}): el director aún no la ha leído.`, 409);

    try {
        const id = await escribirPeticion(p);
        return Response.json({ ok: true, id, accion: p.accion }, { headers: SIN_CACHE });
    } catch {
        return error("No se pudo escribir la petición.", 500);
    }
}
