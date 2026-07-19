"use client";

/**
 * StarSeed OS — BOTÓN 📎 y CHIPS de adjuntos de chat (Agente S1)
 * ============================================================================
 * UI COMPARTIDA de adjuntos para las tres superficies de chat de Astraura
 * (Exocórtex, `/agent` Nexus y mini-reproductor de la orbe):
 *
 *   · `ChatAttachButton`        — botón 📎 (Paperclip) que abre el SELECTOR
 *     UNIVERSAL ya existente (dispositivo · bibliotecas · neuronas · red). Sube
 *     al bucket `os-files` y entrega `UniversalAttachment[]` con url real.
 *   · `PendingAttachmentChips`  — chips de los adjuntos AÚN sin enviar (con ✕).
 *   · `MessageAttachmentChips`  — chips (solo lectura) de los adjuntos YA en un
 *     mensaje del hilo, con abrir/descargar.
 *
 * No reinventa el picker: envuelve `AttachFilePickerButton` de
 * universal-file-picker.tsx. Filosofía del repo: cursor-pointer, sin
 * emojis-icono (lucide-react), transiciones 150–300ms, nunca lanza.
 */

import { useMemo, type ReactNode } from "react";
import {
  Paperclip, X, File as FileIcon, Image as ImageIcon, Music,
  Video as VideoIcon, Link as LinkIcon, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AttachFilePickerButton } from "@/components/files/universal-file-picker";
import {
  humanFileSize,
  normalizeAttachments,
  type UniversalAttachment,
} from "@/lib/aurora/attachments";

// ── Icono por tipo ────────────────────────────────────────────────────────────
function iconFor(a: Pick<UniversalAttachment, "mime" | "kind">): typeof FileIcon {
  const m = (a.mime || a.kind || "").toLowerCase();
  if (m.startsWith("image")) return ImageIcon;
  if (m.startsWith("audio")) return Music;
  if (m.startsWith("video")) return VideoIcon;
  if (m === "ref" || m.includes("link") || m.includes("external")) return LinkIcon;
  return FileIcon;
}

// ── Botón 📎 ──────────────────────────────────────────────────────────────────
export interface ChatAttachButtonProps {
  /** Adjuntos elegidos (ya subidos, con url real) — el llamador los pone en "pendientes". */
  onPick: (attachments: UniversalAttachment[]) => void;
  /** Folder lógico de subida (por defecto "aurora"). */
  folder?: string;
  className?: string;
  title?: string;
  disabled?: boolean;
  children?: ReactNode;
}

/**
 * Botón 📎 listo para la fila de entrada de cualquier chat. Abre el selector
 * universal (dispositivo/bibliotecas/neuronas/red) y devuelve los adjuntos.
 */
export function ChatAttachButton({
  onPick, folder = "aurora", className, title = "Adjuntar archivo", disabled, children,
}: ChatAttachButtonProps) {
  if (disabled) {
    return (
      <button
        type="button"
        disabled
        title={title}
        aria-label={title}
        className={cn("inline-flex items-center justify-center opacity-40", className)}
      >
        {children ?? <Paperclip className="h-4 w-4" />}
      </button>
    );
  }
  return (
    <AttachFilePickerButton
      onPick={onPick}
      folder={folder}
      title={title}
      className={cn("inline-flex items-center justify-center", className)}
    >
      {children ?? <Paperclip className="h-4 w-4" />}
    </AttachFilePickerButton>
  );
}

// ── Chips de adjuntos PENDIENTES (sin enviar) ────────────────────────────────
export interface PendingAttachmentChipsProps {
  items: UniversalAttachment[];
  onRemove: (index: number) => void;
  className?: string;
}

export function PendingAttachmentChips({ items, onRemove, className }: PendingAttachmentChipsProps) {
  if (!items || items.length === 0) return null;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {items.map((a, i) => {
        const Icon = iconFor(a);
        return (
          <span
            key={`${a.name}-${i}`}
            className="inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 py-1 pl-2 pr-1 text-[11px] text-cyan-100"
          >
            <Icon className="h-3 w-3 shrink-0 text-cyan-300" />
            <span className="truncate">{a.name || "adjunto"}</span>
            {a.size ? <span className="shrink-0 text-cyan-200/50">{humanFileSize(a.size)}</span> : null}
            <button
              type="button"
              onClick={() => onRemove(i)}
              title="Quitar adjunto"
              aria-label={`Quitar ${a.name || "adjunto"}`}
              className="grid size-4 shrink-0 cursor-pointer place-items-center rounded-full text-cyan-200/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        );
      })}
    </div>
  );
}

// ── Chips de adjuntos de un MENSAJE (solo lectura, abrir/descargar) ──────────
export interface MessageAttachmentChipsProps {
  /** El jsonb `attachments` del mensaje (unknown[]) o ya normalizado. */
  attachments: unknown[] | null | undefined;
  className?: string;
}

export function MessageAttachmentChips({ attachments, className }: MessageAttachmentChipsProps) {
  const items = useMemo(() => normalizeAttachments(attachments), [attachments]);
  if (items.length === 0) return null;
  return (
    <div className={cn("mt-1.5 flex flex-wrap gap-1.5", className)}>
      {items.map((a, i) => {
        const Icon = iconFor(a);
        const href = a.url || a.route;
        const inner = (
          <>
            <Icon className="h-3 w-3 shrink-0 text-white/60" />
            <span className="truncate">{a.name || "adjunto"}</span>
            {a.size ? <span className="shrink-0 text-white/35">{humanFileSize(a.size)}</span> : null}
            {href ? <Download className="h-3 w-3 shrink-0 text-white/45" /> : null}
          </>
        );
        const chipClass =
          "inline-flex max-w-[16rem] items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-2 py-1 text-[11px] text-white/80 transition-colors duration-200";
        return href ? (
          <a
            key={`${a.name}-${i}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            download={a.name || undefined}
            title={`Abrir/descargar ${a.name || "adjunto"}`}
            className={cn(chipClass, "cursor-pointer hover:border-cyan-400/40 hover:bg-white/[0.08]")}
          >
            {inner}
          </a>
        ) : (
          <span key={`${a.name}-${i}`} className={chipClass} title={a.name || "adjunto"}>
            {inner}
          </span>
        );
      })}
    </div>
  );
}

export default ChatAttachButton;
