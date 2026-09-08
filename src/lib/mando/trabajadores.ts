/**
 * Consejo honesto de cuántos agentes lanzar a la vez (2026-09-08, Ola 286 · F3).
 * Módulo cliente-seguro: solo funciones puras y tipos, sin dependencias de Node,
 * para que el Diseñador de olas (`"use client"`) pueda importarlo sin arrastrar
 * los built-ins de `colas.ts` (node:fs, node:child_process, …) al bundle.
 */

/** Entrada del consejo: lo que el orquestador sabe de la máquina en este momento. */
export interface EntradaRecomendacion {
    memoriaLibreMb: number;
    proveedoresVivos: number;
    enCurso: number;
}

/** Resultado del consejo: cuántos caben, techo y por qué. */
export interface RecomendacionTrabajadores {
    recomendado: number;
    maximo: number;
    motivo: string;
}

/**
 * Cuántos agentes caben ahora mismo, con honestidad. Máximo 8; un agente por cada
 * ~1200 MB libres (mínimo 1); nunca más de `proveedoresVivos * 2`, y se descuentan
 * los que ya están `enCurso`. El motivo explica en una frase cuál de los tres límites
 * mandó (2026-09-08, Ola 286 · F3).
 */
export function trabajadoresRecomendados(entrada: EntradaRecomendacion): RecomendacionTrabajadores {
    const maximo = 8;
    const { memoriaLibreMb, proveedoresVivos, enCurso } = entrada;

    // Límite por memoria: un agente por cada ~1200 MB libres, mínimo 1.
    const porMemoria = Math.max(1, Math.floor(memoriaLibreMb / 1200));
    // Límite por proveedores: nunca más del doble de proveedores vivos.
    const porProveedores = Math.max(1, proveedoresVivos * 2);
    // Límite duro del orquestador.
    const techo = maximo;

    const bruto = Math.min(porMemoria, porProveedores, techo);
    const recomendado = Math.max(1, bruto - enCurso);

    let motivo: string;
    if (bruto === porMemoria) {
        motivo = `la memoria libre (~${memoriaLibreMb} MB) da un agente por cada 1200 MB.`;
    } else if (bruto === porProveedores) {
        motivo = `con ${proveedoresVivos} proveedores vivos caben a lo sumo el doble (${porProveedores}).`;
    } else {
        motivo = "el techo del orquestador es de 8 agentes a la vez.";
    }

    return { recomendado, maximo: techo, motivo };
}