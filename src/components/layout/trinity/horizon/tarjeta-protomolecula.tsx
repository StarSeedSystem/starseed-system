"use client";

/**
 * Tarjeta «Protomolécula» de la cortina Horizon: el interruptor de la orbe 4D y todos sus ajustes en el lienzo
 * de creación (petición de Alex del 2026-10-20 y 2026-10-25). Vista previa viva, estilo con muestra, forma,
 * «Devolverla a su sitio» y «Abrir la Protomolécula». Todo lo hace la API de la orbe (`useOrbeProtomolecula`).
 */
import { useId, useState } from "react";
import { Atom, ChevronDown, Maximize2, RotateCcw, SlidersHorizontal, Sparkles } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ESTILOS, ESTILOS_VALIDOS, FICHAS, type Estilo } from "@/lib/protomolecula/orbe4d/coreografia";
import { FORMAS_ELEGIBLES } from "@/lib/protomolecula/orbe4d/eventos";
import { RUTA_PROTOMOLECULA } from "./datos";
import { useOrbeProtomolecula } from "./use-orbe-protomolecula";
import { VistaPreviaOrbe } from "./vista-previa-orbe";

const NOMBRE_ESTILO: Record<Estilo, string> = { sobria: "Sobria", expresiva: "Expresiva", experimental: "Experimental" };

export function TarjetaProtomolecula({ ir }: { ir: (href: string) => void }) {
  const orbe = useOrbeProtomolecula();
  const [ajustesAbiertos, setAjustesAbiertos] = useState(true);
  const idSwitch = useId();
  const idTitulo = useId();
  const ficha = orbe.forma ? FICHAS[orbe.forma] : null;

  return (
    <section
      aria-labelledby={idTitulo}
      data-testid="tarjeta-protomolecula"
      className="relative overflow-hidden rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/[0.14] via-black/30 to-teal-900/25 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_10px_30px_-12px_rgba(16,185,129,0.35)]"
    >
      <div className="flex items-center gap-3">
        <VistaPreviaOrbe estilo={orbe.estilo} activa={orbe.activada} className="h-16 w-16" />
        <div className="min-w-0 flex-1">
          <h3 id={idTitulo} className="font-headline text-lg font-semibold uppercase leading-tight tracking-widest text-emerald-50">
            Protomolécula
          </h3>
          <p className="mt-0.5 text-xs leading-snug text-emerald-100/65">
            {orbe.activada
              ? "Orbe de creación 4D junto a Astraura."
              : "Orbe apagada: enciéndela aquí o pídeselo a Astraura."}
          </p>
        </div>
        <label htmlFor={idSwitch} className="flex min-h-[44px] shrink-0 cursor-pointer flex-col items-center justify-center gap-0.5 px-1">
          <Switch
            id={idSwitch}
            checked={orbe.activada}
            onCheckedChange={orbe.alternar}
            aria-label="Orbe de la Protomolécula"
            className="data-[state=checked]:bg-emerald-500 data-[state=unchecked]:bg-white/20 focus-visible:ring-lime-300/70 focus-visible:ring-offset-black"
          />
          <span aria-hidden="true" className={cn("text-[10px] font-medium uppercase tracking-wider", orbe.activada ? "text-lime-300" : "text-emerald-100/50")}>
            {orbe.activada ? "Encendida" : "Apagada"}
          </span>
        </label>
      </div>

      <Collapsible open={ajustesAbiertos} onOpenChange={setAjustesAbiertos} className="mt-3">
        <CollapsibleTrigger className="flex min-h-[44px] w-full cursor-pointer items-center gap-2 rounded-xl border-t border-emerald-400/15 pt-1 text-left text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80 outline-none transition-colors duration-150 hover:text-emerald-200 focus-visible:ring-2 focus-visible:ring-lime-300/60">
          <SlidersHorizontal className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">Ajustes de la orbe</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none", ajustesAbiertos ? "rotate-0" : "-rotate-90")}
            aria-hidden="true"
          />
        </CollapsibleTrigger>

        <CollapsibleContent className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
          {!orbe.activada && (
            <p role="note" className="mb-3 rounded-xl bg-white/[0.04] px-3 py-2 text-[11px] leading-snug text-emerald-100/65">
              Lo que elijas se guarda y se aplica en cuanto la enciendas.
            </p>
          )}

          <fieldset className="min-w-0">
            <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-100/55">Estilo</legend>
            <div role="radiogroup" aria-label="Estilo de la orbe" className="grid grid-cols-3 gap-2">
              {ESTILOS_VALIDOS.map((e) => {
                const p = ESTILOS[e];
                const elegido = orbe.estilo === e;
                return (
                  <button
                    key={e}
                    type="button"
                    role="radio"
                    aria-checked={elegido}
                    onClick={() => orbe.elegirEstilo(e)}
                    title={`${p.secuencia.length} formas · ${p.particulas} puntos · cambia de forma cada ${p.permanenciaS} s`}
                    className={cn(
                      "flex min-h-[92px] min-w-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border px-1 py-2 text-center outline-none transition-[background-color,border-color,transform] duration-200 focus-visible:ring-2 focus-visible:ring-lime-300/70 motion-safe:active:scale-[0.97]",
                      elegido
                        ? "border-lime-300/70 bg-emerald-400/20 shadow-[0_0_18px_-4px_rgba(57,255,20,0.45)]"
                        : "border-white/10 bg-white/[0.03] hover:border-emerald-300/40 hover:bg-emerald-400/10",
                    )}
                  >
                    <VistaPreviaOrbe estilo={e} activa animada={false} className="h-10 w-10" />
                    <span className={cn("text-xs font-medium", elegido ? "text-white" : "text-emerald-50/85")}>{NOMBRE_ESTILO[e]}</span>
                    <span className="text-[10px] leading-tight text-emerald-100/55">
                      {p.secuencia.length} formas · {p.permanenciaS} s
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          <fieldset className="mt-4 min-w-0">
            <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-100/55">Forma</legend>
            <div className="flex flex-wrap gap-1.5">
              <ChipForma activa={orbe.forma === null} onClick={() => orbe.elegirForma(null)}>
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Automática
              </ChipForma>
              {FORMAS_ELEGIBLES.map((f) => (
                <ChipForma key={f} activa={orbe.forma === f} onClick={() => orbe.elegirForma(f)} titulo={`${FICHAS[f].numero} · ${FICHAS[f].sentido}`}>
                  {FICHAS[f].nombre}
                </ChipForma>
              ))}
            </div>
            <p className="mt-2 text-[11px] leading-snug text-emerald-100/60" aria-live="polite">
              {ficha ? (
                <>
                  <span className="text-cyan-300">{ficha.nombre}</span> · {ficha.sentido}
                </>
              ) : (
                "Automática: la orbe recorre sus formas sola, según lo que pasa."
              )}
            </p>
          </fieldset>

          <div className="mt-4 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2">
            <Pildora onClick={orbe.devolverASuSitio} icono={<RotateCcw className="h-4 w-4" aria-hidden="true" />}>
              Devolverla a su sitio
            </Pildora>
            <Pildora onClick={() => ir(RUTA_PROTOMOLECULA)} icono={<Atom className="h-4 w-4" aria-hidden="true" />} principal>
              Abrir la Protomolécula
            </Pildora>
          </div>

          <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-emerald-100/50">
            <Maximize2 className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            <span>Late con la voz de Astraura y se aviva cuando creas. También se apaga arrastrándola al borde izquierdo.</span>
          </p>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}

function ChipForma({ activa, onClick, titulo, children }: { activa: boolean; onClick: () => void; titulo?: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-pressed={activa}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-lime-300/70",
        activa ? "border-cyan-300/60 bg-cyan-300/15 text-white" : "border-white/10 text-emerald-50/75 hover:border-emerald-300/40 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Pildora({ onClick, icono, children, principal }: { onClick: () => void; icono: React.ReactNode; children: React.ReactNode; principal?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-full border px-4 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-lime-300/70",
        principal
          ? "border-emerald-300/50 bg-emerald-500/25 text-emerald-50 hover:bg-emerald-500/35"
          : "border-white/15 text-emerald-50/85 hover:bg-white/10",
      )}
    >
      {icono}
      {children}
    </button>
  );
}
