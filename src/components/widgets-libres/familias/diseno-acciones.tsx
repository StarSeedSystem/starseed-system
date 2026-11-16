"use client";

import { useMemo } from "react";
import { MessageCircle, Sparkles } from "lucide-react";
import { disenoDe } from "./comun";
import { Accion, esTactil, escalaTipo, useClaseForzada, useDispositivo } from "./inicio-piezas";
import { PilaAjustable } from "@/components/dashboard/kit/pila-ajustable";
import type { PropsDiseno, EstadoAsistente } from "@/lib/widgets/astraura/disenos";
import type { ClaseTamano } from "@/lib/widgets/forma/tamanos";

const VIOLETA_ASTROAURA = "hsl(var(--astraura-violet))";
const TURQUESA_ASTROAURA = "hsl(var(--astraura-cian))";

export function DisenoAcciones(props: PropsDiseno) {
    const dispositivo = useDispositivo();
    const tactil = esTactil(dispositivo);
    const forzada = useClaseForzada();
    const k = escalaTipo(dispositivo);
    const clase = forzada ?? "m";

    const { base, horizontal } = disenoDe(clase as ClaseTamano);

    const ancho = props.tam;
    const alto = Math.min(props.tam, 360);

    const esMinim = ancho < 280;
    const numeroSugerencias = props.sugerencias.length;

    const alturaDisponible = alto - 260;
    const filasDisponibles = Math.max(1, Math.floor(alturaDisponible / 90));

    const sugerenciasAMostrar = props.sugerencias.slice(0, Math.min(3, filasDisponibles * 2));

    const mostrarHilo = props.hilo.length > 0 && (base === "l" || base === "xl");

    const muestraPreguntar = ancho >= 280;

    const anchoColumnas = esMinim ? "100%" : "40%";
    const anchoContenido = esMinim ? "100%" : "60%";

    const gridClass = esMinim ? "grid-cols-1" : "grid-cols-2";
    return (
        <div 
            className={`flex h-full w-full gap-3 px-3 py-2 ${esMinim ? "flex-col items-center justify-center" : "flex-row items-start"} ${gridClass}`}
            data-diseno="acciones"
            style={{ minWidth: 44 }}
        >
            <div className="flex shrink-0 flex-col items-center gap-2" style={{ width: anchoColumnas }}>
                <button
                    type="button"
                    className="ss-redondo rounded-full relative shrink-0 cursor-pointer"
                    style={{ width: Math.min(ancho * 0.26, 110) * k, height: Math.min(ancho * 0.26, 110) * k }}
                    aria-label="Abrir el chat de Astraura"
                    onClick={props.onAbrirChat}
                >
                    <svg viewBox="0 0 44 44" width={Math.min(ancho * 0.26, 110) * k} height={Math.min(ancho * 0.26, 110) * k}>
                        <circle cx="22" cy="22" r="20" fill={`${VIOLETA_ASTROAURA}1c`} stroke={VIOLETA_ASTROAURA} strokeWidth={1} />
                        <circle cx="22" cy="22" r="8" fill={VIOLETA_ASTROAURA} />
                        <path 
                            d="M14 22l6 6 6-6" 
                            fill="none" 
                            stroke="hsl(var(--astraura-cian))" 
                            strokeWidth={2}
                            strokeLinecap="round"
                        />
                    </svg>
                </button>

                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {estadoATexto(props.estado)}
                </span>

                <div className={`flex flex-wrap gap-1.5 justify-center ${esMinim ? "max-w-full" : "max-w-[140px]"}}`}>
                    {props.voz && (
                        <Accion 
                            icono={props.estado === "escuchando" ? MicOffIcon : MicIcon} 
                            color={TURQUESA_ASTROAURA} 
                            grande={tactil}
                            onClick={props.estado === "escuchando" ? undefined : props.escuchar}
                        >
                            {props.estado === "escuchando" ? "Parar" : "Hablar"}
                        </Accion>
                    )}
                    <Accion 
                        icono={MessageCircle} 
                        color={VIOLETA_ASTROAURA} 
                        grande={tactil}
                        onClick={props.onAbrirChat}
                        aria-label="Abrir el chat de Astraura"
                    >
                        Chat
                    </Accion>
                </div>
            </div>

<PilaAjustable niveles={8} className="min-w-0 flex-1 self-stretch">
                        <div className={`flex min-w-0 flex-col gap-2.5 ${esMinim ? "items-center" : ""}`}>
                            {mostrarHilo && (
                                <div className="min-w-0" aria-label="Última conversación">
                                    <p className="text-[12.5px] leading-snug text-white/90" title={props.ultima?.texto ?? ""}>
                                        {props.ultima?.texto ?? ""}
                                    </p>
                                </div>
                            )}
                            {sugerenciasAMostrar.length > 0 && !esMinim && (
                        <div className="min-w-0" aria-label="Última conversación">
                            {props.hilo.slice(-2).map((turno, i) => (
                                <div 
                                    key={i} 
                                    className={`text-[12.5px] leading-snug ${turno.rol === "user" ? "text-muted-foreground" : "text-foreground"}`}
                                    title={turno.texto}
                                >
                                    <span className={turno.rol === "user" ? "text-white/60" : ""}>
                                        {turno.rol === "user" ? "Tú: " : ""}
                                        {recortarTexto(turno.texto, 110)}
                                    </span>
                                    <span className="text-[10.5px] text-violet-200/70">
                                        {` · hace 1 min`}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}

                    {sugerenciasAMostrar.length > 0 && !esMinim && (
                        <div className="flex flex-col gap-1.5">
                            {sugerenciasAMostrar.map((s) => (
                                <Accion 
                                    key={s} 
                                    icono={Sparkles} 
                                    color={VIOLETA_ASTROAURA} 
                                    grande={tactil}
                                    onClick={() => props.onSugerencia(s)}
                                    className="max-w-full whitespace-normal text-left leading-tight"
                                >
                                    {s}
                                </Accion>
                            ))}
                        </div>
                    )}

                    {muestraPreguntar && props.preguntar}
                </div>
            </PilaAjustable>
        </div>
    );
}

function estadoATexto(e: EstadoAsistente): string {
    switch (e) {
        case "calma": return "En calma";
        case "escuchando": return "Escuchando…";
        case "hablando": return "Hablando";
        case "pensando": return "Pensando…";
        case "error": return "Algo falló";
    }
}

function recortarTexto(texto: string, max: number): string {
    const t = (texto ?? "").replace(/\s+/g, " ").trim();
    if (t.length <= max) return t;
    const corte = t.slice(0, max + 1);
    const espacio = corte.lastIndexOf(" ");
    const base = (espacio > max * 0.6 ? corte.slice(0, espacio) : t.slice(0, max)).replace(/[\s,.;:·(—–-]+$/u, "");
    return `${base}…`;
}

function haceCuando(ts: number, ahora = Date.now()): string {
    const s = Math.max(0, Math.round((ahora - ts) / 1000));
    if (s < 60) return "ahora";
    const m = Math.round(s / 60);
    if (m < 60) return `hace ${m} min`;
    const h = Math.round(m / 60);
    if (h < 24) return `hace ${h} h`;
    const d = Math.round(h / 24);
    if (d === 1) return "ayer";
    if (d < 7) return `hace ${d} días`;
    return `el ${new Date(ts).toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", "")}`;
}

const SendIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <line x1={22} y1={2} x2={11} y2={13} />
        <polygon points="11 4 4 11 4 11 11 18 22 11 11 4" />
    </svg>
);

const MicIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1v13" />
        <path d="M12 14v3" />
        <path d="M12 21a4 4 0 0 0-4-4h-1a4 4 0 0 1 0-8h1a4 4 0 0 1 4-4" />
        <path d="M4 11a8 8 0 0 1 16 0" />
    </svg>
);

const MicOffIcon = () => (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 1v13" />
        <path d="M12 21a4 4 0 0 0-4-4h-1a4 4 0 0 1 0-8h1" />
        <line x1={2} y1={2} x2={22} y2={22} />
        <path d="M4 11a8 8 0 0 1 12.7-6.3" />
    </svg>
);