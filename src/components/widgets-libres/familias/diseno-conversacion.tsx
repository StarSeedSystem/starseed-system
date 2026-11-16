"use client";

import * as React from "react";
import { AstrauraForma } from "./astraura-forma";
import { Rotulo, recortarPalabras } from "./comun";
import { PilaAjustable, Prescindible } from "@/components/dashboard/kit/pila-ajustable";
import { haceCuanto } from "./inicio-piezas";
import { textoDeEstado } from "@/lib/widgets/astraura/estado-forma";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";

const DisenoConversacion = (props: PropsDiseno) => {
    const { estado, tam, ultima, hilo, ahora, tactil, preguntar, onAbrirChat } = props;
    const tamForma = Math.max(44, tam * 0.6);
    const maxTurnos = 3;
    const vista = hilo.slice(-maxTurnos * 2);

    return (
        <div className="w-full flex flex-col gap-2">
            <div className="flex items-center gap-3">
                <AstrauraForma estado={estado} tam={tamForma} onClick={() => onAbrirChat()} />
                <Rotulo color="hsl(var(--foreground))">{textoDeEstado(estado)}</Rotulo>
            </div>

            <PilaAjustable niveles={maxTurnos * 2} className="flex-1 min-h-0 overflow-hidden">
                {vista.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-4">
                        Aún no habéis hablado. Pregúntale lo que quieras.
                    </div>
                ) : (
                    <ol className="flex flex-col gap-2 min-w-0" aria-label="Última conversación">
                        {vista.map((e, i) => {
                            const esUltimoAstraura = e.rol === "aurora" && i === vista.length - 1;
                            const item = (
                                <li key={`${e.ts}-${i}`} className="min-w-0">
                                    <p className="text-xs text-muted-foreground">
                                        {e.rol === "user" ? "Tú" : "Astraura"}
                                    </p>
                                    <p className="line-clamp-2 text-sm text-foreground" title={e.texto}>
                                        {recortarPalabras(e.rol === "user" ? `Tú: ${e.texto}` : e.texto, 110)}
                                    </p>
                                    {esUltimoAstraura && (
                                        <span className="text-[10.5px] text-muted-foreground">
                                            {haceCuanto(e.ts, ahora)}
                                        </span>
                                    )}
                                </li>
                            );
                            return i === vista.length - 1 ? item : (
                                <Prescindible key={`${e.ts}-${i}`} nivel={1 + i}>
                                    {item}
                                </Prescindible>
                            );
                        })}
                    </ol>
                )}
            </PilaAjustable>

            <div className="flex w-full">{preguntar}</div>

            <div
                className="cursor-pointer mt-2 text-center"
                style={{ color: PALETAS.astraura.colores[0] }}
                onClick={() => onAbrirChat()}
            >
                Preguntar
            </div>
        </div>
    );
};

export default DisenoConversacion;