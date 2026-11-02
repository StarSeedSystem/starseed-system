"use client";

/** Panel «Contenido vivo» (CVV1028, tarea H, contrato `architecture/contenido-vivo.md`): los tres niveles
 *  con su interruptor, la tabla de `compararRutas` por tarea, «Conectar» en los externos sin conectar y la
 *  cotización con «Generar» que pide confirmación antes de gastar créditos. */

import { useMemo, useState } from "react";
import { TAREAS_VIVAS } from "@/lib/contenido-vivo/catalogo-rutas";
import { compararRutas, elegirRuta, servicioConectado, type CandidatoRuta, type ContextoVivo } from "@/lib/contenido-vivo/rutas";
import type { NivelVivo, TareaViva } from "@/lib/contenido-vivo/tipos";

/** Una tarea cotizada: sus candidatos, la ruta elegida y el total del plan. */
export interface PlanVivo {
  tareas: { tarea: TareaViva; candidatos: CandidatoRuta[]; elegida: CandidatoRuta | null }[];
  total: number;
}

/** Los tres niveles del contrato §1, con sus tareas. */
export const NIVELES_VIVOS = [
  { nivel: 1, nombre: "3D vivo", tareas: ["escena-3d"] },
  { nivel: 2, nombre: "Película e imágenes", tareas: ["clip-pelicula", "fotograma-clave", "foto", "foto-viva"] },
  { nivel: 3, nombre: "Gráficos vivos", tareas: ["grafico-vivo", "revision-texto", "comprobacion"] },
] as const;

/** Cotiza el plan con funciones puras: elige por tarea y suma los créditos elegidos. */
export function cotizarPlan(contexto: ContextoVivo, seleccion: Partial<Record<TareaViva, string>>, tareas: readonly TareaViva[] = TAREAS_VIVAS): PlanVivo {
  const cotizadas = tareas.map((tarea) => {
    const candidatos = compararRutas(tarea, contexto);
    return { tarea, candidatos, elegida: candidatos.find((c) => c.ruta.id === seleccion[tarea]) ?? elegirRuta(tarea, contexto) ?? null };
  });
  return { tareas: cotizadas, total: cotizadas.reduce((suma, t) => suma + (t.elegida?.ruta.creditosPorUnidad ?? 0), 0) };
}

export function PanelContenidoVivo({ contexto, onConfirmar }: { contexto: ContextoVivo; onConfirmar?: (plan: PlanVivo) => void }) {
  const [encendidos, setEncendidos] = useState<Record<NivelVivo, boolean>>({ 1: true, 2: true, 3: true });
  const [seleccion, setSeleccion] = useState<Partial<Record<TareaViva, string>>>({});
  const [confirmada, setConfirmada] = useState<PlanVivo | null>(null);
  const plan = useMemo(
    () => cotizarPlan(contexto, seleccion, NIVELES_VIVOS.filter((n) => encendidos[n.nivel]).flatMap((n) => n.tareas)),
    [contexto, seleccion, encendidos],
  );
  const generar = () => {
    if (plan.total === 0) return onConfirmar?.(plan);
    setConfirmada(plan);
  };
  return (
    <section data-testid="panel-contenido-vivo" className="mx-auto flex w-full max-w-2xl flex-col items-center gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
      <h3 className="text-base font-semibold">Contenido vivo</h3>
      <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3">
        {NIVELES_VIVOS.map((nivel) => (
          <div key={nivel.nivel} data-testid={`nivel-${nivel.nivel}`} className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-black/20 p-3 text-center">
            <span className="font-medium">{nivel.nombre}</span>
            <button type="button" data-testid={`interruptor-nivel-${nivel.nivel}`} aria-pressed={encendidos[nivel.nivel]} onClick={() => setEncendidos((e) => ({ ...e, [nivel.nivel]: !e[nivel.nivel] }))} className={`cursor-pointer rounded-full px-3 py-1 text-xs ${encendidos[nivel.nivel] ? "bg-emerald-500/20 text-emerald-200" : "bg-white/10 text-foreground/60"}`}>
              {encendidos[nivel.nivel] ? "Encendido" : "Apagado"}
            </button>
          </div>
        ))}
      </div>
      <div className="w-full space-y-3">
        {NIVELES_VIVOS.filter((n) => encendidos[n.nivel]).flatMap((nivel) =>
          nivel.tareas.map((tarea) => {
            const cotizada = plan.tareas.find((t) => t.tarea === tarea);
            if (!cotizada) return null;
            return (
              <div key={tarea} data-testid={`tabla-${tarea}`} className="rounded-xl border border-white/10 bg-black/20 p-3 text-left">
                <span className="font-medium">{tarea}</span>
                {cotizada.candidatos.map((c) => {
                  const elegida = c.ruta.id === cotizada.elegida?.ruta.id;
                  return (
                    <div key={c.ruta.id} data-testid={`ruta-${c.ruta.id}`} data-elegida={elegida ? "true" : "false"} className="flex flex-wrap items-center justify-between gap-2 border-t border-white/5 py-1">
                      <span>{c.ruta.nombre}</span>
                      <span className="text-xs">{c.ruta.tipo === "local" ? "Local" : "Externo"}</span>
                      <span className="text-xs">{c.ruta.creditosPorUnidad} créditos</span>
                      <span className="w-full text-xs text-foreground/70">{c.razon}</span>
                      <span className="flex items-center gap-2">
                        {elegida && <span className="text-xs text-emerald-200">Elegida</span>}
                        {!elegida && (
                          <button type="button" aria-label={`Elegir ${c.ruta.nombre}`} onClick={() => setSeleccion((s) => ({ ...s, [tarea]: c.ruta.id }))} className="cursor-pointer rounded-full bg-white/10 px-2 py-0.5 text-xs hover:bg-white/20">
                            Elegir
                          </button>
                        )}
                        {c.ruta.tipo === "externo" && !c.disponible && c.ruta.enlaceConectar && !servicioConectado(c.ruta, contexto) && (
                          <a href={c.ruta.enlaceConectar} target="_blank" rel="noopener noreferrer" className="cursor-pointer rounded-full bg-sky-500/20 px-2 py-0.5 text-xs text-sky-100 hover:bg-sky-500/30">
                            Conectar
                          </a>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          }),
        )}
      </div>
      <div data-testid="cotizacion" className="flex w-full flex-col items-center gap-2 border-t border-white/10 pt-3 text-center">
        <span data-testid="total-cotizado" className="text-base font-semibold">Total: {plan.total} créditos</span>
        <span className="text-xs text-foreground/60">Quedan {contexto.creditosDisponibles} créditos en este ámbito.</span>
        <button type="button" disabled={plan.total > contexto.creditosDisponibles} onClick={generar} className="cursor-pointer rounded-full bg-sky-500/80 px-4 py-1.5 font-medium hover:bg-sky-500/90 disabled:cursor-not-allowed disabled:opacity-50">
          Generar
        </button>
      </div>
      {confirmada && (
        <div data-testid="confirmacion-generar" role="alertdialog" className="w-full rounded-xl border border-amber-400/30 bg-amber-500/10 p-3 text-center">
          <span className="font-medium">¿Generar el contenido vivo?</span>
          <span data-testid="confirmacion-total" className="block text-sm">Total: {confirmada.total} créditos</span>
          <span className="mt-2 flex items-center justify-center gap-2">
            <button type="button" onClick={() => { onConfirmar?.(confirmada); setConfirmada(null); }} className="cursor-pointer rounded-full bg-emerald-500/80 px-3 py-1 hover:bg-emerald-500/90">
              Sí
            </button>
            <button type="button" onClick={() => setConfirmada(null)} className="cursor-pointer rounded-full bg-white/10 px-3 py-1 hover:bg-white/20">
              No
            </button>
          </span>
        </div>
      )}
    </section>
  );
}
