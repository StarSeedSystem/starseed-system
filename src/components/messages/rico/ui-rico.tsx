"use client";

/**
 * Piezas de interfaz compartidas por el editor de mensajes, el panel de estilo y el estilo rápido:
 * secciones con rótulo, muestras de color, opciones en píldora y deslizadores accesibles.
 * Material: cristal oscuro, radios 14–16 px, acento violeta de Mensajes.
 */
import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Rotulo } from "@/components/widgets-libres/familias/comun";

export const VIOLETA = "#7C5CFF";

export const PALETA_TEXTO = [
    "#ffffff", "#e5e7eb", "#9ca3af", "#0b0d1a", "#7c5cff", "#a78bfa", "#007fff", "#14b8a6",
    "#10b981", "#39ff14", "#ffbf00", "#f59e0b", "#f43f5e", "#dc143c", "#ec4899",
];

export const PALETA_RESALTADO = ["#fde047", "#fdba74", "#86efac", "#67e8f9", "#c4b5fd", "#f9a8d4", "#7c5cff66", "#10b98166", "#f43f5e66"];

export function Seccion({ titulo, children, accion, className }: { titulo: string; children: ReactNode; accion?: ReactNode; className?: string }) {
    return (
        <section className={cn("space-y-2.5", className)}>
            <div className="flex min-h-6 items-center justify-between gap-2">
                <Rotulo>{titulo}</Rotulo>
                {accion}
            </div>
            {children}
        </section>
    );
}

/** Opción en píldora/tarjeta con estado activo visible. */
export function Opcion({
    activa,
    onClick,
    children,
    className,
    etiqueta,
    ...resto
}: {
    activa?: boolean;
    onClick: () => void;
    children: ReactNode;
    className?: string;
    etiqueta?: string;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children">) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={activa}
            aria-label={etiqueta}
            className={cn(
                "relative flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-[14px] px-3 py-2 text-[13px] font-medium text-white/85 [&>svg]:shrink-0 transition-[background-color,box-shadow,transform] duration-200 hover:bg-white/[0.07] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF] disabled:cursor-not-allowed disabled:opacity-45",
                activa ? "bg-[#7C5CFF]/[0.16] text-white shadow-[inset_0_0_0_1.5px_#7C5CFF]" : "bg-white/[0.035] shadow-[inset_0_0_0_1px_rgba(255,255,255,.08)]",
                className,
            )}
            {...resto}
        >
            {children}
        </button>
    );
}

/** Muestras de color + selector libre. `null` = automático / sin color. */
export function SelectorColor({
    valor,
    onChange,
    paleta = PALETA_TEXTO,
    etiquetaVacio,
    vacioActivo,
    nombre,
}: {
    valor?: string;
    onChange: (c: string | undefined) => void;
    paleta?: string[];
    /** Texto de la opción «sin color» (si se ofrece). */
    etiquetaVacio?: string;
    /** Si la opción «sin color» está elegida (por defecto: cuando no hay valor). */
    vacioActivo?: boolean;
    /** Para las etiquetas accesibles («Color del texto #fff»). */
    nombre: string;
}) {
    const id = useId();
    const personalizado = valor && !paleta.includes(valor.toLowerCase()) ? valor : undefined;
    return (
        <div className="space-y-2">
            <div className="flex flex-wrap gap-2" role="group" aria-label={nombre}>
                {paleta.map((c) => {
                    const activo = valor?.toLowerCase() === c.toLowerCase();
                    return (
                        <button
                            key={c}
                            type="button"
                            onClick={() => onChange(c)}
                            aria-label={`${nombre} ${c}`}
                            aria-pressed={activo}
                            title={c}
                            className={cn(
                                "ss-redondo relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-full transition-transform duration-200 hover:scale-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7C5CFF]",
                                activo ? "ring-2 ring-white ring-offset-2 ring-offset-[#0c0e22]" : "shadow-[inset_0_0_0_1px_rgba(255,255,255,.25)]",
                            )}
                            style={{ background: c }}
                        >
                            {activo && <Check className="h-3.5 w-3.5 mix-blend-difference" strokeWidth={3} color="#fff" aria-hidden="true" />}
                        </button>
                    );
                })}
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <label
                    htmlFor={id}
                    className={cn(
                        "ss-redondo flex min-h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-[12px] font-medium text-white/80 transition-colors duration-200 hover:bg-white/[0.07]",
                        personalizado ? "bg-[#7C5CFF]/[0.16] shadow-[inset_0_0_0_1.5px_#7C5CFF]" : "bg-white/[0.035] shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)]",
                    )}
                >
                    <span
                        className="ss-redondo h-4 w-4 rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,.35)]"
                        style={{ background: personalizado ?? "conic-gradient(#f43f5e,#ffbf00,#39ff14,#14b8a6,#007fff,#7c5cff,#f43f5e)" }}
                        aria-hidden="true"
                    />
                    Otro color
                    <input
                        id={id}
                        type="color"
                        className="sr-only"
                        value={(valor && /^#[0-9a-f]{6}$/i.test(valor) ? valor : "#7c5cff").toLowerCase()}
                        onChange={(e) => onChange(e.target.value)}
                        aria-label={`${nombre}: elegir otro color`}
                    />
                </label>
                {etiquetaVacio && (
                    <button
                        type="button"
                        onClick={() => onChange(undefined)}
                        aria-pressed={vacioActivo ?? !valor}
                        className={cn(
                            "ss-redondo min-h-9 cursor-pointer rounded-full px-3 text-[12px] font-medium text-white/80 transition-colors duration-200 hover:bg-white/[0.07]",
                            (vacioActivo ?? !valor) ? "bg-[#7C5CFF]/[0.16] shadow-[inset_0_0_0_1.5px_#7C5CFF]" : "bg-white/[0.035] shadow-[inset_0_0_0_1px_rgba(255,255,255,.1)]",
                        )}
                    >
                        {etiquetaVacio}
                    </button>
                )}
            </div>
        </div>
    );
}

/** Deslizador nativo (accesible y táctil) con su valor a la vista. */
export function Deslizador({
    etiqueta,
    valor,
    min,
    max,
    paso = 1,
    unidad = "",
    onChange,
}: {
    etiqueta: string;
    valor: number;
    min: number;
    max: number;
    paso?: number;
    unidad?: string;
    onChange: (v: number) => void;
}) {
    const id = useId();
    return (
        <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[12px] text-white/65">
                <label htmlFor={id}>{etiqueta}</label>
                <span className="tabular-nums text-white/85">
                    {valor}
                    {unidad}
                </span>
            </div>
            <input
                id={id}
                type="range"
                min={min}
                max={max}
                step={paso}
                value={valor}
                onChange={(e) => onChange(Number(e.target.value))}
                className="h-6 w-full cursor-pointer accent-[#7C5CFF]"
            />
        </div>
    );
}
