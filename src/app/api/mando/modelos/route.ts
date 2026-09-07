/**
 * GET /api/mando/modelos — todos los modelos que esta máquina puede usar ahora
 * (xKiro gratuitos, NIM, aihubmix, tokenrouter, OpenRouter, Gemini, Ollama local) con la
 * salud del supervisor del enjambre. Lleva además `proveedores` (Ola 271 · M9B: la
 * clasificación honesta por claves REALES de la máquina + salud + foto del bus) y
 * `agotados` (sinCupo + enfriandose), el número que muestra la cabecera del Mando.
 * Nunca devuelve claves, solo nombres de variables, medios y huellas.
 */
import { guardianMando } from "@/lib/mando/guardian";
import { leerLatidosDelBus } from "@/lib/mando/lector-local";
import { clavesPresentes, listarModelos, saludCruda } from "@/lib/mando/modelos-disponibles";
import { proveedoresDisponibles, type FotoProveedorBus } from "@/lib/mando/proveedores-catalogo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;
    const [modelos, claves, salud, bus] = await Promise.all([
        listarModelos(),
        clavesPresentes(),
        saludCruda(),
        leerLatidosDelBus(),
    ]);
    // Foto del bus por proveedor: de todos los orquestadores vivos gana el latido más nuevo.
    const foto: Record<string, FotoProveedorBus> = {};
    for (const enjambre of bus.enjambres) {
        for (const [proveedor, p] of Object.entries(enjambre.proveedores ?? {})) {
            const actual = foto[proveedor];
            const tNuevo = Date.parse(enjambre.t);
            const tViejo = actual?.t ? Date.parse(actual.t) : NaN;
            // Gana el latido más nuevo; con fechas ilegibles se conserva el primero visto.
            if (!actual || (!Number.isNaN(tNuevo) && (Number.isNaN(tViejo) || tNuevo > tViejo))) {
                foto[proveedor] = { estado: p.estado, t: enjambre.t };
            }
        }
    }
    const proveedores = proveedoresDisponibles({ salud, clavesPresentes: claves, foto, ahora: Date.now() });
    const agotados = proveedores.filter((p) => p.estado === "sinCupo" || p.estado === "enfriandose").length;
    return Response.json(
        { modelos, proveedores, agotados, generadoEn: new Date().toISOString() },
        { headers: { "Cache-Control": "no-store" } },
    );
}
