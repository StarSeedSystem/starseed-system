/**
 * El publicador visto desde el Mando: lanzarlo, leer su diario y resumirlo.
 *
 * El trabajo de verdad lo hace `scripts/puente/publicar.py`, suelto, porque las
 * puertas tardan entre cinco y quince minutos y una petición HTTP se muere antes
 * por tiempo de espera — y entonces nadie sabe si publicó o no. Aquí solo se
 * arranca ese proceso y se lee el archivo donde va dejando su estado, de modo
 * que el panel puede seguirlo en vivo y sobrevive a que cierres el navegador.
 */
import { spawn } from "node:child_process";
import { openSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { raizDelProyecto } from "@/lib/mando/raiz";

import {
    normalizarDiario,
    type DiarioPublicacion,
} from "@/lib/mando/publicador-tipos";

export * from "@/lib/mando/publicador-tipos";

const RAÍZ = raizDelProyecto();
const DIARIO = path.join(RAÍZ, "starseed_memory_root", "mando", "publicacion-estado.json");
const REGISTRO = path.join(RAÍZ, "starseed_memory_root", "mando", "publicacion.log");

/** El diario actual, o `null` si nadie ha publicado desde aquí todavía. */
export async function leerDiario(): Promise<DiarioPublicacion | null> {
    try {
        return normalizarDiario(JSON.parse(await readFile(DIARIO, "utf8")));
    } catch {
        return null;
    }
}

/**
 * Arranca el publicador. Devuelve `{ ok: false }` si ya hay uno corriendo: dos
 * publicadores a la vez se pisarían el índice de git y el diario.
 */
export async function lanzarPublicacion(nota: string): Promise<{ ok: boolean; error?: string; pid?: number }> {
    const actual = await leerDiario();
    if (actual?.estado === "corriendo") {
        return { ok: false, error: "Ya hay una publicación en marcha; espera a que termine." };
    }
    await mkdir(path.dirname(REGISTRO), { recursive: true });
    const log = openSync(REGISTRO, "a");
    const guion = path.join(RAÍZ, "scripts", "puente", "publicar.py");
    const hijo = spawn("python3", [guion, nota.slice(0, 2000)], {
        cwd: RAÍZ,
        detached: true,
        stdio: ["ignore", log, log],
        env: { ...process.env, STARSEED_ROOT: RAÍZ },
    });
    hijo.unref();
    return { ok: true, pid: hijo.pid };
}
