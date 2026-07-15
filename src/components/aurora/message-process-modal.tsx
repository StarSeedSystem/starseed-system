"use client";

/**
 * StarSeed OS — Aurora · Modal "Ver proceso" de un mensaje
 * ----------------------------------------------------------------------------
 * Transparencia total por mensaje: qué fuente/modelo respondió, cuántos
 * intentos hizo el router (`router.ts`), duración, dificultad estimada y qué
 * herramientas se invocaron (con su resultado y si dejaron algo reversible).
 * Ver architecture/astraura-inteligencia.md §17.3/§17.4.
 *
 * Mensajes anteriores a esta función (chatlog viejo) no tienen `meta`: se
 * explica honestamente en vez de mostrar un modal vacío o roto.
 */

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Undo2 } from "lucide-react";
import type { AuroraMessageMeta } from "@/lib/aurora/engine";

export interface MessageProcessModalProps {
  open: boolean;
  meta: AuroraMessageMeta | undefined;
  onOpenChange: (open: boolean) => void;
}

export function MessageProcessModal({ open, meta, onOpenChange }: MessageProcessModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-white/10 bg-black/90 text-white backdrop-blur-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm">Proceso de esta respuesta</DialogTitle>
          <DialogDescription className="text-xs text-white/50">
            Qué inteligencia respondió y qué hizo, sin cajas negras.
          </DialogDescription>
        </DialogHeader>

        {!meta ? (
          <p className="text-xs leading-relaxed text-white/60">
            Este mensaje no tiene metadatos de proceso — es de antes de esta función, o es un mensaje tuyo.
          </p>
        ) : (
          <div className="space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {meta.provider && (
                <Badge variant="outline" className="border-white/15 text-white/80">
                  {meta.provider}
                  {meta.model ? ` · ${meta.model}` : ""}
                </Badge>
              )}
              {meta.free !== undefined && (
                <Badge
                  variant="outline"
                  className={meta.free ? "border-emerald-400/30 text-emerald-300" : "border-amber-400/30 text-amber-300"}
                >
                  {meta.free ? "gratis" : "de pago"}
                </Badge>
              )}
              {meta.local && (
                <Badge variant="outline" className="border-sky-400/30 text-sky-300">
                  respuesta local honesta
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-white/70">
              {typeof meta.attempts === "number" && (
                <div>
                  Intentos: <span className="text-white/90">{meta.attempts}</span>
                </div>
              )}
              {typeof meta.ms === "number" && (
                <div>
                  Duración: <span className="text-white/90">{meta.ms} ms</span>
                </div>
              )}
              {typeof meta.difficulty === "number" && (
                <div>
                  Dificultad estimada: <span className="text-white/90">{Math.round(meta.difficulty * 100)}%</span>
                </div>
              )}
            </div>

            {meta.reason && <p className="text-white/60">{meta.reason}</p>}

            {meta.modelText && (
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-white/70">
                {meta.modelText}
              </div>
            )}

            {meta.tools && meta.tools.length > 0 && (
              <div className="space-y-1.5">
                <div className="text-[10px] uppercase tracking-wide text-white/40">Herramientas invocadas</div>
                {meta.tools.map((t, i) => (
                  <div key={`${t.name}-${i}`} className="rounded-lg border border-white/10 bg-white/5 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-white/85">{t.name}</span>
                      <span className={t.ok ? "text-emerald-300" : "text-rose-300"}>{t.ok ? "ok" : "falló"}</span>
                    </div>
                    {t.summary && <p className="mt-0.5 text-white/60">{t.summary}</p>}
                    {t.undo && (
                      <p className="mt-1 flex items-center gap-1 text-[10px] text-sky-300/80">
                        <Undo2 className="h-3 w-3" /> Reversible: {t.undo.label}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default MessageProcessModal;
