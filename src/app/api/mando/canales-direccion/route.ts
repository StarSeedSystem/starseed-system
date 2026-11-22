import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { guardianMando } from "@/lib/mando/guardian";
import {
    enviarMensajeCanalEspecializado,
    esIdCanalEspecializado,
    obtenerEstadoCanalEspecializado,
} from "@/lib/mando/canales-direccion-servidor";
import {
    nombreDeCanal,
    type RegistroNombresCanales,
} from "@/lib/mando/canales-nombres";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SIN_CACHE = { "Cache-Control": "no-store" };

function leerNombresDelRegistro(): RegistroNombresCanales {
    try {
        const ruta = path.join(os.homedir(), ".starseed", "canales-direccion.json");
        const crudo = JSON.parse(readFileSync(ruta, "utf-8")) as unknown;
        return crudo && typeof crudo === "object" ? (crudo as RegistroNombresCanales) : {};
    } catch {
        return {};
    }
}

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
        const nombre = nombreDeCanal(canalRaw, leerNombresDelRegistro());
        return Response.json(
            {
                ...estado,
                nombre,
                perfil: {
                    ...estado.perfil,
                    nombre,
                    botNombre: nombre,
                    sesionHermesTitulo: nombre,
                },
                vinculo: { ...estado.vinculo, hermesTitulo: nombre },
            },
            { headers: SIN_CACHE },
        );
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
