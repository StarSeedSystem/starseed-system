import { NextResponse } from "next/server";
import type { StoreSourceKind } from "@/lib/store/store-data";
import { publishToStore, type PublishInput } from "@/lib/store/store-data";

export async function POST(req: Request): Promise<Response> {
    try {
        const body = await req.json();
        // Construir input compatible con publishToStore
        const input: PublishInput = {
            category: body.kind || "recurso",
            title: body.title || "Sin título",
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