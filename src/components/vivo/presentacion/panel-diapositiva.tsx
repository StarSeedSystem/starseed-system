"use client";

/**
 * Panel de propiedades de la presentación: con un elemento elegido, sus acciones y ajustes
 * (`PanelElemento` del lienzo de los mensajes); sin elemento, el fondo de ESTA diapositiva, sus
 * capas y los ajustes del mazo entero (tema y proporción), que cambian para todos a la vez.
 */

import { Layers, Lock, Palette, RotateCcw } from "lucide-react";
import { ICONO_ELEMENTO, PanelElemento, nombreElemento } from "@/components/messages/rico/editor-lienzo";
import type { OpcionesCambio } from "@/components/messages/rico/historial";
import { PanelEstilo } from "@/components/messages/rico/panel-estilo";
import { fondoCssDe } from "@/lib/mensajeria/formato";
import type { LienzoMensaje } from "@/lib/mensajeria/formato-tipos";
import { cn } from "@/lib/utils";
import {
    TEMAS_PRESENTACION,
    lienzoEfectivo,
    sinHerencia,
    temaDe,
    type Diapositiva,
    type MetaPresentacion,
    type ProporcionPresentacion,
} from "@/lib/vivo/presentacion";

function Rotulo({ children }: { children: React.ReactNode }) {
    return <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{children}</p>;
}

export interface PanelDiapositivaProps {
    diapositiva: Diapositiva;
    numero: number;
    meta: MetaPresentacion;
    puedeEditar: boolean;
    seleccion: string | null;
    onSeleccion: (id: string | null) => void;
    onEditarTexto: (id: string) => void;
    onCambiar: (lienzo: LienzoMensaje, opciones?: OpcionesCambio) => void;
    onCambiarMeta: (cambio: Partial<MetaPresentacion>) => void;
}

export function PanelDiapositiva({ diapositiva, numero, meta, puedeEditar, seleccion, onSeleccion, onEditarTexto, onCambiar, onCambiarMeta }: PanelDiapositivaProps) {
    const efectivo = lienzoEfectivo(diapositiva, meta);
    const elegido = efectivo.elementos.find((e) => e.id === seleccion) ?? null;
    const cambiar = (l: LienzoMensaje, op?: OpcionesCambio) => onCambiar(sinHerencia(l, diapositiva, meta), op);

    if (!puedeEditar) {
        return (
            <p className="px-1 text-[13px] leading-relaxed text-white/60">
                Estás viendo la presentación. Para cambiar diapositivas, pide a quien la creó que te invite como editor.
            </p>
        );
    }

    if (elegido) {
        return (
            <div className="space-y-4">
                <PanelElemento el={elegido} lienzo={efectivo} onChange={cambiar} onSeleccion={onSeleccion} onEditarTexto={onEditarTexto} />
                <button
                    type="button"
                    onClick={() => onSeleccion(null)}
                    className="ss-redondo min-h-10 w-full cursor-pointer rounded-full px-4 text-[13px] font-semibold text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)] transition-colors duration-200 hover:bg-white/[0.07]"
                >
                    Ver los ajustes de la diapositiva
                </button>
            </div>
        );
    }

    const propio = diapositiva.lienzo.fondo !== undefined || diapositiva.lienzo.animacionFondo !== undefined;
    const capas = [...efectivo.elementos].sort((a, b) => b.z - a.z);
    const tema = temaDe(meta);

    return (
        <div className="space-y-7">
            <section>
                <Rotulo>Diapositiva {numero}</Rotulo>
                <PanelEstilo
                    estilo={{ fondo: efectivo.fondo, animacionFondo: efectivo.animacionFondo }}
                    onChange={(e) => cambiar({ ...efectivo, fondo: e?.fondo, animacionFondo: e?.animacionFondo }, { agrupar: "fondo-diapositiva", ventana: 1200 })}
                    secciones={["fondo", "animacionFondo"]}
                    compacto
                />
                {propio && (
                    <button
                        type="button"
                        onClick={() => {
                            const { fondo: _f, animacionFondo: _a, ...resto } = diapositiva.lienzo;
                            onCambiar(resto as LienzoMensaje);
                        }}
                        className="ss-redondo mt-3 inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-full px-4 text-[13px] font-semibold text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)] transition-colors duration-200 hover:bg-white/[0.07]"
                    >
                        <RotateCcw className="h-4 w-4" aria-hidden="true" /> Usar el fondo del tema
                    </button>
                )}
            </section>

            {capas.length > 0 && (
                <section>
                    <Rotulo>
                        <span className="inline-flex items-center gap-1.5">
                            <Layers className="h-3.5 w-3.5" aria-hidden="true" /> Capas
                        </span>
                    </Rotulo>
                    <ul className="space-y-1" role="list" aria-label="Capas de la diapositiva (arriba la más visible)">
                        {capas.map((el) => {
                            const Icono = ICONO_ELEMENTO[el.tipo];
                            return (
                                <li key={el.id}>
                                    <button
                                        type="button"
                                        onClick={() => onSeleccion(el.id)}
                                        className="flex min-h-10 w-full cursor-pointer items-center gap-2.5 rounded-[12px] px-3 text-left text-[13px] text-white/80 transition-colors duration-200 hover:bg-white/[0.06]"
                                    >
                                        <Icono className="h-4 w-4 flex-none" aria-hidden="true" />
                                        <span className="min-w-0 flex-1 truncate">{nombreElemento(el)}</span>
                                        {el.bloqueado && <Lock className="h-3.5 w-3.5 flex-none text-white/55" aria-label="Bloqueado" />}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            <section>
                <Rotulo>
                    <span className="inline-flex items-center gap-1.5">
                        <Palette className="h-3.5 w-3.5" aria-hidden="true" /> Tema de la presentación
                    </span>
                </Rotulo>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Tema de la presentación">
                    {TEMAS_PRESENTACION.map((t) => {
                        const activo = t.id === tema.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                role="radio"
                                aria-checked={activo}
                                onClick={() => onCambiarMeta({ tema: t.id })}
                                className={cn(
                                    "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left transition-[box-shadow,background-color] duration-200",
                                    activo ? "bg-[#7C5CFF]/[0.14] shadow-[inset_0_0_0_1.5px_#7C5CFF]" : "bg-white/[0.035] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] hover:bg-white/[0.07]",
                                )}
                            >
                                <span className="grid h-8 w-11 flex-none place-items-center rounded-[8px] text-[12px] font-bold" style={{ background: fondoCssDe(t.fondo), color: t.color }} aria-hidden="true">
                                    Aa
                                </span>
                                <span className="truncate text-[13px] font-semibold text-white">{t.nombre}</span>
                            </button>
                        );
                    })}
                </div>
                <p className="mt-2 text-[12px] text-white/55">El tema cambia el fondo y la letra de todas las diapositivas que no tengan fondo propio.</p>
            </section>

            <section>
                <Rotulo>Proporción</Rotulo>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Proporción de las diapositivas">
                    {(
                        [
                            ["16:9", "Panorámica"],
                            ["4:3", "Clásica"],
                        ] as [ProporcionPresentacion, string][]
                    ).map(([p, nombre]) => (
                        <button
                            key={p}
                            type="button"
                            role="radio"
                            aria-checked={meta.proporcion === p}
                            onClick={() => onCambiarMeta({ proporcion: p })}
                            className={cn(
                                "min-h-11 cursor-pointer rounded-[14px] px-3 text-left transition-[box-shadow,background-color] duration-200",
                                meta.proporcion === p ? "bg-[#7C5CFF]/[0.14] shadow-[inset_0_0_0_1.5px_#7C5CFF]" : "bg-white/[0.035] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)] hover:bg-white/[0.07]",
                            )}
                        >
                            <span className="block text-[13px] font-semibold text-white">{nombre}</span>
                            <span className="block text-[11.5px] text-white/55">{p}</span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
}
