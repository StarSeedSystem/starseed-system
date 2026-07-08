"use client";

// src/components/canvas/tldraw-board.tsx
// StarSeed · Pizarra — motor "tldraw (profesional)" (github.com/tldraw/tldraw).
// Componente CLIENTE puro: se monta desde canvas-board.tsx vía
// `next/dynamic(..., { ssr: false })` (tldraw toca `window`/canvas al
// importarse, así que este módulo entero debe quedar fuera del bundle de
// servidor). Motor ALTERNATIVO y ADITIVO junto a "Lienzo StarSeed"
// (canvas-board.tsx), que queda intacto — ver el selector de motor en
// <CanvasBoard/> (persiste por pizarra vía src/lib/canvas/board-engine.ts).
//
// LICENCIA ("tldraw license"): uso gratuito con la marca de agua "Made with
// tldraw" obligatoria (no hay `licenseKey` comercial configurada). NO se
// oculta ni recorta el watermark del SDK — es una condición legal de la
// licencia, no un detalle estético. No tocar `components`/`licenseKey`.
//
// PERSISTENCIA:
//  · Local (sin `boardSpaceId`): `persistenceKey` del propio SDK → IndexedDB
//    del navegador, por pizarra (clave = boardId), sincronizado entre
//    pestañas del MISMO dispositivo. Cero red, cero configuración.
//  · Compartida opcional (con `boardSpaceId`, os_spaces kind='board' — mismo
//    mecanismo que "Compartir pizarra…" del motor StarSeed): el store se
//    serializa (`editor.getSnapshot()`) y se espeja con debounce en
//    `os_spaces.doc.tldrawSnapshot` (useSpaceDoc, mismo patrón que
//    shared-board-space.ts). Los cambios remotos se aplican con
//    `editor.loadSnapshot()` dentro de `store.mergeRemoteChanges()` (los
//    marca `source:'remote'` para no reenviarlos de vuelta).
//    HONESTO: esto es un espejo LWW (last-write-wins) de snapshot COMPLETO,
//    no fusión operacional real — si dos personas dibujan a la vez, el último
//    `setDoc` en llegar gana y puede pisar al otro. Colaboración robusta
//    (CRDT en vivo, cursores en tiempo real) requiere el sync server real de
//    tldraw (@tldraw/sync): evolución futura, no esta entrega.

import { useCallback, useEffect, useRef } from "react";
import { Tldraw, type Editor, type TLEditorSnapshot } from "tldraw";
import "tldraw/tldraw.css";
import { Loader2 } from "lucide-react";
import { useSpaceDoc } from "@/lib/spaces/spaces";
import { cn } from "@/lib/utils";

/** Forma del doc colaborativo (os_spaces.doc) cuando el espacio es un tablero tldraw. */
export interface TldrawShareDoc {
  engine: "tldraw";
  tldrawSnapshot?: TLEditorSnapshot;
  updatedAt?: number;
}

export interface TldrawBoardProps {
  /** Identifica esta pizarra para la persistencia LOCAL (IndexedDB). */
  boardId: string;
  /** Si hay un espacio compartido activo, entra en modo colaborativo best-effort. */
  boardSpaceId?: string | null;
  className?: string;
}

const PUSH_DEBOUNCE_MS = 500;

export default function TldrawBoard({ boardId, boardSpaceId = null, className }: TldrawBoardProps) {
  const editorRef = useRef<Editor | null>(null);
  const pushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Modo COMPARTIDO (best-effort, ver nota de licencia/colaboración arriba).
  // Sin `boardSpaceId`, este hook es un no-op estable (doc=null, loading=false).
  const { doc, loading, setDoc, lastChangeWasRemote } = useSpaceDoc<TldrawShareDoc>(boardSpaceId);

  useEffect(() => {
    return () => {
      if (pushTimer.current) clearTimeout(pushTimer.current);
    };
  }, []);

  const handleMount = useCallback(
    (editor: Editor) => {
      editorRef.current = editor;

      // Cambios LOCALES del usuario (no remotos, no cámara/selección): se
      // empujan al espacio compartido con debounce. Sin `boardSpaceId` este
      // listener no tiene nada que hacer (persistencia local ya la cubre el
      // propio `persistenceKey` del SDK).
      const unlisten = editor.store.listen(
        () => {
          if (!boardSpaceId) return;
          if (pushTimer.current) clearTimeout(pushTimer.current);
          pushTimer.current = setTimeout(() => {
            const ed = editorRef.current;
            if (!ed) return;
            setDoc({ engine: "tldraw", tldrawSnapshot: ed.getSnapshot(), updatedAt: Date.now() });
          }, PUSH_DEBOUNCE_MS);
        },
        { source: "user", scope: "document" },
      );

      return () => {
        unlisten();
        editorRef.current = null;
      };
    },
    [boardSpaceId, setDoc],
  );

  // Cambios REMOTOS (de otro colaborador): aplica el snapshot recibido dentro
  // de `mergeRemoteChanges` para que quede marcado `source:'remote'` y el
  // listener de arriba (filtrado a `source:'user'`) NO lo reenvíe (anti-eco).
  useEffect(() => {
    if (!boardSpaceId || !lastChangeWasRemote) return;
    const ed = editorRef.current;
    const snap = doc?.tldrawSnapshot;
    if (!ed || !snap) return;
    ed.store.mergeRemoteChanges(() => {
      ed.loadSnapshot(snap);
    });
  }, [boardSpaceId, doc, lastChangeWasRemote]);

  // Mientras se resuelve el espacio compartido, no montamos <Tldraw/> todavía
  // (así el snapshot inicial se pasa YA resuelto vía la prop `snapshot`, sin
  // parpadeo de lienzo vacío → lienzo con contenido).
  if (boardSpaceId && loading) {
    return (
      <div className={cn("flex h-full w-full items-center justify-center gap-2 rounded-2xl border border-cyan-500/20 bg-zinc-950/40 text-xs text-white/40", className)}>
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando pizarra compartida…
      </div>
    );
  }

  return (
    <div className={cn("relative h-full w-full min-h-0 overflow-hidden rounded-2xl border border-cyan-500/20 bg-zinc-950/40", className)}>
      <Tldraw
        key={boardSpaceId ?? boardId}
        persistenceKey={boardSpaceId ? undefined : `starseed-pizarra-tldraw-${boardId}`}
        snapshot={boardSpaceId ? doc?.tldrawSnapshot : undefined}
        onMount={handleMount}
      />
    </div>
  );
}
