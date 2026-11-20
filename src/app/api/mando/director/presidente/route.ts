import { guardianMando } from "@/lib/mando/guardian";
import {
    FUENTES_REGISTRO_HEADLESS,
    validarConfigPresidente,
    type AccionHeadlessPresidente,
    type FuenteRegistroHeadless,
} from "@/lib/mando/presidente-config";
import {
    ejecutarAccionHeadlessPresidente,
    guardarConfigPresidenteServidor,
    obtenerEstadoPresidenteServidor,
} from "@/lib/mando/presidente-servidor";

export const runtime = "nodejs";

const ACCIONES_PERMITIDAS = new Set<AccionHeadlessPresidente>([
    "enrutar-hermes",
    "reintentar-cola",
    "buscar-capacidad",
    "comprobar-pasarelas",
    "refrescar-acciones",
    "estado-pruebas",
    "sincronizar-ides",
    "probar-presidente",
]);

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const url = new URL(peticion.url);
    const fuenteRaw = url.searchParams.get("registro");
    const lineasRaw = Number(url.searchParams.get("lineas") ?? "40");
    const fuenteValida =
        fuenteRaw && FUENTES_REGISTRO_HEADLESS.some((f) => f.id === fuenteRaw)
            ? (fuenteRaw as FuenteRegistroHeadless)
            : undefined;

    const estado = await obtenerEstadoPresidenteServidor(
        fuenteValida,
        Number.isFinite(lineasRaw) ? lineasRaw : 40,
    );
    return Response.json(estado, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const cuerpo: unknown = await peticion.json().catch(() => null);
    const validado = validarConfigPresidente(cuerpo);
    if (!validado.ok) {
        return Response.json({ ok: false, errores: validado.errores }, { status: 400 });
    }
    const config = guardarConfigPresidenteServidor(validado.valor);
    return Response.json({ ok: true, config }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const cuerpo = (await peticion.json().catch(() => null)) as {
        accion?: string;
        mensaje?: string;
    } | null;

    const accion = cuerpo?.accion as AccionHeadlessPresidente | undefined;
    if (!accion || !ACCIONES_PERMITIDAS.has(accion)) {
        return Response.json({ ok: false, error: "Acción headless no reconocida." }, { status: 400 });
    }

    try {
        const res = await ejecutarAccionHeadlessPresidente(accion, cuerpo?.mensaje);
        return Response.json(res, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
        const detalle = err instanceof Error ? err.message : String(err);
        return Response.json({ ok: false, error: detalle }, { status: 500 });
    }
}
