"use client";

import { useState } from "react";
import { ChartBar, ClipboardList, Kanban, LayoutTemplate, ListChecks, Users, Vote, type LucideIcon } from "lucide-react";
import { PLANTILLAS_PROGRAMA, type IdPlantilla } from "@/lib/vivo/programas/plantillas";
import { NOMBRE_TIPO_BLOQUE } from "@/lib/vivo/programas/tipos";
import { Boton, estilos as s } from "../juegos/comun";
import p from "./programas.module.css";

const ICONOS: Record<string, LucideIcon> = { ChartBar, ListChecks, Kanban, Vote, ClipboardList, Users, LayoutTemplate };

export interface PropsGaleriaPlantillas {
    /** Texto del botón de confirmar («Crear programa y entrar», «Empezar con esta plantilla»…). */
    etiquetaConfirmar: string;
    deshabilitado?: boolean;
    ocupado?: boolean;
    alConfirmar: (plantilla: IdPlantilla) => void;
}

/** Elige una plantilla (o empezar en blanco). */
export function GaleriaPlantillas({ etiquetaConfirmar, deshabilitado, ocupado, alConfirmar }: PropsGaleriaPlantillas) {
    const [elegida, setElegida] = useState<IdPlantilla>("encuesta");
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className={s.tarjetas} role="radiogroup" aria-label="Elige una plantilla">
                {PLANTILLAS_PROGRAMA.map((t) => {
                    const Icono = ICONOS[t.icono] ?? LayoutTemplate;
                    const activa = t.id === elegida;
                    return (
                        <button
                            key={t.id}
                            type="button"
                            role="radio"
                            aria-checked={activa}
                            className={`${s.tarjeta} ${activa ? s.tarjetaSel : ""}`}
                            style={{ ["--color-tarjeta" as string]: t.color }}
                            onClick={() => setElegida(t.id)}
                        >
                            <span className={s.icono} style={{ background: `${t.color}26`, boxShadow: `inset 0 0 0 1px ${t.color}66`, color: t.color }}>
                                <Icono size={24} aria-hidden="true" />
                            </span>
                            <h3 className={s.tarjetaNombre}>{t.nombre}</h3>
                            <span className={s.nota}>{t.descripcion}</span>
                            {t.contiene.length > 0 && (
                                <span className={p.chips} aria-label="Bloques que lleva">
                                    {[...new Set(t.contiene)].map((tipo) => (
                                        <span key={tipo} className={p.chip}>
                                            {NOMBRE_TIPO_BLOQUE[tipo]}
                                        </span>
                                    ))}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>
            <div>
                <Boton variante="primario" disabled={deshabilitado || ocupado} onClick={() => alConfirmar(elegida)}>
                    {ocupado ? "Un momento…" : etiquetaConfirmar}
                </Boton>
            </div>
        </div>
    );
}
