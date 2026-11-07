"use client";

/*
 * EstadoServidorLocal — pastilla «servidor local · listo en 127.0.0.1:…» (APP1107T6, 2026-11-07).
 * Lógica: src/lib/nativa/estado-servidor-local.ts · contrato: architecture/apps-autonomas-sin-internet.md T6.
 *
 * Solo se pinta dentro de la app nativa (si no hay `window.__TAURI__`, no pregunta ni pinta nada).
 * Se refresca sola: rápido mientras arranca o se reinicia, despacio cuando ya está listo.
 *
 * (CAP1107A · T1) Dice qué CAPA del servidor sirve (la del instalador o una bajada sin reinstalar) y, si
 * hay una nueva ya verificada, ofrece «Actualizar ahora»: reinicia solo el servidor local de la app
 * (sin cerrarla) y la página se recarga sola con la capa nueva. Contrato: apps-autonomas-sin-internet.md §10.
 */

import { useEffect, useState } from "react";
import { RefreshCw, Server } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  consultarEstadoServidor,
  pedirActualizarServidor,
  textoEstadoServidor,
  type EstadoServidorLocal as Estado,
  type TonoServidor,
} from "@/lib/nativa/estado-servidor-local";

const CLASE_TONO: Record<TonoServidor, string> = {
  ok: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  info: "border-sky-400/30 bg-sky-500/10 text-sky-200",
  aviso: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  error: "border-rose-400/30 bg-rose-500/10 text-rose-200",
  neutro: "border-white/10 bg-white/[0.04] text-white/55",
};

const CADA_RAPIDO_MS = 3_000;
const CADA_LENTO_MS = 30_000;

export function EstadoServidorLocal({ className }: { className?: string }) {
  const [estado, setEstado] = useState<Estado | null>(null);
  const [actualizando, setActualizando] = useState<string | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const fase = estado?.fase;
  const rapido = !!actualizando;

  useEffect(() => {
    let vivo = true;
    const leer = async () => {
      const e = await consultarEstadoServidor();
      if (vivo) setEstado(e);
    };
    void leer();
    // Sin dato (web normal o la app aún no contesta) o ya listo: despacio. Arrancando o caído: rápido.
    const lento = !rapido && (fase === undefined || fase === "local" || fase === "otro-sistema");
    const t = setInterval(() => void leer(), lento ? CADA_LENTO_MS : CADA_RAPIDO_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [fase, rapido]);

  const actualizar = async () => {
    setFallo(null);
    setActualizando("Actualizando…");
    const r = await pedirActualizarServidor();
    // Si fue bien, la página se recarga sola en unos segundos; si no, se dice por qué.
    setActualizando(r.ok ? r.mensaje : null);
    if (!r.ok) setFallo(r.mensaje);
  };

  const t = textoEstadoServidor(estado);
  if (!t) return null;
  const detalle = [t.detalle, fallo].filter(Boolean).join(" · ");
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      <span
        role="status"
        aria-label={detalle ? `${t.texto}. ${detalle}` : t.texto}
        title={detalle || undefined}
        data-testid="estado-servidor-local"
        data-tono={t.tono}
        className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-none whitespace-nowrap", CLASE_TONO[t.tono])}
      >
        <Server className="h-3 w-3" aria-hidden />
        {t.texto}
        {t.capa && (
          <>
            {" "}
            <span className="opacity-70" data-testid="estado-servidor-local-capa">
              · {t.capa}
            </span>
          </>
        )}
      </span>
      {t.nueva && (
        <button
          type="button"
          onClick={() => void actualizar()}
          disabled={!!actualizando}
          title={actualizando || `${t.nueva}: reinicia solo el servidor local, sin cerrar la app`}
          data-testid="estado-servidor-local-actualizar"
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-none whitespace-nowrap transition-colors",
            CLASE_TONO.info,
            "hover:bg-sky-500/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-300 disabled:opacity-60",
          )}
        >
          <RefreshCw className={cn("h-3 w-3", actualizando && "animate-spin")} aria-hidden />
          {actualizando ? "actualizando…" : `${t.nueva} · Actualizar ahora`}
        </button>
      )}
    </span>
  );
}
