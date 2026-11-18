"use client";

/**
 * Ficha de una señal del espectro (MAP1116B): toda su información y sus opciones de
 * compatibilidad, con el estilo de las fichas del mapa (`secciones-ficha.tsx`). Lo que falta
 * se enseña «sin dato», nunca 0. El botón de una opción posible SOLO llama a
 * `onAccion(opcion)`: esta ficha no conecta nada por sí misma.
 */

import { etiquetaFrecuencia } from "@/lib/senales/espectro/bandas";
import type { CapaRed, Compatibilidad, Medio, OrigenDato, SenalEspectro, TipoVinculo } from "@/lib/senales/espectro/tipos";
import type { EstadoDato } from "@/lib/senales/tipos-vivo";
import { cn } from "@/lib/utils";
import { PildoraDato } from "./secciones-ficha";

/** Texto único para todo valor que no se midió ni se declaró. */
export const SIN_DATO = "sin dato";

const ORIGEN_A_ESTADO: Record<OrigenDato, EstadoDato> = { medida: "medido", declarada: "declarado", estimada: "estimado" };

const ETIQUETA_MEDIO: Record<Medio, string> = {
  wifi: "Wi-Fi", bluetooth: "Bluetooth", lora: "LoRa", celular: "Celular",
  malla: "Malla", internet: "Internet", estacion: "Estación", sdr: "SDR",
};

const ETIQUETA_OBJETIVO: Record<Compatibilidad["con"], string> = { ...ETIQUETA_MEDIO, neurona: "Neurona" };

const ETIQUETA_CAPA: Record<CapaRed, string> = { propia: "propia", publica: "pública", comunidad: "comunidad", privada: "privada", externa: "externa" };

const ETIQUETA_VINCULO: Record<TipoVinculo, string> = {
  antena: "antena", cerebro: "cerebro", nodo: "nodo", neurona: "neurona",
  servidor: "servidor", estacion: "estación", router: "router",
};

function horaLegible(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Frecuencia o ancho en unidades legibles; «sin dato» si no se midió. */
function textoKhz(khz: number | null): string {
  return khz !== null && Number.isFinite(khz) && khz > 0 ? etiquetaFrecuencia(khz) : SIN_DATO;
}

function textoFuerza(dbm: number | null): string {
  return dbm !== null && Number.isFinite(dbm) ? `${dbm} dBm` : SIN_DATO;
}

function textoCalidad(cal: number | null): string {
  return cal !== null && Number.isFinite(cal) ? `${Math.round(cal)} %` : SIN_DATO;
}

function textoOrigen(origen: OrigenDato, medidoEn: number | null): string {
  if (origen !== "medida") return origen; // «declarada» / «estimada», tal cual
  return medidoEn === null ? "medida · sin dato de hora" : `medida a las ${horaLegible(medidoEn)}`;
}

function Fila({ etiqueta, valor, hueco = false }: { etiqueta: string; valor: string; hueco?: boolean }) {
  return (
    <div className="border-t border-white/[0.06] py-1.5 first:border-t-0" data-fila={etiqueta}>
      <div className="flex items-center justify-between gap-2">
        <span className="shrink-0 text-[10px] text-white/50">{etiqueta}</span>
        <span className={cn("break-words text-right text-[10px] tabular-nums", hueco ? "text-white/40" : "font-medium text-white/85")}>{valor}</span>
      </div>
    </div>
  );
}

function OpcionCompatible({ opcion, onAccion }: { opcion: Compatibilidad; onAccion: (o: Compatibilidad) => void }) {
  return (
    <li className="rounded-xl border border-white/8 bg-white/[0.02] px-2.5 py-1.5" data-opcion={opcion.con}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-white/80">{ETIQUETA_OBJETIVO[opcion.con]}</span>
        <span className={cn("shrink-0 rounded-full border px-1.5 py-px text-[8px] font-black uppercase tracking-wider", opcion.posible ? "border-emerald-400/35 bg-emerald-500/10 text-emerald-200" : "border-white/15 bg-white/[0.04] text-white/50")}>
          {opcion.posible ? "posible" : "no posible"}
        </span>
      </div>
      <p className="mt-0.5 text-[9px] leading-snug text-white/50">{opcion.motivo}</p>
      {opcion.posible ? (
        <button
          type="button"
          onClick={() => onAccion(opcion)}
          className="mt-1 inline-flex cursor-pointer items-center rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-white/70 transition-colors duration-200 hover:border-white/25 hover:text-white/90"
        >
          {opcion.que}
        </button>
      ) : null}
    </li>
  );
}

export function FichaSenalEspectro({ senal, onAccion }: { senal: SenalEspectro; onAccion: (opcion: Compatibilidad) => void }) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/45 p-3" data-testid="ficha-senal-espectro">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-white/95">{ETIQUETA_MEDIO[senal.medio]}</p>
          <p className="mt-0.5 text-[10px] text-white/50">{senal.banda}</p>
        </div>
        <PildoraDato estado={ORIGEN_A_ESTADO[senal.origen]} />
      </div>
      <div className="mt-2">
        <Fila etiqueta="Origen" valor={textoOrigen(senal.origen, senal.medidoEn)} />
        <Fila etiqueta="Frecuencia" valor={textoKhz(senal.frecuenciaKhz)} hueco={senal.frecuenciaKhz === null} />
        <Fila etiqueta="Ancho" valor={textoKhz(senal.anchoKhz)} hueco={senal.anchoKhz === null} />
        <Fila etiqueta="Fuerza" valor={textoFuerza(senal.fuerzaDbm)} hueco={senal.fuerzaDbm === null} />
        <Fila etiqueta="Calidad" valor={textoCalidad(senal.calidad)} hueco={senal.calidad === null} />
        <Fila etiqueta="Capa" valor={ETIQUETA_CAPA[senal.capa]} />
        <Fila etiqueta="Zona aproximada" valor={senal.zona ?? SIN_DATO} hueco={senal.zona === null} />
        <Fila etiqueta="Quién la ve" valor={senal.fuente} />
        <Fila etiqueta="Vínculo" valor={senal.vinculo ? `${ETIQUETA_VINCULO[senal.vinculo.tipo]} ${senal.vinculo.id}` : SIN_DATO} hueco={!senal.vinculo} />
      </div>
      <p className="mt-2 text-[11px] font-semibold text-white/80">Compatibilidad</p>
      <ul className="mt-1 space-y-1">
        {senal.compatibles.map((c) => <OpcionCompatible key={c.con} opcion={c} onAccion={onAccion} />)}
      </ul>
    </div>
  );
}
