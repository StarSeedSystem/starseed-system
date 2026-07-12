"use client";

/*
 * BoardShareDialog — "Compartir pizarra…" (SOP §11 · Adenda 63 §5): desde esta
 * ola es un ENVOLTORIO fino sobre el modelo universal de permisos
 * (src/lib/sharing/access.ts + ShareAccessDialog): ámbitos perfil/cuenta/
 * personalizado/público, roles ver/comentar/editar/administrar, buscador de
 * perfiles reales y enlace colaborativo ?board-space= existente.
 *
 * Mantiene su API previa ({ canvas, open, onClose } + BoardShareTrigger) para
 * no tocar a sus consumidores (canvas-board.tsx). El espacio os_spaces
 * kind='board' se crea/asegura al conceder accesos o copiar el enlace,
 * copiando el doc actual del lienzo (bloques + aristas) — la pizarra personal
 * queda intacta; el espacio es la variante compartida con realtime.
 */

import { Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ShareAccessDialog } from "@/components/sharing/share-access-dialog";
import type { Canvas } from "@/lib/canvas/canvas";
import { getEdges } from "@/lib/canvas/workcenters";

export function BoardShareDialog({
    canvas,
    open,
    onClose,
}: {
    canvas: Canvas;
    open: boolean;
    onClose: () => void;
}) {
    return (
        <ShareAccessDialog
            open={open}
            onOpenChange={(o) => !o && onClose()}
            resource={{ type: "board", id: canvas.id, title: canvas.title || "Pizarra" }}
            makeSpaceDoc={() => ({ blocks: canvas.blocks, edges: getEdges(canvas) }) as Record<string, unknown>}
            buildLink={(spaceId) =>
                spaceId && typeof window !== "undefined"
                    ? `${window.location.origin}/pizarra?board-space=${encodeURIComponent(spaceId)}`
                    : null
            }
            title={`Compartir pizarra «${canvas.title || "Sin título"}»`}
            description="Crea un espacio colaborativo a partir de este lienzo. Tu pizarra personal no se modifica."
        />
    );
}

/** Botón compacto "Compartir pizarra…" listo para insertar en la toolbar. */
export function BoardShareTrigger({ onClick }: { onClick: () => void }) {
    return (
        <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 border-amber-500/30 text-amber-100 cursor-pointer"
            onClick={onClick}
            title="Crear un espacio colaborativo a partir de este lienzo"
        >
            <Share2 className="w-3.5 h-3.5" /> Compartir pizarra…
        </Button>
    );
}
