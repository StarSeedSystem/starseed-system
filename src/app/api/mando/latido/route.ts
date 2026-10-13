/**
 * GET/POST /api/mando/latido (Ola 298 · LT2 · 2026-09-08)
 * ─────────────────────────────────────────────────────────────────────────────
 * GET  → { saludes, resumen, autocuracion }: la salud de cada cola (viva /
 *        huérfana / terminada / sin_latido), el titular para la cabecera del
 *        Genesis y el estado del interruptor de autocuración.
 * POST → { accion: "revivir", cola, trabajadores? }  — relanza una cola huérfana
 *        (rechaza si está viva: dos orquestadores se pisarían).
 *        { accion: "autocuracion", activa } — enciende/apaga el interruptor
 *        (por defecto APAGADA: se enciende a propósito).
 *        { accion: "barrido" } — revive hasta 2 huérfanas por pasada, si el
 *        interruptor está encendido.
 *
 * ⚠️ Nada de esto arranca solo desde el módulo: quien dispara el barrido es la
 * interfaz de Genesis (LT3) o una tarea programada; esta ruta solo responde a
 * quien la llama. Seguridad: puerta única `guardianMando` — 404 fuera de
 * local/STARSEED_MANDO; sesión solo en producción no local; nunca devuelve
 * claves ni rutas absolutas del disco.
 */

import { compartirCalculo } from "@/lib/mando/calculo-compartido";
import { guardianMando } from "@/lib/mando/guardian";
import { resumen, saludDeLasColas } from "@/lib/mando/latido-orquestador";
import { barridoAutocuracion, estadoAutocuracion, guardarAutocuracion, revivir } from "@/lib/mando/latido-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_ALMACEN = { "Cache-Control": "no-store" };

/**
 * (2026-10-13, medido) Con la Mac en presión de memoria esta lectura tardaba 8-12,5 s y la página de
 * MetaGenesis en otro aparato la usa como SONDA del túnel con un tope de 8 s: decía «la Mac está
 * apagada o sin túnel» con la Mac viva. Ahora se calcula una vez cada 10 s para todos y nadie
 * espera más de 1,5 s si ya hay un resultado anterior (que dice de cuándo es con `generadoEn`).
 */
const saludCompartida = compartirCalculo(
    async () => {
        const saludes = await saludDeLasColas();
        return { saludes, resumen: resumen(saludes), autocuracion: await estadoAutocuracion(), generadoEn: new Date().toISOString() };
    },
    10_000,
    undefined,
    1_500,
);

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    return Response.json(await saludCompartida(), { headers: SIN_ALMACEN });
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    let cuerpo: Record<string, unknown>;
    try {
        const crudo = (await peticion.json()) as unknown;
        cuerpo = typeof crudo === "object" && crudo !== null ? (crudo as Record<string, unknown>) : {};
    } catch {
        return Response.json({ error: "Cuerpo JSON inválido." }, { status: 400 });
    }
    const accion = typeof cuerpo.accion === "string" ? cuerpo.accion : "";

    if (accion === "revivir") {
        const cola = typeof cuerpo.cola === "string" ? cuerpo.cola.trim().toLowerCase() : "";
        if (cola === "") return Response.json({ error: "Falta la cola a revivir." }, { status: 400 });
        // Trabajadores opcional: sin valor usa el que decida `revivir` (2); el
        // orquestador techa el real en 1–8, aquí solo se rechazan burradas.
        const trabajadores = typeof cuerpo.trabajadores === "number" && Number.isFinite(cuerpo.trabajadores)
            ? Math.min(8, Math.max(1, Math.round(cuerpo.trabajadores)))
            : undefined;
        const r = await revivir(cola, trabajadores);
        return Response.json(r, { status: r.ok ? 200 : 409, headers: SIN_ALMACEN });
    }

    if (accion === "autocuracion") {
        if (typeof cuerpo.activa !== "boolean") {
            return Response.json({ error: "«activa» debe ser true o false." }, { status: 400 });
        }
        const estado = await guardarAutocuracion(cuerpo.activa);
        return Response.json({ ok: true, autocuracion: estado }, { headers: SIN_ALMACEN });
    }

    if (accion === "barrido") {
        const r = await barridoAutocuracion();
        return Response.json(r, { status: r.ok ? 200 : 500, headers: SIN_ALMACEN });
    }

    return Response.json({ error: "Acción desconocida." }, { status: 400 });
}
