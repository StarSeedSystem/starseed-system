"use client";
/**
 * Ventana de la Protomolécula · propuesta sin salir del contexto. Cuando el gobierno dice «proponer» o «votar»,
 * el borrador que trae el veredicto (`proposalForChange`) siembra el compositor de propuestas del OS, aquí
 * mismo, dentro de la ventana. El compositor se carga a demanda: pesa y casi nunca se abre.
 *
 * Honestidad: la propuesta lleva tu petición como texto. Al aprobarse, el comando que lleva el borrador es lo
 * que se ejecuta; el plan de Astraura NO se aplica solo: lo aplica quien lo apruebe.
 */
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import type { PlanPeticion, VeredictoGobierno } from "@/lib/protomolecula/peticion/contrato";
import { describirPaso } from "./pasos";

const Compositor = dynamic(() => import("@/components/governance/proposal-composer"), {
  ssr: false,
  loading: () => <p role="status" className="px-1 py-3 text-xs text-white/60">Abriendo el compositor de propuestas…</p>,
});

/** Ámbito del compositor: lo dice el borrador; si no, se deduce del tipo de entidad que gobierna. */
const ESCOPE: Record<string, string> = { grupo: "group", comunidad: "community", pagina: "page" };

export interface VistaPropuestaProps {
  plan: PlanPeticion;
  veredicto: VeredictoGobierno;
  /** Entidad que gobierna (para deducir el ámbito si el borrador no lo trae). */
  gobierna?: { tipo: string; id: string };
  alVolver: () => void;
  alCrear: () => void;
}

export function VistaPropuesta({ plan, veredicto, gobierna, alVolver, alCrear }: VistaPropuestaProps) {
  const borrador = veredicto.propuesta;
  const inicial = useMemo(() => {
    if (!borrador) return null;
    const pasos = plan.pasos.map((p) => { const d = describirPaso(p); return `· ${d.titulo}${d.detalle ? `: ${d.detalle}` : ""}`; }).join("\n");
    return {
      title: borrador.title,
      description: `${borrador.description}\n\nLo que se pidió a Astraura (${plan.motor}):\n${plan.resumen}\n${pasos}`,
      command: { type: borrador.command.type, payload: { ...borrador.command.payload, ...borrador.payload } },
    };
  }, [borrador, plan]);
  const scope = borrador?.payload.scope || (gobierna ? ESCOPE[gobierna.tipo] : undefined) || "global";
  const scopeRef = borrador?.payload.scope_ref || gobierna?.id;

  return (
    <section aria-label="Proponer el cambio" data-testid="vista-propuesta" className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <button
        type="button"
        onClick={alVolver}
        className="mb-2 inline-flex min-h-[44px] cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-medium text-white/80 transition-colors duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Volver al plan
      </button>
      {inicial ? (
        <>
          <p className="mb-2 text-[11px] leading-snug text-white/70">
            Tu petición viaja como texto de la propuesta. Al aprobarse se ejecuta el comando de la propuesta; el plan de Astraura no se aplica solo: lo aplica quien lo apruebe.
          </p>
          <div className="max-h-[50dvh] overflow-y-auto rounded-xl bg-black/20 p-2">
            <Compositor scope={scope} scopeRef={scopeRef} initial={inicial} onCreated={alCrear} />
          </div>
        </>
      ) : (
        <p role="status" className="text-xs text-white/75">
          El gobierno decidió que esto se propone, pero no trajo un borrador de propuesta. No he creado nada; abre las reglas de la entidad en la pestaña Gobierno.
        </p>
      )}
    </section>
  );
}
