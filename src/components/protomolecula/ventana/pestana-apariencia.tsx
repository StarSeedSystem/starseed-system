"use client";
/**
 * Ventana de la Protomolécula · «Apariencia» (oculta tras el menú «⋯»): la geometría de la orbe (su secuencia
 * automática o una forma fija), su estilo (sobria · expresiva · experimental) y apagarla. Es lo que antes era
 * lo principal de la ventana; ahora es un ajuste.
 */
import { Power, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { FICHAS, type Estilo, type IdForma } from "@/lib/protomolecula/orbe4d/coreografia";
import { FORMAS_ELEGIBLES } from "@/lib/protomolecula/orbe4d/eventos";

const ESTILOS: { id: Estilo; nombre: string }[] = [
  { id: "sobria", nombre: "Sobria" },
  { id: "expresiva", nombre: "Expresiva" },
  { id: "experimental", nombre: "Experimental" },
];

export interface PestanaAparienciaProps {
  fijada: IdForma | null;
  estilo: Estilo;
  alElegirForma: (f: IdForma | null) => void;
  alElegirEstilo: (e: Estilo) => void;
  alApagar: () => void;
}

export function PestanaApariencia({ fijada, estilo, alElegirForma, alElegirEstilo, alApagar }: PestanaAparienciaProps) {
  return (
    <div className="flex flex-col gap-3" data-testid="pestana-apariencia">
      <fieldset>
        <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">Geometría</legend>
        <div className="flex flex-wrap gap-1.5">
          <Chip activa={fijada === null} onClick={() => alElegirForma(null)} titulo="La orbe recorre sus formas sola, según lo que pasa">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Automática
          </Chip>
          {FORMAS_ELEGIBLES.map((f) => (
            <Chip key={f} activa={fijada === f} onClick={() => alElegirForma(f)} titulo={`${FICHAS[f].numero} · ${FICHAS[f].sentido}`}>
              {FICHAS[f].nombre}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">Estilo</legend>
        <div className="grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-white/5 p-1" role="radiogroup" aria-label="Estilo de la orbe">
          {ESTILOS.map((e) => (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={estilo === e.id}
              onClick={() => alElegirEstilo(e.id)}
              className={cn(
                "min-h-[44px] cursor-pointer rounded-full px-2 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80",
                estilo === e.id ? "bg-[#10B981] text-[#0A0F1D]" : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              {e.nombre}
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <button
          type="button"
          onClick={alApagar}
          className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border border-[#DC143C]/40 px-4 text-sm font-medium text-white transition-colors duration-150 hover:bg-[#DC143C]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80"
        >
          <Power className="h-4 w-4" aria-hidden="true" />
          Apagar orbe
        </button>
        <p className="mt-2 text-[11px] leading-snug text-white/50">
          También se apaga arrastrándola a su zona del borde izquierdo, y se enciende desde el lienzo de creación o pidiéndoselo a Astraura.
        </p>
      </div>
    </div>
  );
}

function Chip({ activa, onClick, titulo, children }: { activa: boolean; onClick: () => void; titulo: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={titulo}
      aria-pressed={activa}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-[44px] cursor-pointer items-center gap-1 rounded-full border px-3 text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00F0FF]/80",
        activa ? "border-[#00F0FF]/60 bg-[#00F0FF]/15 text-white" : "border-white/10 text-white/70 hover:border-white/25 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

export default PestanaApariencia;
