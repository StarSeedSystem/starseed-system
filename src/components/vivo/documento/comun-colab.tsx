"use client";

/**
 * Piezas comunes de las apps colaborativas L2 (Documento y Presentación): estado de guardado,
 * avatares de presencia, menú vertical de acciones, pantallas de estado, avisos de «X también
 * editó…», versiones automáticas y descargas. Lenguaje visual del OS: cristal oscuro, píldoras
 * fantasma, lucide, transiciones de 150–300 ms.
 */

import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
    AlertTriangle,
    ArrowLeft,
    Check,
    CloudOff,
    Eye,
    Loader2,
    Lock,
    MoreHorizontal,
    Radio,
    RefreshCw,
    type LucideIcon,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { iniciales } from "@/lib/vivo/doc-colaborativo/modelo";
import type { EstadoGuardado, Presente, SalaColaborativa } from "@/lib/vivo/doc-colaborativo/motor";
import { guardarVersion } from "@/lib/vivo/doc-colaborativo/versiones";

// ───────────────────────────── Botones ─────────────────────────────

export function BotonIcono({
    etiqueta,
    onClick,
    disabled,
    activo,
    children,
    className,
}: {
    etiqueta: string;
    onClick?: () => void;
    disabled?: boolean;
    activo?: boolean;
    children: ReactNode;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={etiqueta}
            title={etiqueta}
            aria-pressed={activo}
            className={cn(
                "ss-redondo grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-full text-white/80 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF] disabled:cursor-not-allowed disabled:opacity-35",
                activo && "bg-[#7C5CFF]/25 text-white shadow-[inset_0_0_0_1px_#7C5CFF99]",
                className,
            )}
        >
            {children}
        </button>
    );
}

/** Píldora de acción con texto completo (principal o fantasma). */
export function BotonPildora({
    children,
    onClick,
    color = "#7C5CFF",
    principal,
    disabled,
    etiqueta,
    className,
}: {
    children: ReactNode;
    onClick?: () => void;
    color?: string;
    principal?: boolean;
    disabled?: boolean;
    etiqueta?: string;
    className?: string;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            aria-label={etiqueta}
            className={cn(
                "ss-redondo inline-flex min-h-10 flex-none cursor-pointer items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold text-white transition-[transform,background-color,box-shadow] duration-200 hover:scale-[1.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100",
                className,
            )}
            style={
                principal
                    ? { background: color, boxShadow: `0 6px 18px ${color}55`, outlineColor: color }
                    : { background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66`, outlineColor: color }
            }
        >
            {children}
        </button>
    );
}

export function EnlaceVolver({ href, etiqueta }: { href: string; etiqueta: string }) {
    return (
        <Link
            href={href}
            aria-label={etiqueta}
            title={etiqueta}
            className="ss-redondo grid h-10 w-10 flex-none cursor-pointer place-items-center rounded-full text-white/75 transition-colors duration-200 hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]"
        >
            <ArrowLeft className="h-[18px] w-[18px]" aria-hidden="true" />
        </Link>
    );
}

// ───────────────────────────── Estado de guardado ─────────────────────────────

const ESTADOS: Record<EstadoGuardado | "lectura", { texto: string; color: string; icono: LucideIcon; gira?: boolean }> = {
    guardado: { texto: "Guardado", color: "#10B981", icono: Check },
    pendiente: { texto: "Guardando…", color: "#007FFF", icono: Loader2, gira: true },
    guardando: { texto: "Guardando…", color: "#007FFF", icono: Loader2, gira: true },
    "sin-conexion": { texto: "Sin conexión · reintentando", color: "#FFBF00", icono: CloudOff },
    "sin-permiso": { texto: "Solo lectura", color: "#94A3B8", icono: Lock },
    error: { texto: "No se pudo guardar", color: "#DC143C", icono: AlertTriangle },
    lectura: { texto: "Solo lectura", color: "#14B8A6", icono: Eye },
};

export function EstadoGuardadoChip({ guardado, puedeEditar, conectado }: { guardado: EstadoGuardado; puedeEditar: boolean; conectado: boolean }) {
    const e = ESTADOS[!puedeEditar && guardado !== "sin-permiso" ? "lectura" : guardado];
    const Icono = e.icono;
    return (
        <div className="flex flex-none items-center gap-1.5" role="status" aria-live="polite">
            <span
                className="ss-redondo inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[12px] font-semibold text-white/90"
                style={{ background: `${e.color}1f`, boxShadow: `inset 0 0 0 1px ${e.color}66` }}
            >
                <Icono className={cn("h-3.5 w-3.5", e.gira && "animate-spin motion-reduce:animate-none")} style={{ color: e.color }} aria-hidden="true" />
                {e.texto}
            </span>
            <span
                className="ss-redondo hidden min-h-8 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium text-white/65 sm:inline-flex"
                title={conectado ? "Conectado en tiempo real con los demás" : "Conectando con los demás…"}
            >
                <Radio className="h-3.5 w-3.5" style={{ color: conectado ? "#39FF14" : "#FFBF00" }} aria-hidden="true" />
                {conectado ? "En vivo" : "Conectando…"}
            </span>
        </div>
    );
}

// ───────────────────────────── Presencia ─────────────────────────────

/** Una persona una vez (aunque tenga dos pestañas abiertas). */
export function personasUnicas(presentes: Presente[]): Presente[] {
    const vistos = new Map<string, Presente>();
    for (const p of presentes) {
        const clave = p.uid ?? p.clave;
        const previo = vistos.get(clave);
        if (!previo || (p.modo === "editar" && previo.modo !== "editar")) vistos.set(clave, p);
    }
    return [...vistos.values()];
}

export function AvatarPersona({ p, tamano = 32 }: { p: Pick<Presente, "nombre" | "color">; tamano?: number }) {
    return (
        <span
            className="grid flex-none place-items-center rounded-full font-semibold text-[#0b0d1a]"
            style={{ width: tamano, height: tamano, fontSize: Math.round(tamano * 0.38), background: p.color, boxShadow: "0 0 0 2px rgba(12,14,34,.95)" }}
            aria-hidden="true"
        >
            {iniciales(p.nombre)}
        </span>
    );
}

export function AvataresPresencia({ presentes, max = 4, describir }: { presentes: Presente[]; max?: number; describir?: (p: Presente) => string | null }) {
    const personas = personasUnicas(presentes);
    if (!personas.length) {
        return <span className="hidden text-[12px] text-white/50 md:inline">Solo tú por ahora</span>;
    }
    const visibles = personas.slice(0, max);
    const resto = personas.length - visibles.length;
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    className="ss-redondo flex flex-none cursor-pointer items-center rounded-full py-1 pl-1 pr-2 transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]"
                    aria-label={`${personas.length === 1 ? "1 persona más" : `${personas.length} personas más`} aquí: ${personas.map((p) => p.nombre).join(", ")}`}
                >
                    <span className="flex -space-x-2">
                        {visibles.map((p) => (
                            <AvatarPersona key={p.clave} p={p} />
                        ))}
                    </span>
                    {resto > 0 && <span className="ml-1.5 text-[12px] font-semibold text-white/75">+{resto}</span>}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="z-[130] w-[min(300px,90vw)] rounded-[18px] border-white/10 bg-[rgba(12,14,34,.94)] p-2 text-white backdrop-blur-xl">
                <p className="px-2 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">Aquí ahora</p>
                <ul className="space-y-0.5" role="list">
                    {personas.map((p) => {
                        const donde = describir?.(p);
                        return (
                            <li key={p.clave} className="flex items-center gap-3 rounded-[14px] px-2 py-2">
                                <AvatarPersona p={p} tamano={30} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-semibold">{p.nombre}</span>
                                    <span className="block truncate text-[12px] text-white/60">
                                        {p.presentando ? "Presentando" : p.modo === "editar" ? "Puede editar" : "Mirando"}
                                        {donde ? ` · ${donde}` : ""}
                                    </span>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            </PopoverContent>
        </Popover>
    );
}

// ───────────────────────────── Menú vertical ─────────────────────────────

export function MenuAcciones({ etiqueta = "Más acciones", children, texto = "Más" }: { etiqueta?: string; children: ReactNode; texto?: string }) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <button
                    type="button"
                    aria-label={etiqueta}
                    title={etiqueta}
                    className="ss-redondo inline-flex min-h-10 flex-none cursor-pointer items-center gap-2 rounded-full px-3.5 text-[13.5px] font-semibold text-white/85 shadow-[inset_0_0_0_1px_rgba(255,255,255,.14)] transition-colors duration-200 hover:bg-white/[0.07] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF]"
                >
                    <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                    {texto}
                </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="z-[130] max-h-[70dvh] w-[min(320px,92vw)] overflow-y-auto rounded-[20px] border-white/10 bg-[rgba(12,14,34,.95)] p-1.5 text-white backdrop-blur-xl">
                <div role="menu" aria-label={etiqueta} className="flex flex-col gap-0.5">
                    {children}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export function FilaMenu({
    icono: Icono,
    etiqueta,
    ayuda,
    onClick,
    disabled,
    color = "#7C5CFF",
    peligro,
}: {
    icono: LucideIcon;
    etiqueta: string;
    ayuda?: string;
    onClick: () => void;
    disabled?: boolean;
    color?: string;
    peligro?: boolean;
}) {
    const c = peligro ? "#DC143C" : color;
    return (
        <button
            type="button"
            role="menuitem"
            onClick={onClick}
            disabled={disabled}
            className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-[14px] px-2.5 py-2 text-left transition-colors duration-200 hover:bg-white/[0.06] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#7C5CFF] disabled:cursor-not-allowed disabled:opacity-45"
        >
            <span aria-hidden="true" className="ss-redondo grid h-8 w-8 flex-none place-items-center rounded-full" style={{ background: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}66`, color: c }}>
                <Icono className="h-4 w-4" />
            </span>
            <span className="min-w-0">
                <span className={cn("block text-[14px] font-semibold", peligro ? "text-[#fda4af]" : "text-white")}>{etiqueta}</span>
                {ayuda && <span className="block text-[12px] text-white/60">{ayuda}</span>}
            </span>
        </button>
    );
}

// ───────────────────────────── Pantallas de estado ─────────────────────────────

export function PantallaEstado({
    icono: Icono,
    color = "#7C5CFF",
    titulo,
    texto,
    children,
    cargando,
}: {
    icono: LucideIcon;
    color?: string;
    titulo: string;
    texto?: string;
    children?: ReactNode;
    cargando?: boolean;
}) {
    return (
        <div className="grid min-h-[calc(100dvh-8rem)] place-items-center px-4 py-10 text-white">
            <div
                className="w-full max-w-md rounded-[24px] border border-white/[0.08] bg-[rgba(12,14,34,.55)] p-7 text-center shadow-[inset_0_1px_0_rgba(255,255,255,.06)] backdrop-blur-[20px] backdrop-saturate-[1.4]"
                role={cargando ? "status" : "alert"}
            >
                <span className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[18px]" style={{ background: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}66` }} aria-hidden="true">
                    <Icono className={cn("h-6 w-6", cargando && "animate-spin motion-reduce:animate-none")} style={{ color }} />
                </span>
                <h1 className="text-[18px] font-semibold">{titulo}</h1>
                {texto && <p className="mt-2 text-[14px] leading-relaxed text-white/65">{texto}</p>}
                {children && <div className="mt-5 flex flex-wrap justify-center gap-2">{children}</div>}
            </div>
        </div>
    );
}

export function BotonReintentar({ onClick }: { onClick: () => void }) {
    return (
        <BotonPildora onClick={onClick} principal>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar
        </BotonPildora>
    );
}

export function AvisoError({ texto, onCerrar }: { texto: string; onCerrar?: () => void }) {
    return (
        <div role="alert" className="flex items-start gap-3 rounded-[16px] bg-[#DC143C]/15 px-4 py-3 text-[13.5px] text-[#fecdd3] shadow-[inset_0_0_0_1px_#DC143C66]">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[#fda4af]" aria-hidden="true" />
            <span className="flex-1">{texto}</span>
            {onCerrar && (
                <button type="button" onClick={onCerrar} className="flex-none cursor-pointer text-[12.5px] font-semibold text-white/80 hover:text-white">
                    Entendido
                </button>
            )}
        </div>
    );
}

// ───────────────────────────── Avisos de conflicto ─────────────────────────────

/** «Ana también editó este párrafo» — suave, sin bloquear, uno cada pocos segundos por unidad. */
export function useAvisosConflicto<P, M>(sala: SalaColaborativa<P, M> | null, describir: (unidadId: string) => string) {
    const describirRef = useRef(describir);
    describirRef.current = describir;
    useEffect(() => {
        if (!sala) return;
        return sala.alConflicto((c) => {
            const que = describirRef.current(c.unidadId);
            toast.message(`${c.autorNombre} también editó ${que}`, {
                description: c.ganaRemoto
                    ? "Se ha quedado su versión, que es la más reciente. Si falta algo tuyo, lo tienes en el historial de versiones."
                    : "Se ha mantenido tu versión, que es la más reciente.",
                duration: 5000,
            });
        });
    }, [sala]);
}

// ───────────────────────────── Versiones automáticas ─────────────────────────────

const CADA_MS = 5 * 60 * 1000;

/**
 * Cada 5 minutos con cambios tuyos se guarda una versión automática (y otra al salir si hubo
 * cambios). `marcarCambio` se llama en cada edición local.
 */
export function useVersionesAutomaticas(opciones: {
    espacioId: string | null;
    activo: boolean;
    contenido: () => unknown;
    resumen: () => string;
    autorNombre: string | null;
}): { marcarCambio: () => void } {
    const ref = useRef(opciones);
    ref.current = opciones;
    const cambios = useRef(0);
    const ultima = useRef(Date.now());

    useEffect(() => {
        if (!opciones.activo || !opciones.espacioId) return;
        const guardar = () => {
            const o = ref.current;
            if (!o.espacioId || cambios.current === 0) return;
            cambios.current = 0;
            ultima.current = Date.now();
            void guardarVersion(o.espacioId, { contenido: o.contenido(), motivo: "auto", resumen: o.resumen(), autorNombre: o.autorNombre });
        };
        const t = setInterval(() => {
            if (Date.now() - ultima.current >= CADA_MS) guardar();
        }, 60_000);
        return () => {
            clearInterval(t);
            guardar();
        };
    }, [opciones.activo, opciones.espacioId]);

    const marcarCambio = useCallback(() => {
        cambios.current += 1;
    }, []);
    return useMemo(() => ({ marcarCambio }), [marcarCambio]);
}

// ───────────────────────────── Descargas ─────────────────────────────

export function descargarArchivo(nombre: string, contenido: string, mime: string): void {
    try {
        const url = URL.createObjectURL(new Blob([contenido], { type: `${mime};charset=utf-8` }));
        const a = document.createElement("a");
        a.href = url;
        a.download = nombre;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch {
        toast.error("No se pudo descargar el archivo en este navegador.");
    }
}

export async function copiarEnlace(ruta: string): Promise<void> {
    const url = typeof window !== "undefined" ? `${window.location.origin}${ruta}` : ruta;
    try {
        await navigator.clipboard.writeText(url);
        toast.success("Enlace copiado", { description: "Solo lo abre quien tenga acceso (invitación o enlace público)." });
    } catch {
        toast.message("Enlace", { description: url });
    }
}
