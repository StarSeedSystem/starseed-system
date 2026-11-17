"use client";
/**
 * Diseño «Acciones» del asistente Astraura (ASW1116A): la forma Protomolécula con su estado en
 * texto y una rejilla de atajos para empezar rápido — las sugerencias que pasa la tarea que lo
 * monta (hasta 4, cada una llama a `onSugerencia(texto)`) más el atajo fijo «Abrir el chat» —
 * y debajo el campo para preguntar que inyecta el widget. Rejilla de 2 columnas a partir de
 * 280 px de ancho (consulta de contenedor) y 1 columna por debajo. Colores del tema y acento
 * de `PALETAS.astraura` (marca Trinity Liquid Crystal); sin blanco fijo fuera del vidrio oscuro
 * que ya pinta el widget libre.
 */
import * as React from "react";
import { CalendarCheck, ClipboardList, MessageCircle, Radar, Sparkles } from "lucide-react";
import { AstrauraForma } from "./astraura-forma";
import { Accion } from "./inicio-piezas";
import { textoDeEstado } from "@/lib/widgets/astraura/estado-forma";
import type { PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";

/** Icono de lucide para cada sugerencia, por posición (el texto lo pone la tarea que lo monta). */
const ICONOS = [Sparkles, Radar, ClipboardList, CalendarCheck];

export function DisenoAcciones(props: PropsDiseno) {
    const acento = PALETAS.astraura.colores[0];
    const acento2 = PALETAS.astraura.colores[2];
    return (
        <div className="@container flex h-full w-full flex-col gap-3 text-foreground" data-diseno="acciones">
            <div className="flex min-w-0 items-center gap-2.5">
                <AstrauraForma estado={props.estado} tam={props.tam} onClick={() => props.onAbrirChat()} />
                <span aria-hidden className="size-2 shrink-0 rounded-full" data-acento="true" style={{ background: acento }} />
                <p className="min-w-0 truncate text-[13px] font-semibold text-foreground" role="status">
                    {textoDeEstado(props.estado)}
                </p>
            </div>
            <div role="group" aria-label="Atajos para empezar rápido"
                className="grid min-w-0 grid-cols-1 items-start gap-2 @[280px]:grid-cols-2">
                {props.sugerencias.slice(0, 4).map((texto, i) => (
                    <Accion key={`${texto}-${i}`} icono={ICONOS[i % ICONOS.length]} color={i % 2 === 0 ? acento : acento2}
                        grande={props.tactil} onClick={() => props.onSugerencia(texto)}
                        className="max-w-full !whitespace-normal text-left leading-tight">
                        {texto}
                    </Accion>
                ))}
                <Accion icono={MessageCircle} color={acento2} principal grande={props.tactil}
                    onClick={() => props.onAbrirChat()}
                    className="max-w-full !whitespace-normal text-left leading-tight">
                    Abrir el chat
                </Accion>
            </div>
            <div className="min-w-0 text-muted-foreground">{props.preguntar}</div>
        </div>
    );
}

export default DisenoAcciones;
