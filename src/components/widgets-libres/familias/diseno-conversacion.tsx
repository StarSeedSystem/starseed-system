"use client";

import * as React from "react";
import { haceCuanto } from "@/components/widgets-libres/familias/inicio-piezas";
import { Prescindible, PilaAjustable } from "@/components/dashboard/kit/pila-ajustable";
import { cn } from "@/lib/utils";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { AstrauraForma } from "./astraura-forma";
import type { EstadoAsistente } from "@/lib/widgets/astraura/estado-forma";
import { Accion } from "@/components/widgets-libres/familias/inicio-piezas";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";

const VIOLETA = "#7c5cff";
const TURQUESA = "#23d5ab";
const SUGERENCIAS_DEFECTO = ["Resúmeme mi día", "¿Qué hay nuevo en la red?", "Ayúdame a ordenar mis tareas de hoy"];

const TEXTO_VOZ: Record<EstadoAsistente, string> = {
  calma: "En calma",
  escuchando: "Escuchando…",
  pensando: "Pensando…",
  hablando: "Hablando",
};

function Rotulo({ children, color, className = "" }: { children: React.ReactNode; color?: string; className?: string }) {
  return (
    <span
      className={`whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.14em] ${className}`}
      style={{ color: color ?? "rgba(255,255,255,.6)" }}
    >
      {children}
    </span>
  );
}

export function DisenoConversacion(props: PropsDiseno) {
  const { estado, tam, ultima, hilo, ahora, tactil, voz, preguntar, botonVoz, sugerencias, onAbrirChat, onSugerencia } = props;
  const ancho = Math.min(tam, 360);
  const alto = Math.min(tam, 500);

  const [mostrarSugerencias, setMostrarSugerencias] = React.useState(sugerencias.length > 0);

  const hiloNodo = (turnos: number) => {
    const vista = hilo.slice(-turnos * 2);
    if (!vista.length) {
      return <p className="text-[12px] text-white/60">Aún no habéis hablado. Pregúntale lo que quieras.</p>;
    }

    return (
      <ol className="flex min-w-0 flex-col gap-1.5" aria-label="Última conversación">
        {vista.map((e, i) => {
          const esUltimo = i === vista.length - 1;
          const esAstraura = e.rol === "aurora";

          const item = (
            <li
              key={`${e.ts}-${i}`}
              className={`min-w-0 text-[12px] leading-snug ${esAstraura ? "text-white/90" : "text-white/60"}`}
            >
              <p className="line-clamp-2" title={e.text}>
                {esAstraura ? e.text : `Tú: ${e.text}`}
              </p>
              {esUltimo && esAstraura && <span className="text-[10.5px] text-violet-200/70">{haceCuanto(e.ts, ahora || Date.now())}</span>}
            </li>
          );

          return i === vista.length - 1 ? item : <Prescindible nivel={2 + i} key={`${e.ts}-${i}`}>{item}</Prescindible>;
        })}
      </ol>
    );
  };

  const maxTurnos = 3;
  const turnosMostrados = Math.min(maxTurnos, hilo.length);

  return (
    <div className="h-full w-full flex flex-col gap-2">
      <AstrauraForma
        estado={estado}
        tam={tam * 0.6}
        onClick={onAbrirChat}
      />
      <div className="text-center text-[11px] text-white/70">
        {TEXTO_VOZ[estado]}
      </div>
      <PilaAjustable niveles={8} className="min-h-0 w-full flex-1 overflow-hidden">
        <div className="my-auto flex min-w-0 flex-col gap-2.5">
          {hiloNodo(turnosMostrados > 0 ? turnosMostrados : 1)}
          {mostrarSugerencias && (sugerencias.length > 0 || SUGERENCIAS_DEFECTO.length > 0) && (
            <>
              {(sugerencias.length > 0 ? sugerencias : SUGERENCIAS_DEFECTO).map((s, idx) => (
                <Prescindible key={`sug-${idx}`} nivel={1}>
                  <Accion
                    icono={React.createElement("span", { className: "size-3.5" }, "✨")}
                    color={VIOLETA}
                    grande={tactil}
                    onClick={() => void onSugerencia?.(s)}
                    className="max-w-full !whitespace-normal text-left leading-tight"
                  >
                    {s}
                  </Accion>
                </Prescindible>
              ))}
            </>
          )}
        </div>
      </PilaAjustable>
      {preguntar}
    </div>
  );
}