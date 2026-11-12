/**
 * «Pruebas» en el pulso · fuentes (PRB1111V) · SOLO SERVIDOR
 * ─────────────────────────────────────────────────────────────────────────────
 * Lee, con defensa, lo que escribe el director de pruebas y el banco de pruebas (PRB1111W) en
 * `~/.starseed/produccion/` (`STARSEED_PRODUCCION_DIR` lo cambia en las pruebas), los instaladores del prerelease
 * `canal-pruebas` (API pública de GitHub, sin token), la cola local de commits (git) y el registro de un paso que
 * falló (`gh run view --log-failed`, sin tocar nunca el token). Y ESCRIBE las peticiones al director: un archivo por
 * petición en `pruebas-peticiones/<id>.json`. Nunca devuelve rutas del disco ni claves.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { publicacionParaEnviar, type EnMarcha } from "@/lib/mando/en-marcha";
import { leerCarrilDeDisco, leerPuertaDeDisco } from "@/lib/mando/en-marcha-disco";
import { raizDelProyecto } from "@/lib/mando/raiz";

import { aplicarArchivo, estaEnMarcha, resumenPruebas } from "./lanzamientos-pruebas";
import {
    carpetaProduccion,
    escribirAtomico,
    git,
    leerComprobaciones,
    pruebasCompartidas,
} from "./lanzamientos-pruebas-fuentes";
import {
    accesosDeVersion,
    cuerpoDePeticion,
    idDePeticion,
    leerBanco,
    leerDirector,
    leerPeticion,
    pruebaParaEnviar,
    ultimasLineasDelRegistro,
} from "./pruebas-vivas";
import type {
    AccesosPrueba,
    ArchivoPrerelease,
    BancoLeido,
    ColaLocal,
    DirectorLeido,
    PeticionControl,
    PeticionVista,
    RespuestaVivo,
} from "./pruebas-vivas-tipos";

const ejecutar = promisify(execFile);
const REPO = "StarSeedSystem/starseed-system";
const GH = ["/opt/homebrew/bin/gh", "/usr/local/bin/gh", "gh"];

export const ARCHIVO_DIRECTOR = "pruebas-director-estado.json";
export const ARCHIVO_BANCO = "pruebas-banco.json";
export const CARPETA_PETICIONES = "pruebas-peticiones";

export function rutaPeticiones(): string {
    return path.join(carpetaProduccion(), CARPETA_PETICIONES);
}

async function leerJsonDe(ruta: string): Promise<{ ok: true; valor: unknown } | { ok: false; falta: boolean }> {
    let crudo: string;
    try {
        crudo = await readFile(ruta, "utf-8");
    } catch {
        return { ok: false, falta: true };
    }
    try {
        return { ok: true, valor: JSON.parse(crudo) as unknown };
    } catch {
        return { ok: false, falta: false };
    }
}

export async function leerDirectorArchivo(): Promise<DirectorLeido | "ilegible" | null> {
    const r = await leerJsonDe(path.join(carpetaProduccion(), ARCHIVO_DIRECTOR));
    if (!r.ok) return r.falta ? null : "ilegible";
    return leerDirector(r.valor) ?? "ilegible";
}

export async function leerBancoArchivo(): Promise<BancoLeido | "ilegible" | null> {
    const r = await leerJsonDe(path.join(carpetaProduccion(), ARCHIVO_BANCO));
    if (!r.ok) return r.falta ? null : "ilegible";
    return leerBanco(r.valor) ?? "ilegible";
}

async function archivosJson(dir: string, max: number): Promise<string[]> {
    let nombres: string[];
    try {
        nombres = (await readdir(dir)).filter((n) => /^[a-z0-9-]{1,40}\.json$/.test(n));
    } catch {
        return [];
    }
    const con = await Promise.all(nombres.map(async (n) => ({ n, m: (await stat(path.join(dir, n)).catch(() => null))?.mtimeMs ?? 0 })));
    return con.sort((a, b) => b.m - a.m).slice(0, max).map((x) => path.join(dir, x.n));
}

/** Las peticiones recientes: las pendientes (sin atender), las hechas y las que cuenta el director. Más nueva primero. */
export async function leerPeticiones(director: DirectorLeido | "ilegible" | null): Promise<PeticionVista[]> {
    const dir = rutaPeticiones();
    const [pend, hechas] = await Promise.all([archivosJson(dir, 20), archivosJson(path.join(dir, "hechas"), 20)]);
    const por = new Map<string, PeticionVista>();
    const poner = (p: PeticionVista | null) => {
        if (p) por.set(p.id, p);
    };
    for (const p of pend) {
        const r = await leerJsonDe(p);
        if (r.ok) poner(leerPeticion(r.valor, "pendiente"));
    }
    if (director && director !== "ilegible") for (const p of director.peticiones) poner(p);
    for (const p of hechas) {
        const r = await leerJsonDe(p);
        if (!r.ok) continue;
        const v = leerPeticion(r.valor, "hecha");
        if (v) poner(v.estado === "pendiente" || v.estado === "escrita" ? { ...v, estado: "hecha" } : v);
    }
    return [...por.values()].sort((a, b) => (Date.parse(b.t ?? "") || 0) - (Date.parse(a.t ?? "") || 0)).slice(0, 20);
}

/** Escribe UNA petición para el director (tmp + rename). Devuelve su id. */
export async function escribirPeticion(p: PeticionControl, ahora = Date.now(), azar = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0")): Promise<string> {
    const id = idDePeticion(ahora, azar());
    const cuerpo = cuerpoDePeticion(p, id, new Date(ahora).toISOString().replace(/\.\d{3}Z$/, "Z"));
    await escribirAtomico(path.join(rutaPeticiones(), `${id}.json`), cuerpo);
    return id;
}

// ── La cola local ──────────────────────────────────────────────────────────────────────────────────

const SHA40 = /^[0-9a-f]{40}$/;

export async function colaLocal(): Promise<ColaLocal> {
    const [local, origen, cuenta] = await Promise.all([
        git(["rev-parse", "HEAD"]),
        git(["rev-parse", "origin/main"]),
        git(["rev-list", "--count", "origin/main..HEAD"]),
    ]);
    const n = cuenta.ok && /^\d+$/.test(cuenta.salida) ? Number(cuenta.salida) : null;
    return {
        sinPublicar: n,
        local: local.ok && SHA40.test(local.salida) ? local.salida : null,
        origen: origen.ok && SHA40.test(origen.salida) ? origen.salida : null,
    };
}

// ── Instaladores del prerelease ────────────────────────────────────────────────────────────────────

let cacheArchivos: { t: number; valor: ArchivoPrerelease[] | null } | null = null;

export async function archivosDelPrerelease(ahora = Date.now(), pedir: typeof fetch = fetch): Promise<ArchivoPrerelease[] | null> {
    if (cacheArchivos && ahora - cacheArchivos.t < 60_000) return cacheArchivos.valor;
    let valor: ArchivoPrerelease[] | null = null;
    try {
        const r = await pedir(`https://api.github.com/repos/${REPO}/releases/tags/canal-pruebas`, {
            headers: { Accept: "application/vnd.github+json" },
            cache: "no-store",
            signal: AbortSignal.timeout(5_000),
        });
        if (r.ok) {
            const d = (await r.json()) as { assets?: { name?: unknown; size?: unknown }[] };
            valor = (Array.isArray(d.assets) ? d.assets : [])
                .filter((a) => typeof a?.name === "string")
                .map((a) => ({ nombre: a.name as string, bytes: typeof a.size === "number" ? a.size : null }));
        }
    } catch {
        valor = null;
    }
    cacheArchivos = { t: ahora, valor };
    return valor;
}

// ── Qué corre ahora (ligero) ───────────────────────────────────────────────────────────────────────

export async function leerEnMarchaLigero(): Promise<EnMarcha | null> {
    const carpeta = path.join(os.homedir(), ".starseed", "produccion");
    const autopub = async () => {
        const leer = async (n: string) => JSON.parse(await readFile(path.join(carpeta, n), "utf8").catch(() => "{}")) as Record<string, unknown>;
        const [interruptor, estado] = await Promise.all([leer("autopublicar.json"), leer("autopublicar-estado.json")]);
        const ultima = Number(estado.ultima_publicacion);
        const act = typeof estado.actualizado === "string" ? Date.parse(estado.actualizado.replace(" ", "T")) : NaN;
        return {
            activa: interruptor.activo === true,
            fase: typeof estado.fase === "string" ? estado.fase : undefined,
            detalle: typeof estado.detalle === "string" ? estado.detalle : undefined,
            ultimaMs: Number.isFinite(ultima) && ultima > 0 ? ultima * 1000 : undefined,
            actualizadoMs: Number.isFinite(act) ? act : undefined,
        };
    };
    const [carril, puerta, publicacion] = await Promise.all([
        leerCarrilDeDisco(raizDelProyecto()).catch(() => null),
        leerPuertaDeDisco(path.join(carpeta, "puerta-estado.json"), path.join(os.homedir(), ".starseed", "opus1031")).catch(() => null),
        autopub().then(publicacionParaEnviar).catch(() => null),
    ]);
    return carril || puerta || publicacion ? { generadoMs: Date.now(), carril, puerta, publicacion } : null;
}

// ── Registro de un paso que falló ──────────────────────────────────────────────────────────────────

const cacheRegistros = new Map<number, { t: number; valor: ReturnType<typeof ultimasLineasDelRegistro> }>();

/** Las últimas líneas del paso que falló de un job, ya sin claves. null si gh no respondió. */
export async function registroDeFallo(runId: number, jobId: number, ahora = Date.now()): Promise<ReturnType<typeof ultimasLineasDelRegistro> | null> {
    if (!Number.isInteger(runId) || runId <= 0 || !Number.isInteger(jobId) || jobId <= 0) return null;
    const guardado = cacheRegistros.get(jobId);
    if (guardado && ahora - guardado.t < 5 * 60_000) return guardado.valor;
    for (const bin of GH) {
        if (bin.startsWith("/") && !existsSync(bin)) continue;
        try {
            const { stdout } = await ejecutar(bin, ["run", "view", String(runId), "--job", String(jobId), "--log-failed", "--repo", REPO], {
                timeout: 30_000,
                maxBuffer: 16 * 1024 * 1024,
            });
            const valor = ultimasLineasDelRegistro(stdout);
            cacheRegistros.set(jobId, { t: ahora, valor });
            return valor;
        } catch {
            return null;
        }
    }
    return null;
}

/** (PRB1111V) La prueba en marcha para «Qué corre ahora»: nadie espera más de 2,5 s; sin foto, null (no se inventa). */
export async function pruebaParaEnMarcha(esperaMs = 2_500): Promise<ReturnType<typeof pruebaParaEnviar>> {
    const foto = await Promise.race([pruebasCompartidas().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), esperaMs))]);
    if (!foto) return null;
    const archivo = await leerComprobaciones().catch(() => null);
    return pruebaParaEnviar(archivo ? aplicarArchivo(foto.versiones, archivo) : foto.versiones, foto.tipicos, Date.now());
}

// ── Todo junto ─────────────────────────────────────────────────────────────────────────────────────

/** La respuesta de `GET …/pruebas/vivo`. */
export async function reunirVivo(opciones: { aprobarAqui: boolean; ahora?: number }): Promise<RespuestaVivo> {
    const ahora = opciones.ahora ?? Date.now();
    const [foto, archivo, director, banco, cola, enMarchaBase, archivos] = await Promise.all([
        pruebasCompartidas(),
        leerComprobaciones(),
        leerDirectorArchivo(),
        leerBancoArchivo(),
        colaLocal(),
        leerEnMarchaLigero().catch(() => null),
        archivosDelPrerelease(ahora),
    ]);
    const peticiones = await leerPeticiones(director);
    const versiones = aplicarArchivo(foto.versiones, archivo);

    const accesos: AccesosPrueba[] = [];
    if (archivos) {
        const enMarcha = versiones.find(estaEnMarcha);
        const ultima = versiones.find((v) => v.publicadaEnTodas && v.version);
        if (enMarcha?.version) accesos.push({ ...accesosDeVersion(enMarcha.version, "en-marcha", archivos, enMarcha.plataformas.map((p) => p.plataforma)), numero: enMarcha.numero });
        if (ultima?.version && ultima.numero !== enMarcha?.numero) accesos.push({ ...accesosDeVersion(ultima.version, "ultima-publicada", archivos, ultima.plataformas.map((p) => p.plataforma)), numero: ultima.numero });
    }
    const prueba = pruebaParaEnviar(versiones, foto.tipicos, ahora);
    const enMarcha: EnMarcha | null = enMarchaBase || prueba ? { generadoMs: ahora, carril: null, puerta: null, ...(enMarchaBase ?? {}), pruebas: prueba } : null;

    return {
        ...foto,
        versiones,
        resumen: resumenPruebas(versiones, ahora),
        aprobarAqui: opciones.aprobarAqui,
        controlAqui: opciones.aprobarAqui,
        tipicos: foto.tipicos,
        director,
        banco,
        cola,
        peticiones,
        accesos,
        prereleaseLeido: archivos !== null,
        enMarcha,
        ahoraServidor: ahora,
    };
}

export { leerComprobaciones, pruebasCompartidas };
