"use client";

// VersionesUpstream — «Mi colección → Actualizaciones» · Ola 1025R. La versión upstream de cada
// ficha instalada, con el módulo PURO @/lib/library/versiones-upstream y la ruta
// /api/library/actualizaciones: UN fetch al montarse (AbortController + try/catch; la ruta ya
// cachea 6 h, sin sondeos) y un botón «Comprobar ahora» para repetir.

import { useCallback, useEffect, useState } from "react";
import { ArrowUpCircle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { findPackage, getInstalledMap, LIBRARY_EVENT } from "@/lib/library/packages";
import { resumirVersiones, type FuenteVersion, type ResumenVersion, type TonoVersion } from "@/lib/library/versiones-upstream";

type RespuestaActualizaciones = { generado: string; fuentes: FuenteVersion[] };

/** Chip por tono: color Y texto (nunca solo color). */
const CHIPS: Record<TonoVersion, { texto: string; clase: string }> = {
  "al-dia": { texto: "Al día", clase: "border-emerald-300/40 bg-emerald-900/20 text-emerald-300" },
  novedad: { texto: "Versión nueva", clase: "border-amber-300/40 bg-amber-900/20 text-amber-300" },
  "sin-comprobar": { texto: "Sin comprobar", clase: "border-white/20 bg-black/20 text-white/60" },
};

async function consultaRuta(senal: AbortSignal): Promise<RespuestaActualizaciones> {
  const respuesta = await fetch("/api/library/actualizaciones", { cache: "no-store", signal: senal });
  if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
  return (await respuesta.json()) as RespuestaActualizaciones;
}

export function VersionesUpstream({ consultar, idsIniciales }: {
  /** Inyectables para las pruebas; por defecto fetch a la ruta y getInstalledMap() re-lecto ante LIBRARY_EVENT. */
  consultar?: (senal: AbortSignal) => Promise<RespuestaActualizaciones>;
  idsIniciales?: Record<string, unknown>;
}) {
  const [idsInstalados, setIdsInstalados] = useState<Record<string, unknown>>(() => idsIniciales ?? {});
  const [fuentes, setFuentes] = useState<FuenteVersion[] | null>(null);
  const [avisoError, setAvisoError] = useState(false);
  const [buscando, setBuscando] = useState(true);

  // Ids instalados: re-lectura cuando la Biblioteca cambia (no sondeos).
  useEffect(() => {
    if (idsIniciales) return;
    const releer = () => setIdsInstalados(getInstalledMap());
    releer();
    window.addEventListener(LIBRARY_EVENT, releer);
    return () => window.removeEventListener(LIBRARY_EVENT, releer);
  }, [idsIniciales]);

  // Un fetch por llamada: al montarse y con «Comprobar ahora». Sin periodos.
  const lanzar = useCallback(async (senal: AbortSignal) => {
    setBuscando(true);
    setAvisoError(false);
    try {
      setFuentes((await (consultar ?? consultaRuta)(senal)).fuentes);
    } catch {
      if (!senal.aborted) {
        setFuentes(null);
        setAvisoError(true);
      }
    } finally {
      if (!senal.aborted) setBuscando(false);
    }
  }, [consultar]);

  useEffect(() => {
    const control = new AbortController();
    void lanzar(control.signal);
    return () => control.abort();
  }, [lanzar]);

  const comprobarAhora = useCallback(() => void lanzar(new AbortController().signal), [lanzar]);
  const resumen: ResumenVersion[] = fuentes
    ? resumirVersiones(fuentes, new Set(Object.keys(idsInstalados)))
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowUpCircle className="h-4 w-4 text-amber-300" />
          <h3 className="text-lg font-bold">Versiones de lo que tienes instalado</h3>
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px] cursor-pointer" onClick={comprobarAhora} disabled={buscando}>
          {buscando ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Comprobar ahora
        </Button>
      </div>

      {avisoError && (
        <GlassCard className="p-6 text-center text-sm text-amber-300/90">
          No pude consultar los repos ahora; la Biblioteca sigue funcionando
        </GlassCard>
      )}
      {!avisoError && !buscando && resumen.length === 0 && (
        <GlassCard className="p-6 text-center text-sm text-muted-foreground">
          Nada instalado que comprobar todavía: instala fichas y verás su versión frente a la publicada.
        </GlassCard>
      )}
      {buscando && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> Consultando los repos…
        </p>
      )}

      <div className="grid gap-2">
        {resumen.map((r) => {
          const chip = CHIPS[r.tono];
          return (
            <GlassCard key={r.id} className="p-3 flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex flex-col gap-0.5">
                <span className="text-sm font-semibold leading-tight truncate">{findPackage(r.id)?.name ?? r.id}</span>
                <span className="text-[11px] text-white/70">{r.texto}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <span className="text-[10px] text-white/60">Ficha: {r.instalada}</span>
                <span className="text-[10px] text-white/60">Publicada: {r.remota ?? "—"}</span>
                {r.fecha && <span className="text-[10px] text-white/40">{r.fecha}</span>}
                <Badge variant="outline" className={`text-[10px] gap-0.5 ${chip.clase}`}>{chip.texto}</Badge>
                <a href={r.upstream} target="_blank" rel="noopener noreferrer" className="flex items-center gap-0.5 text-[10px] text-primary hover:underline cursor-pointer transition-colors duration-150">
                  repo <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
