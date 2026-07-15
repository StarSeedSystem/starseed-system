"use client";

/**
 * StarSeed OS — Aurora · Menú contextual de un mensaje del chat
 * ----------------------------------------------------------------------------
 * Clic derecho / long-press sobre CUALQUIER mensaje de `aurora-chat-view.tsx`
 * (chat en vivo o sesión/contexto cargado). Reutiliza el posicionamiento por
 * (x,y) del Finder (`useContextTrigger` + `DropdownMenu` de Radix controlado,
 * mismo patrón que `finder-context-menu.tsx` — no hay ContextMenu de Radix
 * instalado en el repo).
 *
 * Acciones: Copiar mensaje · Ramificar chat desde aquí · Ver proceso ·
 * Reintentar (submenú de proveedores/modelos disponibles) · Revertir cambios ·
 * Guardar en Biblioteca. Ver architecture/astraura-inteligencia.md §17.4.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Bookmark, Copy, GitBranch, Loader2, RotateCcw, Sparkles, Undo2, Volume2, MessageSquarePlus } from "lucide-react";
import { detectAvailability, type SourceAvailability } from "@/ai/astraura/availability";
import { useAuroraEngine, type AuroraMessageMeta } from "@/lib/aurora/engine";
import { executeUndo } from "@/lib/aurora/undo";
import { myLibraryDestinations, saveItem } from "@/lib/library/entity-library";
import { useSavedLibrary } from "@/lib/library-store";
import type { PersonalityProfile } from "@/lib/aurora/personalities";

/** Un mensaje normalizado (vivo o cargado) para el menú contextual. */
export interface ChatMessagePayload {
  role: "user" | "aurora";
  text: string;
  ts: number;
  meta?: AuroraMessageMeta;
  /**
   * Historial (rol/texto/ts) hasta ESTE mensaje incluido, del array de origen
   * (vivo o cargado). Contrato: el ÚLTIMO elemento de `history` es siempre
   * este mismo mensaje (así "Reintentar" busca el último "user" ANTES de él
   * sin depender de comparar timestamps, que pueden repetirse).
   */
  history: { role: "user" | "aurora"; text: string; ts: number }[];
}

export interface MessageContextMenuProps {
  x: number;
  y: number;
  payload: ChatMessagePayload;
  onClose: () => void;
  /** Crea una rama nueva con el historial hasta este mensaje. */
  onBranchFromMessage?: (history: ChatMessagePayload["history"], label: string) => void;
  /** Reenvía el último mensaje de usuario anterior a esta respuesta. */
  onRetryMessage?: (userText: string, forceSource?: { sourceId: string; modelId: string }) => void;
  /** Abre el modal "Ver proceso" con los metadatos completos. */
  onViewProcess?: (meta: AuroraMessageMeta | undefined) => void;
}

/** Último mensaje de usuario ANTES de `payload` (el último elemento de `history` es `payload` mismo). */
function findPrecedingUserText(payload: ChatMessagePayload): string | null {
  const upto = payload.history.slice(0, -1);
  for (let i = upto.length - 1; i >= 0; i--) {
    if (upto[i].role === "user") return upto[i].text;
  }
  return null;
}

export function MessageContextMenu({
  x, y, payload, onClose, onBranchFromMessage, onRetryMessage, onViewProcess,
}: MessageContextMenuProps) {
  const [avail, setAvail] = useState<SourceAvailability[] | null>(null);
  const isAurora = payload.role === "aurora";
  const undoableTools = (payload.meta?.tools ?? []).filter((t) => !!t.undo);
  
  const aurora = useAuroraEngine();
  const { items } = useSavedLibrary();
  const personalities = items
    .filter((it) => it.kind === "personality" && (it as any).content)
    .map((it) => {
      try { return JSON.parse((it as any).content || "{}") as PersonalityProfile; }
      catch { return null; }
    })
    .filter(Boolean) as PersonalityProfile[];
  const defaultPersonality = aurora?.activePersonality;

  useEffect(() => {
    if (!isAurora || !onRetryMessage) return;
    let alive = true;
    // fast=true: sin sondas de red, solo claves + capacidades del navegador
    // (el submenú debe abrir al instante).
    detectAvailability(true)
      .then((list) => { if (alive) setAvail(list); })
      .catch(() => { if (alive) setAvail([]); });
    return () => { alive = false; };
  }, [isAurora, onRetryMessage]);

  const wrap = (fn: () => void) => () => {
    fn();
    onClose();
  };

  const readMessage = (p?: PersonalityProfile) => {
    aurora?.speak(payload.text, p);
    window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex", { 
      detail: { text: payload.text, personality: p } 
    }));
  };

  const copyToChat = () => {
    window.dispatchEvent(
      new CustomEvent("aurora:inject-text", {
        detail: { text: payload.text.substring(0, 2000) },
      })
    );
    window.dispatchEvent(new CustomEvent("starseed:open-aurora-exocortex"));
    toast.success("Mensaje copiado al chat de Aurora");
  };

  const copyMessage = () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      toast.error("El portapapeles no está disponible aquí.");
      return;
    }
    navigator.clipboard.writeText(payload.text).then(
      () => toast.success("Mensaje copiado"),
      () => toast.error("No pude copiar el mensaje"),
    );
  };

  const branch = () => {
    const label = `Rama · ${new Date(payload.ts).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
    onBranchFromMessage?.(payload.history, label);
    toast.success("Rama creada con el historial hasta este mensaje", { description: "Ábrela en el árbol de Contextos." });
  };

  const retry = (forceSource?: { sourceId: string; modelId: string }) => {
    const userText = findPrecedingUserText(payload);
    if (!userText) {
      toast.error("No encontré el mensaje de usuario anterior a este.");
      return;
    }
    onRetryMessage?.(userText, forceSource);
  };

  const revert = async () => {
    if (!undoableTools.length) {
      toast.message("Nada que revertir", {
        description: "Esta respuesta no ejecutó cambios reversibles (navegar, conversar o lanzar un agente no se puede deshacer).",
      });
      return;
    }
    for (const t of undoableTools) {
      if (!t.undo) continue;
      const res = await executeUndo(t.undo);
      if (res.ok) toast.success(res.message);
      else toast.error(res.message);
    }
  };

  const save = async () => {
    try {
      const dests = await myLibraryDestinations();
      if (!dests.length) {
        toast.error("Inicia sesión para guardar en tu biblioteca.");
        return;
      }
      const title = `Mensaje de ${isAurora ? "Aurora" : "usuario"} — ${new Date(payload.ts).toLocaleString("es-ES")}`;
      const res = await saveItem(dests[0].ref, { type: "external", title, note: payload.text.slice(0, 4000) }, null);
      if (res.ok) toast.success("Guardado en tu Biblioteca", { description: dests[0].label });
      else toast.error("No se pudo guardar.");
    } catch {
      toast.error("No se pudo guardar.");
    }
  };

  // Fuentes listas AHORA, limitadas para que el submenú siga siendo usable.
  const readySources = (avail ?? []).filter((a) => a.ready).slice(0, 10);

  return (
    <DropdownMenu open onOpenChange={(o) => !o && onClose()}>
      <DropdownMenuContent
        align="start"
        sideOffset={0}
        style={{ position: "fixed", left: x, top: y, zIndex: 200 }}
        className="w-64 border-white/10 bg-black/90 text-white backdrop-blur-2xl"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
          {isAurora ? "Mensaje de Aurora" : "Tu mensaje"}
        </DropdownMenuLabel>

        <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(copyMessage)}>
          <Copy className="h-3.5 w-3.5" /> Copiar mensaje
        </DropdownMenuItem>

        <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(copyToChat)}>
          <MessageSquarePlus className="h-3.5 w-3.5" /> Copiar al chat
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger className="cursor-pointer gap-2 text-xs">
            <Volume2 className="h-3.5 w-3.5" /> Leer con Aurora
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent className="w-56 border-white/10 bg-black/95 text-white backdrop-blur-2xl">
              <DropdownMenuItem
                className="cursor-pointer text-xs"
                onClick={wrap(() => readMessage())}
              >
                Predeterminada ({defaultPersonality?.name || "Aurora"})
              </DropdownMenuItem>
              {personalities.length > 0 && (
                <>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuLabel className="text-[10px] uppercase text-muted-foreground">Otras</DropdownMenuLabel>
                  {personalities.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      className="cursor-pointer text-xs"
                      onClick={wrap(() => readMessage(p))}
                    >
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>

        {onBranchFromMessage && (
          <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(branch)}>
            <GitBranch className="h-3.5 w-3.5" /> Ramificar chat desde aquí
          </DropdownMenuItem>
        )}

        {isAurora && (
          <>
            <DropdownMenuSeparator className="bg-white/10" />
            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(() => onViewProcess?.(payload.meta))}>
              <Sparkles className="h-3.5 w-3.5" /> Ver proceso
            </DropdownMenuItem>

            {onRetryMessage && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="cursor-pointer gap-2 text-xs">
                  <RotateCcw className="h-3.5 w-3.5" /> Reintentar
                </DropdownMenuSubTrigger>
                <DropdownMenuPortal>
                  <DropdownMenuSubContent className="w-56 border-white/10 bg-black/90 text-white backdrop-blur-2xl">
                    <DropdownMenuItem className="cursor-pointer text-xs" onClick={wrap(() => retry())}>
                      Auto (Aurora elige)
                    </DropdownMenuItem>
                    {avail === null ? (
                      <DropdownMenuItem disabled className="gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" /> Detectando fuentes…
                      </DropdownMenuItem>
                    ) : readySources.length === 0 ? (
                      <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                        Sin otras fuentes listas ahora
                      </DropdownMenuItem>
                    ) : (
                      <>
                        <DropdownMenuSeparator className="bg-white/10" />
                        {readySources.flatMap((a) =>
                          a.source.models.slice(0, 2).map((m) => (
                            <DropdownMenuItem
                              key={`${a.source.id}::${m.id}`}
                              className="cursor-pointer text-xs"
                              onClick={wrap(() => retry({ sourceId: a.source.id, modelId: m.id }))}
                            >
                              {a.source.label} · {m.label}
                            </DropdownMenuItem>
                          )),
                        )}
                      </>
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuPortal>
              </DropdownMenuSub>
            )}

            <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(() => void revert())}>
              <Undo2 className="h-3.5 w-3.5" />
              Revertir cambios{undoableTools.length ? "" : " (nada que revertir)"}
            </DropdownMenuItem>
          </>
        )}

        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem className="cursor-pointer gap-2 text-xs" onClick={wrap(() => void save())}>
          <Bookmark className="h-3.5 w-3.5" /> Guardar en Biblioteca
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default MessageContextMenu;
