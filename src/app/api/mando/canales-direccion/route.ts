import { guardianMando } from "@/lib/mando/guardian";
import {
    enviarMensajeCanalEspecializado,
    esIdCanalEspecializado,
    obtenerEstadoCanalEspecializado,
} from "@/lib/mando/canales-direccion-servidor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

export async function GET(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const canalRaw = new URL(peticion.url).searchParams.get("canal") ?? "audiovisual";
    if (!esIdCanalEspecializado(canalRaw)) {
        return Response.json(
            { ok: false, error: "Canal no válido. Usa principal, general o audiovisual." },
            { status: 400, headers: SIN_CACHE },
        );
    }

    try {
        const estado = await obtenerEstadoCanalEspecializado(canalRaw);
        return Response.json(estado, { headers: SIN_CACHE });
    } catch (err) {
        const detalle = err instanceof Error ? err.message : String(err);
        return Response.json({ ok: false, error: detalle }, { status: 500, headers: SIN_CACHE });
    }
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const cuerpo = (await peticion.json().catch(() => null)) as {
        canal?: string;
        texto?: string;
        origen?: string;
    } | null;

    const canal = cuerpo?.canal ?? "";
    if (!esIdCanalEspecializado(canal)) {
        return Response.json(
            { ok: false, error: "Canal de dirección no reconocido." },
            { status: 400, headers: SIN_CACHE },
        );
    }

    const texto = typeof cuerpo?.texto === "string" ? cuerpo.texto.trim() : "";
    if (!texto || texto.length > 4000) {
        return Response.json(
            { ok: false, error: "Escribe un mensaje entre 1 y 4000 caracteres." },
            { status: 400, headers: SIN_CACHE },
        );
    }

    try {
        const resultado = await enviarMensajeCanalEspecializado(
            canal,
            texto,
            typeof cuerpo?.origen === "string" ? cuerpo.origen : "metagenesis",
        );
        return Response.json(resultado, {
            status: resultado.ok ? 200 : 500,
            headers: SIN_CACHE,
        });
    } catch (err) {
        const detalle = err instanceof Error ? err.message : String(err);
        return Response.json({ ok: false, error: detalle }, { status: 500, headers: SIN_CACHE });
    }
}
