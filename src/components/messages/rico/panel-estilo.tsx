"use client";

/**
 * «Estilo del mensaje» — panel compartido por el editor (texto y lienzo), los elementos de texto
 * del lienzo y el estilo rápido del compositor: fuente (con su muestra), tamaño, color, marco,
 * fondo, animación de letras (con vista previa viva), animación de fondo y alineación.
 */
import { useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic } from "lucide-react";
import { cn } from "@/lib/utils";
import { ANIMACIONES_FONDO, ANIMACIONES_TEXTO } from "@/lib/mensajeria/formato";
import { FONDOS_BURBUJA, FUENTES_MENSAJE, LIMITES_FORMATO, type AnimacionTexto, type EstiloMensaje } from "@/lib/mensajeria/formato-tipos";
import { TextoRico } from "./render-doc";
import { CapaFondoAnimado } from "./render-lienzo";
import { Deslizador, Opcion, Seccion, SelectorColor } from "./ui-rico";
import styles from "./rico.module.css";

export type SeccionEstilo = "fuente" | "tamano" | "color" | "marco" | "fondo" | "animacionTexto" | "animacionFondo" | "alineacion";

export const TODAS_LAS_SECCIONES: SeccionEstilo[] = ["fuente", "tamano", "color", "marco", "fondo", "animacionTexto", "animacionFondo", "alineacion"];

/** Quita campos vacíos y los «ninguna»; `null` si no queda nada. */
export function limpiarEstilo(e: EstiloMensaje | null | undefined): EstiloMensaje | null {
    if (!e) return null;
    const out: EstiloMensaje = {};
    for (const [k, v] of Object.entries(e) as [keyof EstiloMensaje, unknown][]) {
        if (v === undefined || v === null || v === "" || v === false || v === "ninguna") continue;
        (out as Record<string, unknown>)[k] = v;
    }
    return Object.keys(out).length ? out : null;
}

function MuestraAnimacion({ id, activa, onClick }: { id: AnimacionTexto; activa: boolean; onClick: () => void }) {
    const [vuelta, setVuelta] = useState(0);
    const info = ANIMACIONES_TEXTO.find((a) => a.id === id)!;
    return (
        <Opcion
            activa={activa}
            onClick={() => {
                setVuelta((v) => v + 1);
                onClick();
            }}
            onMouseEnter={() => !info.bucle && setVuelta((v) => v + 1)}
            className="flex-col gap-1 py-2.5"
        >
            <span className="flex h-7 items-center text-[17px] font-semibold" aria-hidden="true">
                {id === "ninguna" ? <span>Hola</span> : <TextoRico key={vuelta} texto="Hola" animacion={id} colorNeon="#a78bfa" />}
            </span>
            <span className="text-[11.5px] text-white/70">{info.nombre}</span>
        </Opcion>
    );
}

export interface PanelEstiloProps {
    estilo: EstiloMensaje | null | undefined;
    onChange: (e: EstiloMensaje | null) => void;
    secciones?: SeccionEstilo[];
    /** Menos aire (popover del estilo rápido). */
    compacto?: boolean;
    /** Tamaño mostrado cuando no hay uno fijado. */
    tamanoPorDefecto?: number;
    /** Nombre del tamaño («Tamaño» o «Tamaño en el lienzo»). */
    etiquetaTamano?: string;
    className?: string;
}

export function PanelEstilo({
    estilo,
    onChange,
    secciones = TODAS_LAS_SECCIONES,
    compacto,
    tamanoPorDefecto = 15,
    etiquetaTamano = "Tamaño de letra",
    className,
}: PanelEstiloProps) {
    const e = estilo ?? {};
    const ver = (s: SeccionEstilo) => secciones.includes(s);
    const fijar = (cambio: Partial<EstiloMensaje>) => onChange(limpiarEstilo({ ...e, ...cambio }));

    return (
        <div className={cn(styles.raiz, compacto ? "space-y-5" : "space-y-6", className)}>
            {ver("fuente") && (
                <Seccion titulo="Tipografía">
                    <div className="grid grid-cols-2 gap-2">
                        {FUENTES_MENSAJE.map((f) => {
                            return (
                                <Opcion
                                    key={f.id}
                                    activa={e.fuente === f.id}
                                    onClick={() => fijar({ fuente: e.fuente === f.id ? undefined : f.id })}
                                    className="justify-start gap-2.5"
                                    etiqueta={`Fuente ${f.nombre}`}
                                >
                                    <span className="w-7 flex-none text-left text-[19px] leading-none" style={{ fontFamily: f.css }} aria-hidden="true">
                                        Aa
                                    </span>
                                    <span className="truncate text-[13px]" style={{ fontFamily: f.css }}>
                                        {f.nombre}
                                    </span>
                                </Opcion>
                            );
                        })}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <Opcion activa={!!e.negrita} onClick={() => fijar({ negrita: !e.negrita })}>
                            <Bold className="h-4 w-4" aria-hidden="true" /> Negrita
                        </Opcion>
                        <Opcion activa={!!e.cursiva} onClick={() => fijar({ cursiva: !e.cursiva })}>
                            <Italic className="h-4 w-4" aria-hidden="true" /> Cursiva
                        </Opcion>
                    </div>
                </Seccion>
            )}

            {ver("tamano") && (
                <Seccion
                    titulo={etiquetaTamano}
                    accion={
                        e.tamano !== undefined ? (
                            <button type="button" onClick={() => fijar({ tamano: undefined })} className="cursor-pointer text-[12px] font-medium text-[#b9a8ff] hover:text-white">
                                Normal
                            </button>
                        ) : undefined
                    }
                >
                    <Deslizador
                        etiqueta="Tamaño"
                        valor={e.tamano ?? tamanoPorDefecto}
                        min={LIMITES_FORMATO.tamanoMin}
                        max={LIMITES_FORMATO.tamanoMax}
                        unidad=" px"
                        onChange={(v) => fijar({ tamano: v })}
                    />
                </Seccion>
            )}

            {ver("color") && (
                <Seccion titulo="Color del texto">
                    <SelectorColor nombre="Color del texto" valor={e.color} onChange={(c) => fijar({ color: c })} etiquetaVacio="Automático" />
                </Seccion>
            )}

            {ver("marco") && (
                <Seccion titulo="Marco">
                    <SelectorColor
                        nombre="Color del marco"
                        valor={e.colorMarco}
                        onChange={(c) => fijar({ colorMarco: c, grosorMarco: c ? (e.grosorMarco ?? 2) : undefined })}
                        etiquetaVacio="Sin marco"
                    />
                    {e.colorMarco && (
                        <Deslizador etiqueta="Grosor del marco" valor={e.grosorMarco ?? 2} min={0} max={6} unidad=" px" onChange={(v) => fijar({ grosorMarco: v })} />
                    )}
                </Seccion>
            )}

            {ver("fondo") && (
                <Seccion titulo="Fondo">
                    <div className="grid grid-cols-4 gap-2">
                        {FONDOS_BURBUJA.map((f) => {
                            const activo = e.fondo === f.id;
                            return (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => fijar({ fondo: activo ? undefined : f.id })}
                                    aria-pressed={activo}
                                    aria-label={`Fondo ${f.nombre}`}
                                    className="group flex cursor-pointer flex-col items-center gap-1 focus-visible:outline-none"
                                >
                                    <span
                                        className={cn(
                                            "block h-10 w-full rounded-[12px] transition-transform duration-200 group-hover:scale-[1.04] group-focus-visible:ring-2 group-focus-visible:ring-[#7C5CFF]",
                                            activo ? "ring-2 ring-white ring-offset-2 ring-offset-[#0c0e22]" : "shadow-[inset_0_0_0_1px_rgba(255,255,255,.15)]",
                                        )}
                                        style={{ background: f.css }}
                                    />
                                    <span className="text-[11px] text-white/65">{f.nombre}</span>
                                </button>
                            );
                        })}
                    </div>
                    <SelectorColor
                        nombre="Color de fondo"
                        valor={e.fondo && e.fondo.startsWith("#") ? e.fondo : undefined}
                        onChange={(c) => fijar({ fondo: c })}
                        paleta={["#0b0d1a", "#1e1b4b", "#0f172a", "#134e4a", "#3f1d38", "#ffffff", "#fef3c7"]}
                        etiquetaVacio="Sin fondo"
                        vacioActivo={!e.fondo}
                    />
                </Seccion>
            )}

            {ver("animacionTexto") && (
                <Seccion titulo="Animación de letras">
                    <div className={cn("grid gap-2", compacto ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3")}>
                        {ANIMACIONES_TEXTO.map((a) => (
                            <MuestraAnimacion
                                key={a.id}
                                id={a.id}
                                activa={(e.animacionTexto ?? "ninguna") === a.id}
                                onClick={() => fijar({ animacionTexto: a.id === "ninguna" ? undefined : a.id })}
                            />
                        ))}
                    </div>
                </Seccion>
            )}

            {ver("animacionFondo") && (
                <Seccion titulo="Animación de fondo">
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3">
                        {ANIMACIONES_FONDO.map((a) => {
                            const activa = (e.animacionFondo ?? "ninguna") === a.id;
                            return (
                                <Opcion
                                    key={a.id}
                                    activa={activa}
                                    onClick={() => fijar({ animacionFondo: a.id === "ninguna" ? undefined : a.id })}
                                    className="flex-col gap-1.5 py-2.5"
                                >
                                    <span className="relative block h-8 w-full overflow-hidden rounded-[10px] bg-[#0b0d1a] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]" aria-hidden="true">
                                        <CapaFondoAnimado tipo={a.id} />
                                    </span>
                                    <span className="text-[11.5px] text-white/70">{a.nombre}</span>
                                </Opcion>
                            );
                        })}
                    </div>
                </Seccion>
            )}

            {ver("alineacion") && (
                <Seccion titulo="Alineación">
                    <div className="grid grid-cols-3 gap-2">
                        {(
                            [
                                { id: "izquierda", nombre: "Izquierda", Icono: AlignLeft },
                                { id: "centro", nombre: "Centro", Icono: AlignCenter },
                                { id: "derecha", nombre: "Derecha", Icono: AlignRight },
                            ] as const
                        ).map(({ id, nombre, Icono }) => (
                            <Opcion
                                key={id}
                                activa={(e.alineacion ?? "izquierda") === id}
                                onClick={() => fijar({ alineacion: id === "izquierda" ? undefined : id })}
                                className="flex-col gap-1 px-1"
                            >
                                <Icono className="h-4 w-4" aria-hidden="true" />
                                <span className="text-[11.5px]">{nombre}</span>
                            </Opcion>
                        ))}
                    </div>
                </Seccion>
            )}
        </div>
    );
}
