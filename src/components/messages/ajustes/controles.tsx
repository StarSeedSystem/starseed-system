"use client";

/**
 * Piezas de los Ajustes de Mensajería (2026-09-28): tarjetas de cristal, filas con interruptor,
 * grupos de opciones con etiqueta completa y notas. Accesibles con teclado y lector de pantalla
 * (radiogrupos con flechas, interruptores con su etiqueta enlazada).
 */

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { ACENTO, CLASE_ROTULO, pildoraFantasma } from "@/components/messages/marco/estilos";

export function Bloque({ titulo, descripcion, children, className }: { titulo: string; descripcion?: string; children: ReactNode; className?: string }) {
    return (
        <section className={cn("space-y-2.5", className)}>
            <div className="px-1">
                <h3 className={CLASE_ROTULO}>{titulo}</h3>
                {descripcion && <p className="mt-1 text-[12px] leading-relaxed text-white/55">{descripcion}</p>}
            </div>
            <div className="divide-y divide-white/[0.06] overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
                {children}
            </div>
        </section>
    );
}

export function Fila({ etiqueta, detalle, children, htmlFor, apilada }: { etiqueta: ReactNode; detalle?: ReactNode; children?: ReactNode; htmlFor?: string; apilada?: boolean }) {
    return (
        <div className={cn("flex gap-3 px-4 py-3.5", apilada ? "flex-col" : "items-center justify-between")}>
            <div className="min-w-0 flex-1">
                {htmlFor ? (
                    <label htmlFor={htmlFor} className="block cursor-pointer text-[14px] font-medium text-white/90">
                        {etiqueta}
                    </label>
                ) : (
                    <p className="text-[14px] font-medium text-white/90">{etiqueta}</p>
                )}
                {detalle && <p className="mt-0.5 text-[12px] leading-relaxed text-white/55">{detalle}</p>}
            </div>
            {children}
        </div>
    );
}

export function FilaInterruptor({
    etiqueta,
    detalle,
    checked,
    onChange,
    disabled,
}: {
    etiqueta: string;
    detalle?: ReactNode;
    checked: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
}) {
    const id = useId();
    return (
        <Fila etiqueta={etiqueta} detalle={detalle} htmlFor={id}>
            <Switch
                id={id}
                checked={checked}
                onCheckedChange={onChange}
                disabled={disabled}
                aria-label={etiqueta}
                className="ss-redondo shrink-0 data-[state=checked]:bg-[#7C5CFF] data-[state=unchecked]:bg-white/15"
            />
        </Fila>
    );
}

export interface OpcionGrupo<T extends string> {
    id: T;
    etiqueta: string;
    detalle?: string;
}

/** Grupo de opciones excluyentes: pastillas con la etiqueta completa, que saltan de línea. */
export function GrupoOpciones<T extends string>({
    etiqueta,
    valor,
    opciones,
    onChange,
    color = ACENTO.mensajes,
    className,
}: {
    etiqueta: string;
    valor: T;
    opciones: OpcionGrupo<T>[];
    onChange: (v: T) => void;
    color?: string;
    className?: string;
}) {
    const refs = useRef<(HTMLButtonElement | null)[]>([]);
    const mover = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
        const delta = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!delta) return;
        e.preventDefault();
        const j = (i + delta + opciones.length) % opciones.length;
        refs.current[j]?.focus();
        onChange(opciones[j].id);
    };
    return (
        <div role="radiogroup" aria-label={etiqueta} className={cn("flex flex-wrap gap-1.5", className)}>
            {opciones.map((o, i) => {
                const activa = o.id === valor;
                return (
                    <button
                        key={o.id}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={activa}
                        tabIndex={activa ? 0 : -1}
                        title={o.detalle}
                        onClick={() => onChange(o.id)}
                        onKeyDown={(e) => mover(e, i)}
                        className={cn(
                            "ss-redondo cursor-pointer rounded-full px-3 py-1.5 text-[13px] font-medium transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                            activa ? "text-white" : "text-white/65 hover:text-white",
                        )}
                        style={{ ...pildoraFantasma(color, activa), outlineColor: color }}
                    >
                        {o.etiqueta}
                    </button>
                );
            })}
        </div>
    );
}

export function FilaOpciones<T extends string>(props: {
    etiqueta: string;
    detalle?: ReactNode;
    valor: T;
    opciones: OpcionGrupo<T>[];
    onChange: (v: T) => void;
    color?: string;
}) {
    return (
        <Fila etiqueta={props.etiqueta} detalle={props.detalle} apilada>
            <GrupoOpciones etiqueta={props.etiqueta} valor={props.valor} opciones={props.opciones} onChange={props.onChange} color={props.color} />
        </Fila>
    );
}

export function Nota({ children, color = ACENTO.aurora }: { children: ReactNode; color?: string }) {
    return (
        <p className="rounded-xl px-3 py-2 text-[12px] leading-relaxed text-white/70" style={{ background: `${color}14`, boxShadow: `inset 0 0 0 1px ${color}33` }}>
            {children}
        </p>
    );
}
