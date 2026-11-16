"use client";

import { Accion } from "./inicio-piezas";
import { AstrauraForma } from "./astraura-forma";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";

export function DisenoAcciones(props: PropsDiseno) {
    const { estado, tam, ultima, hilo, ahora, tactil, voz, preguntar, botonVoz, sugerencias, onAbrirChat, onSugerencia } = props;
    const isLarge = tam >= 280;
    const [c1, c2, c3] = PALETAS.astraura.colores;

    return (
        <div className="space-y-3">
            <AstrauraForma estado={estado} tam={tam} onClick={onAbrirChat} />

            <div className={isLarge ? "grid grid-cols-2 gap-3" : "flex flex-col"}>
                {sugerencias.slice(0, 4).map((texto, i) => (
                    <Accion
                        key={i}
                        icono={undefined}
                        color={c1}
                        onClick={() => onSugerencia(texto)}
                        className="h-12 w-12 rounded-full flex items-center justify-center text-sm"
                    >
                        <span>{texto}</span>
                    </Accion>
                ))}

                {isLarge ? (
                    <Accion
                        icono={undefined}
                        color={c1}
                        onClick={onAbrirChat}
                        className="h-12 w-12 rounded-full flex items-center justify-center text-sm"
                    >
                        <span>Abrir chat</span>
                    </Accion>
                ) : (
                    <></>
                )}
            </div>

            {preguntar !== undefined && <div className="text-[11px] text-muted-foreground">{preguntar}</div>}
        </div>
    );
}