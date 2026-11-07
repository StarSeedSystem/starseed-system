"use client";

/*
 * EstadoServidorLocal — pastilla «servidor local · …» (APP1107T6, 2026-11-07).
 * Contrato: architecture/apps-autonomas-sin-internet.md §4 (T6) · lógica: src/lib/nativa/estado-servidor-local.ts.
 *
 * Enseña cómo está el servidor local de la app nativa (comando `servidor_local_estado` de Tauri).
 * Fuera de la app nativa (`window.__TAURI__` ausente) no se pinta ni llama a nada. Se montaría en
 * Ajustes › Neurona y en las señales del medio (informe de la tarea, no aquí).
 */

import { useCallback, useEffect, useState } from "react";
import {
  COMANDO_ESTADO,
  decirEstado,
  esAppNativa,
  interpretarEstado,
  type EstadoServidorLocalRemoto,
  type TonoEstado,
} from "@/lib/nativa/estado-servidor-local";

const CADA_MS = 15_000;

const TONOS: Record<TonoEstado, string> = {
  listo: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
  arrancando: "border-amber-300/40 bg-amber-300/10 text-amber-200",
  caido: "border-rose-300/40 bg-rose-300/10 text-rose-200",
  respaldo: "border-white/15 bg-black/50 text-white/80",
};

export function EstadoServidorLocal() {
  const [estado, setEstado] = useState<EstadoServidorLocalRemoto | null>(null);

  const leer = useCallback(async () => {
    const w = typeof window === "undefined" ? undefined : (window as unknown as { __TAURI__?: { core?: { invoke?: (cmd: string) => Promise<unknown> } } });
    const invoke = w?.__TAURI__?.core?.invoke;
    if (!invoke) return;
    try {
      const v = interpretarEstado(await invoke(COMANDO_ESTADO));
      if (v) setEstado(v);
    } catch {
      // La app se está cerrando o el puente aún no responde: se deja lo que haya.
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !esAppNativa(window as unknown as { __TAURI__?: unknown })) return;
    void leer();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void leer();
    }, CADA_MS);
    return () => clearInterval(t);
  }, [leer]);

  if (!estado) return null;
  const p = decirEstado(estado);
  const detalle = [estado.motivo, estado.reinicios > 0 ? `${estado.reinicios} reinicios` : null, estado.version_paquete ? `paquete ${estado.version_paquete}` : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <span
      role="status"
      aria-live="polite"
      title={detalle || undefined}
      data-testid="estado-servidor-local"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs ${TONOS[p.tono]}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {p.texto}
      {detalle ? <span className="sr-only">{` · ${detalle}`}</span> : null}
    </span>
  );
}
