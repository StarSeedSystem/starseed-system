"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * «PUBLICAR TAMBIÉN EN REDES» · Postiz  (Adenda 67 · P4-8)
 * ---------------------------------------------------------------------------
 * Panel que aparece EN EL LIENZO UNIVERSAL solo cuando el usuario tiene Postiz
 * configurado y habilitado (Ajustes → Integraciones → Postiz). Si no lo tiene,
 * este componente no pinta NADA: no molesta, no promete, no existe.
 *
 * ⚠️ REGLA IRRENUNCIABLE (la razón de que esto sea un panel aparte y no una
 * casilla dentro del botón «Publicar»): publicar en X, Instagram, LinkedIn o
 * Mastodon tiene EFECTOS IRREVERSIBLES en cuentas que NO son de StarSeed. Por eso:
 *
 *   1. NUNCA es automático. Publicar en la red StarSeed jamás dispara Postiz.
 *   2. El botón de crosspost es un acto SEPARADO y explícito del usuario.
 *   3. Antes de enviar se muestra un diálogo de confirmación con la LISTA EXACTA
 *      de canales y el TEXTO EXACTO que va a salir. Sin sorpresas.
 *   4. Aurora puede preparar el texto, pero NO puede pulsar este botón.
 *
 * Contraste con el resto del OS: aquí no hay «gratis-primero» que valga — es la
 * frontera con el mundo exterior y se cruza a mano.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { loadIntegrationConfig } from "@/lib/integrations/registry";
import { runIntegration } from "@/lib/integrations/run";
import type { PostizChannel } from "@/lib/integrations/clients/postiz";
import { Loader2, Megaphone, ShieldAlert, Share2, RefreshCw } from "lucide-react";

/** ¿Ha configurado y activado el usuario su Postiz? (SSR-safe) */
export function postizEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const cfg = loadIntegrationConfig("postiz");
    return cfg.enabled === true && !!(cfg.apiKey || "").trim();
  } catch {
    return false;
  }
}

export function SocialCrosspost({
  /** Texto que saldría a las redes. Se lee EN EL MOMENTO de pulsar. */
  getText,
  /** URL de imagen pública (opcional) ya alojada en la Biblioteca del OS. */
  getImageUrl,
  className,
}: {
  getText: () => string;
  getImageUrl?: () => string | undefined;
  className?: string;
}) {
  const [available, setAvailable] = useState(false);
  const [channels, setChannels] = useState<PostizChannel[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [text, setText] = useState("");

  const loadChannels = useCallback(async () => {
    setLoading(true);
    try {
      const res = await runIntegration("postiz", "integrations", {});
      if (res.ok) {
        const list = ((res.data?.channels ?? []) as PostizChannel[]).filter((c) => !c.disabled);
        setChannels(list);
      } else {
        setChannels([]);
        toast.error(`Postiz: ${res.error ?? "no se pudieron leer tus canales."}`);
      }
    } catch {
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const on = postizEnabled();
    setAvailable(on);
    if (on) void loadChannels();
  }, [loadChannels]);

  // Sin Postiz configurado → el panel no existe. Nada de promesas vacías.
  if (!available) return null;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const openConfirm = () => {
    const t = (getText() || "").trim();
    if (!t) {
      toast.error("Escribe algo antes de compartirlo fuera de la red.");
      return;
    }
    if (selected.size === 0) {
      toast.error("Elige al menos un canal.");
      return;
    }
    setText(t);
    setConfirming(true);
  };

  const doPublish = async () => {
    setSending(true);
    try {
      const ids = Array.from(selected);
      const platformByChannel: Record<string, string> = {};
      for (const c of channels) if (selected.has(c.id)) platformByChannel[c.id] = c.platform;

      const imageUrl = getImageUrl?.();
      let images: { id: string; path: string }[] | undefined;
      if (imageUrl) {
        const up = await runIntegration("postiz", "attach-url", { url: imageUrl });
        if (up.ok && up.data?.id && up.data?.path) {
          images = [{ id: String(up.data.id), path: String(up.data.path) }];
        } else {
          // Honesto: seguimos SIN la imagen y lo decimos, en vez de fallar en silencio.
          toast.message("Postiz no aceptó la imagen; se publicará solo el texto.");
        }
      }

      const res = await runIntegration("postiz", "publish", {
        content: text,
        channelIds: ids,
        when: "now",
        images,
        platformByChannel,
      });

      if (res.ok) {
        toast.success(`Publicado en ${ids.length} canal(es) vía Postiz.`);
        setConfirming(false);
        setSelected(new Set());
      } else {
        toast.error(`Postiz: ${res.error ?? "no se pudo publicar."}`);
      }
    } catch {
      toast.error("Postiz: fallo al publicar.");
    } finally {
      setSending(false);
    }
  };

  const chosen = channels.filter((c) => selected.has(c.id));

  return (
    <>
      <div className={cn("rounded-xl border border-sky-400/25 bg-sky-500/[0.05] p-3", className)}>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Megaphone className="h-4 w-4 shrink-0 text-sky-300" />
          <span className="text-sm font-medium text-white/85">Publicar también en redes</span>
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-white/40">
            Postiz
          </span>
          <button
            type="button"
            onClick={() => void loadChannels()}
            disabled={loading}
            className="ml-auto inline-flex cursor-pointer items-center gap-1 text-[11px] text-white/45 hover:text-white/70 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Recargar canales
          </button>
        </div>

        {loading && channels.length === 0 ? (
          <p className="py-2 text-xs text-white/40">Leyendo tus canales…</p>
        ) : channels.length === 0 ? (
          <p className="text-[11px] text-white/45">
            Tu Postiz no tiene canales conectados todavía. Conéctalos en su panel y vuelve aquí.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {channels.map((c) => {
              const on = selected.has(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(c.id)}
                  className={cn(
                    "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                    on
                      ? "border-sky-400/60 bg-sky-500/20 text-sky-50"
                      : "border-white/10 bg-white/[0.03] text-white/55 hover:bg-white/[0.07]",
                  )}
                >
                  <span className="max-w-[130px] truncate">{c.name}</span>
                  <span className="text-white/35">{c.platform}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={openConfirm}
            disabled={selected.size === 0}
            className="cursor-pointer gap-1.5 border-sky-400/40 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20"
          >
            <Share2 className="h-3.5 w-3.5" />
            Compartir fuera de la red ({selected.size})
          </Button>
          <p className="flex items-start gap-1 text-[10px] leading-relaxed text-white/35">
            <ShieldAlert className="mt-px h-3 w-3 shrink-0 text-amber-300" />
            Acción separada e irreversible: publicar en la red StarSeed <strong>nunca</strong> publica en redes
            externas por su cuenta. Solo sale lo que confirmes aquí.
          </p>
        </div>
      </div>

      {/* Confirmación explícita: canales exactos + texto exacto. */}
      <Dialog open={confirming} onOpenChange={(o) => !sending && setConfirming(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-amber-300" /> Vas a publicar FUERA de StarSeed
            </DialogTitle>
            <DialogDescription>
              Esto sale de la red soberana y llega a plataformas de terceros. No se puede deshacer desde aquí.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-white/40">
                Canales ({chosen.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {chosen.map((c) => (
                  <span
                    key={c.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-sky-400/40 bg-sky-500/15 px-2.5 py-1 text-[11px] text-sky-50"
                  >
                    {c.name} <span className="text-sky-200/50">{c.platform}</span>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] uppercase tracking-wider text-white/40">Texto exacto</p>
              <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/40 p-2.5 font-sans text-xs text-white/75">
                {text}
              </pre>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirming(false)}
              disabled={sending}
              className="cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={() => void doPublish()}
              disabled={sending}
              className="cursor-pointer gap-1.5 bg-sky-600 text-white hover:bg-sky-500"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              Sí, publicar en {chosen.length} canal(es)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
