"use client";

/**
 * Controles de la ventana de llamada: botones redondos de cristal con su nombre debajo, el
 * panel «Audio y vídeo» (micro, cámara y altavoz) y el menú «Más» (lista vertical) para
 * pantallas estrechas.
 */
import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { Check, RefreshCw, X } from "lucide-react";
import { soportaAltavoz } from "@/lib/llamadas/medios";
import type { EstadoLlamada } from "@/lib/llamadas/tipos";

export type VarianteBoton = "normal" | "apagado" | "acento" | "peligro" | "exito";

const FONDO: Record<VarianteBoton, { fondo: string; icono: string; anillo: string }> = {
    normal: { fondo: "rgba(255,255,255,.10)", icono: "#ffffff", anillo: "rgba(255,255,255,.16)" },
    apagado: { fondo: "rgba(255,255,255,.92)", icono: "#12142a", anillo: "rgba(255,255,255,.6)" },
    acento: { fondo: "#007FFF", icono: "#ffffff", anillo: "rgba(125,211,252,.55)" },
    peligro: { fondo: "#DC143C", icono: "#ffffff", anillo: "rgba(255,120,140,.55)" },
    exito: { fondo: "#10B981", icono: "#ffffff", anillo: "rgba(110,231,183,.55)" },
};

export function BotonRedondo({
    icono: Icono,
    etiqueta,
    aria,
    onClick,
    variante = "normal",
    disabled = false,
    presionado,
    tam = 52,
    mostrarEtiqueta = true,
    title,
    expandido,
}: {
    icono: LucideIcon;
    etiqueta: string;
    aria?: string;
    onClick?: () => void;
    variante?: VarianteBoton;
    disabled?: boolean;
    /** Para botones de alternar (aria-pressed). */
    presionado?: boolean;
    tam?: number;
    mostrarEtiqueta?: boolean;
    title?: string;
    /** Para botones que abren un panel (aria-expanded). */
    expandido?: boolean;
}) {
    const c = FONDO[variante];
    return (
        <div className="flex min-w-0 flex-col items-center gap-1.5">
            <motion.button
                type="button"
                onClick={onClick}
                disabled={disabled}
                aria-label={aria ?? etiqueta}
                aria-pressed={presionado}
                aria-expanded={expandido}
                title={title ?? aria ?? etiqueta}
                whileHover={disabled ? undefined : { scale: 1.06 }}
                whileTap={disabled ? undefined : { scale: 0.94 }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                className="ss-redondo grid shrink-0 cursor-pointer place-items-center rounded-full transition-colors duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-not-allowed disabled:opacity-45"
                style={{
                    width: tam,
                    height: tam,
                    background: c.fondo,
                    color: c.icono,
                    boxShadow: `inset 0 0 0 1px ${c.anillo}, inset 0 1px 0 rgba(255,255,255,.08), 0 8px 22px rgba(0,0,0,.28)`,
                    backdropFilter: variante === "normal" ? "blur(14px)" : undefined,
                }}
            >
                <Icono style={{ width: Math.round(tam * 0.42), height: Math.round(tam * 0.42) }} aria-hidden />
            </motion.button>
            {mostrarEtiqueta && <span className="whitespace-nowrap text-[11px] font-medium leading-none text-white/70">{etiqueta}</span>}
        </div>
    );
}

/** Hoja de cristal dentro de la ventana (panel de dispositivos, menú «Más»). */
export function HojaLlamada({ titulo, onCerrar, children, id }: { titulo: string; onCerrar: () => void; children: React.ReactNode; id?: string }) {
    return (
        <motion.div
            id={id}
            role="dialog"
            aria-label={titulo}
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="absolute inset-x-3 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-20 mx-auto flex max-h-[min(70dvh,560px)] max-w-md flex-col overflow-hidden rounded-[22px] text-white sm:inset-x-auto sm:left-1/2 sm:w-[420px] sm:-translate-x-1/2"
            style={{
                background: "rgba(12,14,34,.86)",
                backdropFilter: "blur(20px) saturate(140%)",
                border: "1px solid rgba(255,255,255,.08)",
                boxShadow: "inset 0 1px 0 rgba(255,255,255,.06), 0 24px 60px rgba(0,0,0,.45)",
            }}
        >
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-white/[.07] px-4 py-3">
                <h2 className="text-[15px] font-semibold">{titulo}</h2>
                <button
                    type="button"
                    onClick={onCerrar}
                    className="ss-redondo grid h-9 w-9 cursor-pointer place-items-center rounded-full text-white/80 transition-colors duration-200 hover:bg-white/10 hover:text-white"
                    aria-label={`Cerrar ${titulo.toLowerCase()}`}
                >
                    <X className="h-4 w-4" aria-hidden />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">{children}</div>
        </motion.div>
    );
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
    return (
        <section className="px-2 py-2">
            <h3 className="px-2 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">{titulo}</h3>
            <div className="flex flex-col gap-1">{children}</div>
        </section>
    );
}

function Opcion({ activa, nombre, onElegir }: { activa: boolean; nombre: string; onElegir: () => void }) {
    return (
        <button
            type="button"
            role="radio"
            aria-checked={activa}
            onClick={onElegir}
            className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[14px] transition-colors duration-150 hover:bg-white/[.07] focus-visible:bg-white/[.09] focus-visible:outline-none"
            style={activa ? { background: "rgba(124,92,255,.16)", boxShadow: "inset 0 0 0 1px rgba(124,92,255,.45)" } : undefined}
        >
            <span className="grid h-5 w-5 shrink-0 place-items-center">{activa && <Check className="h-4 w-4 text-[#a996ff]" aria-hidden />}</span>
            <span className="min-w-0 flex-1 break-words">{nombre}</span>
        </button>
    );
}

export function PanelDispositivos({
    estado,
    onMicro,
    onCamara,
    onAltavoz,
    onActualizar,
    onCerrar,
}: {
    estado: EstadoLlamada;
    onMicro: (id: string) => void;
    onCamara: (id: string) => void;
    onAltavoz: (id: string) => void;
    onActualizar: () => void;
    onCerrar: () => void;
}) {
    const { dispositivos: d, seleccion: s } = estado;
    const altavoz = soportaAltavoz();
    return (
        <HojaLlamada titulo="Audio y vídeo" onCerrar={onCerrar} id="panel-dispositivos-llamada">
            <Seccion titulo="Micrófono">
                <div role="radiogroup" aria-label="Micrófono" className="flex flex-col gap-1">
                    {d.microfonos.length ? (
                        d.microfonos.map((m, i) => (
                            <Opcion key={m.id} nombre={m.nombre} activa={s.microId ? s.microId === m.id : i === 0} onElegir={() => onMicro(m.id)} />
                        ))
                    ) : (
                        <p className="px-3 py-2 text-[13px] text-white/60">No vemos ningún micrófono (o aún no hay permiso para listarlos).</p>
                    )}
                </div>
            </Seccion>
            <Seccion titulo="Cámara">
                <div role="radiogroup" aria-label="Cámara" className="flex flex-col gap-1">
                    {d.camaras.length ? (
                        d.camaras.map((m, i) => (
                            <Opcion key={m.id} nombre={m.nombre} activa={s.camaraId ? s.camaraId === m.id : i === 0} onElegir={() => onCamara(m.id)} />
                        ))
                    ) : (
                        <p className="px-3 py-2 text-[13px] text-white/60">No vemos ninguna cámara en este dispositivo.</p>
                    )}
                </div>
            </Seccion>
            <Seccion titulo="Altavoz">
                {altavoz && d.altavoces.length ? (
                    <div role="radiogroup" aria-label="Altavoz" className="flex flex-col gap-1">
                        {d.altavoces.map((m, i) => (
                            <Opcion key={m.id} nombre={m.nombre} activa={s.altavozId ? s.altavozId === m.id : i === 0} onElegir={() => onAltavoz(m.id)} />
                        ))}
                    </div>
                ) : (
                    <p className="px-3 py-2 text-[13px] text-white/60">
                        Este navegador no deja elegir el altavoz desde la página: suena por la salida del sistema.
                    </p>
                )}
            </Seccion>
            <div className="px-3 pb-2 pt-1">
                <button
                    type="button"
                    onClick={onActualizar}
                    className="ss-redondo inline-flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium text-white transition-transform duration-200 hover:scale-[1.03]"
                    style={{ background: "#7C5CFF1f", boxShadow: "inset 0 0 0 1px #7C5CFF66" }}
                >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                    Volver a buscar dispositivos
                </button>
            </div>
        </HojaLlamada>
    );
}

export interface OpcionMas {
    id: string;
    icono: LucideIcon;
    etiqueta: string;
    ayuda?: string;
    color?: string;
    onElegir: () => void;
    disabled?: boolean;
}

/** Menú «Más» de la llamada: lista vertical con nombres completos y una línea de ayuda. */
export function MenuMas({ opciones, onCerrar }: { opciones: OpcionMas[]; onCerrar: () => void }) {
    return (
        <HojaLlamada titulo="Más opciones" onCerrar={onCerrar} id="menu-mas-llamada">
            <ul className="flex flex-col gap-1 p-1" role="menu" aria-label="Más opciones de la llamada">
                {opciones.map((o) => {
                    const Icono = o.icono;
                    return (
                        <li key={o.id} role="none">
                            <button
                                type="button"
                                role="menuitem"
                                disabled={o.disabled}
                                onClick={() => {
                                    onCerrar();
                                    o.onElegir();
                                }}
                                className="flex w-full cursor-pointer items-center gap-3 rounded-[14px] px-3 py-3 text-left transition-colors duration-150 hover:bg-white/[.07] focus-visible:bg-white/[.09] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                <span
                                    className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
                                    style={{ background: `${o.color ?? "#7C5CFF"}1f`, boxShadow: `inset 0 0 0 1px ${o.color ?? "#7C5CFF"}66` }}
                                >
                                    <Icono className="h-[18px] w-[18px]" style={{ color: o.color ?? "#a996ff" }} aria-hidden />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[14px] font-semibold text-white">{o.etiqueta}</span>
                                    {o.ayuda && <span className="block text-[12px] text-white/60">{o.ayuda}</span>}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </HojaLlamada>
    );
}
