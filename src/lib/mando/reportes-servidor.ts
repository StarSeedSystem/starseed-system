// src/lib/mando/reportes-servidor.ts
// -----------------------------------------------------------------------------
// Reunión de datos para la bandeja curada de Reportes (Ola p323Bb · SOLO servidor).
//
// La LÓGICA de curación vive en `@/lib/mando/reportes` (puro, Ola p323A). Aquí
// solo se junta la materia prima: commits de git, progreso y colas del disco y
// eventos del bus. Todo es tolerante: cualquier comando o archivo que falle
// deja vacía SOLO su parte, porque esta bandeja no puede caerse entera.
// -----------------------------------------------------------------------------

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
    leerColas,
    leerEventosDelBus,
    leerProgreso,
} from "@/lib/mando/lector-local";
import { raizDelProyecto } from "@/lib/mando/raiz";
import {
    construirReportes,
    type ColaEntrada,
    type CommitEntrada,
    type DatosConstruccion,
    type ProgresoEntrada,
    type Reporte,
} from "@/lib/mando/reportes";

/** Raíz del repo, opaca al trazador de Next (ver `raiz.ts`). */
const RAÍZ = raizDelProyecto();

const correr = promisify(execFile);

/** Opciones del armado: la bandeja se acota por fecha y por tamaño. */
export interface OpcionesReportes {
    /** ISO: solo entradas de este momento en adelante. */
    desde?: string;
    /** Tope de reportes de vuelta (la ruta lo limita a 200). */
    limite?: number;
}

/** Resultado junto al instante en que se armó (para caché y UI). */
export interface RespuestaReportes {
    reportes: Reporte[];
    generadoEn: string;
}

function texto(v: unknown): string {
    return typeof v === "string" ? v : "";
}

/** Corre git tolerante a fallos: ante cualquier error devuelve cadena vacía. */
async function git(args: string[]): Promise<string> {
    try {
        const { stdout } = await correr("git", args, {
            cwd: RAÍZ,
            timeout: 20_000,
            maxBuffer: 8_000_000,
        });
        return stdout;
    } catch {
        return "";
    }
}

/** Traduce `progreso.json` a lo que la lógica pura entiende. */
function progresoEntradas(crudo: Record<string, unknown>): ProgresoEntrada[] {
    const salida: ProgresoEntrada[] = [];
    for (const [id, valor] of Object.entries(crudo)) {
        if (typeof valor !== "object" || valor === null) continue;
        const v = valor as Record<string, unknown>;
        salida.push({
            id,
            estado: texto(v.estado),
            ola: texto(v.ola) || undefined,
            texto: texto(v.nota) || texto(v.texto) || undefined,
        });
    }
    return salida;
}

/** Agrupa las tareas por cola: a la bandeja le importa la ola, no la tarea. */
function colaEntradas(tareas: import("@/lib/mando/tipos").TareaOla[]): ColaEntrada[] {
    const porCola = new Map<string, ColaEntrada>();
    for (const t of tareas) {
        const clave = t.cola ?? t.ola;
        const ya = porCola.get(clave);
        if (ya) {
            ya.partes = (ya.partes ?? 0) + 1;
        } else {
            porCola.set(clave, { id: clave, titulo: clave, partes: 1 });
        }
    }
    return [...porCola.values()];
}

/**
 * Reúne toda la bandeja. Cada fuente falla por su cuenta (commits sin repo,
 * disco ilegible, bus vacío): lo que sí se haya leído llega igualmente, porque
 * una bandeja medio llena informa y una 500 solo molesta.
 */
export async function obtenerReportes(o: OpcionesReportes = {}): Promise<RespuestaReportes> {
    const [commits, crudo, tareasCola, eventos, remoto] = await Promise.all([
        leerCommits(),
        leerProgreso(),
        leerColas(),
        leerEventosDelBus(80),
        git(["remote", "get-url", "origin"]).then(normalizarRemoto),
    ]);
    const ahora = Date.now();
    const datos: DatosConstruccion = {
        eventos,
        progreso: progresoEntradas(crudo),
        commits,
        colas: colaEntradas(tareasCola),
        ahora,
        baseRemota: remoto ?? "",
        baseLocal: process.env.STARSEED_MANDO_LOCAL ?? "http://localhost:9002",
    };
    let reportes = construirReportes(datos);
    // Sin remoto no hay enlaces de diff fiables: se quitan, no se inventan.
    if (!remoto) for (const r of reportes) r.enlaces = r.enlaces.filter((e) => e.clase !== "diff");
    if (o.desde) {
        const corte = new Date(o.desde).getTime();
        if (Number.isFinite(corte)) {
            reportes = reportes.filter((r) => {
                const t = new Date(r.t).getTime();
                return Number.isFinite(t) && t >= corte;
            });
        }
    }
    if (o.limite && o.limite > 0) reportes = reportes.slice(0, o.limite);
    return { reportes, generadoEn: new Date(ahora).toISOString() };
}
/**
 * Parsea la salida de `git log` con separador de REGISTRO `\x1e` y de CAMPO `\x1f`.
 * El separador de registro es la defensa contra el fallo que tumbó el intento
 * anterior: `%b` (cuerpo) puede llevar saltos de línea y un parseo línea a
 * línea partía el commit y dejaba la fecha fuera, excluyéndolo del `?desde`.
 * Con `\x1e` cada registro entero es un commit completo, multi-línea incluido.
 */
export function parsearLogGit(salida: string): Array<Omit<CommitEntrada, "archivos">> {
    const commits: Array<Omit<CommitEntrada, "archivos">> = [];
    for (const bruto of salida.split("\x1e")) {
        const campos = bruto.split("\x1f");
        if (campos.length < 4) continue;
        const sha = campos[0].trim();
        const cuerpo = campos[2].trim();
        const fecha = campos[3].trim();
        // Fecha no parseable = registro corrupto; se salta antes que mentir.
        if (!/^[0-9a-f]{7,40}$/i.test(sha)) continue;
        if (!Number.isFinite(new Date(fecha).getTime())) continue;
        commits.push({
            sha,
            asunto: campos[1].trim(),
            cuerpo: cuerpo || null,
            fecha,
        });
    }
    return commits;
}

/**
 * Normaliza la URL del remoto a https sin `.git`, de modo que sirva de base
 * para enlaces de diff (`${base}/commit/<sha>`). Acepta tanto la forma ssh
 * (`git@host:org/repo.git`) como https. Devuelve null si no es reconocible:
 * mejor ningún enlace que uno roto.
 */
export function normalizarRemoto(url: string): string | null {
    const limpia = url.trim().replace(/\.git$/, "").replace(/\/+$/, "");
    if (!limpia) return null;
    const ssh = /^git@([^:]+):(.+)$/.exec(limpia);
    if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
    const sshPlano = /^ssh:\/\/git@([^/]+)\/(.+)$/.exec(limpia);
    if (sshPlano) return `https://${sshPlano[1]}/${sshPlano[2]}`;
    if (/^https?:\/\//.test(limpia)) return limpia;
    return null;
}

/** Lee los últimos commits de main y los archivos que tocó cada uno. */
async function leerCommits(): Promise<CommitEntrada[]> {
    const bruto = await git([
        "log", "main", "-n", "60",
        "--format=%H%x1f%s%x1f%b%x1f%cI%x1e",
    ]);
    const sinArchivos = parsearLogGit(bruto);
    // Un `git show` por commit, en paralelo: son 60 comandos cortos y la
    // bandeja no puede esperar 60 idas y vueltas en serie.
    return Promise.all(
        sinArchivos.map(async (c) => {
            const nombres = await git(["show", "--name-only", "--format=", c.sha]);
            return {
                ...c,
                archivos: nombres
                    .split("\n")
                    .map((l) => l.trim())
                    .filter((l) => l.length > 0),
            };
        }),
    );
}
