"use client";

/**
 * ELEGIR FONDO INICIAL — paso «Elige tu fondo» del rito (Ola 1018F · FSH1018J ·
 * architecture/fondos-shaders.md §3), con el estilo del `SelectorVozInicial`.
 * NO bloquea: «Ahora no» lo aplaza 7 días (fondo-inicial.ts). Primera opción el
 * fondo ACTUAL (motor base, Spline por defecto); luego los sets oficiales de
 * StarSeed y la Biblioteca («Fondos con Shaders», el catálogo entero, nunca
 * recursos de shaders.com). Se aplica al perfil y/o a las apps (`alcance-fondos`)
 * y queda guardado en la Biblioteca (`fondos-biblioteca`).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, Layers, Loader2, Library, Palette } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EVENTO_APLICAR_FONDO, type DetalleAplicarFondo } from "@/lib/protomolecula/peticion/fondo-evento";
import { capasConFondo, PREFIJO_CAPA_FONDO } from "@/lib/protomolecula/peticion/fondo";
import { FORMATO_SET, LICENCIA_SHADERS, type SetFondo } from "@/lib/appearance/sets-fondo";
import { guardarSet } from "@/lib/appearance/fondos-biblioteca";
import { versionDelCatalogo, aplazamientoElegirFondo, CLAVE_FONDO_INICIAL, type EstadoFondoInicial } from "@/lib/onboarding/fondo-inicial";
import type { AmbitoFondo } from "@/lib/appearance/alcance-fondos";
import { useMyLibraryDestinations } from "@/lib/library/entity-library";

interface PresetOficial { components?: unknown[]; structureVersion?: number }
export interface EleccionFondo { set: string | null; alcance: AmbitoFondo[] }

export function ElegirFondoInicial({ onElegir, className }: {
  onElegir?: (e: EleccionFondo) => void | Promise<void>;
  className?: string;
}) {
  const { destinations } = useMyLibraryDestinations();
  const destino = destinations[0] ?? null; // «Mi biblioteca», nunca compartida
  const [sets, setSets] = useState<Array<{ id: string; nombre: string; desc: string; preset: PresetOficial }> | null>(null);
  const [efectos, setEfectos] = useState<number | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [alcance, setAlcance] = useState<AmbitoFondo[]>(["perfil"]);
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    let vivo = true;
    Promise.all([
      import("@/lib/library/packages").then((m) => m.FONDO_SHADER_REPO),
      import("@/lib/appearance/catalogo-shaders").then((m) => m.cargarCatalogo()),
    ]).then(([repo, catalogo]) => {
      if (!vivo) return;
      setEfectos(versionDelCatalogo(catalogo) % 1000); // efectos en la parte baja de la «versión»
      setSets(repo.packages.filter((p) => p.kind === "design").map((p) => ({
        id: p.id, nombre: p.name, desc: p.description ?? "",
        preset: (p.payload as { setFondo?: PresetOficial }).setFondo ?? {},
      })));
    }).catch(() => { if (vivo) setSets([]); });
    return () => { vivo = false; };
  }, []);
  const guardar = useCallback(async () => {
    if (guardando) return;
    setGuardando(true);
    try {
      const sel = sets?.find((s) => s.id === elegido) ?? null;
      if (!sel) { await onElegir?.({ set: null, alcance }); return; }
      const { createLayer } = await import("@/lib/appearance/background-layers");
      const capa = { ...createLayer("shader"), name: `${PREFIJO_CAPA_FONDO}${sel.nombre}`,
        preset: { components: sel.preset.components ?? [], structureVersion: sel.preset.structureVersion ?? 1 } };
      const detalle: DetalleAplicarFondo = { aplicar: (capas) => capasConFondo(capas, capa as unknown as Record<string, unknown>) };
      const atendido = !window.dispatchEvent(new CustomEvent(EVENTO_APLICAR_FONDO, { detail: detalle, cancelable: true }));
      const setFondo: SetFondo = { formato: FORMATO_SET, version: 1, id: sel.id, nombre: sel.nombre, autor: "StarSeed",
        licencias: [LICENCIA_SHADERS], base: null, capas: [capa], creado: new Date().toISOString() };
      const r = destino ? await guardarSet(destino.ref, setFondo) : null;
      const nota = !atendido ? "No pude aplicar el fondo: la apariencia no respondió" : !r ? "Fondo aplicado; entra en tu cuenta para que quede en tu Biblioteca" : r.ok ? `Fondo aplicado y guardado en la carpeta «Fondos» de ${destino.label}` : `Fondo aplicado, pero no quedó en tu Biblioteca: ${r.motivo}`;
      toast[!atendido ? "error" : !r ? "info" : r.ok ? "success" : "error"](nota);
      await onElegir?.({ set: sel.id, alcance });
    } finally {
      setGuardando(false);
    }
  }, [alcance, destino, elegido, guardando, onElegir, sets]);
  const diferir = useCallback(() => {
    const estado: EstadoFondoInicial = { yaEligio: false, aplazadoHasta: aplazamientoElegirFondo(new Date()) };
    try { window.localStorage.setItem(CLAVE_FONDO_INICIAL, JSON.stringify(estado)); } catch { /* sesión en memoria */ }
    void onElegir?.({ set: null, alcance: [] });
  }, [onElegir]);
  const anim = "cursor-pointer rounded-xl border px-3 py-3 transition-all duration-200 hover:-translate-y-0.5";
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-white/35">Elige tu fondo</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => setElegido(null)} aria-pressed={elegido === null} className={cn(anim, "text-center", elegido === null ? "border-fuchsia-400/70 bg-fuchsia-500/[0.12]" : "border-white/10 bg-white/[0.03] hover:border-fuchsia-400/40")}>
          <Palette className={cn("mx-auto mb-1 h-4 w-4", elegido === null ? "text-fuchsia-200" : "text-white/40")} aria-hidden />
          <span className="block text-[13px] font-semibold">Tu fondo actual</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-white/50">Se queda como está (motor base, Spline por defecto).</span>
        </button>
        {sets === null && <p className="text-[11px] leading-snug text-white/40">Abriendo los sets de la Biblioteca…</p>}
        {sets?.map((s) => (
          <button key={s.id} type="button" onClick={() => setElegido(s.id)} aria-pressed={elegido === s.id} title={s.desc} className={cn(anim, "text-left", elegido === s.id ? "border-fuchsia-400/70 bg-fuchsia-500/[0.12]" : "border-white/10 bg-white/[0.03] hover:border-fuchsia-400/40")}>
            <Layers className={cn("mb-1 h-4", elegido === s.id ? "text-fuchsia-200" : "text-white/40")} aria-hidden />
            <span className="block text-[13px] font-semibold">{s.nombre}</span>
            <span className="mt-0.5 line-clamp-2 block text-[11px] leading-snug text-white/50">{s.desc}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
        <span className="text-[11px] text-white/50">Aplicar a:</span>
        {([["perfil", "Todo el perfil"], ["app", "Las apps"]] as const).map(([a, punto]) => (
          <button key={a} type="button" aria-pressed={alcance.includes(a)} onClick={() => setAlcance((v) => (v.includes(a) ? v.filter((x) => x !== a) : [...v, a]))}
            title={a === "app" ? "El fondo queda disponible para las apps" : "El fondo manda en todo el perfil"}
            className={cn("inline-flex cursor-pointer items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-medium transition-colors", alcance.includes(a) ? "border-fuchsia-400/60 bg-fuchsia-500/20 text-fuchsia-100" : "border-white/12 bg-white/[0.03] text-white/65 hover:border-fuchsia-400/40")}>
            {alcance.includes(a) && <Check className="size-3" aria-hidden />} {punto}
          </button>
        ))}
        <Link href="/library" className="mx-auto inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.03] px-3 py-1.5 text-[11px] text-white/65 transition-colors hover:border-white/25 hover:text-white/85" title="La Biblioteca guarda sets y la ficha «Fondos con Shaders» con todo el catálogo">
          <Library className="h-3.5 w-3.5" aria-hidden /> Biblioteca · Fondos con Shaders
          {efectos !== null && <span className="text-white/40">({efectos} efectos)</span>}
        </Link>
        <button type="button" onClick={diferir} className="cursor-pointer rounded-full px-3 py-1.5 text-[11px] font-medium text-white/60 transition-colors hover:text-white/90">Ahora no</button>
        <button type="button" onClick={() => void guardar()} disabled={guardando} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-fuchsia-400/35 bg-fuchsia-500/10 px-3 py-1.5 text-[11px] font-medium text-fuchsia-100/90 transition-colors hover:border-fuchsia-400/60 hover:bg-fuchsia-500/20 disabled:cursor-not-allowed disabled:opacity-40">
          {guardando ? <><Loader2 className="size-3 animate-spin" aria-hidden /> Guardando…</> : "Listo"}
        </button>
      </div>
    </div>
  );
}
export default ElegirFondoInicial;
