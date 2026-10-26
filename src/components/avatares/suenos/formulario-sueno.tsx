"use client";

/**
 * «Soñar juntos» (Ola 1025U · U4): se eligen los agentes (uno = sueño individual; de dos a seis = sueño compartido) y
 * el tema, y se empieza. Los agentes que están descansando en la zona de sueños ahora mismo van marcados y se pueden
 * elegir de golpe. El formulario no inventa nada: si el sueño no puede empezar (tope, sin tema…), lo dice debajo.
 */
import { useId, useMemo, useState } from "react";
import { Moon, Users } from "lucide-react";
import { EtiquetaBotIA } from "@/components/agentes-red/etiqueta-bot-ia";
import { ETIQUETA_ORIGEN } from "@/lib/avatares/mundo/habitantes";
import type { AgenteMundoRef } from "@/lib/avatares/mundo/agente-mundo";
import { TOPES_SUENO, planSueno } from "@/lib/avatares/suenos/sueno";
import type { ControlSuenos } from "./use-suenos";

export interface FormularioSuenoProps {
  agentes: readonly AgenteMundoRef[];
  /** Ids de los agentes que descansan ahora en la zona de sueños. */
  descansando: readonly string[];
  /** Nombre de esa zona, para decirlo en la interfaz. */
  zonaNombre: string;
  uso: Pick<ControlSuenos, "iniciar" | "enCurso">;
}

export function FormularioSueno({ agentes, descansando, zonaNombre, uso }: FormularioSuenoProps) {
  const idTema = useId();
  const idAyuda = useId();
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set());
  const [tema, setTema] = useState("");
  const [error, setError] = useState<string | null>(null);

  const vivos = useMemo(() => new Set(agentes.map((a) => a.id)), [agentes]);
  // Lo elegido que ya no vive en este escenario no cuenta.
  const seleccion = useMemo(() => agentes.filter((a) => elegidos.has(a.id) && vivos.has(a.id)), [agentes, elegidos, vivos]);
  const enZona = useMemo(() => agentes.filter((a) => descansando.includes(a.id)), [agentes, descansando]);
  const sonando = uso.enCurso !== null;

  const vista = useMemo(() => planSueno(seleccion, tema.trim() || "tema"), [seleccion, tema]);
  const resumen =
    seleccion.length === 0
      ? "Elige a quien quieras que sueñe."
      : vista.ok
        ? vista.plan.tipo === "individual"
          ? `Sueño individual: ${seleccion[0].nombre} sueña solo, ${vista.plan.orden.length} turnos.`
          : `Sueño compartido de ${seleccion.length}: ${vista.plan.orden.length} turnos, por rondas.`
        : vista.motivo;

  const alternar = (id: string) => {
    setError(null);
    setElegidos((previo) => {
      const sig = new Set(previo);
      if (sig.has(id)) sig.delete(id);
      else sig.add(id);
      return sig;
    });
  };

  const elegirLosQueDescansan = () => {
    setError(null);
    setElegidos(new Set(enZona.slice(0, TOPES_SUENO.participantesMax).map((a) => a.id)));
  };

  const empezar = (e: React.FormEvent) => {
    e.preventDefault();
    const r = uso.iniciar(seleccion, tema);
    if (!r.ok) {
      setError(r.motivo);
      return;
    }
    setError(null);
    setTema("");
  };

  return (
    <form onSubmit={empezar} className="flex min-w-0 flex-col gap-3" aria-label="Soñar juntos" data-testid="formulario-sueno">
      <div className="flex min-w-0 flex-col gap-1">
        <label htmlFor={idTema} className="text-xs font-semibold uppercase tracking-wider text-white/70">
          Tema del sueño
        </label>
        <input
          id={idTema}
          type="text"
          value={tema}
          onChange={(e) => {
            setTema(e.target.value);
            setError(null);
          }}
          maxLength={TOPES_SUENO.caracteresTema}
          placeholder="Un puente de luz entre dos ciudades…"
          autoComplete="off"
          aria-describedby={idAyuda}
          className="h-11 w-full min-w-0 rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-white placeholder:text-white/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#007FFF]"
        />
        <p id={idAyuda} className="text-[11px] text-white/50">
          Lo que escribas llega a los agentes elegidos como punto de partida. Máximo {TOPES_SUENO.caracteresTema} caracteres.
        </p>
      </div>

      <fieldset className="min-w-0 border-0 p-0">
        <legend className="mb-1 flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
          <span>Quién sueña</span>
          <span className="font-normal normal-case tracking-normal text-white/50">
            {seleccion.length} de {TOPES_SUENO.participantesMax}
          </span>
        </legend>

        {enZona.length > 0 && (
          <button
            type="button"
            onClick={elegirLosQueDescansan}
            className="mb-2 inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-[#39FF14]/35 bg-[#39FF14]/10 px-3 text-xs font-semibold text-[#c9ffbd] transition duration-150 hover:bg-[#39FF14]/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#39FF14]"
          >
            <Users className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">
              Elegir a quien descansa en «{zonaNombre}» ({enZona.length})
            </span>
          </button>
        )}

        {agentes.length === 0 ? (
          <p className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-white/60" role="status">
            Todavía no vive nadie en este escenario: no hay quien sueñe.
          </p>
        ) : (
          <ul className="flex max-h-56 min-w-0 flex-col gap-1 overflow-y-auto overscroll-contain pr-1" aria-label="Agentes de este escenario">
            {agentes.map((a) => {
              const marcado = elegidos.has(a.id);
              const lleno = !marcado && seleccion.length >= TOPES_SUENO.participantesMax;
              const descansa = descansando.includes(a.id);
              return (
                <li key={a.id} className="min-w-0">
                  <label
                    className={
                      "flex min-h-11 min-w-0 cursor-pointer items-center gap-3 rounded-xl border px-3 py-1.5 transition duration-150 " +
                      (marcado ? "border-[#007FFF]/60 bg-[#007FFF]/15" : "border-white/10 bg-black/20 hover:bg-white/10") +
                      (lleno ? " cursor-not-allowed opacity-50" : "")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={lleno}
                      onChange={() => alternar(a.id)}
                      className="size-5 shrink-0 cursor-pointer accent-[#007FFF]"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="min-w-0 break-words text-sm font-semibold text-white">{a.nombre}</span>
                        <EtiquetaBotIA />
                      </span>
                      <span className="block break-words text-[11px] text-white/50">
                        {ETIQUETA_ORIGEN[a.origen]}
                        {descansa ? ` · descansa en ${zonaNombre}` : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </fieldset>

      <p className="text-xs text-white/70" role="status" data-testid="resumen-sueno">
        {resumen}
      </p>

      {error && (
        <p role="alert" className="break-words rounded-xl border border-[#DC143C]/50 bg-[#DC143C]/10 px-3 py-2 text-xs text-[#ffb3c0]">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={sonando || seleccion.length === 0 || tema.trim() === ""}
        className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#007FFF] px-4 font-headline text-sm font-bold uppercase tracking-wide text-white transition duration-150 hover:bg-[#1a8cff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Moon className="size-4 shrink-0" aria-hidden="true" />
        {sonando ? "Ya hay un sueño en curso" : "Empezar a soñar"}
      </button>
    </form>
  );
}
