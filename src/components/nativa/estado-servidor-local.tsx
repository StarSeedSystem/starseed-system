"use client";

/*
 * EstadoServidorLocal — pastilla «servidor local · listo en 127.0.0.1:…» (APP1107T6, 2026-11-07).
 * Lógica: src/lib/nativa/estado-servidor-local.ts · contrato: architecture/apps-autonomas-sin-internet.md T6.
 *
 * Solo se pinta dentro de la app nativa (si no hay `window.__TAURI__`, no pregunta ni pinta nada).
 * Se refresca sola: rápido mientras arranca o se reinicia, despacio cuando ya está listo.
 */

import { useEffect, useState } from "react";
import { Server } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  consultarEstadoServidor,
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
  const fase = estado?.fase;

  useEffect(() => {
    let vivo = true;
    const leer = async () => {
      const e = await consultarEstadoServidor();
      if (vivo) setEstado(e);
    };
    void leer();
    // Sin dato (web normal o la app aún no contesta) o ya listo: despacio. Arrancando o caído: rápido.
    const lento = fase === undefined || fase === "local" || fase === "otro-sistema";
    const t = setInterval(() => void leer(), lento ? CADA_LENTO_MS : CADA_RAPIDO_MS);
    return () => {
      vivo = false;
      clearInterval(t);
    };
  }, [fase]);

  const t = textoEstadoServidor(estado);
  if (!t) return null;
  return (
    <span
      role="status"
      aria-label={t.detalle ? `${t.texto}. ${t.detalle}` : t.texto}
      title={t.detalle || undefined}
      data-testid="estado-servidor-local"
      data-tono={t.tono}
      className={cn("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] leading-none whitespace-nowrap", CLASE_TONO[t.tono], className)}
    >
      <Server className="h-3 w-3" aria-hidden />
      {t.texto}
    </span>
  );
}
