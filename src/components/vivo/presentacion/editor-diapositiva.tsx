"use client";

/**
 * Escenario de edición de UNA diapositiva: el compositor del lienzo de los mensajes
 * (`EscenarioLienzo`: arrastrar, escalar, girar, capas, teclado) y, al editar un texto, el editor
 * tipo Word encima. El fondo y las medidas del mazo se ven pero no se copian a la diapositiva
 * (`sinHerencia`), para que cambiar el tema del mazo siga afectando a todas.
 */

import { Users, X } from "lucide-react";
import { EditorDoc } from "@/components/messages/rico/editor-doc";
import { EscenarioLienzo, PanelCristal } from "@/components/messages/rico/editor-lienzo";
import type { OpcionesCambio } from "@/components/messages/rico/historial";
import { actualizarElemento } from "@/components/messages/rico/lienzo-ops";
import { colorTextoSobre, fondoCssDe } from "@/lib/mensajeria/formato";
import type { DocRico, EstiloMensaje, LienzoMensaje } from "@/lib/mensajeria/formato-tipos";
import type { Presente } from "@/lib/vivo/doc-colaborativo/motor";
import { lienzoEfectivo, sinHerencia, type Diapositiva, type MetaPresentacion } from "@/lib/vivo/presentacion";

const DOC_VACIO: DocRico = { bloques: [] };

export interface EditorDiapositivaProps {
    diapositiva: Diapositiva;
    meta: MetaPresentacion;
    estiloBase: EstiloMensaje;
    onCambiar: (lienzo: LienzoMensaje, opciones?: OpcionesCambio) => void;
    /** Corrección automática del alto de los textos (sin paso de deshacer). */
    onAjustar: (lienzo: LienzoMensaje) => void;
    seleccion: string | null;
    onSeleccion: (id: string | null) => void;
    editandoTexto: string | null;
    onEditarTexto: (id: string | null) => void;
    onDeshacer: () => void;
    onRehacer: () => void;
    /** Otras personas en esta misma diapositiva. */
    companeros: Presente[];
}

export function EditorDiapositiva({
    diapositiva,
    meta,
    estiloBase,
    onCambiar,
    onAjustar,
    seleccion,
    onSeleccion,
    editandoTexto,
    onEditarTexto,
    onDeshacer,
    onRehacer,
    companeros,
}: EditorDiapositivaProps) {
    const efectivo = lienzoEfectivo(diapositiva, meta);
    const enEdicion = efectivo.elementos.find((e) => e.id === editandoTexto && e.tipo === "texto") ?? null;
    const cambiar = (l: LienzoMensaje, op?: OpcionesCambio) => onCambiar(sinHerencia(l, diapositiva, meta), op);

    return (
        <div className="relative h-full min-h-0" data-editor-diapositiva="">
            <PanelCristal className="h-full overflow-hidden">
                <EscenarioLienzo
                    lienzo={efectivo}
                    onChange={cambiar}
                    estiloMensaje={estiloBase}
                    seleccion={seleccion}
                    onSeleccion={onSeleccion}
                    onEditarTexto={(id) => onEditarTexto(id)}
                    onDeshacer={onDeshacer}
                    onRehacer={onRehacer}
                    onAjustarAltos={(cambios) =>
                        onAjustar(
                            sinHerencia(
                                {
                                    ...efectivo,
                                    elementos: efectivo.elementos.map((e) => {
                                        const c = cambios.find((x) => x.id === e.id);
                                        return c ? { ...e, h: Math.min(c.h, efectivo.alto * 2) } : e;
                                    }),
                                },
                                diapositiva,
                                meta,
                            ),
                        )
                    }
                />
            </PanelCristal>
            {companeros.length > 0 && (
                <p
                    className="ss-redondo pointer-events-none absolute left-3 top-3 z-10 inline-flex max-w-[calc(100%-24px)] items-center gap-2 rounded-full bg-[rgba(12,14,34,.8)] px-3 py-1.5 text-[12px] font-medium text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,.12)] backdrop-blur-md"
                    role="status"
                >
                    <Users className="h-3.5 w-3.5 flex-none" style={{ color: companeros[0].color }} aria-hidden="true" />
                    <span className="truncate">
                        {companeros.map((c) => c.nombre).join(", ")} {companeros.length === 1 ? "también está" : "también están"} en esta diapositiva
                    </span>
                </p>
            )}
            {enEdicion && (
                <div className="absolute inset-0 z-20 flex flex-col gap-3 rounded-[22px] bg-[rgba(7,8,22,.94)] p-3 shadow-[inset_0_0_0_1px_rgba(124,92,255,.35)] backdrop-blur-xl sm:p-4">
                    <div className="flex items-center gap-3">
                        <p className="mr-auto text-[15px] font-semibold">Editar texto</p>
                        <button
                            type="button"
                            onClick={() => onEditarTexto(null)}
                            className="ss-redondo inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full bg-[#7C5CFF] px-4 text-[13px] font-semibold text-white"
                        >
                            <X className="h-4 w-4" aria-hidden="true" /> Listo
                        </button>
                    </div>
                    <EditorDoc
                        key={enEdicion.id}
                        compacto
                        autoFocus
                        etiqueta="Texto del elemento de la diapositiva"
                        placeholder="Escribe el texto…"
                        doc={enEdicion.texto ?? DOC_VACIO}
                        onChange={(doc, op) => cambiar(actualizarElemento(efectivo, enEdicion.id, { texto: doc }), op)}
                        onDeshacer={onDeshacer}
                        onRehacer={onRehacer}
                        estiloBase={{ fuente: enEdicion.estilo?.fuente ?? estiloBase.fuente, color: enEdicion.estilo?.color ?? estiloBase.color, alineacion: enEdicion.estilo?.alineacion }}
                        estiloArea={{ background: fondoCssDe(enEdicion.estilo?.fondo ?? efectivo.fondo), color: colorTextoSobre(enEdicion.estilo?.fondo ?? efectivo.fondo) }}
                        className="min-h-0 flex-1"
                    />
                </div>
            )}
        </div>
    );
}
