"use client";

/**
 * SesionesOtrasApps — Sesiones activas de otras apps (Audiomorphic, Omnifrecuencias…) por aparato (2026-11-27).
 * ============================================================================================================
 * Identifica qué aparato(s) activos están usando cada app conectada o externa (mostrando el @idUnico,
 * color y estado de sincronización del aparato junto al apellido de su neurona) y ofrece las opciones
 * disponibles sobre todas las neuronas de la cuenta.
 */

import { useEffect, useMemo, useState } from "react";
import { AppWindow, Check, Cpu, RefreshCw, Sliders } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  colorEsteAparato,
  idUnicoEsteAparato,
  nombreEsteAparato,
  setPermission,
  type Neuron,
  type NeuronPermissions,
} from "@/lib/neurons/neurons";
import { neuronDeviceSyncId } from "@/lib/network/identidad-dispositivo";
import { usePresenciaNeuronas } from "@/lib/neurons/presencia";
import {
  EVENTO_SESIONES_APPS,
  agruparSesionesPorApp,
  detectarAppsLocalesActivas,
  type SesionAppLocal,
} from "@/lib/neurons/sesiones-apps";

export interface SesionesOtrasAppsProps {
  neuronas: readonly Neuron[];
  onAbrirNeurona?: (neuronaId: string) => void;
  className?: string;
}

export function SesionesOtrasApps({ neuronas, onAbrirNeurona, className }: SesionesOtrasAppsProps) {
  const presencia = usePresenciaNeuronas();
  const [locales, setLocales] = useState<SesionAppLocal[]>([]);
  const [appAbierta, setAppAbierta] = useState<string | null>(null);

  const recargarLocales = () => {
    setLocales(detectarAppsLocalesActivas());
  };

  useEffect(() => {
    recargarLocales();
    const h = () => recargarLocales();
    window.addEventListener(EVENTO_SESIONES_APPS, h);
    window.addEventListener("storage", h);
    const t = window.setInterval(recargarLocales, 15_000);
    return () => {
      window.removeEventListener(EVENTO_SESIONES_APPS, h);
      window.removeEventListener("storage", h);
      window.clearInterval(t);
    };
  }, []);

  const neuronaActual = neuronas.find((n) => n.isThisDevice) ?? null;

  const grupos = useMemo(
    () =>
      agruparSesionesPorApp({
        presenciaMedios: presencia.medios,
        neuronas,
        sesionesLocales: locales,
        neuronaActualId: neuronaActual?.id ?? null,
        aparatoActual: {
          id: neuronDeviceSyncId() || "este-aparato",
          idUnico: typeof idUnicoEsteAparato === "function" ? idUnicoEsteAparato() : "este-aparato",
          nombre: typeof nombreEsteAparato === "function" ? nombreEsteAparato() || (neuronaActual?.name ?? "Este aparato") : "Este aparato",
          color: typeof colorEsteAparato === "function" ? colorEsteAparato() : "#38bdf8",
          plataforma: neuronaActual?.capabilities?.platform,
        },
      }),
    [presencia.medios, neuronas, locales, neuronaActual],
  );

  const alternarPermisoNeurona = (n: Neuron, key: keyof NeuronPermissions) => {
    const nuevo = !(n.permissions?.[key] ?? true);
    try {
      setPermission(n.id, key, nuevo);
      toast.success(`Permiso «${key}» en ${n.name}: ${nuevo ? "activo" : "apagado"}`);
    } catch {
      toast.error("No se pudo cambiar el permiso de esa neurona");
    }
  };

  return (
    <section
      className={cn("w-full min-w-0 max-w-full rounded-2xl border border-white/10 bg-black/25 p-3 sm:p-4 space-y-3", className)}
      aria-label="Sesiones de otras apps"
      data-testid="sesiones-otras-apps"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="flex items-center gap-2 text-sm font-semibold text-white">
            <AppWindow className="h-4 w-4 text-fuchsia-300" aria-hidden />
            Sesiones de otras apps (Audiomorphic y ecosistema)
          </h4>
          <p className="text-xs text-white/55">
            Reconoce qué aparato(s) activos usan cada app conectada junto con las opciones de todas las neuronas disponibles.
          </p>
        </div>
        <Button size="sm" variant="ghost" className="cursor-pointer h-8 gap-1.5 text-xs" onClick={recargarLocales}>
          <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Detectar sesiones
        </Button>
      </div>

      {grupos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-3 py-4 text-xs text-white/55">
          No hay sesiones activas de apps externas detectadas ahora en tus aparatos. Cuando abras Audiomorphic u otra app conectada en cualquier dispositivo, aparecerá aquí con su aparato activo y opciones de neurona.
        </p>
      ) : (
        <div className="space-y-2.5">
          {grupos.map((g) => {
            const abierta = appAbierta === g.appId;
            return (
              <div key={g.appId} className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
                      {g.nombre}
                      <Badge variant="outline" className="border-fuchsia-400/35 bg-fuchsia-500/15 text-[10px] text-fuchsia-200">
                        {g.aparatosActivos.length} {g.aparatosActivos.length === 1 ? "aparato activo" : "aparatos activos"}
                      </Badge>
                    </p>
                    {g.origen && <p className="text-[11px] text-white/50">{g.origen}</p>}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="cursor-pointer h-8 gap-1.5 text-xs"
                    onClick={() => setAppAbierta(abierta ? null : g.appId)}
                  >
                    <Sliders className="h-3.5 w-3.5" aria-hidden />
                    {abierta ? "Ocultar opciones de neuronas" : "Opciones de neuronas"}
                  </Button>
                </div>

                {/* Aparatos activos usando esta app */}
                <ul className="space-y-1.5" aria-label={`Aparatos activos usando ${g.nombre}`}>
                  {g.aparatosActivos.map((ap) => (
                    <li key={ap.clave} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-2 text-xs">
                      <span className="size-2.5 shrink-0 rounded-full ring-1 ring-white/40" style={{ backgroundColor: ap.aparatoColor }} aria-hidden />
                      <span className="font-semibold text-white/90">{ap.aparatoNombre}</span>
                      <span className="rounded border border-white/15 bg-black/40 px-1.5 py-px font-mono text-[10px] text-white/80">
                        @{ap.aparatoIdUnico}
                      </span>
                      <span className="text-white/55">· Neurona: {ap.neuronaNombre}</span>
                      {ap.plataforma && <span className="text-white/45">({ap.plataforma})</span>}
                      {ap.esEsteAparato && (
                        <Badge variant="outline" className="border-emerald-400/35 bg-emerald-500/15 text-[9px] text-emerald-200">
                          Este aparato
                        </Badge>
                      )}
                      <span className={cn(
                        "ml-auto rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                        ap.syncEstado === "activa" ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200",
                      )}>
                        {ap.syncEstado === "activa" ? "Sincronización activa" : "Sync pendiente"}
                      </span>
                    </li>
                  ))}
                </ul>

                {/* Opciones de todas las neuronas disponibles para esta sesión */}
                {abierta && (
                  <div className="space-y-2 border-t border-white/10 pt-2.5">
                    <p className="flex items-center gap-1.5 text-xs font-medium text-white/75">
                      <Cpu className="h-3.5 w-3.5 text-cyan-300" aria-hidden />
                      Opciones disponibles por neurona ({neuronas.length})
                    </p>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {neuronas.map((n) => (
                        <div key={n.id} className="rounded-lg border border-white/10 bg-black/30 p-2.5 space-y-2 text-xs">
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="font-semibold text-white">{n.name}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {n.online ? "En línea" : "En espera"}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(["senses", "sync", "compute", "agent"] as const).map((k) => {
                              const on = n.permissions?.[k] ?? true;
                              return (
                                <button
                                  key={k}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => alternarPermisoNeurona(n, k)}
                                  className={cn(
                                    "inline-flex cursor-pointer items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] transition-colors",
                                    on ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100" : "border-white/10 bg-black/20 text-white/50",
                                  )}
                                >
                                  {on && <Check className="h-2.5 w-2.5" aria-hidden />}
                                  {k === "senses" ? "Sentidos" : k === "sync" ? "Sync" : k === "compute" ? "Cómputo" : "Agentes"}
                                </button>
                              );
                            })}
                            {onAbrirNeurona && (
                              <button
                                type="button"
                                onClick={() => onAbrirNeurona(n.id)}
                                className="ml-auto cursor-pointer rounded border border-sky-400/35 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-200 hover:bg-sky-500/20"
                              >
                                Abrir ficha
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

export default SesionesOtrasApps;
