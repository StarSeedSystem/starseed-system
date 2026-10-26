"use client";
/**
 * Ventana de la Protomolécula · vista previa del plan. Qué va a pasar (pasos), qué se queda fuera, quién lo
 * decide (aplicar · proponer · votar · denegar, según el gobierno de lo que tienes delante) y los botones para
 * confirmar o cancelar. Nada se aplica hasta que la persona confirma.
 */
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanPeticion, VeredictoGobierno } from "@/lib/protomolecula/peticion/contrato";
import { ICONO_GOBIERNO, ICONO_PASO, TONO_DECISION } from "./iconos";
import { describirPaso, textoVeredicto } from "./pasos";

export interface VistaPlanProps {
  plan: PlanPeticion;
  veredicto: VeredictoGobierno;
  texto?: string;
  /** Si lo pidió un agente (no la persona): su nombre. Se dice claro, y Cancelar lo descarta. */
  agente?: string;
  alConfirmar: () => void;
  alCancelar: () => void;
}

export function VistaPlan({ plan, veredicto, texto, agente, alConfirmar, alCancelar }: VistaPlanProps) {
  const v = textoVeredicto(veredicto);
  const tono = TONO_DECISION[v.tono];
  const IconoDecision = ICONO_GOBIERNO[v.tono];
  const denegado = veredicto.decision === "denegar";
  return (
    <section aria-label="Plan de Astraura" data-testid="vista-plan" className="rounded-2xl border border-white/10 bg-white/5 p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
      {agente ? (
        <p className="mb-1 text-[11px] text-[#00F0FF]" data-testid="plan-de-agente">
          Lo propone {agente} (bot de IA) · no se aplica nada hasta que lo confirmes{texto ? <span className="block truncate text-white/60" title={texto}>Pidió · {texto}</span> : null}
        </p>
      ) : texto ? <p className="mb-1 truncate text-[11px] text-white/60" title={texto}>Tu petición · {texto}</p> : null}
      <p className="font-headline text-sm font-semibold tracking-wide">{plan.resumen}</p>
      <p className="mt-0.5 text-[11px] text-white/60">Planificado por: {plan.motor}</p>

      <ol className="mt-2 flex flex-col gap-1.5" aria-label="Pasos">
        {plan.pasos.map((p, i) => {
          const d = describirPaso(p);
          const Icono = ICONO_PASO[d.icono];
          return (
            <li key={i} className="flex items-start gap-2 rounded-xl bg-black/20 px-2.5 py-2 text-xs">
              <Icono className="mt-0.5 h-4 w-4 shrink-0 text-[#00F0FF]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{d.titulo}</span>
                {d.detalle ? <span className="block break-words text-white/70">{d.detalle}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>

      {plan.fuera.length > 0 && (
        <div className="mt-2 rounded-xl border border-white/10 px-2.5 py-2 text-xs">
          <p className="font-medium text-white/80">Se queda fuera (no lo sé hacer todavía)</p>
          <ul className="mt-1 list-disc pl-4 text-white/70">
            {plan.fuera.map((f, i) => <li key={i} className="break-words">{f}</li>)}
          </ul>
        </div>
      )}

      <div className={cn("mt-2 flex items-start gap-2 rounded-xl border px-2.5 py-2 text-xs", tono.borde, tono.fondo)} data-testid="veredicto" data-decision={veredicto.decision}>
        <IconoDecision className={cn("mt-0.5 h-4 w-4 shrink-0", tono.texto)} aria-hidden="true" />
        <span>
          <strong className={cn("block font-semibold", tono.texto)}>{v.titulo}</strong>
          <span className="block text-white/75">{veredicto.motivo}</span>
          {veredicto.confirmar && veredicto.decision === "aplicar" ? <span className="block text-white/60">Lo ha planificado una IA: se confirma con tu clic.</span> : null}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={alConfirmar}
          disabled={denegado}
          className="inline-flex min-h-[44px] flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#10B981] px-4 text-sm font-semibold text-[#0A0F1D] transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {v.boton}
        </button>
        <button
          type="button"
          onClick={alCancelar}
          className="inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-full border border-white/15 px-4 text-sm font-medium transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80"
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Cancelar
        </button>
      </div>
    </section>
  );
}
