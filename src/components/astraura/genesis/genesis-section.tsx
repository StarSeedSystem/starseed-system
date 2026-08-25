"use client";

/**
 * genesis-section.tsx — compositor de la sección "Génesis de Seres".
 * ----------------------------------------------------------------------------
 * El punto de entrada único: junta la lista de seres, la ficha de cada uno,
 * el ritual de creación y la bandeja de propuestas en una sola pieza
 * autocontenida (Génesis es su propia sección — ver el comentario de
 * `genesis-shared.tsx` — así que trae su propia cabecera, no depende de que
 * algún host externo se la ponga).
 *
 * Dos raíces navegables por pestaña — "Seres" y "Propuestas" — más dos
 * vistas de detalle a las que solo se llega por acción (abrir un ser, pedir
 * "nuevo ser" o "engendrar") y que se salen por su propio botón de volver:
 * `raiz` recuerda a cuál de las dos pestañas persistentes regresar, `view`
 * es lo que de verdad está en pantalla ahora mismo. Así una ficha abierta
 * desde una propuesta vuelve a "Propuestas", y una abierta desde la lista
 * vuelve a "Seres" — sin necesitar dos componentes de ficha distintos.
 */
import { useState } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Ser } from "@/lib/astraura/genesis-types";
import type { GenesisTarget } from "@/lib/astraura/genesis-client";
import { CARD, PILL, PILL_ON, PILL_OFF } from "../s158/shared";
import { GENESIS_VIEW_LABEL, GenesisTargetSwitcher, type GenesisView } from "./genesis-shared";
import { SeresLista } from "./seres-lista";
import { SerFicha } from "./ser-ficha";
import { RitualCreacion } from "./ritual-creacion";
import { PropuestasBandeja } from "./propuestas-bandeja";

/** Las dos vistas persistentes; "ficha" y "ritual" son sub-estados de cualquiera de las dos. */
type Raiz = Extract<GenesisView, "lista" | "propuestas">;

export interface GenesisSectionProps {
  className?: string;
}

export function GenesisSection({ className }: GenesisSectionProps) {
  const [target, setTarget] = useState<GenesisTarget>("local");
  const [raiz, setRaiz] = useState<Raiz>("lista");
  const [view, setView] = useState<GenesisView>("lista");
  const [serId, setSerId] = useState<string | null>(null);
  const [progenitor, setProgenitor] = useState<{ id: string; nombre: string } | null>(null);
  // Sube cada vez que la ficha cambia algo visible desde la lista (nombre,
  // estado, generación…): remontar <SeresLista> con una key nueva la recarga
  // al instante, en vez de esperar a su próximo sondeo (hasta 20s).
  const [listaEpoch, setListaEpoch] = useState(0);

  function irARaiz(siguiente: Raiz) {
    setRaiz(siguiente);
    setView(siguiente);
    setSerId(null);
    setProgenitor(null);
  }

  function volverARaiz() {
    setView(raiz);
    setSerId(null);
    setProgenitor(null);
  }

  function abrirSer(id: string) {
    setSerId(id);
    setView("ficha");
  }

  function irARitual(prog: { id: string; nombre: string } | null) {
    setProgenitor(prog);
    setView("ritual");
  }

  // Los ids de ser y de propuesta son propios de cada destino: arrastrar una
  // ficha de "esta neurona" a "nube" (o al revés) enseñaría el ser
  // equivocado, o un "no encontrado" que nadie pidió. Más honesto: al
  // cambiar de destino, volver siempre a la raíz.
  function cambiarTarget(siguiente: GenesisTarget) {
    if (siguiente === target) return;
    setTarget(siguiente);
    irARaiz("lista");
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className={cn(CARD, "relative overflow-hidden p-4")}>
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-fuchsia-500/10 blur-3xl" aria-hidden="true" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-headline text-lg font-semibold text-white">
              <Sparkles className="h-5 w-5 text-fuchsia-300" aria-hidden="true" /> Génesis de Seres
            </h2>
            <p className="mt-1 max-w-2xl text-[12px] leading-snug text-white/65">
              Donde invocas, configuras y contemplas a tus seres: su cuerpo, su soberanía explicada antes que
              editable, con qué modelos piensan de verdad, y el trabajo que proponen fuera de su dominio.
            </p>
          </div>
          <GenesisTargetSwitcher target={target} onChange={cambiarTarget} />
        </div>

        <div className="mt-3 flex items-center gap-1" role="tablist" aria-label="Secciones de Génesis de Seres">
          <button type="button" role="tab" aria-selected={raiz === "lista"} className={cn(PILL, raiz === "lista" ? PILL_ON : PILL_OFF)} onClick={() => irARaiz("lista")}>
            {GENESIS_VIEW_LABEL.lista}
          </button>
          <button type="button" role="tab" aria-selected={raiz === "propuestas"} className={cn(PILL, raiz === "propuestas" ? PILL_ON : PILL_OFF)} onClick={() => irARaiz("propuestas")}>
            {GENESIS_VIEW_LABEL.propuestas}
          </button>
        </div>
      </div>

      {view === "lista" && <SeresLista key={listaEpoch} target={target} onAbrir={abrirSer} onCrear={() => irARitual(null)} />}

      {view === "ficha" && serId && (
        <SerFicha
          target={target}
          serId={serId}
          onVolver={volverARaiz}
          onBorrado={() => irARaiz("lista")}
          onEngendrar={(id, nombre) => irARitual({ id, nombre })}
          onCambiado={() => setListaEpoch((e) => e + 1)}
        />
      )}

      {view === "ritual" && (
        <RitualCreacion
          target={target}
          progenitor={progenitor}
          onCreado={(ser: Ser) => {
            setListaEpoch((e) => e + 1); // la lista tendrá un ser más en cuanto se vuelva a ella
            setSerId(ser.id);
            setView("ficha"); // directo a su ficha: el ritual es deliberadamente ligero, el resto se afina justo aquí
          }}
          onCancelar={volverARaiz}
        />
      )}

      {view === "propuestas" && <PropuestasBandeja target={target} onAbrirSer={abrirSer} />}
    </div>
  );
}

export default GenesisSection;
