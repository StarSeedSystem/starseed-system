"use client";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * InstallModelModal — oferta OPCIONAL de instalar un modelo local descargable.
 * ---------------------------------------------------------------------------
 * Algunas fuentes del catálogo corren en el navegador pero necesitan DESCARGAR
 * pesos grandes la primera vez (SmolLM3, SmolVLM2, WebLLM, Gemini Nano de
 * Chrome…). Ese download NUNCA debe ocurrir solo: este modal lo ofrece con
 * transparencia total (tamaño, qué aporta, límites) y deja claro que es OPCIONAL
 * — Aurora sigue funcionando con la mejor alternativa gratis mientras tanto.
 *
 * Botones:
 *   · "Instalar ahora" → installModelInBackground() (sigue en 2º plano; el modal
 *     se puede cerrar). Muestra barra de progreso vía MODEL_DOWNLOAD_EVENT.
 *   · "Más tarde (en Ajustes)" → markOffered() + cerrar (no re-preguntar).
 *
 * Se dispara por evento global `starseed:astraura-offer-install`
 * (detail { sourceId }): el orquestador de Aurora lo emite. NO se monta en el
 * layout aquí — se exporta `<InstallModelModalHost/>` para que el orquestador lo
 * monte donde corresponda. SSR-safe y defensivo: nunca lanza.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Download, HardDriveDownload, ShieldCheck, Clock, Loader2, CheckCircle2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { findSource } from "@/ai/astraura/free-catalog";
import {
  DOWNLOAD_SIZES,
  MODEL_DOWNLOAD_EVENT,
  installModelInBackground,
  isDownloading,
  downloadProgress,
  isModelInstalled,
  markOffered,
} from "@/ai/astraura/installed-models";

/** Evento global que dispara la oferta: detail = { sourceId }. */
export const OFFER_INSTALL_EVENT = "starseed:astraura-offer-install";

interface DownloadDetail {
  sourceId: string;
  pct?: number;
  label?: string;
  done?: boolean;
  error?: string;
}

/* ─────────────────────────── Hook de control ─────────────────────────── */

/**
 * Controla la visibilidad de la oferta. `show(sourceId)` la abre; `close()` la
 * cierra. `offer` es el sourceId activo (o null). SSR-safe.
 */
export function useInstallOffer() {
  const [offer, setOffer] = useState<string | null>(null);
  const show = useCallback((sourceId: string) => {
    if (typeof sourceId === "string" && sourceId) setOffer(sourceId);
  }, []);
  const close = useCallback(() => setOffer(null), []);
  return { offer, show, close };
}

/* ─────────────────────────── Modal presentacional ─────────────────────────── */

export function InstallModelModal({
  sourceId,
  open,
  onOpenChange,
}: {
  sourceId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const router = useRouter();
  const source = sourceId ? findSource(sourceId) : undefined;
  const size = sourceId ? DOWNLOAD_SIZES[sourceId] : undefined;

  // Estado de descarga en vivo (sincronizado con el módulo + evento).
  const [pct, setPct] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al (re)abrir con una fuente, refleja su estado actual.
  useEffect(() => {
    if (!open || !sourceId) return;
    setError(null);
    if (isModelInstalled(sourceId)) { setDone(true); setBusy(false); setPct(100); return; }
    setDone(false);
    if (isDownloading(sourceId)) { setBusy(true); setPct(downloadProgress(sourceId)); }
    else { setBusy(false); setPct(0); }
  }, [open, sourceId]);

  // Escucha el progreso de descarga de ESTA fuente (defensivo).
  useEffect(() => {
    if (typeof window === "undefined" || !sourceId) return;
    const onProgress = (e: Event) => {
      const d = (e as CustomEvent<DownloadDetail>).detail;
      if (!d || d.sourceId !== sourceId) return;
      if (typeof d.pct === "number") setPct(Math.max(0, Math.min(100, d.pct)));
      if (d.done) {
        setBusy(false);
        if (d.error) { setError(d.error); setDone(false); }
        else { setDone(true); setPct(100); }
      }
    };
    window.addEventListener(MODEL_DOWNLOAD_EVENT, onProgress);
    return () => window.removeEventListener(MODEL_DOWNLOAD_EVENT, onProgress);
  }, [sourceId]);

  const handleInstall = useCallback(async () => {
    if (!sourceId) return;
    setBusy(true);
    setError(null);
    setPct((p) => (p > 0 ? p : 1));
    // La descarga sigue en 2º plano: el usuario puede cerrar el modal.
    const res = await installModelInBackground(sourceId);
    if (!res.ok && !isDownloading(sourceId)) {
      setBusy(false);
      setError(res.message);
      toast.error(source?.label ?? "Modelo", { description: res.message });
    } else if (res.ok) {
      setDone(true);
      setPct(100);
      toast.success(source?.label ?? "Modelo", { description: res.message });
    }
  }, [sourceId, source]);

  const handleLater = useCallback(() => {
    if (sourceId) markOffered(sourceId);
    onOpenChange(false);
  }, [sourceId, onOpenChange]);

  if (!source) {
    // Sin fuente válida: no renderizamos contenido (dialog cerrado).
    return <Dialog open={false} onOpenChange={onOpenChange} />;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-teal-400/25 bg-teal-500/10">
              <HardDriveDownload className="h-6 w-6 text-teal-300" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-base leading-tight">Instalar {source.label}</DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-1.5">
                {size && (
                  <Badge variant="outline" className="border-teal-400/30 bg-teal-500/10 text-[10px] text-teal-200">
                    Descarga {size}
                  </Badge>
                )}
                <Badge variant="outline" className="border-emerald-400/30 bg-emerald-500/10 text-[10px] text-emerald-200">
                  Local · privacidad total
                </Badge>
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {/* Qué aporta */}
          <p className="text-sm leading-relaxed text-gray-200">{source.why}</p>

          {/* Límites honestos */}
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5" /> Límites honestos
            </p>
            <p className="mt-1 text-xs leading-relaxed text-gray-300">{source.limits}</p>
          </div>

          {/* Aviso clave: es opcional */}
          <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.06] p-3">
            <p className="text-xs leading-relaxed text-emerald-100/90">
              Aurora sigue funcionando con la mejor alternativa gratis mientras tanto — esto es
              <strong> opcional</strong>. La descarga ocurre en segundo plano: puedes cerrar esta ventana.
            </p>
          </div>

          {/* Barra de progreso / estado */}
          {(busy || pct > 0 || done || error) && (
            <div className="space-y-1.5">
              <Progress
                value={done ? 100 : pct}
                indicatorClassName={error ? "bg-rose-500" : done ? "bg-emerald-500" : "bg-teal-400"}
              />
              <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {error ? (
                  <span className="text-rose-300">{error}</span>
                ) : done ? (
                  <><CheckCircle2 className="h-3 w-3 text-emerald-400" /> Instalado y listo. Aurora ya puede elegirlo.</>
                ) : busy ? (
                  <><Loader2 className="h-3 w-3 animate-spin" /> Descargando en segundo plano… {pct > 0 ? `${Math.round(pct)}%` : ""}</>
                ) : null}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          {done ? (
            <Button
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500 cursor-pointer"
              onClick={() => onOpenChange(false)}
            >
              <CheckCircle2 className="h-4 w-4" /> Hecho
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                className="gap-1.5 cursor-pointer"
                onClick={handleLater}
                title="No se volverá a ofrecer; puedes instalarlo cuando quieras en Ajustes → Inteligencia"
              >
                <Clock className="h-4 w-4" /> Más tarde (en Ajustes)
              </Button>
              <Button
                className="gap-2 bg-teal-600 text-white hover:bg-teal-500 cursor-pointer"
                onClick={() => void handleInstall()}
                disabled={busy}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {busy ? "Instalando…" : "Instalar ahora"}
              </Button>
            </>
          )}
        </DialogFooter>

        {/* Atajo a Ajustes (transparencia: todo se gestiona también allí) */}
        <button
          type="button"
          onClick={() => { router.push("/settings?tab=ai"); onOpenChange(false); }}
          className="mx-auto -mt-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-white transition-colors cursor-pointer"
        >
          <Settings2 className="h-3 w-3" /> Gestionar modelos en Ajustes → Inteligencia
        </button>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────────────────── Host escuchador ─────────────────────────── */

/**
 * Host que escucha el evento global `starseed:astraura-offer-install` y muestra
 * el modal. El orquestador de Aurora lo monta (NO se monta aquí en el layout).
 * SSR-safe. Ignora ofertas de modelos ya instalados.
 */
export function InstallModelModalHost() {
  const { offer, show, close } = useInstallOffer();
  const openRef = useRef(false);
  openRef.current = offer !== null;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOffer = (e: Event) => {
      const d = (e as CustomEvent<{ sourceId?: string }>).detail;
      const id = d?.sourceId;
      if (!id) return;
      // No re-ofrecer algo ya instalado.
      try { if (isModelInstalled(id)) return; } catch { /* */ }
      show(id);
    };
    window.addEventListener(OFFER_INSTALL_EVENT, onOffer);
    return () => window.removeEventListener(OFFER_INSTALL_EVENT, onOffer);
  }, [show]);

  return (
    <InstallModelModal
      sourceId={offer}
      open={offer !== null}
      onOpenChange={(v) => { if (!v) close(); }}
    />
  );
}

export default InstallModelModalHost;
