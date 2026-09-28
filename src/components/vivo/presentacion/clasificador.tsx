"use client";

/**
 * Clasificador de diapositivas: miniaturas numeradas, quién está en cada una, nueva diapositiva
 * con diseño, y por diapositiva un menú vertical (duplicar, subir, bajar, eliminar). En escritorio
 * también se reordena arrastrando; con teclado, Alt+↑/↓ mueve la diapositiva elegida.
 * Rejilla que se parte en filas en el móvil (nunca una tira que se desliza de lado).
 */

import { memo, useState, type DragEvent, type KeyboardEvent } from "react";
import { ArrowDown, ArrowUp, Copy, LayoutTemplate, MoreVertical, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { EstiloMensaje } from "@/lib/mensajeria/formato-tipos";
import { cn } from "@/lib/utils";
import type { UnidadColab } from "@/lib/vivo/doc-colaborativo/modelo";
import type { Presente } from "@/lib/vivo/doc-colaborativo/motor";
import { DISENOS_DIAPOSITIVA, lienzoEfectivo, textoDeDiapositiva, type Diapositiva, type DisenoDiapositiva, type MetaPresentacion } from "@/lib/vivo/presentacion";
import { FilaMenu } from "@/components/vivo/documento/comun-colab";
import { VistaDiapositiva } from "./vista-diapositiva";
import styles from "./presentacion.module.css";

export interface ClasificadorProps {
    unidades: UnidadColab<Diapositiva>[];
    meta: MetaPresentacion;
    estiloBase: EstiloMensaje;
    seleccionada: string | null;
    onSeleccionar: (id: string) => void;
    puedeEditar: boolean;
    onNueva: (diseno: DisenoDiapositiva) => void;
    onDuplicar: (id: string) => void;
    onBorrar: (id: string) => void;
    /** Mover a la posición `destino` (índice en la lista sin la propia diapositiva). */
    onMover: (id: string, destino: number) => void;
    presentes: Presente[];
    className?: string;
}

export function MenuNuevaDiapositiva({ onNueva, className, texto = "Nueva diapositiva" }: { onNueva: (d: DisenoDiapositiva) => void; className?: string; texto?: string }) {
    const [abierto, setAbierto] = useState(false);
    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className={cn(
                        "ss-redondo inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-full bg-[#F43F5E] px-4 text-[13.5px] font-semibold text-white shadow-[0_6px_18px_#F43F5E55] transition-transform duration-200 hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F43F5E]",
                        className,
                    )}
                >
                    <Plus className="h-4 w-4" aria-hidden="true" /> {texto}
                </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="z-[130] w-[min(300px,90vw)] rounded-[20px] border-white/10 bg-[rgba(12,14,34,.95)] p-1.5 text-white backdrop-blur-xl">
                <div role="menu" aria-label="Diseño de la diapositiva nueva" className="flex flex-col gap-0.5">
                    {DISENOS_DIAPOSITIVA.map((d) => (
                        <FilaMenu
                            key={d.id}
                            icono={LayoutTemplate}
                            etiqueta={d.nombre}
                            ayuda={d.ayuda}
                            color="#F43F5E"
                            onClick={() => {
                                setAbierto(false);
                                onNueva(d.id);
                            }}
                        />
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}

function MenuDiapositiva({ numero, total, onDuplicar, onSubir, onBajar, onBorrar }: { numero: number; total: number; onDuplicar: () => void; onSubir: () => void; onBajar: () => void; onBorrar: () => void }) {
    const [abierto, setAbierto] = useState(false);
    const hacer = (f: () => void) => () => {
        setAbierto(false);
        f();
    };
    return (
        <Popover open={abierto} onOpenChange={setAbierto}>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={`Opciones de la diapositiva ${numero}`}
                    title="Opciones"
                    className="ss-redondo grid h-9 w-9 flex-none cursor-pointer place-items-center rounded-full text-white/70 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]"
                >
                    <MoreVertical className="h-4 w-4" aria-hidden="true" />
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="z-[130] w-[min(260px,88vw)] rounded-[20px] border-white/10 bg-[rgba(12,14,34,.95)] p-1.5 text-white backdrop-blur-xl">
                <div role="menu" aria-label={`Diapositiva ${numero}`} className="flex flex-col gap-0.5">
                    <FilaMenu icono={Copy} etiqueta="Duplicar" onClick={hacer(onDuplicar)} />
                    <FilaMenu icono={ArrowUp} etiqueta="Subir" onClick={hacer(onSubir)} disabled={numero <= 1} color="#007FFF" />
                    <FilaMenu icono={ArrowDown} etiqueta="Bajar" onClick={hacer(onBajar)} disabled={numero >= total} color="#007FFF" />
                    <FilaMenu icono={Trash2} etiqueta="Eliminar" onClick={hacer(onBorrar)} peligro />
                </div>
            </PopoverContent>
        </Popover>
    );
}

/** Miniatura memorizada: solo se repinta si cambia ESA diapositiva (no a cada tecla en otra). */
const Miniatura = memo(function Miniatura({ datos, meta, estiloBase }: { datos: Diapositiva; meta: MetaPresentacion; estiloBase: EstiloMensaje }) {
    return <VistaDiapositiva lienzo={lienzoEfectivo(datos, meta)} estiloBase={estiloBase} miniatura radio={10} />;
});

export function Clasificador({ unidades, meta, estiloBase, seleccionada, onSeleccionar, puedeEditar, onNueva, onDuplicar, onBorrar, onMover, presentes, className }: ClasificadorProps) {
    const [arrastrada, setArrastrada] = useState<string | null>(null);
    const [destino, setDestino] = useState<{ id: string; antes: boolean } | null>(null);

    const soltar = (e: DragEvent, id: string) => {
        e.preventDefault();
        const origen = arrastrada;
        setArrastrada(null);
        setDestino(null);
        if (!origen || origen === id) return;
        const sin = unidades.filter((u) => u.id !== origen);
        const idx = sin.findIndex((u) => u.id === id);
        if (idx < 0) return;
        onMover(origen, destino?.antes ? idx : idx + 1);
    };

    const teclas = (e: KeyboardEvent, i: number, id: string) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const delta = e.key === "ArrowUp" ? -1 : 1;
        if (e.altKey && puedeEditar) {
            const nuevo = Math.max(0, Math.min(unidades.length - 1, i + delta));
            if (nuevo !== i) onMover(id, nuevo);
            return;
        }
        const vecina = unidades[i + delta];
        if (vecina) {
            onSeleccionar(vecina.id);
            (e.currentTarget.closest("ol")?.querySelector<HTMLButtonElement>(`[data-diapositiva-id="${vecina.id}"]`) ?? null)?.focus();
        }
    };

    return (
        <div className={cn("flex min-h-0 flex-col gap-2.5", className)}>
            <div className="flex items-center justify-between gap-2 px-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                    Diapositivas · {unidades.length}
                </p>
            </div>
            {puedeEditar && <MenuNuevaDiapositiva onNueva={onNueva} className="w-full" />}
            <ol className="grid min-h-0 grid-cols-2 gap-2.5 overflow-y-auto p-0.5 sm:grid-cols-3 lg:grid-cols-1" role="list" aria-label="Diapositivas (Alt + flechas para moverlas)">
                {unidades.map((u, i) => {
                    const d = u.datos!;
                    const activa = u.id === seleccionada;
                    const aqui = presentes.filter((p) => p.unidad === u.id || p.presentando?.id === u.id);
                    const texto = textoDeDiapositiva(d);
                    return (
                        <li
                            key={u.id}
                            draggable={puedeEditar}
                            onDragStart={(e) => {
                                setArrastrada(u.id);
                                e.dataTransfer.effectAllowed = "move";
                                e.dataTransfer.setData("text/plain", u.id);
                            }}
                            onDragOver={(e) => {
                                if (!arrastrada) return;
                                e.preventDefault();
                                const r = e.currentTarget.getBoundingClientRect();
                                setDestino({ id: u.id, antes: e.clientY < r.top + r.height / 2 });
                            }}
                            onDragLeave={() => setDestino((d0) => (d0?.id === u.id ? null : d0))}
                            onDrop={(e) => soltar(e, u.id)}
                            onDragEnd={() => {
                                setArrastrada(null);
                                setDestino(null);
                            }}
                            className={cn(
                                "rounded-[16px]",
                                arrastrada === u.id && styles.arrastrando,
                                destino?.id === u.id && (destino.antes ? styles.destinoAntes : styles.destinoDespues),
                            )}
                        >
                            <div
                                className={cn(
                                    styles.miniatura,
                                    "relative rounded-[16px] p-1.5",
                                    activa ? "bg-[#7C5CFF]/[0.16] shadow-[inset_0_0_0_1.5px_#7C5CFF]" : "bg-white/[0.03] shadow-[inset_0_0_0_1px_rgba(255,255,255,.07)]",
                                )}
                            >
                                <button
                                    type="button"
                                    data-diapositiva-id={u.id}
                                    onClick={() => onSeleccionar(u.id)}
                                    onKeyDown={(e) => teclas(e, i, u.id)}
                                    aria-current={activa ? "true" : undefined}
                                    aria-label={`Diapositiva ${i + 1}${texto ? `: ${texto.slice(0, 80)}` : ""}`}
                                    className="block w-full cursor-pointer rounded-[12px] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]"
                                >
                                    <Miniatura datos={d} meta={meta} estiloBase={estiloBase} />
                                </button>
                                <div className="flex items-center gap-2 px-1 pt-1.5">
                                    <span className={cn("text-[12px] font-semibold tabular-nums", activa ? "text-white" : "text-white/65")}>{i + 1}</span>
                                    <span className="flex min-w-0 flex-1 -space-x-1" aria-label={aqui.length ? `Aquí: ${aqui.map((p) => p.nombre).join(", ")}` : undefined}>
                                        {aqui.slice(0, 4).map((p) => (
                                            <span key={p.clave} title={p.nombre} className="h-2.5 w-2.5 rounded-full shadow-[0_0_0_1.5px_rgba(12,14,34,.95)]" style={{ background: p.color }} />
                                        ))}
                                    </span>
                                    {puedeEditar && (
                                        <MenuDiapositiva
                                            numero={i + 1}
                                            total={unidades.length}
                                            onDuplicar={() => onDuplicar(u.id)}
                                            onSubir={() => onMover(u.id, i - 1)}
                                            onBajar={() => onMover(u.id, i + 1)}
                                            onBorrar={() => onBorrar(u.id)}
                                        />
                                    )}
                                </div>
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
