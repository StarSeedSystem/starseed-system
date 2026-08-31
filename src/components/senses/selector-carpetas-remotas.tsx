"use client";

/**
 * SELECTOR DE CARPETAS DE LA CUENTA CONECTADA (Adenda 195).
 * ----------------------------------------------------------------------------
 * Navega las carpetas reales del servicio (Drive, Dropbox, OneDrive) y deja
 * marcar las que quieras. Cada una marcada se vincula como carpeta de la
 * neurona y el paso de Cerebros la enlaza sola al cerebro principal.
 * Honesto con los estados: sin cuenta, sesión caducada o error se dicen tal
 * cual, con la acción que corresponde.
 */

import { useCallback, useEffect, useState } from "react";
import { Folder, FolderOpen, ChevronRight, Loader2, Check, RotateCw, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { listarCarpetasRemotas, type CarpetaRemota } from "@/lib/storage/carpetas-remotas";
import { agregarCarpetaServicio, listarCarpetas, quitarCarpeta } from "@/lib/storage/carpetas-vinculadas";
import { OAUTH_ALMACENAMIENTO } from "@/lib/storage/oauth-almacenamiento";
import type { ServicioAlmacenamiento } from "@/lib/storage/carpetas-vinculadas";

interface Nivel { id: string; nombre: string; ruta: string }

export function SelectorCarpetasRemotas({
  servicio,
  onReconectar,
  onCerrar,
}: {
  servicio: ServicioAlmacenamiento;
  onReconectar: () => void;
  onCerrar?: () => void;
}) {
  const [ruta, setRuta] = useState<Nivel[]>([]);
  const [carpetas, setCarpetas] = useState<CarpetaRemota[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<{ motivo: string; detalle?: string } | null>(null);
  const [vinculadas, setVinculadas] = useState<Set<string>>(new Set());

  const label = OAUTH_ALMACENAMIENTO[servicio]?.label ?? "el servicio";
  const actual = ruta[ruta.length - 1];

  const cargar = useCallback(async (nivel: Nivel | undefined) => {
    setCargando(true);
    setError(null);
    const r = await listarCarpetasRemotas(servicio, nivel?.id ?? "", nivel?.ruta ?? "");
    if (r.ok) setCarpetas(r.carpetas);
    else { setCarpetas([]); setError({ motivo: r.motivo, detalle: r.detalle }); }
    setCargando(false);
  }, [servicio]);

  useEffect(() => { void cargar(undefined); }, [cargar]);

  // Refleja lo que ya está vinculado (por ruta) para poder desmarcar.
  useEffect(() => {
    const set = new Set<string>();
    for (const c of listarCarpetas()) {
      if (c.tipo === "servicio" && c.servicio === servicio && c.ruta) set.add(c.ruta);
    }
    setVinculadas(set);
  }, [servicio, carpetas]);

  const entrar = useCallback((c: CarpetaRemota) => {
    const nivel = { id: c.id, nombre: c.nombre, ruta: c.ruta };
    setRuta((r) => [...r, nivel]);
    void cargar(nivel);
  }, [cargar]);

  const subirA = useCallback((idx: number) => {
    const nueva = ruta.slice(0, idx + 1);
    setRuta(nueva);
    void cargar(nueva[nueva.length - 1]);
  }, [ruta, cargar]);

  const alternar = useCallback((c: CarpetaRemota) => {
    const yaEsta = vinculadas.has(c.ruta);
    if (yaEsta) {
      const encontrada = listarCarpetas().find((x) => x.tipo === "servicio" && x.servicio === servicio && x.ruta === c.ruta);
      if (encontrada) quitarCarpeta(encontrada.id);
      setVinculadas((s) => { const n = new Set(s); n.delete(c.ruta); return n; });
    } else {
      agregarCarpetaServicio(servicio, c.ruta);
      setVinculadas((s) => new Set(s).add(c.ruta));
    }
  }, [vinculadas, servicio]);

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-black/20 p-2.5">
      {/* Migas de pan */}
      <div className="flex flex-wrap items-center gap-1 text-[11px] text-white/60">
        <button
          type="button"
          onClick={() => { setRuta([]); void cargar(undefined); }}
          className="inline-flex items-center gap-1 rounded px-1 py-0.5 transition-colors hover:bg-white/10 hover:text-white/90"
        >
          <Home className="h-3 w-3" aria-hidden /> {label}
        </button>
        {ruta.map((n, i) => (
          <span key={n.id} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-white/30" aria-hidden />
            <button
              type="button"
              onClick={() => subirA(i)}
              className="rounded px-1 py-0.5 transition-colors hover:bg-white/10 hover:text-white/90"
            >
              {n.nombre}
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={() => void cargar(actual)}
          className="ml-auto inline-flex items-center gap-1 rounded px-1 py-0.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white/80"
          title="Actualizar"
        >
          <RotateCw className="h-3 w-3" aria-hidden />
        </button>
      </div>

      {cargando ? (
        <p className="flex items-center gap-2 px-1 py-4 text-[11px] text-white/50">
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Leyendo tus carpetas…
        </p>
      ) : error ? (
        <div className="space-y-2 px-1 py-2 text-[11px] leading-snug text-amber-100/90">
          {error.motivo === "sesion-caducada" || error.motivo === "sin-cuenta" ? (
            <>
              <p>La autorización de {label} ya no es válida (caducó o la revocaste desde tu cuenta).</p>
              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onReconectar}>
                Volver a conectar
              </Button>
            </>
          ) : (
            <p>No pude leer las carpetas: {error.detalle || "el servicio no respondió."}</p>
          )}
        </div>
      ) : carpetas.length === 0 ? (
        <p className="px-1 py-4 text-[11px] text-white/50">Aquí no hay carpetas.</p>
      ) : (
        <ul className="max-h-56 space-y-1 overflow-y-auto pr-1">
          {carpetas.map((c) => {
            const marcada = vinculadas.has(c.ruta);
            return (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => alternar(c)}
                  aria-pressed={marcada}
                  className={cn(
                    "grid h-5 w-5 shrink-0 place-items-center rounded border transition-colors",
                    marcada ? "border-emerald-400/60 bg-emerald-500/20 text-emerald-200" : "border-white/20 text-transparent hover:border-emerald-400/40",
                  )}
                  title={marcada ? "Quitar de mis carpetas" : "Vincular esta carpeta"}
                >
                  <Check className="h-3 w-3" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => entrar(c)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left text-xs transition-colors hover:text-cyan-200"
                >
                  {marcada ? <FolderOpen className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
                           : <Folder className="h-3.5 w-3.5 shrink-0 text-cyan-300" aria-hidden />}
                  <span className="min-w-0 truncate">{c.nombre}</span>
                  <ChevronRight className="ml-auto h-3 w-3 shrink-0 text-white/25" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex items-center justify-between gap-2 pt-0.5">
        <span className="text-[10px] text-white/45">
          {vinculadas.size > 0
            ? `${vinculadas.size} carpeta${vinculadas.size === 1 ? "" : "s"} vinculada${vinculadas.size === 1 ? "" : "s"} · se enlazan solas a tu cerebro principal`
            : "Marca las carpetas que quieres que tu cerebro conozca."}
        </span>
        {onCerrar && (
          <Button size="sm" variant="outline" className="h-7 shrink-0 text-[11px]" onClick={onCerrar}>Listo</Button>
        )}
      </div>
    </div>
  );
}

export default SelectorCarpetasRemotas;
