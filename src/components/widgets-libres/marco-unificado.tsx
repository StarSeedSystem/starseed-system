"use client";
/**
 * MarcoUnificado (Ola L6) — el MISMO material de WidgetLibre para los widgets clásicos.
 *
 * Los ocho widgets libres estrenaron un material que el dueño adoptó: vidrio oscuro recortado
 * (`rgba(12,14,34,.42)` + desenfoque solo cuando el halo es «vivo»; si no, `.58`), la luz del
 * acento arriba a la izquierda, un brillo superior y un filo blanco a 135° que se apaga en
 * diagonal. Este marco lleva ese material a los ~96 widgets restantes SIN reescribirlos: los
 * envuelve en un rectángulo redondeado, publica su acento, su tamaño y su espaciado por
 * contexto (el kit lo lee y adopta la escala de Rotulo/Pildora) y ajusta los tokens del tema
 * dentro de sí para que ninguna tarjeta clara pelee con el vidrio.
 *
 * Presupuesto: el desenfoque y el halo solo con `useNivelRender() === "pleno"`; en «eco» o
 * con movimiento reducido no hay animación de entrada. Solo `opacity`/`transform`.
 */
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useElementSize } from "@/components/dashboard/kit/use-element-size";
import {
    ContextoMarco,
    type BaseTamano,
    type ContextoMarcoUnificado,
    type EspaciadoMarco,
} from "@/components/dashboard/kit/contexto-marco";
import { claseDesdePx, type ClaseTamano } from "@/lib/widgets/forma/tamanos";
import { presupuesto, useNivelRender } from "@/lib/widgets/forma/nivel-dispositivo";
import { disenoDe, mezclar, Rotulo } from "./familias/comun";
import { conAlfa, esHex, normalizarHex, primerPlanoSobre, tripleHsl } from "./acentos-categoria";
import estilos from "./marco-unificado.module.css";

export type VarianteMarco = "cristal" | "solido" | "transparente";

// ── Espaciado por tamaño ──────────────────────────────────────────────
// Clases literales (Tailwind JIT). Cada tamaño respira distinto: en «micro» cabe un dato, en
// «xl» una escena; panorámico y torre usan el de «m» (disenoDe).

export const ESPACIADO_MARCO: Readonly<Record<BaseTamano, EspaciadoMarco>> = {
    micro: { cabecera: "gap-1.5 px-2.5 pt-2 pb-1", cuerpo: "px-2.5 pb-2.5", pie: "px-2.5 pb-2 pt-1", icono: "size-5 rounded-[8px]", iconoSvg: "size-3", radio: 16 },
    s: { cabecera: "gap-2 px-3 pt-2.5 pb-1.5", cuerpo: "px-3 pb-3", pie: "px-3 pb-2.5 pt-1.5", icono: "size-6 rounded-[9px]", iconoSvg: "size-3.5", radio: 18 },
    m: { cabecera: "gap-2.5 px-3.5 pt-3 pb-2", cuerpo: "px-3.5 pb-3.5", pie: "px-3.5 pb-3 pt-2", icono: "size-7 rounded-[10px]", iconoSvg: "size-3.5", radio: 22 },
    l: { cabecera: "gap-2.5 px-4 pt-3.5 pb-2.5", cuerpo: "px-4 pb-4", pie: "px-4 pb-3.5 pt-2", icono: "size-8 rounded-[11px]", iconoSvg: "size-4", radio: 24 },
    xl: { cabecera: "gap-3 px-5 pt-4 pb-3", cuerpo: "px-5 pb-5", pie: "px-5 pb-4 pt-2.5", icono: "size-9 rounded-[12px]", iconoSvg: "size-[18px]", radio: 26 },
};

const ORDEN_BASE: readonly BaseTamano[] = ["micro", "s", "m", "l", "xl"];

/** Espaciado de una clase; `compacto` (Ajustes → widgets compactos) baja un escalón. */
export function espaciadoDe(clase: ClaseTamano, compacto = false): EspaciadoMarco {
    const { base } = disenoDe(clase);
    const i = ORDEN_BASE.indexOf(base);
    return ESPACIADO_MARCO[ORDEN_BASE[compacto ? Math.max(0, i - 1) : i]];
}

/** Radio del marco (px) para una clase de tamaño. */
export function radioDe(clase: ClaseTamano): number {
    return ESPACIADO_MARCO[disenoDe(clase).base].radio;
}

// ── Material ──────────────────────────────────────────────────────────

export interface OpcionesMaterial {
    acento: string;
    acento2: string;
    /** Halo «vivo» (dispositivo pleno): vidrio más fino + desenfoque + halo. */
    vivo: boolean;
    variante?: VarianteMarco;
    /** Intensidad de la luz del acento, 0-1. */
    intensidad?: number;
}

/** Estilo del material (fondo en capas + desenfoque + sombra). Puro: se prueba sin DOM. */
export function estiloMaterial({ acento, acento2, vivo, variante = "cristal", intensidad = 0.5 }: OpcionesMaterial): React.CSSProperties {
    if (variante === "transparente") return { background: "transparent" };
    const cuerpo = Math.max(0, Math.min(1, intensidad));
    const solido = variante === "solido";
    const vidrio = solido ? "rgba(12,14,34,.86)" : vivo ? "rgba(12,14,34,.42)" : "rgba(12,14,34,.58)";
    const luz = `radial-gradient(75% 75% at 20% 15%, ${conAlfa(acento, 0.1 + 0.22 * cuerpo)} 0%, ${conAlfa(acento2, 0.05 * cuerpo)} 60%, ${conAlfa(acento2, 0)} 100%)`;
    const brillo = "linear-gradient(180deg, rgba(255,255,255,.14) 0%, rgba(255,255,255,.02) 35%, rgba(255,255,255,0) 100%)";
    const desenfoque = vivo && !solido ? "blur(22px) saturate(140%)" : undefined;
    return {
        background: `${brillo}, ${luz}, ${vidrio}`,
        backdropFilter: desenfoque,
        WebkitBackdropFilter: desenfoque,
        boxShadow: vivo
            ? `0 0 32px -6px ${conAlfa(acento, 0.22)}, 0 16px 36px -22px rgba(0,0,0,.65)`
            : "0 12px 28px -20px rgba(0,0,0,.55)",
    };
}

// ── Cabecera común ────────────────────────────────────────────────────

export interface CabeceraMarcoProps {
    titulo: string;
    subtitulo?: string;
    /** Componente lucide o un icono ya creado (`<Sun />`). */
    icono?: LucideIcon | React.ReactElement;
    /** Controles a la derecha: se pintan como pastillas fantasma del acento. */
    acciones?: React.ReactNode;
    vivo?: boolean;
    acento: string;
    base: BaseTamano;
    horizontal?: boolean;
    espaciado: EspaciadoMarco;
    className?: string;
}

/**
 * Icono + título en Rotulo + acciones como pastillas fantasma. En «micro» solo queda el icono
 * (el título sigue ahí para lectores de pantalla); el subtítulo aparece de «m» en adelante.
 */
export function CabeceraMarco({ titulo, subtitulo, icono: Icono, acciones, vivo, acento, base, horizontal, espaciado, className }: CabeceraMarcoProps) {
    const micro = base === "micro";
    const conSubtitulo = !!subtitulo && (base === "l" || base === "xl" || (base === "m" && !horizontal));
    const tinta = esHex(acento) ? mezclar(normalizarHex(acento), "#ffffff", 0.35) : "#ffffff";
    return (
        <header data-cabecera-marco="" className={cn("relative z-10 flex shrink-0 items-center", espaciado.cabecera, className)}>
            {Icono && (
                <span
                    aria-hidden
                    className={cn("grid shrink-0 place-items-center", React.isValidElement(Icono) && "[&>svg]:size-[55%]", espaciado.icono)}
                    style={{ background: conAlfa(acento, 0.12), boxShadow: `inset 0 0 0 1px ${conAlfa(acento, 0.4)}`, color: tinta }}
                >
                    {React.isValidElement(Icono) ? Icono : <Icono className={espaciado.iconoSvg} strokeWidth={2} />}
                </span>
            )}
            <div className={cn("min-w-0 flex-1", micro && "sr-only")}>
                <h3 className="truncate leading-tight"><Rotulo>{titulo}</Rotulo></h3>
                {conSubtitulo && <p className="mt-0.5 truncate text-[12px] leading-tight text-white/55">{subtitulo}</p>}
            </div>
            {micro && <span aria-hidden className="flex-1" />}
            {vivo && (
                <span className="inline-flex shrink-0 items-center gap-1.5" title="En vivo">
                    <span aria-hidden className={estilos.pulso} style={{ background: acento, color: acento }} />
                    {micro ? <span className="sr-only">En vivo</span> : <Rotulo color={tinta}>En vivo</Rotulo>}
                </span>
            )}
            {acciones && !micro && <div className={cn(estilos.acciones, "flex shrink-0 items-center gap-1")}>{acciones}</div>}
        </header>
    );
}

// ── Marco ─────────────────────────────────────────────────────────────

export interface MarcoUnificadoProps {
    acento?: string;
    acento2?: string;
    /** Nombre accesible del widget (si no hay título). */
    etiqueta?: string;
    /** Cabecera propia del marco (para cuerpos que no traen la suya). */
    titulo?: string;
    subtitulo?: string;
    icono?: LucideIcon;
    acciones?: React.ReactNode;
    vivo?: boolean;
    /** Variante elegida en el engranaje del widget. */
    variante?: VarianteMarco;
    intensidad?: number;
    /** Widgets compactos (Ajustes → Apariencia): un escalón menos de aire. */
    compacto?: boolean;
    /** Aplica el espaciado del tamaño al cuerpo (por defecto, solo con cabecera propia). */
    acolchado?: boolean;
    /** La raíz del cuerpo deja ver el vidrio (fondo, borde y sombra propios fuera). */
    absorberFondo?: boolean;
    /** Metadatos para depurar y para la auditoría. */
    tipo?: string;
    familia?: string;
    className?: string;
    children: React.ReactNode | ((ctx: ContextoMarcoUnificado) => React.ReactNode);
}

const ACENTO_POR_DEFECTO = "#7c5cff";
const ACENTO2_POR_DEFECTO = "#23d5ab";

export function MarcoUnificado({
    acento = ACENTO_POR_DEFECTO, acento2 = ACENTO2_POR_DEFECTO, etiqueta, titulo, subtitulo, icono, acciones, vivo,
    variante = "cristal", intensidad = 0.5, compacto = false, acolchado, absorberFondo = true,
    tipo, familia, className, children,
}: MarcoUnificadoProps) {
    const { ref, size } = useElementSize<HTMLDivElement>();
    const nivel = useNivelRender();
    const p = presupuesto(nivel);
    const vidrioVivo = p.halo === "vivo";

    const clase = claseDesdePx(Math.round(size.width), Math.round(size.height));
    const { base, horizontal } = disenoDe(clase);
    const espaciado = espaciadoDe(clase, compacto);
    const luz = esHex(acento) ? normalizarHex(acento) : ACENTO_POR_DEFECTO;
    const luz2 = esHex(acento2) ? normalizarHex(acento2) : ACENTO2_POR_DEFECTO;

    const ctx = React.useMemo<ContextoMarcoUnificado>(
        () => ({ acento: luz, acento2: luz2, clase, base, horizontal, espaciado }),
        [luz, luz2, clase, base, horizontal, espaciado],
    );
    const material = React.useMemo(
        () => estiloMaterial({ acento: luz, acento2: luz2, vivo: vidrioVivo, variante, intensidad }),
        [luz, luz2, vidrioVivo, variante, intensidad],
    );
    const tokens = React.useMemo(
        () => ({
            ["--primary-hsl" as string]: tripleHsl(luz),
            ["--primary-foreground-hsl" as string]: primerPlanoSobre(luz),
            ["--ring-hsl" as string]: tripleHsl(luz),
            ["--w-fn-accent" as string]: luz,
        }) as React.CSSProperties,
        [luz],
    );
    const conCabecera = !!titulo;
    const conAcolchado = acolchado ?? conCabecera;

    return (
        <div
            ref={ref}
            role="group"
            aria-label={etiqueta ?? titulo}
            data-marco="unificado"
            data-tipo={tipo}
            data-familia={familia}
            data-tamano={clase}
            data-nivel-render={nivel}
            data-material={variante}
            data-vidrio={vidrioVivo ? "vivo" : "suave"}
            className={cn(estilos.marco, className)}
            style={{ borderRadius: radioDe(clase), ["--marco-acento" as string]: luz, ["--marco-acento-2" as string]: luz2 } as React.CSSProperties}
        >
            <div className={estilos.capa} data-entrada={p.duracionEntradaMs > 0 ? "si" : "no"}>
                {variante !== "transparente" && <div aria-hidden data-material-marco="" className={estilos.material} style={material} />}
                <div className={cn("dark", estilos.contenido)} style={tokens}>
                    <ContextoMarco.Provider value={ctx}>
                        {conCabecera && (
                            <CabeceraMarco
                                titulo={titulo!}
                                subtitulo={subtitulo}
                                icono={icono}
                                acciones={acciones}
                                vivo={vivo}
                                acento={luz}
                                base={base}
                                horizontal={horizontal}
                                espaciado={espaciado}
                            />
                        )}
                        <div
                            className={cn(
                                estilos.cuerpo,
                                !conCabecera && estilos.cuerpoPleno,
                                absorberFondo && estilos.absorbe,
                                conAcolchado && espaciado.cuerpo,
                            )}
                        >
                            {typeof children === "function" ? children(ctx) : children}
                        </div>
                    </ContextoMarco.Provider>
                </div>
            </div>
        </div>
    );
}

export default MarcoUnificado;
