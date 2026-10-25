"use client";

/*
 * StarSeed OS — Agentes · barrel de exportación pública.
 * Punto único de importación del subsistema de Agentes (P4 + P5).
 */

export * from "./model";
export * from "./builtins";
export * from "./store";
export * from "./sync";
// Contrato de MOTORES de agentes (SOP §3 · repos-3d-oido-agentes-1023):
// fichas de los seis motores + la regla pura `elegirMotor`. Los adaptadores
// por motor llegan en su tarea propia; aquí vive el contrato que consumen.
export * from "./motores/tipos";
