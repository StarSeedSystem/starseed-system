import { NextResponse } from "next/server";
import type { StoreSourceKind } from "@/lib/store/store-data";
import { publishToStore, type PublishInput } from "@/lib/store/store-data";

const ALLOWED_KIND = new Set(["package", "post", "file", "contact", "message", "page", "route", "external", "bookmark", "design", "personality"]);

export async function POST(req: Request): Promise<Response> {
    try {
        const body = await req.json();
        
        // Validación de body.kind y body.title
        if (!body.kind || !ALLOWED_KIND.has(body.kind)) {
            return NextResponse.json(
                { error: "Kind inválido" },
                { status: 400 }
            );
        }
        if (!body.title || typeof body.title !== "string" || body.title.trim().length === 0) {
            return NextResponse.json(
                { error: "Título inválido" },
                { status: 400 }
            );
        }
        
        // Sanitizar título (eliminar rutas de archivo y rutas de navegación)
        const sanitizedTitle = body.title
            .trim()
            .replace(/\.\.(\\\\|\/)?/g, "")
            .replace(/^\//, "")
            .replace(/\\/g, "/");
        
        if (sanitizedTitle.length === 0) {
            return NextResponse.json(
                { error: "Título no válido después de sanitizar" },
                { status: 400 }
            );
        }
        
        // Construir input compatible con publishToStore
        const input: PublishInput = {
            category: body.kind || "recurso",
            title: sanitizedTitle,
            description: body.note,
            payload: body,
            sourceKind: body.kind as StoreSourceKind,
            sourceRef: body.route || undefined,
            license: body.license || "StarSeed Public",
        };
        const published = await publishToStore(input);
        if (!published) {
            return NextResponse.json(
                { error: "No se pudo publicar el ítem" },
                { status: 500 }
            );
        }
        return NextResponse.json({ ok: true, item: published }, { status: 200 });
    } catch (err: any) {
        console.error("Error en /api/publish-item:", err);
        return NextResponse.json(
            { error: err.message || "Error interno" },
            { status: 500 }
        );
    }
}