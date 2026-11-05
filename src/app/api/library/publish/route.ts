// src/app/api/library/publish/route.ts
// API para publicar items de la Biblioteca sin fuga de datos (POST con payload JSON).
// Reemplaza la navegación por querystring en finder-view.tsx.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/client";
import type { EntityRef } from "@/lib/sync/entity-state";
import type { SavedItemType } from "@/lib/library/entity-library";

export const runtime = "nodejs";

const TABLE = "library_public_items";

interface PublishPayload {
    item: {
        id: string;
        type: SavedItemType;
        title: string;
        url?: string;
        route?: string;
        mime?: string;
        thumbnail?: string;
        content?: string;
        language?: string;
        description?: string;
        note?: string;
        tags: string[];
        folderId?: string | null;
    };
    category: string;
    destFolder?: string;
    entityRef: EntityRef;
}

function normalizeFolder(folder: string | null | undefined): string {
    return (folder ?? "").replace(/^\/+|\/+$/g, "").trim();
}

export async function POST(req: NextRequest) {
    try {
        const supabase = createClient();
        const { data: userData, error: authError } = await supabase.auth.getUser();
        if (authError || !userData?.user?.id) {
            return NextResponse.json({ ok: false, error: "Inicia sesión para publicar en la Librería." }, { status: 401 });
        }

        const payload: PublishPayload = await req.json();
        if (!payload.item?.id || !payload.item?.title) {
            return NextResponse.json({ ok: false, error: "El ítem debe tener id y título." }, { status: 400 });
        }

        const folder = normalizeFolder(payload.destFolder);
        const itemPayload: Record<string, unknown> = {
            url: payload.item.url,
            route: payload.item.route,
            mime: payload.item.mime,
            type: payload.item.type,
            thumbnail: payload.item.thumbnail,
            content: payload.item.content,
            language: payload.item.language,
            description: payload.item.description,
            ref: {
                entityKind: payload.entityRef.kind,
                entityId: payload.entityRef.id,
                itemId: payload.item.id,
            },
        };

        const { data, error } = await supabase
            .from(TABLE)
            .insert({
                owner: userData.user.id,
                category: payload.category || "otro",
                folder,
                name: payload.item.title,
                kind: payload.item.type,
                payload: itemPayload,
                tags: payload.item.tags ?? [],
            })
            .select("id")
            .single();

        if (error || !data) {
            return NextResponse.json({ ok: false, error: error?.message ?? "No se pudo publicar." }, { status: 500 });
        }

        const id = String((data as { id: string }).id);
        return NextResponse.json({ ok: true, id });
    } catch (e) {
        const message = e instanceof Error ? e.message : "Error al publicar.";
        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}