"use client";

/**
 * El panel de los sueños del mundo (Ola 1025U · U4). Va dentro de `PanelCristal`: arriba el formulario para soñar
 * juntos, el interruptor de los sueños automáticos (apagado de fábrica, con su tope a la vista), el sueño que corre
 * ahora con su transcripción turno a turno y, debajo, los últimos sueños de este escenario con la suya.
 *
 * Honestidad: los sueños los escriben IAs (cada autor lleva su chapa «Bot de IA»); sin IA disponible el sueño se
 * detiene y lo dice, no se rellena con texto de plantilla.
 */
import { useState } from "react";
import { ChevronDown, Square, Trash2, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { haceCuanto } from "@/lib/avatares/agente/desarrollo";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { ETIQUETA_ESTADO_SUENO, TOPES_SUENO, type EstadoSueno, type Sueno } from "@/lib/avatares/suenos/sueno";
import { FormularioSueno } from "./formulario-sueno";
import { TranscripcionSueno } from "./transcripcion-sueno";
import type { ControlSuenos } from "./use-suenos";

export interface PanelSuenosProps {
  uso: ControlSuenos;
  agentes: readonly AgenteMundoRef[];
  descansando: readonly string[];
  zonaNombre: string;
  /** Reloj para «hace 5 min». Por defecto, `Date.now`. */
  ahora?: number;
}

const COLOR_ESTADO: Record<EstadoSueno, string> = {
  "en-curso": "border-[#007FFF]/50 bg-[#007FFF]/15 text-sky-200",
  completo: "border-[#39FF14]/45 bg-[#39FF14]/10 text-[#c9ffbd]",
  cancelado: "border-white/20 bg-white/10 text-white/70",
  "sin-ia": "border-[#FFBF00]/45 bg-[#FFBF00]/10 text-[#ffe9a8]",
  interrumpido: "border-[#DC143C]/45 bg-[#DC143C]/10 text-[#ffb3c0]",
};

function nombresDe(s: Sueno): string {
  return s.participantes.map((p) => p.nombre).join(", ");
}

function TarjetaSueno({ sueno, ahora, abierto, alAlternar, alOlvidar }: {
  sueno: Sueno;
  ahora: number;
  abierto: boolean;
  alAlternar: () => void;
  alOlvidar?: () => void;
}) {
  const cuerpo = `sueno-${sueno.id}`;
  return (
    <li className="min-w-0 rounded-2xl border border-white/12 bg-black/25" data-testid="tarjeta-sueno" data-estado={sueno.estado}>
      <button
        type="button"
        onClick={alAlternar}
        aria-expanded={abierto}
        aria-controls={abierto ? cuerpo : undefined}
        className="flex min-h-11 w-full min-w-0 cursor-pointer items-start gap-2 rounded-2xl px-3 py-2 text-left transition duration-150 hover:bg-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]"
      >
        <span className="min-w-0 flex-1">
          <span className="block break-words font-headline text-sm font-semibold tracking-wide text-white">{sueno.tema}</span>
          <span className="block break-words text-[11px] text-white/55">
            {sueno.tipo === "colectivo" ? "Compartido" : "Individual"} · {nombresDe(sueno)} · {haceCuanto(sueno.creadoEn, ahora)}
            {sueno.origen === "encuentro" ? " · nació de un encuentro" : ""}
          </span>
        </span>
        <span className={`mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${COLOR_ESTADO[sueno.estado]}`}>
          {ETIQUETA_ESTADO_SUENO[sueno.estado]}
        </span>
        <ChevronDown
          className={`mt-1 size-4 shrink-0 text-white/60 transition-transform duration-150 ${abierto ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {abierto && (
        <div id={cuerpo} className="flex min-w-0 flex-col gap-3 border-t border-white/10 px-3 py-3">
          <TranscripcionSueno sueno={sueno} />
          {alOlvidar && (
            <button
              type="button"
              onClick={alOlvidar}
              className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 self-start rounded-xl border border-white/15 bg-white/5 px-3 text-xs font-semibold text-white/75 transition duration-150 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]"
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Olvidar este sueño
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export function PanelSuenos({ uso, agentes, descansando, zonaNombre, ahora }: PanelSuenosProps) {
  const reloj = ahora ?? Date.now();
  const [abiertos, setAbiertos] = useState<ReadonlySet<string>>(new Set());
  const pasados = uso.suenos.filter((s) => s.id !== uso.enCurso?.id);
  const alternar = (id: string) =>
    setAbiertos((previo) => {
      const sig = new Set(previo);
      if (sig.has(id)) sig.delete(id);
      else sig.add(id);
      return sig;
    });

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="panel-suenos">
      <FormularioSueno agentes={agentes} descansando={descansando} zonaNombre={zonaNombre} uso={uso} />

      <section aria-labelledby="suenos-automaticos" className="flex min-w-0 flex-col gap-2 rounded-2xl border border-white/12 bg-black/25 p-3">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <label id="suenos-automaticos" htmlFor="interruptor-suenos-automaticos" className="min-w-0 cursor-pointer text-sm font-semibold text-white">
            Sueños automáticos
          </label>
          <Switch
            id="interruptor-suenos-automaticos"
            checked={uso.automaticos}
            onCheckedChange={uso.ponerAutomaticos}
            aria-describedby="ayuda-suenos-automaticos"
            className="data-[state=checked]:bg-[#39FF14]"
          />
        </div>
        <p id="ayuda-suenos-automaticos" className="text-[11px] leading-snug text-white/55">
          {uso.automaticos
            ? "Encendidos: cuando dos agentes que ya se conocen se encuentran en el mundo, pueden soñar juntos."
            : "Apagados: los agentes solo sueñan cuando tú lo pides."}{" "}
          Tope visible: {uso.topes.automaticosEstaHora} de {TOPES_SUENO.automaticosPorHora} automáticos y {uso.topes.suenosEstaHora} de{" "}
          {TOPES_SUENO.suenosPorHora} sueños en total esta hora, y como mucho {TOPES_SUENO.suenosPorAgentePorHora} por agente. Cada turno
          gasta una llamada a la IA gratuita o local, nunca de pago.
        </p>
      </section>

      {uso.aviso && (
        <div role="status" className="flex min-w-0 items-start justify-between gap-2 rounded-xl border border-[#FFBF00]/40 bg-[#FFBF00]/10 px-3 py-2 text-xs text-[#ffe9a8]">
          <p className="min-w-0 break-words">{uso.aviso}</p>
          <button
            type="button"
            onClick={uso.limpiarAviso}
            aria-label="Cerrar el aviso"
            className="-my-1 inline-flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-[#ffe9a8] transition duration-150 hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFBF00]"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {!uso.guardado && (
        <p role="status" className="text-[11px] text-[#ffe9a8]">
          No cupo en el disco de este aparato: los sueños se mantienen mientras la pestaña siga abierta.
        </p>
      )}

      {uso.enCurso && (
        <section aria-label="Sueño en curso" className="flex min-w-0 flex-col gap-2 rounded-2xl border border-[#007FFF]/45 bg-[#007FFF]/10 p-3" data-testid="sueno-en-curso">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-headline text-sm font-bold uppercase tracking-wide text-white">Soñando ahora</h3>
              <p className="break-words text-xs text-white/70">
                {uso.enCurso.tema} · {nombresDe(uso.enCurso)}
              </p>
            </div>
            <button
              type="button"
              onClick={uso.cancelar}
              className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#DC143C]/50 bg-[#DC143C]/15 px-3 text-xs font-semibold text-[#ffb3c0] transition duration-150 hover:bg-[#DC143C]/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#DC143C]"
            >
              <Square className="size-4" aria-hidden="true" />
              Cancelar
            </button>
          </div>
          <TranscripcionSueno sueno={uso.enCurso} />
        </section>
      )}

      <section aria-labelledby="suenos-recientes" className="flex min-w-0 flex-col gap-2">
        <h3 id="suenos-recientes" className="text-xs font-semibold uppercase tracking-wider text-white/70">
          Sueños de este escenario
        </h3>
        {pasados.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/60" role="status">
            Aún no hay sueños guardados aquí. Se conservan los últimos {TOPES_SUENO.guardadosPorEscenario} en este aparato.
          </p>
        ) : (
          <ul className="flex min-w-0 flex-col gap-2" aria-label="Sueños guardados">
            {pasados.map((s) => (
              <TarjetaSueno
                key={s.id}
                sueno={s}
                ahora={reloj}
                abierto={abiertos.has(s.id)}
                alAlternar={() => alternar(s.id)}
                alOlvidar={() => uso.olvidar(s.id)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
