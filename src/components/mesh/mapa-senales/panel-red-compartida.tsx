"use client";

import * as React from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { COMPARTIR, type Compartir } from "@/lib/malla/cristal/puertas-internet";
import type { PreferenciasRedAparato } from "@/lib/malla/preferencias-red-compartida";
import type { DecisionComparticion } from "@/lib/malla/auto-compartir";
import type { PuertaInternet } from "@/lib/malla/cristal/puertas-internet";

type Props = {
  preferencias: PreferenciasRedAparato;
  puertas: PuertaInternet[];
  decisiones: DecisionComparticion[];
  onCambiar: (patch: Partial<PreferenciasRedAparato>) => void;
};

const TEXTO_COMPARTIR: Record<Compartir, string> = {
  nadie: "Nadie",
  "mi-cuenta": "Mi cuenta",
  vinculos: "Mis vínculos",
  grupo: "Un grupo",
  publico: "Cualquiera",
};

export function PanelRedCompartida({ preferencias, puertas, decisiones, onCambiar }: Props) {
  const [mostrarConfirmacion, setMostrarConfirmacion] = React.useState<Compartir | null>(null);
  const [confirmacionPendiente, setConfirmacionPendiente] = React.useState<Partial<PreferenciasRedAparato> | null>(null);

  const manejarCambioCompartir = (nuevoCompartir: boolean) => {
    onCambiar({ compartir: nuevoCompartir });
  };

  const manejarCambioMaximoCon = (nuevoMaximoCon: Compartir) => {
    const { aviso } = cambioDeAperturaRed(preferencias, { ...preferencias, maximoCon: nuevoMaximoCon });
    if (aviso) {
      setConfirmacionPendiente({ maximoCon: nuevoMaximoCon });
      setMostrarConfirmacion(nuevoMaximoCon);
    } else {
      onCambiar({ maximoCon: nuevoMaximoCon });
    }
  };

  const confirmarApertura = () => {
    if (confirmacionPendiente) {
      onCambiar(confirmacionPendiente);
      setConfirmacionPendiente(null);
      setMostrarConfirmacion(null);
    }
  };

  const cancelarApertura = () => {
    setConfirmacionPendiente(null);
    setMostrarConfirmacion(null);
  };

  const manejarCambioSoloWifi = (soloWifi: boolean) => {
    onCambiar({ soloWifi });
  };

  const manejarCambioKbpsSubidaMax = (kbpsSubidaMax: number) => {
    onCambiar({ kbpsSubidaMax });
  };

  const manejarCambioReservaBateriaPct = (reservaBateriaPct: number) => {
    onCambiar({ reservaBateriaPct });
  };

  const manejarCambioAutomatico = (automatico: boolean) => {
    onCambiar({ automatico });
  };

  const manejarCambioCompartirMedidas = (compartirMedidas: boolean) => {
    onCambiar({ compartirMedidas });
  };

  return (
    <section aria-label="Compartir internet por la malla" className="space-y-3">
      <label
        htmlFor="compartir-internet-malla"
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25",
        )}
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-white/90">Compartir mi internet por la malla</span>
          <span className="block text-[9px] leading-snug text-white/45">
            Apagado por defecto: este aparato no ofrece internet a la malla mientras esté desactivado.
          </span>
        </span>
        <Switch
          id="compartir-internet-malla"
          checked={preferencias.compartir}
          onCheckedChange={manejarCambioCompartir}
        />
      </label>

      <div className="space-y-2">
        <span className="block text-[11px] font-medium text-white/70">¿Con quién?</span>
        <div role="radiogroup" aria-label="Nivel de apertura para compartir internet" className="space-y-1.5">
          {COMPARTIR.map((nivel) => (
            <button
              key={nivel}
              role="radio"
              aria-checked={preferencias.maximoCon === nivel}
              onClick={() => manejarCambioMaximoCon(nivel)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  manejarCambioMaximoCon(nivel);
                }
              }}
              className={cn(
                "flex items-center gap-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25 text-left focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black",
                preferencias.maximoCon === nivel && "border-emerald-400/35 bg-emerald-500/10",
              )}
            >
              <span
                className={cn(
                  "shrink-0 h-4 w-4 rounded-full border-2 transition-colors",
                  preferencias.maximoCon === nivel
                    ? "border-emerald-400 bg-emerald-500/20"
                    : "border-white/20 bg-transparent",
                )}
                aria-hidden="true"
              />
              <span className="text-[11px] font-medium text-white/90">{TEXTO_COMPARTIR[nivel]}</span>
            </button>
          ))}
        </div>
      </div>

      {mostrarConfirmacion && (
        <div role="alertdialog" aria-modal="true" aria-labelledby="confirmacion-titulo" className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2.5 space-y-2">
          <p id="confirmacion-titulo" className="text-[11px] font-medium text-amber-200">
            ¿Confirmas aumentar la apertura a «{TEXTO_COMPARTIR[mostrarConfirmacion]}»?
          </p>
          <p className="text-[10px] text-white/70">
            Tu internet será visible para {TEXTO_COMPARTIR[mostrarConfirmacion].toLowerCase()}. Esta acción no se puede deshacer sin volver a cambiar el ajuste.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={confirmarApertura}
              className="flex-1 rounded-lg bg-amber-500 px-2.5 py-1.5 text-[11px] font-medium text-black transition-colors duration-200 cursor-pointer hover:bg-amber-400"
            >
              Confirmar
            </button>
            <button
              type="button"
              onClick={cancelarApertura}
              className="flex-1 rounded-lg border border-white/20 bg-white/[0.03] px-2.5 py-1.5 text-[11px] font-medium text-white/90 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        <span className="block text-[11px] font-medium text-white/70">Topes</span>
        <label
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25",
          )}
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-medium text-white/90">Solo Wi-Fi</span>
            <span className="block text-[9px] leading-snug text-white/45">
              Solo comparte si este aparato está conectado a Wi-Fi (no en datos móviles).
            </span>
          </span>
          <Switch
            checked={preferencias.soloWifi}
            onCheckedChange={manejarCambioSoloWifi}
          />
        </label>
        <label
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25",
          )}
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-medium text-white/90">Subida máxima compartible</span>
            <span className="block text-[9px] leading-snug text-white/45">
              Tope de ancho de banda de subida que la malla puede usar (kbps).
            </span>
          </span>
          <input
            type="number"
            value={preferencias.kbpsSubidaMax}
            onChange={(e) => manejarCambioKbpsSubidaMax(Math.max(64, Math.min(102400, Number(e.target.value) || 64)))}
            min={64}
            max={102400}
            step={64}
            className="w-24 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/90 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          />
        </label>
        <label
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25",
          )}
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-medium text-white/90">Reserva de batería</span>
            <span className="block text-[9px] leading-snug text-white/45">
              Porcentaje mínimo de batería para compartir (salvo que esté cargando).
            </span>
          </span>
          <input
            type="number"
            value={preferencias.reservaBateriaPct}
            onChange={(e) => manejarCambioReservaBateriaPct(Math.max(0, Math.min(90, Number(e.target.value) || 0)))}
            min={0}
            max={90}
            step={5}
            className="w-20 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-white/90 focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
          />
          <span className="shrink-0 text-[11px] text-white/50">%</span>
        </label>
        <label
          className={cn(
            "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25",
          )}
        >
          <span className="min-w-0">
            <span className="block text-[11px] font-medium text-white/90">Permitir en conexiones medidas</span>
            <span className="block text-[9px] leading-snug text-white/45">
              Permite compartir aunque la conexión tenga tope de datos mensual.
            </span>
          </span>
          <Switch
            checked={preferencias.compartirMedidas}
            onCheckedChange={manejarCambioCompartirMedidas}
          />
        </label>
      </div>

      <label
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 cursor-pointer hover:border-emerald-400/25",
        )}
      >
        <span className="min-w-0">
          <span className="block text-[11px] font-medium text-white/90">Modo automático</span>
          <span className="block text-[9px] leading-snug text-white/45">
            Sugerir y aplicar ajustes dentro de estos topes. Nunca enciende lo que tú no encendiste.
          </span>
        </span>
        <Switch
          checked={preferencias.automatico}
          onCheckedChange={manejarCambioAutomatico}
        />
      </label>

      {preferencias.automatico && puertas.length > 0 && (
        <div className="space-y-1.5">
          <span className="block text-[11px] font-medium text-white/70">Decisiones automáticas</span>
          <div role="list" aria-label="Lista de decisiones de compartir automáticas" className="space-y-1">
            {decisiones.map((decision, index) => (
              <div
                key={`${decision.puertaId}-${index}`}
                role="listitem"
                className={cn(
                  "flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-2 transition-colors duration-200 text-left",
                  decision.accion === "retirar" && "border-rose-400/25 bg-rose-500/[0.05]",
                  decision.accion === "ofrecer" && "border-emerald-400/25 bg-emerald-500/[0.05]",
                  decision.accion === "mantener" && "border-sky-400/25 bg-sky-500/[0.05]",
                )}
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] font-medium text-white/90 truncate">
                    {decision.motivo}
                  </span>
                  <span className="block text-[9px] text-white/45 truncate">
                    Puerta: {decision.puertaId} · Nivel: {TEXTO_COMPARTIR[decision.con]}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider",
                    decision.accion === "retirar" && "bg-rose-500/20 text-rose-300 border border-rose-400/30",
                    decision.accion === "ofrecer" && "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30",
                    decision.accion === "mantener" && "bg-sky-500/20 text-sky-300 border border-sky-400/30",
                  )}
                >
                  {decision.accion}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function cambioDeAperturaRed(
  anterior: PreferenciasRedAparato,
  nueva: PreferenciasRedAparato,
): { aviso: boolean } {
  const de = anterior.maximoCon;
  return { aviso: COMPARTIR.indexOf(nueva.maximoCon) > COMPARTIR.indexOf(de) };
}