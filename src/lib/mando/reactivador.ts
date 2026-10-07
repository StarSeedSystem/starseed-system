/**
 * Reactivador de todos los directores del Mando (2026-10-06).
 *
 * Alex: «debería de haber un botón hasta arriba para lanzar un reactivador de todos los
 * directores que verifique y repare cualquier error o situación». El trabajo lo hace
 * `scripts/puente/reactivar_mando.py` (servicios, autocuración completa, orquestador y
 * medidores) y deja su parte, paso a paso, en `~/.starseed/reactivador-ultimo.json`. Aquí:
 * los tipos, la lectura del parte y las decisiones puras del botón.
 */
import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { InformeReactivador } from "./reactivador-tipos";

export * from "./reactivador-tipos";

export const RUTA_INFORME = path.join(os.homedir(), ".starseed", "reactivador-ultimo.json");

export async function leerInformeReactivador(ruta = RUTA_INFORME): Promise<InformeReactivador | null> {
    try {
        const crudo = JSON.parse(await readFile(ruta, "utf8")) as Partial<InformeReactivador>;
        if (!crudo || typeof crudo !== "object" || typeof crudo.t !== "string") return null;
        return {
            t: crudo.t,
            origen: crudo.origen,
            enMarcha: Boolean(crudo.enMarcha),
            pasos: Array.isArray(crudo.pasos) ? crudo.pasos.filter((p) => p && typeof p.paso === "string") : [],
            resumen: typeof crudo.resumen === "string" ? crudo.resumen : "",
            segundos: typeof crudo.segundos === "number" ? crudo.segundos : undefined,
        };
    } catch {
        return null;
    }
}

