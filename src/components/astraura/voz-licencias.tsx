"use client";

/**
 * Componente VozLicencias
 * ─────────────────────────────────────────────────────────────────────────────
 * Lista los motores de voz del catálogo con su etiqueta de licencia (Libre / Con condiciones / Solo personal),
 * si VoiceStudio está vivo en esta neurona (estado pasado por props) y por qué un motor no suena en el contexto actual.
 *
 * Props:
 *   voiceStudioAlive: boolean - indica si VoiceStudio está activo en la neurona actual
 *   contexto: "personal" | "grupo" | "comunidad" | "publico" | "comercial" - contexto de uso actual
 *   neuronaPlataforma: "macos" | "windows" | "linux" | "android" | "ios" | "web" - plataforma de la neurona
 *   neuronaRamGB: number - RAM disponible en GB en la neurona
 */

import { XCircle } from "lucide-react";
import { MOTORES_VOZ } from "@/lib/aurora/catalogo-voces";
import type { MotorVozCatalogo } from "@/lib/aurora/catalogo-voces";

interface VozLicenciasProps {
    voiceStudioAlive: boolean;
    contexto: "personal" | "grupo" | "comunidad" | "publico" | "comercial";
    neuronaPlataforma: "macos" | "windows" | "linux" | "android" | "ios" | "web";
    neuronaRamGB: number;
}

/**
 * Determina por qué un motor no puede reproducirse en el contexto actual
 */
function motivoNoReproduccion(motor: MotorVozCatalogo, props: VozLicenciasProps): string | null {
    // Verificar si VoiceStudio está activo y si el motor es VoiceStudio
    if (motor.id === "voicestudio") {
        return props.voiceStudioAlive ? null : "VoiceStudio no esta activo en esta neurona";
    }

    // Verificar licencia para contextos no personales
    if (props.contexto !== "personal" && motor.claseLicencia === "personal") {
        return "Solo personal - no disponible en contextos grupales, comunitarios, publicos o comerciales";
    }

    // Verificar disponibilidad de la plataforma
    if (!motor.plataformas.includes(props.neuronaPlataforma)) {
        return `No disponible en ${props.neuronaPlataforma}`;
    }

    // Verificar requisitos de RAM
    if (motor.ramMinGB > props.neuronaRamGB) {
        return `Requiere ${motor.ramMinGB} GB de RAM, pero solo hay ${props.neuronaRamGB} GB`;
    }

    // Verificar si el motor está offline pero necesita conexión
    if (!motor.offline) {
        return "Requiere conexion a internet (actualmente no disponible)";
    }

    return null;
}

/**
 * Obtiene la etiqueta legible para una clase de licencia
 */
function etiquetaLicencia(clase: "libre" | "condicionada" | "personal"): { etiqueta: string; color: string } {
    switch (clase) {
        case "libre":
            return { etiqueta: "Libre", color: "text-emerald-200 border-emerald-400/30 bg-emerald-500/10" };
        case "condicionada":
            return { etiqueta: "Con condiciones", color: "text-amber-200 border-amber-400/30 bg-amber-500/10" };
        case "personal":
            return { etiqueta: "Solo personal", color: "text-rose-200 border-rose-400/30 bg-rose-500/10" };
    }
}

export function VozLicencias(props: VozLicenciasProps) {
    const motoresAptos = MOTORES_VOZ.filter((motor) => {
        const motivo = motivoNoReproduccion(motor, props);
        return !motivo;
    });

    const motoresNoAptos = MOTORES_VOZ.filter((motor) => {
        const motivo = motivoNoReproduccion(motor, props);
        return motivo;
    });

    return (
        <div className="space-y-4">
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <h3 className="mb-3 text-[14px] font-semibold text-white/90">Motivos de reprobacion</h3>
                {motoresNoAptos.length === 0 ? (
                    <p className="text-[11px] text-white/55">Todos los motores cumplen los requisitos del contexto actual.</p>
                ) : (
                    <ul className="space-y-2">
                        {motoresNoAptos.map((motor) => {
                            const motivo = motivoNoReproduccion(motor, props);
                            return (
                                <li key={motor.id} className="flex items-start gap-2 text-[11px]">
                                    <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" />
                                    <div>
                                        <span className="font-medium text-white/85">{motor.nombre}</span>
                                        <span className="ml-1 text-white/45">·</span>
                                        <span className="text-white/65">{motivo}</span>
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <h3 className="mb-3 text-[14px] font-semibold text-white/90">Motivos de aprobacion</h3>
                {motoresAptos.length === 0 ? (
                    <p className="text-[11px] text-white/55">No hay motores disponibles para el contexto actual.</p>
                ) : (
                    <div className="grid gap-3">
                        {motoresAptos.map((motor) => (
                            <div key={motor.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-[12px] font-medium text-white/90">{motor.nombre}</span>
                                    <span className="text-[10.5px] text-white/50">· {motor.formato}</span>
                                    <span className="text-[10.5px] text-white/50">· {motor.origen}</span>
                                    <span
                                        className={`rounded-full border px-1.5 py-px text-[9px] ${etiquetaLicencia(motor.claseLicencia).color}`}
                                    >
                                        {etiquetaLicencia(motor.claseLicencia).etiqueta}
                                    </span>
                                    {motor.id === "voicestudio" && (
                                        <span
                                            className={`rounded-full border px-1.5 py-px text-[9px] ${props.voiceStudioAlive
                                                ? "border-emerald-400/30 text-emerald-200 bg-emerald-500/10"
                                                : "border-amber-400/30 text-amber-200 bg-amber-500/10"
                                            }
                                        >
                                            {props.voiceStudioAlive ? "VoiceStudio activo" : "VoiceStudio inactivo"}
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
