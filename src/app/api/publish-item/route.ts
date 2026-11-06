import { NextResponse } from "next/server";
import { esCategoriaValida, esTituloValido, sanitizarTitulo } from "@/lib/store/validacion";

const VALID_SOURCE_KINDS = new Set(["app", "widget", "tema", "plantilla", "personalidad", "cerebro", "recurso", "calendario"]);

function validarEntrada(body: unknown): { error: string } | null {
    if (typeof body !== "object" || body === null) {
        return { error: "Cuerpo de solicitud inválido" };
    }
    const b = body as Record<string, unknown>;
    
    if (b.kind !== undefined && !esCategoriaValida(b.kind)) {
        return { error: "El campo 'kind' no es una categoría válida" };
    }
    
    if (b.title !== undefined && !esTituloValido(b.title)) {
        return { error: "El campo 'title' debe ser una cadena de 1-200 caracteres" };
    }
    
    return null;
}

export async function POST(req: Request): Promise<Response> {
    try {
        const body = await req.json();
        
        const error = validarEntrada(body);
        if (error) {
            return NextResponse.json({ error: error.error }, { status: 400 });
        }
        
        const b = body as Record<string, unknown>;
        const categoria = (b.kind as string) || "recurso";
        const tituloCrudo = (b.title as string) || "Sin título";
        const titulo = sanitizarTitulo(tituloCrudo);
        
        const input = {
            category: categoria,
            title: titulo,
            description: (b.note as string | undefined) ?? "",
            payload: b,
            sourceKind: (b.kind as string) ?? "manual",
            sourceRef: (b.route as string | undefined) ?? undefined,
            license: (b.license as string | undefined) ?? "StarSeed Public",
        };
        
        const published = await (await import("@/lib/store/store-data")).publishToStore(input);
        if (!published) {
            return NextResponse.json(
                { error: "No se pudo publicar el ítem" },
                { status: 500 }
            );
        }
        return NextResponse.json({ ok: true, item: published }, { status: 200 });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Error interno";
        return NextResponse.json(
            { error: message },
            { status: 500 }
        );
    }
}