'use client';

// StarSeed OS — Diseños propios del Mausbot en el panel de cursor.
// Aplica src/lib/mausbot/disenos.ts: lista los propios (los de fábrica viven en la
// rejilla de cursor-fx), guarda el cursor elegido como variación y borra. Un SVG
// solo se guarda si sanearSvg (llamado por guardarDiseno) lo da por seguro.

import React, { useEffect, useState } from "react";
import { Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
    CLAVE_DISENOS, borrarDiseno, guardarDiseno, listarDisenos, type DisenoMausbot,
} from "@/lib/mausbot/disenos";
import type { CursorOption } from "./cursor-fx";

interface CursorDisenosPanelProps {
    /** El cursor elegido ahora, para marcar el diseño activo. */
    actual: CursorOption;
    /** El diseño del Mausbot activo ahora, o `null` si el cursor no es del Mausbot. */
    disenoActual: DisenoMausbot | null;
    /** La opción de cursor de un diseño propio: `mausbot-diseno-<id>`. */
    opcionDe: (idDiseno: string) => CursorOption;
    /** La vista previa (data-uri) de una opción de cursor. */
    previewDe: (opcion: CursorOption) => string | null;
    /** Elige una opción de cursor como puntero. */
    onElegir: (opcion: CursorOption) => void;
}

/** Los diseños propios del Mausbot: elegir, guardar el actual como variación y borrar. */
export function CursorDisenosPanel({ actual, disenoActual, opcionDe, previewDe, onElegir }: CursorDisenosPanelProps): React.ReactElement {
    const [propios, setPropios] = useState<DisenoMausbot[]>([]);
    const [aviso, setAviso] = useState<string | null>(null);

    const cargar = () => setPropios(listarDisenos().filter((d) => d.origen !== "fabrica"));

    // Los diseños viven en localStorage: se leen en cliente, SSR-safe como el resto del panel.
    useEffect(() => {
        cargar();
        const onStorage = (e: StorageEvent) => {
            if (e.key === null || e.key === CLAVE_DISENOS) cargar();
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const guardarActual = () => {
        if (!disenoActual) return;
        const r = guardarDiseno({ ...disenoActual, id: `propio-${Date.now().toString(36)}`, nombre: `Mi Mausbot · ${disenoActual.nombre}`, origen: "variacion" });
        setAviso(r.ok ? `Diseño propio guardado: «Mi Mausbot · ${disenoActual.nombre}».` : r.motivo);
        cargar();
    };

    const borrarPropio = (id: string, nombre: string) => {
        const r = borrarDiseno(id);
        setAviso(r.ok ? `Se borró el diseño «${nombre}».` : r.motivo);
        cargar();
    };

    return (
        <section className="space-y-2">
            <h4 className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
                Diseños propios del Mausbot
            </h4>
            <div className="flex flex-wrap items-center gap-2">
                {propios.map((d) => {
                    const opcion = opcionDe(d.id);
                    const uri = previewDe(opcion);
                    return (
                        <span
                            key={d.id}
                            className={cn(
                                "inline-flex max-w-full items-center gap-1.5 rounded-full border py-1.5 pr-1.5 pl-3 text-[11px] font-bold",
                                actual === opcion ? "border-sky-400/60 bg-sky-400/10 text-sky-200" : "border-white/10 bg-white/[0.04]",
                            )}
                        >
                            {uri && (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={uri} alt="" className="size-4 shrink-0" draggable={false} />
                            )}
                            <button
                                type="button"
                                onClick={() => onElegir(opcion)}
                                title={`Usar el diseño ${d.nombre}`}
                                className="max-w-36 cursor-pointer truncate"
                            >
                                {d.nombre}
                            </button>
                            <button
                                type="button"
                                onClick={() => borrarPropio(d.id, d.nombre)}
                                title={`Borrar el diseño ${d.nombre}`}
                                aria-label={`Borrar el diseño ${d.nombre}`}
                                className="cursor-pointer rounded-full p-0.5 text-muted-foreground hover:text-red-400"
                            >
                                <Trash2 className="size-3" />
                            </button>
                        </span>
                    );
                })}
                {propios.length === 0 && (
                    <p className="text-[11px] text-muted-foreground">Aún no tienes diseños propios: guarda el actual o crea uno en la Protomolécula.</p>
                )}
            </div>
            <button
                type="button"
                onClick={guardarActual}
                disabled={!disenoActual}
                title="Guarda el diseño actual del Mausbot como uno propio tuyo"
                className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition-all cursor-pointer",
                    disenoActual ? "border-sky-400/50 bg-sky-400/10 text-sky-200 hover:bg-sky-400/20" : "border-white/10 bg-white/[0.03] text-muted-foreground",
                )}
            >
                <Save className="size-3.5" /> Guardar el cursor actual como diseño propio
            </button>
            {aviso && <p className="text-[11px] text-muted-foreground">{aviso}</p>}
        </section>
    );
}
