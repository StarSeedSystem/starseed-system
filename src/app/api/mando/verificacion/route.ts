/**
 * /api/mando/verificacion — comprueba los procesos de verdad y deja un reporte.
 *
 * POR QUÉ (2026-09-15). Donde está este botón había uno de «Abrir director», y el
 * propio código llevaba escrito al lado el motivo por el que no servía: «la
 * navegación no constituye una verificación». Abrir una pestaña no comprueba nada.
 *
 * Cada punto de aquí responde a algo que YA ha fallado en esta casa, no a una
 * lista genérica de salud.
 */
import { execFile } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { guardianMando } from "@/lib/mando/guardian";
import { raizDelProyecto } from "@/lib/mando/raiz";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const correr = promisify(execFile);
const RAÍZ = raizDelProyecto();

export interface PuntoVerificacion {
    nombre: string;
    estado: "ok" | "aviso" | "fallo";
    dato: string;
    porque: string;
}

async function sh(cmd: string, args: string[]): Promise<string> {
    try {
        const { stdout } = await correr(cmd, args, { cwd: RAÍZ, timeout: 20_000, maxBuffer: 8_000_000 });
        return stdout;
    } catch {
        return "";
    }
}

/**
 * Contar orquestadores. OJO con esto: `pgrep -f 'starseed-enjambre.py'` da FALSO
 * POSITIVO, porque el texto del prompt que se le pasa a un agente contiene el
 * nombre del archivo. Hay que exigir que sea python ejecutando ese archivo.
 */
async function orquestadoresVivos(): Promise<number> {
    const salida = await sh("ps", ["-eo", "args"]);
    const patron = /^[^ ]*[Pp]ython[0-9.]* +-u +.*starseed-enjambre\.py/;
    return salida.split("\n").filter((l) => patron.test(l.trim())).length;
}

async function agentesVivos(): Promise<number> {
    const salida = await sh("ps", ["-eo", "args"]);
    return salida.split("\n").filter((l) => l.includes("opencode run")).length;
}

export async function POST(peticion: Request): Promise<Response> {
    const veto = await guardianMando(peticion);
    if (veto) return veto;

    const puntos: PuntoVerificacion[] = [];

    const [orq, agentes] = await Promise.all([orquestadoresVivos(), agentesVivos()]);
    puntos.push({
        nombre: "Orquestador",
        estado: orq === 1 ? "ok" : orq === 0 ? "aviso" : "fallo",
        dato: `${orq} vivo${orq === 1 ? "" : "s"}`,
        porque:
            orq === 1
                ? "uno solo, como debe ser"
                : orq === 0
                  ? "ninguno: si hay trabajo pendiente, el vigilante debería relanzarlo en 90 s"
                  : "MÁS DE UNO se pisan entre ellos en los mismos worktrees: la regla es uno con N trabajadores",
    });
    puntos.push({
        nombre: "Agentes escribiendo",
        estado: agentes > 0 ? "ok" : "aviso",
        dato: String(agentes),
        porque: agentes > 0 ? "hay trabajo en marcha" : "ningún agente escribiendo ahora mismo",
    });

    // Servicios de launchd que deberían estar vivos.
    const launchd = await sh("launchctl", ["list"]);
    const esperados = ["com.starseed.mando", "com.starseed.vigilante", "com.starseed.director"];
    const caidos = esperados.filter((s) => !launchd.includes(s));
    puntos.push({
        nombre: "Servicios",
        estado: caidos.length === 0 ? "ok" : "fallo",
        dato: caidos.length === 0 ? `${esperados.length} cargados` : `faltan ${caidos.join(", ")}`,
        porque:
            caidos.length === 0
                ? "mando, vigilante y director están cargados"
                : "sin el vigilante nadie relanza el enjambre; sin el director nadie reconcilia estados",
    });

    // El Mando se sirve desde .next: sin BUILD_ID, un reinicio no levanta.
    let hayBuild = true;
    try {
        await access(path.join(RAÍZ, ".next", "BUILD_ID"));
    } catch {
        hayBuild = false;
    }
    puntos.push({
        nombre: "Compilación",
        estado: hayBuild ? "ok" : "fallo",
        dato: hayBuild ? ".next con BUILD_ID" : "sin BUILD_ID",
        porque: hayBuild
            ? "el Mando puede reiniciarse sin quedarse abajo"
            : "una compilación murió a medias: si se reinicia el servicio, el Mando no levanta",
    });

    // Git: árbol limpio y qué falta por publicar.
    const sucio = (await sh("git", ["status", "--porcelain"])).split("\n").filter(Boolean).length;
    const sinPublicar = (await sh("git", ["log", "@{upstream}..HEAD", "--format=%h"])).split("\n").filter(Boolean).length;
    puntos.push({
        nombre: "Árbol de trabajo",
        estado: sucio === 0 ? "ok" : "aviso",
        dato: `${sucio} archivos sin commitear`,
        porque:
            sucio === 0
                ? "limpio: el orquestador puede arrancar"
                : "el orquestador se NIEGA a arrancar con el árbol sucio; a veces basta un fichero suelto que sobra",
    });
    puntos.push({
        nombre: "Sin publicar",
        estado: sinPublicar === 0 ? "ok" : "aviso",
        dato: `${sinPublicar} commits`,
        porque: sinPublicar === 0 ? "la rama está igual que el remoto" : "hay trabajo hecho que no ha salido de esta máquina",
    });

    // Disco: las compilaciones mueren con ENOSPC y no lo dicen claro.
    const df = await sh("df", ["-g", "/"]);
    const libresGb = Number(df.split("\n")[1]?.trim().split(/\s+/)[3] ?? "0");
    puntos.push({
        nombre: "Disco",
        estado: libresGb >= 6 ? "ok" : libresGb >= 3 ? "aviso" : "fallo",
        dato: `${libresGb} GB libres`,
        porque:
            libresGb >= 6
                ? "cabe una compilación"
                : "una compilación de Next necesita varios GB de caché; por debajo de 3 muere con ENOSPC a media pasada",
    });

    const peor = puntos.some((p) => p.estado === "fallo")
        ? "fallo"
        : puntos.some((p) => p.estado === "aviso")
          ? "aviso"
          : "ok";
    const veredicto =
        peor === "ok"
            ? "Todo en orden."
            : peor === "aviso"
              ? "Funciona, pero hay cosas que mirar."
              : "Hay algo roto que impide trabajar.";

    const reporte = {
        t: new Date().toISOString(),
        veredicto,
        peor,
        puntos: [...puntos].sort((a, b) => {
            const peso = { fallo: 0, aviso: 1, ok: 2 } as const;
            return peso[a.estado] - peso[b.estado];
        }),
    };

    // Se deja en disco para que la bandeja de Reportes lo recoja.
    try {
        const carpeta = path.join(RAÍZ, "starseed_memory_root", "mando", "verificaciones");
        await mkdir(carpeta, { recursive: true });
        await writeFile(
            path.join(carpeta, `${reporte.t.slice(0, 19).replace(/[:T]/g, "")}.json`),
            JSON.stringify(reporte, null, 1),
            "utf8",
        );
    } catch {
        // Que no se pueda guardar el reporte no invalida la verificación.
    }

    return Response.json(reporte, { headers: { "Cache-Control": "no-store" } });
}
