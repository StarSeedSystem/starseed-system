"use client";

/**
 * Un sistema que recibe versiones (el OS, un perfil, una página, un grupo…) con su política por
 * capa. Los cambios se guardan al momento en el almacén de políticas (viaja con la cuenta).
 */

import { useEffect, useState } from "react";
import { Layers3 } from "lucide-react";
import { toast } from "sonner";
import { guardarPoliticaSistema, leerPoliticaSistema, tienePoliticaPropia, EVENTO_POLITICAS } from "@/lib/actualizaciones/almacen-politicas";
import { NOMBRE_NIVEL, type CapaActualizacion, type NivelGenesis } from "@/lib/actualizaciones/manifiesto";
import { NOMBRE_TIPO, politicaPorDefecto, resumenPolitica, type PoliticaSistema, type TipoEntidad } from "@/lib/actualizaciones/politica";
import { SelectorPolitica } from "./selector-politica";

export interface BloqueSistemaProps {
  sistemaId: string;
  tipo: TipoEntidad;
  nombre: string;
  nivel: NivelGenesis;
  capas: readonly CapaActualizacion[];
  /** Quien no gestiona la entidad ve la política pero no la cambia. */
  soloLectura?: boolean;
  nota?: string;
}

const CHIP_NIVEL: Record<NivelGenesis, string> = {
  meta: "border-violet-400/30 bg-violet-500/10 text-violet-200",
  poli: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  genesis: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
};

export function BloqueSistema({ sistemaId, tipo, nombre, nivel, capas, soloLectura = false, nota }: BloqueSistemaProps) {
  const [politica, setPolitica] = useState<PoliticaSistema>(() => politicaPorDefecto(tipo));
  const [propia, setPropia] = useState(false);

  useEffect(() => {
    const leer = () => {
      setPolitica(leerPoliticaSistema(sistemaId, tipo));
      setPropia(tienePoliticaPropia(sistemaId));
    };
    leer();
    window.addEventListener(EVENTO_POLITICAS, leer);
    return () => window.removeEventListener(EVENTO_POLITICAS, leer);
  }, [sistemaId, tipo]);

  return (
    <section aria-label={`Actualizaciones de ${nombre}`} className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-3">
      <header className="flex flex-wrap items-center gap-2">
        <Layers3 className="h-4 w-4 text-sky-300" aria-hidden />
        <h4 className="text-[13px] font-semibold text-white/90">{nombre}</h4>
        <span className={`rounded-full border px-1.5 text-[9px] font-semibold uppercase tracking-wider ${CHIP_NIVEL[nivel]}`}>{NOMBRE_NIVEL[nivel]}</span>
        <span className="text-[10px] text-white/45">{NOMBRE_TIPO[tipo]} · {resumenPolitica(politica)}{propia ? "" : " · por defecto"}</span>
      </header>
      {nota && <p className="text-[10px] leading-snug text-white/50">{nota}</p>}
      <SelectorPolitica
        etiqueta={`Política de ${nombre}`}
        politica={politica}
        capas={capas}
        deshabilitado={soloLectura}
        onCambiar={(capa, p) => {
          const nueva = { ...politica, [capa]: p };
          setPolitica(nueva);
          if (guardarPoliticaSistema(sistemaId, tipo, nueva)) {
            setPropia(true);
            toast.success("Política guardada", { description: "Viaja con tu cuenta a tus otras neuronas." });
          } else toast.error("No se pudo guardar en este navegador (¿modo privado?).");
        }}
      />
    </section>
  );
}

export default BloqueSistema;
