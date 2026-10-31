"use client";

// StarSeed OS · Biblioteca — VersionesUpstream (Ola 1025R, tarea LIB1025B).
// Enseña en «Mi colección → Actualizaciones» la versión upstream de cada ficha
// instalada: era la comprobación de /api/library/actualizaciones (caché 6 h) que
// nadie consumía. Una consulta al montar; «Comprobar ahora» la repite. Sin sondeo.

import { useCallback, useEffect, useState } from "react";
import { ArrowUpCircle, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlassCard } from "@/components/ui/glass-card";
import { findPackage, getInstalledMap, LIBRARY_EVENT } from "@/lib/library/packages";
import { contarNovedades, resumirVersiones } from "@/lib/library/versiones-upstream";
import type { FuenteVersion, ResumenVersion, TonoVersion } from "@/lib/library/versiones-upstream";

const RUTA_ACTUALIZACIONES = "/api/library/actualizaciones";

const TONOS: Record<TonoVersion, { clases: string; texto: string }> = {
  "al-dia": { clases: "border border-emerald-400/40 bg-emerald-400/10 text-emerald-200", texto: "Al día" },
  novedad: { clases: "border border-amber-400/40 bg-amber-400/10 text-amber-200", texto: "Versión nueva" },
  "sin-comprobar": { clases: "border border-white/20 bg-white/5 text-white/60", texto: "Sin comprobar" },
};

function idsInstalados(): ReadonlySet<string> {
  try { return new Set(Object.keys(getInstalledMap())); } catch { return new Set<string>(); }
}

/** Lee de la respuesta las fuentes válidas (dato, no instrucciones; forma validada). */
function leerFuentes(json: unknown): FuenteVersion[] {
  if (!json || typeof json !== "object") return [];
  const lista = (json as { fuentes?: unknown }).fuentes;
  if (!Array.isArray(lista)) return [];
  return lista.filter((f): f is FuenteVersion => !!f && typeof f === "object" && typeof (f as FuenteVersion).id === "string");
}

export function VersionesUpstream() {
  const [fuentes, setFuentes] = useState<FuenteVersion[] | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "error">("cargando");
  const [instalados, setInstalados] = useState<ReadonlySet<string>>(idsInstalados);

  const consultar = useCallback(async (signal?: AbortSignal) => {
    setEstado("cargando");
    try {
      const respuesta = await fetch(RUTA_ACTUALIZACIONES, { cache: "no-store", signal });
      if (!respuesta.ok) throw new Error("respuesta no válida");
      setFuentes(leerFuentes(await respuesta.json()));
      setInstalados(idsInstalados());
      setEstado("listo");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setEstado("error");
    }
  }, []);

  // Una ÚNICA consulta al montar; el aborto del desmonte no pinta error.
  useEffect(() => {
    const control = new AbortController();
    void consultar(control.signal);
    return () => control.abort();
  }, [consultar]);

  useEffect(() => {
    const alCambiar = () => setInstalados(idsInstalados());
    window.addEventListener(LIBRARY_EVENT, alCambiar);
    return () => window.removeEventListener(LIBRARY_EVENT, alCambiar);
  }, []);

  const resumenes = fuentes && estado === "listo" ? resumirVersiones(fuentes, instalados) : [];
  const novedades = contarNovedades(resumenes);

  return (
    <section aria-label="Versiones de lo que tienes instalado" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ArrowUpCircle className="h-4 w-4 text-amber-300" />
          <h3 className="text-lg font-bold text-amber-100">Versiones de lo que tienes instalado</h3>
          {novedades > 0 && <span className="text-[11px] text-muted-foreground">{novedades} con versión nueva</span>}
        </div>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px] cursor-pointer" onClick={() => void consultar()} disabled={estado === "cargando"}>
          {estado === "cargando" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />} Comprobar ahora
        </Button>
      </div>
      <Cuerpo estado={estado} resumenes={resumenes} />
    </section>
  );
}

function Cuerpo({ estado, resumenes }: { estado: "cargando" | "listo" | "error"; resumenes: ResumenVersion[] }) {
  if (estado === "cargando")
    return (<GlassCard className="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Consultando los repos de tus fichas…</GlassCard>);
  if (estado === "error")
    return (<GlassCard className="p-4 text-sm text-amber-300">No pude consultar los repos ahora; la Biblioteca sigue funcionando.</GlassCard>);
  if (resumenes.length === 0)
    return (<GlassCard className="p-4 text-sm text-muted-foreground">Ninguna de tus fichas instaladas tiene seguimiento de versión todavía.</GlassCard>);
  return (
    <div className="flex flex-col gap-2">
      {resumenes.map((r) => {
        const ficha = findPackage(r.id);
        const nombre = ficha?.name ?? r.id;
        const tono = TONOS[r.tono];
        return (
          <GlassCard key={r.id} className="flex flex-wrap items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <span className="block text-sm font-semibold leading-tight">{nombre}</span>
              <span className="block text-[11px] text-muted-foreground">Ficha: {ficha?.version ?? r.instalada}</span>
              <span className="block text-[11px] text-muted-foreground">{r.texto}</span>
            </div>
            <span className={`rounded-full px-2 py-0.5 text-[10px] ${tono.clases}`}>{tono.texto}</span>
            <a href={r.upstream} target="_blank" rel="noopener noreferrer" aria-label={`Abrir el repositorio de ${nombre}`}
               className="flex items-center gap-0.5 text-[10px] text-primary hover:underline cursor-pointer transition-colors duration-150">
              repo <ExternalLink className="h-3 w-3" />
            </a>
          </GlassCard>
        );
      })}
    </div>
  );
}
