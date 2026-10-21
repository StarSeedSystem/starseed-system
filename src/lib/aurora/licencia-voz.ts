"use client";

/**
 * Módulo de verificación de licencias para motores de voz
 * ─────────────────────────────────────────────────────────────────────────────
 * Funciones puras que determinan si un motor puede reproducirse en un contexto dado,
 * sin red, disco, reloj o audio inyectables.
 *
 * Este módulo contiene la lógica de negocio central para determinar la disponibilidad
 * de motores de voz basada en licencias y restricciones de contexto, manteniendo
 * la pureza funcional para facilitar las pruebas.
 */

import type { MotorVozCatalogo } from "@/lib/aurora/catalogo-voces";

/**
 * Motivos por los que un motor podría no poder reproducirse
 */
export type MotivoNoReproduccion = 
    | "voiceStudioInactivo"
    | "licenciaPersonalContextNoPersonal"
    | "plataformaNoDisponible"
    | "ramInsuficiente"
    | "conexionRequerida";

/**
 * Devuelve el motivo por el que un motor no puede reproducirse, o null si puede reproducirse
 */
export function motivoNoReproduccion(
    motor: MotorVozCatalogo,
    contexto: "personal" | "grupo" | "comunidad" | "publico" | "comercial",
    plataforma: "macos" | "windows" | "linux" | "android" | "ios" | "web",
    ramGB: number,
    voiceStudioActivo: boolean
): MotivoNoReproduccion | null {
    if (motor.id === "voicestudio" && !voiceStudioActivo) {
        return "voiceStudioInactivo";
    }

    if (contexto !== "personal" && motor.claseLicencia === "personal") {
        return "licenciaPersonalContextNoPersonal";
    }

    if (!motor.plataformas.includes(plataforma)) {
        return "plataformaNoDisponible";
    }

    if (motor.ramMinGB > ramGB) {
        return "ramInsuficiente";
    }

    if (!motor.offline) {
        return "conexionRequerida";
    }

    return null;
}

/**
 * Determina si un motor puede reproducirse en el contexto dado
 */
export function motorPuedeReproducirse(
    motor: MotorVozCatalogo,
    contexto: "personal" | "grupo" | "comunidad" | "publico" | "comercial",
    plataforma: "macos" | "windows" | "linux" | "android" | "ios" | "web",
    ramGB: number,
    voiceStudioActivo: boolean
): boolean {
    return motivoNoReproduccion(motor, contexto, plataforma, ramGB, voiceStudioActivo) === null;
}

/**
 * Obtiene todos los motores que pueden reproducirse en el contexto dado
 */
export function motoresDisponibles(
    contexto: "personal" | "grupo" | "comunidad" | "publico" | "comercial",
    plataforma: "macos" | "windows" | "linux" | "android" | "ios" | "web",
    ramGB: number,
    voiceStudioActivo: boolean,
    motores: MotorVozCatalogo[]
): MotorVozCatalogo[] {
    return motores.filter((motor) => 
        motorPuedeReproducirse(motor, contexto, plataforma, ramGB, voiceStudioActivo)
    );
}

/**
 * Obtiene todos los motores que no pueden reproducirse en el contexto dado
 */
export function motoresNoDisponibles(
    contexto: "personal" | "grupo" | "comunidad" | "publico" | "comercial",
    plataforma: "macos" | "windows" | "linux" | "android" | "ios" | "web",
    ramGB: number,
    voiceStudioActivo: boolean,
    motores: MotorVozCatalogo[]
): Array<{ motor: MotorVozCatalogo; motivo: MotivoNoReproduccion }> {
    return motores
        .filter((motor) => {
            const motivo = motivoNoReproduccion(motor, contexto, plataforma, ramGB, voiceStudioActivo);
            return motivo !== null;
        })
        .map((motor) => {
            const motivo = motivoNoReproduccion(motor, contexto, plataforma, ramGB, voiceStudioActivo);
            return { motor, motivo: motivo! };
        });
}

/**
 * Obtiene una descripción legible para un motivo de no reproducción
 */
export function descripcionMotivo(motivo: MotivoNoReproduccion): string {
    switch (motivo) {
        case "voiceStudioInactivo":
            return "VoiceStudio no está activo en esta neurona";
        case "licenciaPersonalContextNoPersonal":
            return "Solo personal — no disponible en contextos grupales, comunitarios, públicos o comerciales";
        case "plataformaNoDisponible":
            return "Plataforma no soportada por este motor";
        case "ramInsuficiente":
            return "RAM insuficiente para este motor";
        case "conexionRequerida":
            return "Requiere conexión a internet (actualmente no disponible)";
        default:
            return "No disponible";
    }
}
