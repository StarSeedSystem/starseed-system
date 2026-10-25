"use client";
/**
 * Panel de la orbe 4D de la Protomolécula: qué forma toma (o su secuencia automática), con qué estilo
 * (sobria · expresiva · experimental), abrir el lienzo o el panel completo y apagarla. Cristal líquido de la
 * marca, acciones en píldora, dianas de 44 px y todo con teclado.
 */
import dynamic from "next/dynamic";
import { useState } from "react";
import { Atom, ExternalLink, Power, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FICHAS, type Estilo, type IdForma } from "@/lib/protomolecula/orbe4d/coreografia";
import { FORMAS_ELEGIBLES } from "@/lib/protomolecula/orbe4d/eventos";

const PanelCompleto = dynamic(
  () => import("@/components/protomolecula/panel-protomolecula").then((m) => m.PanelProtomoleculaAutonomo),
  { ssr: false, loading: () => <p className="px-1 py-3 text-xs text-white/60">Abriendo la Protomolécula…</p> },
);

const ESTILOS: { id: Estilo; nombre: string }[] = [
  { id: "sobria", nombre: "Sobria" },
  { id: "expresiva", nombre: "Expresiva" },
  { id: "experimental", nombre: "Experimental" },
];

export interface PanelOrbeProps {
  forma: IdForma;
  fijada: IdForma | null;
  estilo: Estilo;
  moleculaId?: string;
  completoInicial?: boolean;
  alElegirForma: (f: IdForma | null) => void;
  alElegirEstilo: (e: Estilo) => void;
  alAbrirLienzo: () => void;
  alApagar: () => void;
  alCerrar: () => void;
  /** Dónde se abre respecto a la orbe. */
  lado: { horizontal: "izquierda" | "derecha"; vertical: "arriba" | "abajo" };
}

export function PanelOrbe(p: PanelOrbeProps) {
  const [completo, setCompleto] = useState(Boolean(p.completoInicial));
  const ficha = FICHAS[p.forma];
  return (
    <div
      role="dialog"
      aria-label="Protomolécula"
      className={cn(
        "absolute z-[1001] w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-white/10 p-4 text-white",
        "bg-[#0A0F1D]/75 backdrop-blur-[16px] shadow-lg shadow-black/40 [box-shadow:inset_0_1px_0_rgba(255,255,255,0.15)]",
        "animate-in fade-in-0 zoom-in-95 duration-200",
        p.lado.horizontal === "izquierda" ? "right-full mr-3" : "left-full ml-3",
        p.lado.vertical === "arriba" ? "bottom-0" : "top-0",
        // <640 px: junto a la orbe no cabe (a 360 px se salía 61 px por la derecha). Hoja inferior fija,
        // dentro de la pantalla, con su propio desplazamiento.
        "max-sm:fixed max-sm:inset-x-3 max-sm:top-auto max-sm:bottom-[max(0.75rem,env(safe-area-inset-bottom))]",
        "max-sm:m-0 max-sm:w-auto max-sm:max-h-[72dvh] max-sm:overflow-y-auto",
      )}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-start gap-3">
        <Atom className="mt-0.5 h-5 w-5 shrink-0 text-[#10B981]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-headline text-base font-semibold leading-tight tracking-wide">Protomolécula</p>
          <p className="mt-1 text-xs leading-snug text-white/70">
            <span className="text-[#00F0FF]">{ficha.nombre}</span> · {ficha.sentido}
          </p>
        </div>
        <button
          type="button"
          onClick={p.alCerrar}
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-full text-white/70 transition-colors duration-150 hover:bg-white/10 hover:text-white"
          aria-label="Cerrar el panel de la Protomolécula"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <fieldset className="mt-3">
        <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">Geometría</legend>
        <div className="flex flex-wrap gap-1.5">
          <Chip activa={p.fijada === null} onClick={() => p.alElegirForma(null)} titulo="La orbe recorre sus formas sola, según lo que pasa">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Automática
          </Chip>
          {FORMAS_ELEGIBLES.map((f) => (
            <Chip key={f} activa={p.fijada === f} onClick={() => p.alElegirForma(f)} titulo={`${FICHAS[f].numero} · ${FICHAS[f].sentido}`}>
              {FICHAS[f].nombre}
            </Chip>
          ))}
        </div>
      </fieldset>

      <fieldset className="mt-3">
        <legend className="mb-2 text-[11px] font-medium uppercase tracking-[0.14em] text-white/50">Estilo</legend>
        <div className="grid grid-cols-3 gap-1 rounded-full border border-white/10 bg-white/5 p-1" role="radiogroup" aria-label="Estilo de la orbe">
          {ESTILOS.map((e) => (
            <button
              key={e.id}
              type="button"
              role="radio"
              aria-checked={p.estilo === e.id}
              onClick={() => p.alElegirEstilo(e.id)}
              className={cn(
                "min-h-[36px] cursor-pointer rounded-full px-2 text-xs font-medium transition-colors duration-150",
                p.estilo === e.id ? "bg-[#10B981] text-[#0A0F1D]" : "text-white/70 hover:bg-white/10 hover:text-white",
              )}
            >
              {e.nombre}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap gap-2">
        <Accion onClick={p.alAbrirLienzo} icono={<ExternalLink className="h-4 w-4" aria-hidden="true" />}>Abrir lienzo</Accion>
        <Accion onClick={() => setCompleto((x) => !x)} icono={<Atom className="h-4 w-4" aria-hidden="true" />} pulsado={completo}>
          {completo ? "Ocultar controles" : "Controles"}
        </Accion>
        <Accion onClick={p.alApagar} icono={<Power className="h-4 w-4" aria-hidden="true" />} peligro>
          Apagar orbe
        </Accion>
      </div>
      <p className="mt-2 text-[11px] leading-snug text-white/50">
        También se apaga arrastrándola a su zona del borde izquierdo, y se enciende desde el lienzo de creación o pidiéndoselo a Astraura.
      </p>

      {completo && (
        <div className="mt-3 max-h-[50vh] overflow-auto rounded-2xl border border-white/10 bg-black/20 p-2">
          <PanelCompleto compacto moleculaId={p.moleculaId} />
        </div>
      )}
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
        "inline-flex min-h-[36px] cursor-pointer items-center gap-1 rounded-full border px-3 text-xs transition-colors duration-150",
        activa ? "border-[#00F0FF]/60 bg-[#00F0FF]/15 text-white" : "border-white/10 text-white/70 hover:border-white/25 hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

function Accion({ onClick, icono, children, pulsado, peligro }: { onClick: () => void; icono: React.ReactNode; children: React.ReactNode; pulsado?: boolean; peligro?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pulsado}
      className={cn(
        "inline-flex min-h-[44px] cursor-pointer items-center gap-2 rounded-full border px-4 text-sm font-medium transition-colors duration-150",
        peligro ? "border-[#DC143C]/40 text-white hover:bg-[#DC143C]/20" : "border-white/15 text-white hover:bg-white/10",
        pulsado && "bg-white/10",
      )}
    >
      {icono}
      {children}
    </button>
  );
}
