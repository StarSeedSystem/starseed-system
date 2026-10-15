"use client";

/** Ajustes de sincronización y vinculación del cerebro. Contrato: §8 (vinculación y sincronización). */
import { useMemo, useCallback } from "react";
import type { Brain } from "@/lib/brains/brains";
import { normalizarVinculos } from "@/lib/cerebros/telepatia";
import { getMemoryDestinations } from "@/lib/brains/memory-destinations";
import { Send, ArrowRightLeft, Globe, Database, Wifi, Cloud } from "lucide-react";

export interface AjustesSyncProps {
  valor?: Partial<{ direccion: "enviar" | "recibir" | "ambas" | "ninguna"; auto: boolean; destinos: string[] }>;
  onCambio?: (v: Partial<{ direccion: string; auto: boolean; destinos: string[] }>) => void;
  cerebro?: Brain;
  onAbrirTelepatia?: () => void;
}

export function AjustesSync({ valor, onCambio, cerebro, onAbrirTelepatia }: AjustesSyncProps) {
  const direccion = valor?.direccion ?? "ambas";
  const auto = valor?.auto ?? true;
  const destinos = valor?.destinos ?? [];

  const vinculos = useMemo(() => {
    if (!cerebro) return [];
    return normalizarVinculos(cerebro.config);
  }, [cerebro]);

  const destinosMemoria = useMemo(() => {
    if (!cerebro) return { local: true, starseed: true, external: 0, p2p: false };
    try {
      const d = getMemoryDestinations(cerebro);
      return {
        local: d.local.enabled,
        starseed: d.starseed.enabled,
        external: d.external.length,
        p2p: d.p2p.enabled,
      };
    } catch {
      return { local: true, starseed: true, external: 0, p2p: false };
    }
  }, [cerebro]);

  const opcionesDireccion = [
    { key: "enviar" as const, label: "Enviar", icon: Send },
    { key: "recibir" as const, label: "Recibir", icon: ArrowRightLeft },
    { key: "ambas" as const, label: "Ambas", icon: ArrowRightLeft },
    { key: "ninguna" as const, label: "Ninguna", icon: Globe },
  ];

  const setDireccion = useCallback(
    (d: string) => {
      if (!onCambio) return;
      onCambio({ ...valor, direccion: d as "enviar" | "recibir" | "ambas" | "ninguna" });
    },
    [valor, onCambio],
  );

  const toggleAuto = useCallback(() => {
    if (!onCambio) return;
    onCambio({ ...valor, auto: !auto });
  }, [valor, onCambio, auto]);

  return (
    <section className="flex flex-col gap-5 p-4">
      <h3 className="text-base font-semibold text-foreground">Vinculación y sincronización</h3>

      {/* Dirección */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground">Dirección</span>
        <div className="flex flex-wrap gap-2">
          {opcionesDireccion.map((o) => (
            <button
              key={o.key}
              type="button"
              onClick={() => setDireccion(o.key)}
              className={`cursor-pointer whitespace-normal h-auto px-3 py-2 rounded-full text-sm border transition-colors inline-flex items-center gap-1.5 ${
                direccion === o.key
                  ? "bg-foreground text-background border-foreground"
                  : "bg-muted/40 text-foreground border-border hover:bg-muted/70"
              }`}
              aria-pressed={direccion === o.key}
              title={o.label}
            >
              <o.icon size={14} />
              <span>{o.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Sincronizar solo */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleAuto}
          className="cursor-pointer whitespace-normal h-auto inline-flex items-center gap-2 px-3 py-2 rounded-full text-sm border border-border bg-muted/30 hover:bg-muted/60 transition-colors"
          aria-pressed={auto}
        >
          <ArrowRightLeft size={16} />
          <span>Sincronizar solo</span>
        </button>
        <span className="text-xs text-muted-foreground">{auto ? "Activo" : "Inactivo"}</span>
      </div>

      {/* Destinos */}
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted-foreground">Destinos</span>
        <div className="flex flex-wrap gap-2">
          <span
            className={`cursor-default whitespace-normal h-auto px-2.5 py-1 rounded-md text-xs border ${
              destinosMemoria.local ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-muted/20 text-muted-foreground border-border"
            }`}
          >
            <Database size={12} className="inline mr-1" />Local
          </span>
          <span
            className={`cursor-default whitespace-normal h-auto px-2.5 py-1 rounded-md text-xs border ${
              destinosMemoria.starseed ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-muted/20 text-muted-foreground border-border"
            }`}
          >
            <Cloud size={12} className="inline mr-1" />StarSeed
          </span>
          <span
            className={`cursor-default whitespace-normal h-auto px-2.5 py-1 rounded-md text-xs border ${
              destinosMemoria.external > 0 ? "bg-violet-50 text-violet-700 border-violet-200" : "bg-muted/20 text-muted-foreground border-border"
            }`}
          >
            <Wifi size={12} className="inline mr-1" />Externos ({destinosMemoria.external})
          </span>
          <span
            className={`cursor-default whitespace-normal h-auto px-2.5 py-1 rounded-md text-xs border ${
              destinosMemoria.p2p ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-muted/20 text-muted-foreground border-border"
            }`}
          >
            <ArrowRightLeft size={12} className="inline mr-1" />P2P
          </span>
        </div>
      </div>

      {/* Resumen de telepatía */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Vínculos de Telepatía</span>
          <button
            type="button"
            onClick={() => onAbrirTelepatia?.()}
            className="cursor-pointer whitespace-normal h-auto px-3 py-1.5 rounded-full text-xs border border-border bg-background hover:bg-muted/40 transition-colors inline-flex items-center gap-1.5"
          >
            <ArrowRightLeft size={12} />
            <span>Abrir telepatía</span>
          </button>
        </div>
        {vinculos.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin vínculos configurados.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {vinculos.map((v) => (
              <div
                key={v.id}
                className="cursor-default whitespace-normal h-auto px-3 py-2 rounded-lg text-xs border border-border bg-background/60 flex items-center justify-between"
              >
                <span>
                  <span className="font-medium">{v.destino.tipo}</span>
                  <span className="text-muted-foreground"> · {v.acceso}</span>
                  <span className="text-muted-foreground"> · {v.direccion}</span>
                </span>
                <span className="text-[10px] text-muted-foreground">{v.id.slice(0, 8)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
