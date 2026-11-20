"use client";

import { useEffect, useState } from "react";
import { Check, Palette, Users } from "lucide-react";
import {
    PALETA_SELECCION_USUARIOS,
    aplicarSeleccionEnDocumento,
    estiloSeleccionUsuario,
    guardarPreferenciaSeleccion,
    hexDePreferencia,
    leerPreferenciaSeleccion,
    type PreferenciaSeleccion,
} from "@/lib/seleccion/colores-seleccion";
import { CapaSeleccionCompartida } from "@/components/seleccion/capa-seleccion-compartida";

export interface SelectorColorSeleccionProps {
    alCambiar?: (pref: PreferenciaSeleccion) => void;
}

const DEMO_PARTICIPANTES = [
    { id: "maggasukha", nombre: "Alex (tú)" },
    { id: "hermes", nombre: "Hermes" },
    { id: "oracle-a1", nombre: "Oracle A1" },
    { id: "transmision", nombre: "Transmisión en vivo" },
    { id: "control-remoto", nombre: "Control remoto" },
];

/**
 * Selector interactivo del color de selección de texto para StarSeed OS y MetaGenesis,
 * con vista previa real seleccionable y asignación única en sesiones compartidas.
 */
export function SelectorColorSeleccion({ alCambiar }: SelectorColorSeleccionProps) {
    const [pref, setPref] = useState<PreferenciaSeleccion>(() => leerPreferenciaSeleccion());

    useEffect(() => {
        aplicarSeleccionEnDocumento(pref);
    }, [pref]);

    const hexActivo = hexDePreferencia(pref);
    const estilo = estiloSeleccionUsuario(hexActivo);

    const actualizar = (siguiente: PreferenciaSeleccion) => {
        const limpia = guardarPreferenciaSeleccion(siguiente);
        setPref(limpia);
        aplicarSeleccionEnDocumento(limpia);
        alCambiar?.(limpia);
    };

    return (
        <div
            data-testid="selector-color-seleccion"
            className="flex flex-col gap-4 rounded-xl border border-white/10 bg-black/30 p-4 text-xs text-white"
        >
            <header className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <Palette className="h-4 w-4 text-sky-400" aria-hidden />
                    <div>
                        <h3 className="text-sm font-semibold text-white">
                            Color de selección y sesiones compartidas
                        </h3>
                        <p className="text-[11px] text-white/60">
                            Aplica al subrayar texto en StarSeed OS y MetaGenesis; cada participante recibe un color único en transmisiones, nodos, canales y control remoto.
                        </p>
                    </div>
                </div>
                <span
                    className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium"
                    style={{ backgroundColor: estilo.fondo, borderColor: estilo.borde, color: "#FFFFFF" }}
                >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: estilo.hex }} aria-hidden />
                    {estilo.hex}
                </span>
            </header>

            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Paleta de colores de selección">
                {PALETA_SELECCION_USUARIOS.map((c) => {
                    const activo = !pref.hexPersonalizado && pref.colorId === c.id;
                    return (
                        <button
                            key={c.id}
                            type="button"
                            role="radio"
                            aria-checked={activo}
                            onClick={() =>
                                actualizar({
                                    ...pref,
                                    colorId: c.id,
                                    hexPersonalizado: undefined,
                                })
                            }
                            className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                                activo
                                    ? "border-white/70 bg-white/15 font-semibold text-white"
                                    : "border-white/15 bg-white/5 text-white/75 hover:border-white/35"
                            }`}
                        >
                            <span
                                className="h-3 w-3 rounded-full border border-white/30"
                                style={{ backgroundColor: c.hex }}
                                aria-hidden
                            />
                            {c.nombre}
                            {activo ? <Check className="h-3 w-3 text-emerald-300" aria-hidden /> : null}
                        </button>
                    );
                })}
                <label className="ml-1 inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/80 hover:border-white/35">
                    <span>Personalizado</span>
                    <input
                        type="color"
                        aria-label="Color personalizado de selección"
                        value={hexActivo}
                        onChange={(e) =>
                            actualizar({
                                ...pref,
                                colorId: "personalizado",
                                hexPersonalizado: e.target.value,
                            })
                        }
                        className="h-5 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                    />
                </label>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                <input
                    type="checkbox"
                    checked={pref.unicidadCompartida}
                    onChange={(e) =>
                        actualizar({
                            ...pref,
                            unicidadCompartida: e.target.checked,
                        })
                    }
                    className="h-4 w-4 cursor-pointer accent-sky-500"
                />
                <Users className="h-3.5 w-3.5 text-emerald-400" aria-hidden />
                <span className="text-[11px] text-white/85">
                    Garantizar color único automático por usuario en sesiones compartidas, transmisiones, nodos, canales y control remoto
                </span>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-white/10 bg-[#0A0F1D] p-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                        Prueba aquí (selecciona este texto con el ratón)
                    </p>
                    <p className="select-text text-xs leading-relaxed text-slate-100">
                        Este texto usa tu color{" "}
                        <mark
                            style={{ backgroundColor: estilo.fondo, color: estilo.texto }}
                            className="rounded px-1 py-0.5 font-medium"
                        >
                            destacado activo ({estilo.hex})
                        </mark>{" "}
                        con contraste legible en modo oscuro y modo claro.
                    </p>
                </div>

                <div className="rounded-lg border border-white/10 bg-[#0A0F1D] p-3">
                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/45">
                        Vista previa de unicidad entre medios
                    </p>
                    <CapaSeleccionCompartida
                        etiquetaContexto="Malla activa"
                        compacta
                        participantes={DEMO_PARTICIPANTES.map((p) =>
                            p.id === "maggasukha" ? { ...p, colorPreferido: hexActivo } : p,
                        )}
                    />
                </div>
            </div>
        </div>
    );
}
