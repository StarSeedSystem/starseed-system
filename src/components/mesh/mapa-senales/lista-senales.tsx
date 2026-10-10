"use client";

/**
 * Lista del mapa: la MISMA selección que el 3D, en texto. Es también la vía accesible (teclado y
 * lectores de pantalla) a todo lo que el lienzo pinta. Primero «Tú» (con los demás medios abiertos
 * en este aparato) y luego las señales de mejor a peor calidad; los medios abiertos de cada aparato
 * cuelgan debajo de él. Los aparatos dicen su estado y su enlace real, no una distancia inventada.
 */

import { useState } from "react";
import { ChevronDown, CornerDownRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";
import { COLOR_ESTADO, TEXTO_ESTADO } from "@/lib/senales/aparatos";
import { ESTILO_ENLACE, valorEnlace } from "@/lib/senales/enlaces";
import {
  ETIQUETA_MODO_POSICION, colorCalidad, esAparato, textoCalidad, textoDistancia,
} from "@/lib/senales/mapa-3d";
import type { CentroNeurona } from "@/lib/senales/centro";
import { iconoDeSenal, NOMBRE_ICONO } from "@/lib/senales/iconos";
import type { MedioMapa, VivoMapa } from "@/lib/senales/tipos-vivo";
import { avatarDeSenal, cuentaDe } from "@/lib/senales/cuentas";
import { FotoPerfil } from "./foto-perfil";
import { GlifoIcono } from "./icono-2d";

const FILAS_INICIALES = 8;

const CLASE_MODO: Record<DetectedSignal["placement"]["mode"], string> = {
  gps: "border-emerald-400/35 bg-emerald-500/10 text-emerald-200",
  rf: "border-sky-400/35 bg-sky-500/10 text-sky-200",
  sector: "border-amber-400/35 bg-amber-500/10 text-amber-200",
};

function FilaMedio({ m, seleccionId, onSeleccionar, onApuntar }: {
  m: MedioMapa; seleccionId: string | null; onSeleccionar: (id: string) => void; onApuntar: (id: string | null) => void;
}) {
  const sel = m.id === seleccionId;
  return (
    <li className="ml-4">
      <button
        type="button"
        aria-pressed={sel}
        onClick={() => onSeleccionar(m.id)}
        onMouseEnter={() => onApuntar(m.id)}
        onMouseLeave={() => onApuntar(null)}
        onFocus={() => onApuntar(m.id)}
        onBlur={() => onApuntar(null)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-[10px] transition-colors duration-200",
          sel ? "border-sky-400/45 bg-sky-500/[0.12]" : "border-white/5 bg-white/[0.015] hover:border-white/20",
        )}
      >
        <CornerDownRight className="h-3 w-3 shrink-0 text-white/30" aria-hidden />
        <span className="size-1.5 shrink-0 rounded-full" style={{ background: m.visible ? COLOR_ESTADO.activa : COLOR_ESTADO["segundo-plano"] }} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-white/75">{m.etiqueta}</span>
        <span className="shrink-0 text-[9px] text-white/40">{m.visible ? "a la vista" : "segundo plano"}</span>
      </button>
    </li>
  );
}

export interface ListaSenalesProps {
  senales: readonly DetectedSignal[];
  vivo?: VivoMapa | null;
  /** Etiqueta del medio actual de «Tú» (p. ej. «Chrome 154 · localhost:9002»). */
  etiquetaYo?: string | null;
  /** ESTA neurona (nombre y foto): la fila de «Tú» la enseña. */
  centro?: CentroNeurona | null;
  /** Foto del perfil activo (ya validada): la llevan las filas de tus propios aparatos. */
  avatarPropio?: string | null;
  seleccionId: string | null;
  apuntadaId: string | null;
  onSeleccionar: (id: string) => void;
  onApuntar: (id: string | null) => void;
  className?: string;
  /** Hay filtros activos (si no, una lista vacía significa que no se oye nada). */
  hayFiltros?: boolean;
}

export function ListaSenales({ senales, vivo = null, etiquetaYo = null, centro = null, avatarPropio = null, seleccionId, apuntadaId, onSeleccionar, onApuntar, className, hayFiltros = true }: ListaSenalesProps) {
  const [todas, setTodas] = useState(false);
  // La seleccionada siempre es visible aunque caiga fuera de las primeras filas.
  const idxSel = senales.findIndex((s) => s.id === seleccionId || vivo?.medios.some((m) => m.id === seleccionId && m.padreId === s.id));
  const mostrarTodas = todas || idxSel >= FILAS_INICIALES;
  const visibles = mostrarTodas ? senales : senales.slice(0, FILAS_INICIALES);
  const mediosYo = vivo?.medios.filter((m) => m.padreId === "yo") ?? [];

  const filaYo = (
    <li>
      <button
        type="button"
        aria-pressed={seleccionId === "yo"}
        onClick={() => onSeleccionar("yo")}
        onMouseEnter={() => onApuntar("yo")}
        onMouseLeave={() => onApuntar(null)}
        onFocus={() => onApuntar("yo")}
        onBlur={() => onApuntar(null)}
        className={cn(
          "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors duration-200",
          seleccionId === "yo" ? "border-sky-400/45 bg-sky-500/[0.12]" : apuntadaId === "yo" ? "border-white/25 bg-white/[0.06]" : "border-sky-400/15 bg-sky-500/[0.04] hover:border-sky-400/40",
        )}
      >
        {centro ? (
          <FotoPerfil url={centro.avatar.modo === "foto" ? centro.avatar.url : null} iniciales={centro.iniciales} size={22} />
        ) : (
          <span className="size-3 shrink-0 rounded-full bg-sky-400 shadow-[0_0_6px_#38bdf8]" aria-hidden />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11px] font-semibold text-white/90">{centro ? `${centro.nombreNeurona} · tú` : "Tú · esta neurona"}</span>
          <span className="block truncate text-[9px] text-white/45">{etiquetaYo ?? "este aparato"} · el centro del mapa</span>
        </span>
      </button>
      {mediosYo.length > 0 && (
        <ul className="mt-1 space-y-1" aria-label="Otros medios abiertos en este aparato">
          {mediosYo.map((m) => <FilaMedio key={m.id} m={m} seleccionId={seleccionId} onSeleccionar={onSeleccionar} onApuntar={onApuntar} />)}
        </ul>
      )}
    </li>
  );

  if (senales.length === 0) {
    return (
      <div className={className}>
        <ul className="mb-1.5 space-y-1" aria-label="Tú">{filaYo}</ul>
        <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-[11px] leading-snug text-white/45">
          {hayFiltros
            ? "Ninguna señal con estos filtros. Quita algún filtro o pulsa «Sondear» para volver a escuchar todas las fuentes."
            : "Todavía no se oye ninguna señal. Pulsa «Sondear» para escuchar todas las fuentes o «Escanear BLE» para buscar dispositivos cercanos."}
        </p>
      </div>
    );
  }

  return (
    <div className={className}>
      <ul className="space-y-1" aria-label="Señales detectadas">
        {filaYo}
        {visibles.map((s) => {
          const sel = s.id === seleccionId;
          const q = s.quality;
          const aparato = esAparato(s);
          const estado = vivo?.estados.get(s.id) ?? null;
          const enlace = aparato ? vivo?.enlaces.get(s.id) ?? null : null;
          const medios = vivo?.medios.filter((m) => m.padreId === s.id) ?? [];
          const cuenta = cuentaDe(s);
          return (
            <li key={s.id}>
              <button
                type="button"
                aria-pressed={sel}
                onClick={() => onSeleccionar(s.id)}
                onMouseEnter={() => onApuntar(s.id)}
                onMouseLeave={() => onApuntar(null)}
                onFocus={() => onApuntar(s.id)}
                onBlur={() => onApuntar(null)}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-colors duration-200",
                  sel
                    ? "border-sky-400/45 bg-sky-500/[0.12]"
                    : s.id === apuntadaId
                      ? "border-white/25 bg-white/[0.06]"
                      : "border-white/5 bg-white/[0.02] hover:border-white/20",
                  estado === "desconectada" && "opacity-60",
                )}
              >
                <span title={NOMBRE_ICONO[iconoDeSenal(s)]} className="inline-flex shrink-0">
                  <GlifoIcono id={iconoDeSenal(s)} color={s.color} size={14} />
                </span>
                {(() => {
                  const foto = avatarDeSenal(s, avatarPropio);
                  return foto ? <FotoPerfil url={foto} iniciales="" size={18} color={s.color} /> : null;
                })()}
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[11px] font-semibold text-white/90">{s.label}</span>
                    {cuenta !== "ninguna" && (
                      <span className="shrink-0 rounded-full border border-violet-400/30 bg-violet-500/15 px-1.5 py-px text-[8px] font-black uppercase tracking-wider text-violet-200">
                        {cuenta === "propia" ? "tu cuenta" : "otra cuenta"}
                      </span>
                    )}
                    {s.simulated && (
                      <span className="shrink-0 rounded-full border border-amber-400/40 bg-amber-500/15 px-1.5 py-px text-[8px] font-black uppercase tracking-wider text-amber-200">
                        simulador
                      </span>
                    )}
                  </span>
                  {aparato && estado ? (
                    <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-white/50">
                      <span className="size-1.5 shrink-0 rounded-full" style={{ background: COLOR_ESTADO[estado] }} aria-hidden />
                      <span className="shrink-0">{TEXTO_ESTADO[estado]}</span>
                      {enlace && !(estado === "desconectada" && enlace.clase === "sin-enlace") && (
                        <span className="flex min-w-0 items-center gap-1 truncate">
                          <span aria-hidden className="inline-block h-0 w-3 shrink-0 border-t-2" style={{ borderColor: ESTILO_ENLACE[enlace.clase].color, borderStyle: ESTILO_ENLACE[enlace.clase].discontinua ? "dotted" : "solid" }} />
                          <span className="truncate tabular-nums">{valorEnlace(enlace, estado)}</span>
                        </span>
                      )}
                    </span>
                  ) : (
                    <span className="mt-0.5 flex items-center gap-1.5 text-[9px] text-white/45">
                      <span className="truncate">{s.antennaLabel.split(" (")[0]}</span>
                      <span className={cn("shrink-0 rounded-full border px-1.5 py-px text-[8px] font-black uppercase tracking-wider", CLASE_MODO[s.placement.mode])}>
                        {ETIQUETA_MODO_POSICION[s.placement.mode]}
                      </span>
                      <span className="shrink-0 tabular-nums">{textoDistancia(s.placement.distanceM)}</span>
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5" title={`Calidad ${textoCalidad(q)}`}>
                  <span className="text-[10px] font-bold tabular-nums text-white/80">{q == null ? "—" : Math.round(q * 100)}</span>
                  <span className="h-1 w-9 overflow-hidden rounded-full bg-white/[0.08]">
                    <span className="block h-full rounded-full" style={{ width: `${Math.round((q ?? 0) * 100)}%`, background: colorCalidad(q) }} />
                  </span>
                </span>
              </button>
              {medios.length > 0 && (
                <ul className="mt-1 space-y-1" aria-label={`Medios abiertos en ${s.label}`}>
                  {medios.map((m) => <FilaMedio key={m.id} m={m} seleccionId={seleccionId} onSeleccionar={onSeleccionar} onApuntar={onApuntar} />)}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {senales.length > FILAS_INICIALES && !mostrarTodas && (
        <button
          type="button"
          onClick={() => setTodas(true)}
          className="mt-1.5 inline-flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] py-1 text-[10px] font-medium text-white/60 transition-colors duration-200 hover:border-white/25 hover:text-white/90"
        >
          <ChevronDown className="h-3 w-3" /> Ver las {senales.length - FILAS_INICIALES} restantes
        </button>
      )}
    </div>
  );
}

export default ListaSenales;
