"use client";

/**
 * Pestaña «Mapa» de Señales — fase 1 (MAP1114B): mis neuronas y las de mi cuenta sobre un mapa
 * geográfico, con capas, filtro, ficha y el esquema de la malla como respaldo sin base o sin posición.
 * Solo se pinta lo medido, con su hora. Contrato: architecture/mapa-de-senales.md.
 */

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { LocateFixed } from "lucide-react";
import { CAPA_POR_DEFECTO, type CapaId } from "@/lib/senales/geo/capas";
import { coordenadasDeVista } from "@/lib/senales/geo/modelo-geo";
import { filtrarMarcas, type FiltroGeo, type MarcaGeo } from "@/lib/senales/geo/marcas";
import type { PreferenciaPosicion } from "@/lib/senales/geo/modelo-geo";
import { pedirUbicacion } from "@/lib/senales/geo/almacen-posicion";
import { useCompacto } from "../use-compacto";
import { BarraCapasFiltro } from "./capa-selector";
import { Leyenda } from "./leyenda";
import { FichaGeo } from "./ficha-geo";
import { EsquemaSinBase } from "./esquema-sin-base";
import { useMarcasGeo } from "./use-marcas-geo";

const MapaGeo = dynamic(() => import("./mapa-geo"), {
  ssr: false,
  loading: () => <div className="flex h-full items-center justify-center text-sm text-white/60">Cargando el mapa…</div>,
});

function useEnLinea(): boolean {
  const [en, setEn] = useState(true);
  useEffect(() => {
    const leer = () => setEn(typeof navigator === "undefined" ? true : navigator.onLine !== false);
    leer();
    window.addEventListener("online", leer);
    window.addEventListener("offline", leer);
    return () => { window.removeEventListener("online", leer); window.removeEventListener("offline", leer); };
  }, []);
  return en;
}

/** La pestaña con sus fuentes en vivo. */
export function PestanaMapa({ compacto }: { compacto?: boolean }) {
  const { marcas, pref, presenciaConectada } = useMarcasGeo();
  const enLinea = useEnLinea();
  return <VistaMapa marcas={marcas} pref={pref} presenciaConectada={presenciaConectada} enLinea={enLinea} compacto={compacto} />;
}

export interface VistaMapaProps {
  marcas: readonly MarcaGeo[];
  pref: PreferenciaPosicion;
  presenciaConectada: boolean;
  enLinea: boolean;
  compacto?: boolean;
  /** Solo para pruebas visuales sin red de teselas: no cae al esquema por teselas que no cargan. */
  ignorarFalloTeselas?: boolean;
}

/** La vista pura (sin hooks de datos): la misma que se prueba y se fotografía. */
export function VistaMapa({ marcas, pref, presenciaConectada, enLinea, compacto, ignorarFalloTeselas }: VistaMapaProps) {
  const estrecho = useCompacto(compacto);
  const [capa, setCapa] = useState<CapaId>(CAPA_POR_DEFECTO);
  const [filtro, setFiltro] = useState<FiltroGeo>("cuenta");
  const [sel, setSel] = useState<string | null>(null);
  const [sinTeselas, setSinTeselas] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => { if (enLinea) setSinTeselas(false); }, [enLinea]);

  const visibles = filtrarMarcas(marcas, filtro);
  const colocadas = visibles.filter((m) => coordenadasDeVista(m.posicion));
  const sinPosicion = visibles.filter((m) => !coordenadasDeVista(m.posicion));
  const marcaSel = visibles.find((m) => m.id === sel) ?? null;

  const esquema = !enLinea || sinTeselas || colocadas.length === 0;
  const motivoEsquema = !enLinea ? "No hay conexión a internet." : sinTeselas ? "No se pudieron cargar las teselas del mapa." : visibles.length ? "Ninguna neurona tiene posición conocida." : "";

  const ubicar = async () => {
    const r = await pedirUbicacion();
    setAviso(r.ok ? null : `No se pudo obtener tu ubicación: ${r.motivo}.`);
  };

  return (
    <section aria-label="Mapa de señales" data-testid="pestana-mapa" className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1"><BarraCapasFiltro capa={capa} onCapa={setCapa} filtro={filtro} onFiltro={setFiltro} /></div>
        <button type="button" onClick={ubicar} title="Centrar en mi ubicación" aria-label="Usar mi ubicación" className="shrink-0 cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-2 text-white/70 hover:text-white"><LocateFixed className="h-4 w-4" /></button>
      </div>
      {aviso && <p role="status" className="text-[11px] text-amber-300">{aviso}</p>}
      {!presenciaConectada && <p className="text-[11px] text-white/50">La presencia en vivo no está conectada: solo se muestra lo último que se sabe de cada aparato.</p>}

      <div className={`relative min-h-[360px] ${estrecho ? "h-[74vh]" : "h-[62vh]"} overflow-hidden rounded-2xl border border-white/10 bg-[#070d19]`} data-testid="lienzo-mapa">
        {esquema
          ? <EsquemaSinBase marcas={visibles} capa={capa} motivo={motivoEsquema} seleccion={sel} onElegir={setSel} />
          : <MapaGeo marcas={visibles} capa={capa} seleccion={sel} onElegir={setSel} onSinTeselas={() => { if (!ignorarFalloTeselas) setSinTeselas(true); }} />}
        {!(marcaSel && estrecho) && <Leyenda capa={capa} className="pointer-events-none absolute bottom-2 left-2 z-[500] rounded-xl border border-white/10 bg-[#0b1220]/85 px-2.5 py-2 backdrop-blur" />}
        {marcaSel && <FichaGeo marca={marcaSel} pref={pref} compacto={estrecho} onCerrar={() => setSel(null)} />}
      </div>

      {sinPosicion.length > 0 && !esquema && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-white/60" data-testid="sin-posicion">
          <span>Sin posición conocida:</span>
          {sinPosicion.map((m) => (
            <button key={m.id} type="button" onClick={() => setSel(m.id)} className="cursor-pointer rounded-lg border border-dashed border-white/25 px-2 py-0.5 text-white/75 hover:border-white/50">{m.nombre}</button>
          ))}
        </div>
      )}
    </section>
  );
}

export default PestanaMapa;
