"use client";

/*
 * shared-board-space — modo COLABORATIVO de una pizarra compartida
 * (os_spaces kind='board', SOP §11). Distinto de shared-desktop-space.ts
 * (que posee una clave de localStorage global) porque CanvasBoard mantiene
 * su propio estado de React (`canvas`) en vez de leer directamente de
 * localStorage — así que aquí el hook devuelve el doc inicial + un setter
 * con debounce, y el propio componente decide cuándo aplicarlo a su estado.
 *
 * Uso en canvas-board.tsx:
 *   const boardSpace = useSharedBoardSpace(boardSpaceId);
 *   // al recibir boardSpace.remoteDoc (cambios de otro colaborador), fusionar
 *   // en el estado local `canvas` (blocks/edges); al mutar localmente,
 *   // boardSpace.pushDoc({blocks, edges}) con debounce interno.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getSpace, updateSpaceDoc, subscribeSpace, acceptSpaceInvite, type Space } from "@/lib/spaces/spaces";
import type { CanvasBlock } from "@/lib/canvas/canvas";
import type { CanvasEdge } from "@/lib/canvas/workcenters";

export interface BoardSpaceDoc {
    blocks: CanvasBlock[];
    edges: CanvasEdge[];
}

export interface UseSharedBoardSpace {
    space: Space | null;
    loading: boolean;
    /** Doc inicial (o el último recibido de OTRO colaborador) — null si no hay espacio o aún carga. */
    remoteDoc: BoardSpaceDoc | null;
    /** Empuja el doc actual del lienzo a la nube (debounce interno). No-op sin espacio abierto. */
    pushDoc: (doc: BoardSpaceDoc) => void;
}

function normalizeBoardDoc(raw: unknown): BoardSpaceDoc {
    const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    return {
        blocks: Array.isArray(r.blocks) ? (r.blocks as CanvasBlock[]) : [],
        edges: Array.isArray(r.edges) ? (r.edges as CanvasEdge[]) : [],
    };
}

/**
 * Hook de montaje único (por lienzo): si `spaceId` es no-nulo, entra en modo
 * colaborativo. Si es null, no-op total (comportamiento normal del lienzo
 * personal, sin ningún cambio).
 */
export function useSharedBoardSpace(spaceId: string | null, debounceMs = 900): UseSharedBoardSpace {
    const [space, setSpace] = useState<Space | null>(null);
    const [remoteDoc, setRemoteDoc] = useState<BoardSpaceDoc | null>(null);
    const [loading, setLoading] = useState(!!spaceId);
    const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!spaceId) {
            setSpace(null);
            setRemoteDoc(null);
            setLoading(false);
            return;
        }
        let alive = true;
        setLoading(true);
        void acceptSpaceInvite(spaceId); // best-effort: invited→member al abrir
        void getSpace(spaceId).then((sp) => {
            if (!alive) return;
            setSpace(sp);
            setRemoteDoc(sp ? normalizeBoardDoc(sp.doc) : null);
            setLoading(false);
        });
        const unsub = subscribeSpace(spaceId, (sp) => {
            if (!alive) return;
            setSpace(sp);
            setRemoteDoc(normalizeBoardDoc(sp.doc));
        });
        return () => {
            alive = false;
            unsub();
            if (pushTimer.current) clearTimeout(pushTimer.current);
        };
    }, [spaceId]);

    const pushDoc = useCallback(
        (doc: BoardSpaceDoc) => {
            if (!spaceId) return;
            if (pushTimer.current) clearTimeout(pushTimer.current);
            pushTimer.current = setTimeout(() => {
                void updateSpaceDoc(spaceId, doc as unknown as Record<string, unknown>);
            }, debounceMs);
        },
        [spaceId, debounceMs],
    );

    return { space, loading, remoteDoc, pushDoc };
}
