/**
 * Push que se repara solo (2026-10-09).
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex pulsó PUBLICAR en Astraura y Genesis le devolvió «Falló · remote: Permission to
 * StarSeedSystem/astraura.git denied to alexbordongarrigos · 403». Y ahí se quedó.
 *
 * La causa era de cuentas, no de código: en la Mac hay DOS sesiones de GitHub en `gh`
 * (`alexbordongarrigos`, la activa, y `StarSeedSystem`, la dueña de los dos repos). La
 * activa puede escribir en starseed-system pero en astraura solo puede LEER. git usaba la
 * activa y nadie probaba con la otra, que sí puede.
 *
 * Qué hace esto, en orden, dentro de la MISMA orden de publicar (no publica nada que no se
 * haya pedido):
 *   1. Si para este repo ya se sabe qué cuenta escribe (`cuentas-push.json`, solo NOMBRES de
 *      cuenta), empuja con ella directamente.
 *   2. Si GitHub dice «Permission to O/R denied to U», prueba con cada otra cuenta con sesión
 *      en `gh` y, si una funciona, la recuerda para este repo.
 *   3. Si el fallo es de red (DNS, corte, 5xx), lo reintenta dos veces con espera.
 *   4. Si nada funciona, dice QUÉ hace falta y con el enlace exacto.
 *
 * Ningún token pasa por aquí: git le pide la credencial a un ayudante de una línea que llama
 * a `gh auth token --user <cuenta>` y se la entrega a git por su tubería. Ni se escribe en
 * disco, ni se registra, ni la ve este proceso.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Nombre de usuario de GitHub válido: letras, cifras y guiones, hasta 39. Nada más entra en el ayudante. */
const RE_CUENTA = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;

/** PURA. «Permission to O/R.git denied to U.» → { repo: "O/R", usuario: "U" }; si no aparece, null. */
export function cuentaDenegada(salida: string): { repo: string; usuario: string } | null {
    const m = /Permission to ([\w.-]+\/[\w.-]+?)(?:\.git)? denied to ([\w-]+)/i.exec(String(salida ?? ""));
    return m ? { repo: m[1], usuario: m[2] } : null;
}

/** PURA. Las cuentas con sesión que lista `gh auth status` («Logged in to github.com account X»). */
export function cuentasDeGh(estado: string): string[] {
    const vistas: string[] = [];
    for (const m of String(estado ?? "").matchAll(/Logged in to github\.com (?:account|as) ([\w-]+)/g)) {
        if (RE_CUENTA.test(m[1]) && !vistas.includes(m[1])) vistas.push(m[1]);
    }
    return vistas;
}

/** PURA. ¿Es un fallo de red pasajero (se arregla reintentando) y no de permisos ni de historia? */
export function esFalloDeRed(salida: string): boolean {
    const s = String(salida ?? "");
    if (/denied|rejected|non-fast-forward|fetch first|stale info/i.test(s)) return false;
    return /Could not resolve host|Connection (?:timed out|reset|refused)|Failed to connect|Operation timed out|RPC failed|early EOF|unexpected disconnect|returned error: 5\d\d|SSL_ERROR|TLS connection|timed out/i.test(s);
}

/** PURA. «owner/repo» a partir de la URL del remoto (https o ssh); null si no es GitHub. */
export function repoDeUrl(url: string): string | null {
    const m = /github\.com[/:]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(String(url ?? "").trim());
    return m ? m[1] : null;
}

/**
 * PURA. Los argumentos de git para empujar con una cuenta concreta de `gh`. El ayudante vacía
 * la lista de ayudantes (el `gh auth git-credential` global solo sabe dar la cuenta activa) y
 * pone uno de una línea que imprime `username=` y `password=` sacando el token de `gh` en el
 * momento. La cuenta se valida antes: nada que no sea un nombre de usuario entra en el shell.
 */
export function argsConCuenta(args: string[], cuenta: string, gh: string): string[] {
    if (!RE_CUENTA.test(cuenta)) throw new Error("nombre de cuenta no válido");
    if (/["'`$\\\n]/.test(gh)) throw new Error("ruta de gh no válida");
    const ayudante = `!f() { [ "$1" = get ] || exit 0; echo username=${cuenta}; printf "password="; "${gh}" auth token --user ${cuenta}; }; f`;
    return ["-c", "credential.helper=", "-c", `credential.helper=${ayudante}`, ...args];
}

/** PURA. Qué hace falta cuando ninguna cuenta puede escribir: enlace y orden exactos. */
export function queHaceFalta(repo: string, usuario: string, probadas: string[]): string {
    const otras = probadas.filter((c) => c !== usuario);
    return [
        `Ninguna cuenta con sesión en esta Mac puede escribir en ${repo}`
            + (otras.length ? ` (probadas: ${[usuario, ...otras].join(", ")}).` : ` (solo hay sesión de ${usuario}).`),
        `Hace falta UNA de estas dos cosas:`,
        `· dar permiso de escritura a ${usuario}: https://github.com/${repo}/settings/access`,
        `· o iniciar sesión con la cuenta dueña del repo: gh auth login --hostname github.com --git-protocol https`,
        `Después basta con volver a pulsar PUBLICAR: la cuenta que funcione queda recordada.`,
    ].join("\n");
}

/** Dónde está `gh` en esta máquina (launchd no trae el PATH de Homebrew). */
export function rutaGh(): string {
    for (const r of ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"]) if (existsSync(r)) return r;
    return "gh";
}

type Memoria = Record<string, string>;

async function leerMemoria(ruta: string): Promise<Memoria> {
    try {
        const d = JSON.parse(await readFile(ruta, "utf8")) as unknown;
        if (!d || typeof d !== "object") return {};
        return Object.fromEntries(
            Object.entries(d as Record<string, unknown>).filter(([, v]) => typeof v === "string" && RE_CUENTA.test(v)),
        ) as Memoria;
    } catch {
        return {};
    }
}

async function guardarMemoria(ruta: string, m: Memoria): Promise<void> {
    try {
        await writeFile(ruta, JSON.stringify(m, null, 2), "utf8");
    } catch { /* recordar es un extra: la publicación ya salió */ }
}

export type ResultadoPush = { ok: boolean; salida: string; cuenta: string | null; reparado: string | null };

type Ejecutor = (args: string[]) => Promise<{ stdout: string; stderr: string }>;

/**
 * Empuja reparando lo reparable. `args` es la orden de git tal cual (`push origin …`).
 * `carpetaMemoria` es la carpeta de publicaciones (allí vive `cuentas-push.json`).
 * Los ejecutores se pueden inyectar en las pruebas.
 */
export async function pushReparable(opts: {
    cwd: string;
    args: string[];
    carpetaMemoria: string;
    ejecutar?: Ejecutor;
    estadoGh?: () => Promise<string>;
    urlRemoto?: () => Promise<string>;
    esperar?: (ms: number) => Promise<void>;
}): Promise<ResultadoPush> {
    const { cwd, args, carpetaMemoria } = opts;
    const gh = rutaGh();
    const entorno = { ...process.env, GIT_TERMINAL_PROMPT: "0" };
    const ejecutar: Ejecutor = opts.ejecutar ?? (async (a) => {
        const r = await execFileAsync("git", a, { cwd, timeout: 55000, maxBuffer: 4 * 1024 * 1024, windowsHide: true, env: entorno });
        return { stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? "") };
    });
    const estadoGh = opts.estadoGh ?? (async () => {
        try {
            const r = await execFileAsync(gh, ["auth", "status", "--hostname", "github.com"], { timeout: 15000, windowsHide: true });
            return `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
        } catch (e) {
            const err = e as { stdout?: string; stderr?: string };
            return `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
        }
    });
    const urlRemoto = opts.urlRemoto ?? (async () => {
        try {
            return (await execFileAsync("git", ["remote", "get-url", "origin"], { cwd, timeout: 8000, windowsHide: true })).stdout;
        } catch {
            return "";
        }
    });
    const esperar = opts.esperar ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const rutaMemoria = path.join(carpetaMemoria, "cuentas-push.json");

    const intentar = async (a: string[]): Promise<{ ok: boolean; salida: string }> => {
        // Un corte de red se reintenta dos veces (5 s y 15 s) antes de darlo por fallo.
        let salida = "";
        for (const pausa of [0, 5000, 15000]) {
            if (pausa) await esperar(pausa);
            try {
                const r = await ejecutar(a);
                return { ok: true, salida: `${r.stdout}\n${r.stderr}`.trim() };
            } catch (e) {
                const err = e as { stdout?: string; stderr?: string; message?: string };
                salida = `${err.stdout ?? ""}\n${err.stderr ?? err.message ?? "error"}`.trim();
                if (!esFalloDeRed(salida)) break;
            }
        }
        return { ok: false, salida };
    };

    const memoria = await leerMemoria(rutaMemoria);
    const repo = repoDeUrl(await urlRemoto());
    const recordada = repo ? memoria[repo] : undefined;
    const probadas: string[] = [];

    if (recordada) {
        probadas.push(recordada);
        const r = await intentar(argsConCuenta(args, recordada, gh));
        if (r.ok) return { ok: true, salida: r.salida, cuenta: recordada, reparado: null };
        // La cuenta recordada ya no sirve (revocada, sin sesión): se olvida y se sigue normal.
        if (repo) {
            delete memoria[repo];
            await guardarMemoria(rutaMemoria, memoria);
        }
    }

    const normal = await intentar(args);
    if (normal.ok) return { ok: true, salida: normal.salida, cuenta: null, reparado: null };

    const denegada = cuentaDenegada(normal.salida);
    if (!denegada) return { ok: false, salida: normal.salida, cuenta: null, reparado: null };

    const cuentas = cuentasDeGh(await estadoGh()).filter((c) => c !== denegada.usuario && !probadas.includes(c));
    for (const cuenta of cuentas) {
        probadas.push(cuenta);
        const r = await intentar(argsConCuenta(args, cuenta, gh));
        if (r.ok) {
            const clave = repo ?? denegada.repo;
            memoria[clave] = cuenta;
            await guardarMemoria(rutaMemoria, memoria);
            const reparado = `Autorreparado: la cuenta «${denegada.usuario}» solo puede leer ${denegada.repo}; `
                + `publicado con «${cuenta}», que sí puede escribir (queda recordada para este repo).`;
            return { ok: true, salida: `${reparado}\n${r.salida}`.trim(), cuenta, reparado };
        }
    }
    return {
        ok: false,
        salida: `${normal.salida}\n\n${queHaceFalta(denegada.repo, denegada.usuario, probadas)}`.trim(),
        cuenta: null,
        reparado: null,
    };
}
