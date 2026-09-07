"use client";

/**
 * ficha-ser-mando.tsx — Ficha lateral de un ser del Mando (Ola 272 · 2026-09-07)
 * ─────────────────────────────────────────────────────────────────────────────
 * La tarjeta que se ve al tocar un ser en la Oficina 3D: su avatar, su rol, su
 * actividad viva (por tipo), su genoma (nivel, xp, rasgos, generación) y las
 * acciones de gobierno (ir a su tarea, oír su voz, exportarlo como base de los
 * futuros agentes predeterminados del OS).
 */

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
    Pause,
    Play,
    Send,
    Volume2,
    Download,
    Check,
    AlertCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { derivarAdn } from "@/lib/astraura/genesis-dna";
import type {
    ActividadOcupante,
    OcupanteOficina,
    SerListado,
} from "@/lib/astraura/genesis-types";
import type { GenomaSer, TipoSer } from "@/lib/mando/oficina";
import type { VozDeAgente } from "@/lib/mando/voz-mando";

const AvatarAutonomo = dynamic(
    () => import("@/components/astraura/genesis/avatar/avatar-autonomo").then((m) => m.AvatarAutonomo),
    { ssr: false },
);

/** Datos vivos por tipo de ser, rellenados por `OficinaMando` según la fuente real. */
export interface DetalleVivoSer {
    actividad: ActividadOcupante;
    salaNombre: string | null;
    detalle: string | null;
    desde: number | null;
    // escritor / revisor (desde los latidos de la ramificación)
    tareaActual?: string;
    fase?: string;
    tokensEntrada?: number;
    tokensSalida?: number;
    medio?: string;
    // agente158
    activo?: boolean;
    ejecuciones?: number;
    errores?: number;
    ultimoResultado?: string;
    // personalidad
    turnos?: number;
    ultimaActividad?: string | null;
    // proceso
    procesoActivo?: boolean | null;
    ultimo?: string | null;
    // bitnet
    vivo?: boolean;
    dormido?: boolean;
}

export interface FichaSerMandoProps {
    ser: SerListado;
    genoma: GenomaSer | null;
    ocupante: OcupanteOficina | null;
    detalleVivo: DetalleVivoSer;
    vocesPorAgente: VozDeAgente[];
    onIrALaTarea: () => void;
    onExportar: (id: string) => Promise<{ ok: boolean; ruta?: string; error?: string }>;
}

/** Texto «hace cuánto» desde un epoch ms, corto y en español. */
function haceCuanto(desde: number | null): string {
    if (desde == null) return "ahora";
    const s = Math.max(0, Math.round((Date.now() - desde) / 1000));
    if (s < 60) return "ahora mismo";
    if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
    if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
    return `hace ${Math.floor(s / 86400)} d`;
}

/** Etiqueta en español de la actividad del ocupante. */
function etiquetaActividad(a: ActividadOcupante): string {
    switch (a) {
        case "pensando": return "pensando";
        case "hablando": return "hablando";
        case "trabajando": return "trabajando";
        default: return "inactivo";
    }
}

/** XP que hay que juntar para subir al siguiente nivel (nivel = √xp). */
function xpSiguienteNivel(nivel: number): number {
    return (nivel + 1) * (nivel + 1);
}

/** Etiqueta de rol por tipo, legible. */
function etiquetaTipo(tipo: TipoSer): string {
    switch (tipo) {
        case "escritor": return "Escritor";
        case "revisor": return "Revisor";
        case "agente158": return "Agente 1.58";
        case "personalidad": return "Personalidad";
        case "proceso": return "Proceso";
        case "bitnet": return "Núcleo BitNet";
    }
}

/** Datos vivos según el tipo de ser (escritor/revisor/agente/personalidad/proceso/bitnet). */
function DatosVivosTipo({ ser, detalleVivo, oyendo }: {
    ser: SerListado;
    detalleVivo: DetalleVivoSer;
    oyendo: boolean;
}) {
    const d = detalleVivo;
    const fila = (clave: string, valor: string) => (
        <span className="flex items-baseline justify-between gap-2">
            <span className="text-white/40">{clave}</span>
            <span className="truncate text-right text-white/80">{valor}</span>
        </span>
    );

    if (d.tareaActual !== undefined || d.fase !== undefined) {
        return (
            <>
                {d.tareaActual ? fila("Tarea", d.tareaActual) : null}
                {d.fase ? fila("Fase", d.fase) : null}
                {d.tokensEntrada !== undefined || d.tokensSalida !== undefined
                    ? fila("Tokens", `in ${d.tokensEntrada ?? 0} · out ${d.tokensSalida ?? 0}`)
                    : null}
                {d.medio ? fila("Medio", d.medio) : null}
            </>
        );
    }

    if (d.ejecuciones !== undefined) {
        return (
            <>
                {fila("Estado", d.activo ? "activo" : "pausado")}
                {fila("Ejecuciones", String(d.ejecuciones ?? 0))}
                {fila("Errores", String(d.errores ?? 0))}
                {d.ultimoResultado ? fila("Último resultado", d.ultimoResultado) : null}
            </>
        );
    }

    if (d.turnos !== undefined) {
        return (
            <>
                {fila("Turnos", String(d.turnos))}
                {d.ultimaActividad ? fila("Última", d.ultimaActividad) : null}
                {fila("Estado", d.vivo === undefined ? "inactiva" : "activa")}
            </>
        );
    }

    if (d.procesoActivo !== undefined) {
        return (
            <>
                {fila("Estado", d.procesoActivo ? "activo" : "inactivo")}
                {d.ultimo ? fila("Último", d.ultimo) : null}
            </>
        );
    }

    if (d.vivo !== undefined) {
        return (
            <>
                {fila("Estado", d.vivo ? (d.dormido ? "dormido" : "vivo") : "apagado")}
            </>
        );
    }

    return fila("Ser", ser.id);
}

export function FichaSerMando({
    ser,
    genoma,
    ocupante,
    detalleVivo,
    vocesPorAgente,
    onIrALaTarea,
    onExportar,
}: FichaSerMandoProps) {
    const [exportando, setExportando] = useState(false);
    const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);
    const [oyendo, setOyendo] = useState(false);
    const vozRef = useRef<string | null>(null);

    // ADN del ser: el derivado por el servidor, o uno local si aún no lo trajo.
    const adn = ser.adn ?? derivarAdn({
        id: ser.id,
        nombre: ser.nombre,
        colorPersonalidad: genoma?.color ?? null,
        arquetipo: genoma?.tipo ?? ser.rol,
        generacion: genoma?.generacion ?? ser.generacion,
        experiencia: genoma?.xp ?? ser.experiencia,
    });

    const tipo = genoma?.tipo ?? (ser.rol === "revisor" ? "revisor" : "escritor");
    const nivel = genoma?.nivel ?? 0;
    const xp = genoma?.xp ?? 0;
    const objetivoXp = xpSiguienteNivel(nivel);
    const progreso = Math.min(1, xp / objetivoXp);
    const rasgos = genoma?.rasgos ?? [];

    const exportar = async () => {
        setExportando(true);
        setResultado(null);
        try {
            const res = await onExportar(ser.id);
            setResultado(res.ok
                ? { ok: true, texto: `Exportado como predeterminado: ${res.ruta ?? "ok"}` }
                : { ok: false, texto: res.error ?? "No se pudo exportar." });
        } catch {
            setResultado({ ok: false, texto: "No se pudo exportar." });
        } finally {
            setExportando(false);
        }
    };

    const oir = async () => {
        if (oyendo) return;
        setOyendo(true);
        try {
            const { buscarTimbre, TIMBRES } = await import("@/lib/aurora/timbres");
            const { hablarStarSeed } = await import("@/lib/aurora/voz-starseed/motor");
            // Voz elegida por asignación del Mando (Ola 275) o la primera del catálogo.
            const asignada = vocesPorAgente.find((v) => v.id === ser.id);
            const timbre = (asignada ? buscarTimbre(asignada.timbreId) : null) ?? TIMBRES[0];
            const detalle = detalleVivo.detalle ?? etiquetaActividad(detalleVivo.actividad);
            const texto = `Soy ${ser.nombre}, ${ser.rol}. Ahora ${detalle}.`;
            await hablarStarSeed(texto, { timbre, contexto: "conversacion" });
        } catch {
            // La voz nunca rompe la ficha.
        } finally {
            setOyendo(false);
        }
    };

    return (
        <aside className="rounded-xl border border-white/10 bg-black/30 p-4">
            <div className="flex items-start gap-3">
                <div className="h-16 w-16 shrink-0 rounded-full border border-white/10 bg-white/[0.03]">
                    <AvatarAutonomo adn={adn} tamano={64} className="block" />
                </div>
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-lg font-semibold text-white">{ser.nombre}</h3>
                    <p className="text-sm text-white/60">{ser.rol}</p>
                    <p className="mt-0.5 text-xs text-white/40">
                        {etiquetaTipo(tipo)} · {tipo === "escritor" || tipo === "revisor" ? (ser.id.split("/").pop() ?? ser.id) : ""}
                    </p>
                </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                    {detalleVivo.salaNombre ?? "sin sala"}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                    {etiquetaActividad(detalleVivo.actividad)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/50">
                    {haceCuanto(detalleVivo.desde)}
                </span>
            </div>

            {(ocupante?.detalle || detalleVivo.detalle) ? (
                <p className="mt-2 text-xs text-white/60">{detalleVivo.detalle ?? ocupante?.detalle}</p>
            ) : null}

            <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-xs text-white/70">
                <DatosVivosTipo ser={ser} detalleVivo={detalleVivo} oyendo={oyendo} />
            </div>

            <div className="mt-4 border-t border-white/10 pt-3">
                <div className="flex items-baseline justify-between">
                    <span className="text-3xl font-bold text-white">{nivel}</span>
                    <span className="text-xs text-white/50">nivel · {xp} xp</span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                        className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all"
                        style={{ width: `${Math.round(progreso * 100)}%` }}
                    />
                </div>
                <p className="mt-1 text-[11px] text-white/40">
                    {Math.round(progreso * 100)}% · faltan {Math.max(0, objetivoXp - xp)} xp para el nivel {nivel + 1}
                </p>
                <p className="mt-1 text-[11px] text-white/40">generación {genoma?.generacion ?? 0}</p>
                {rasgos.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                        {rasgos.map((r) => (
                            <span key={r} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/70">
                                {r}
                            </span>
                        ))}
                    </div>
                ) : null}
            </div>

            <div className="mt-4 flex flex-col gap-2 border-t border-white/10 pt-3">
                <button
                    type="button"
                    onClick={onIrALaTarea}
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10"
                >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    Ir a la tarea
                </button>
                <button
                    type="button"
                    onClick={() => void oir()}
                    disabled={oyendo}
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/80 transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
                    {oyendo ? "Hablando…" : "Oír"}
                </button>
                <button
                    type="button"
                    onClick={() => void exportar()}
                    disabled={exportando}
                    className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    {exportando ? "Exportando…" : "Exportar como predeterminado"}
                </button>
                {resultado ? (
                    <p
                        role="status"
                        className={cn(
                            "flex items-start gap-1.5 rounded-lg border px-2 py-1.5 text-[11px]",
                            resultado.ok
                                ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200"
                                : "border-red-400/20 bg-red-500/10 text-red-200",
                        )}
                    >
                        {resultado.ok ? <Check className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />}
                        {resultado.texto}
                    </p>
                ) : null}
            </div>
        </aside>
    );
}