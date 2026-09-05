/**
 * GET /api/voz/forja (Ola 246 · forja de voz 1.58 · Tarea F3)
 * ─────────────────────────────────────────────────────────────────────────────
 * Radiografía de lo que hay DE VERDAD en esta neurona para la forja de voz y el
 * backend 1.58: el motor OmniVoice compilado, los modelos GGUF descargados, el
 * servidor BitNet, el backend Astraura 1.58 y el demonio de voz.
 *
 * Cada comprobación va en su propio try/catch: un componente ausente nunca
 * rompe el resto del informe. Nunca se devuelven contenidos de archivos ni
 * secretos; solo presencia, tamaños y estado de salud.
 *
 * ⚠️ Vercel: no usar `process.cwd()` ni rutas relativas al proyecto (el
 * trazador de archivos metería el repo entero en la función). Solo rutas
 * absolutas del usuario construidas desde `homedir()` o variables de entorno.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import { access, readdir, stat } from "node:fs/promises";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;

/** Carpeta base del motor de voz en esta neurona. */
function directorioVoz(): string {
    return process.env.STARSEED_VOZ_DIR ?? join(homedir(), ".starseed", "astraura-voice");
}

/** Cierto si la ruta existe en disco (archivo o carpeta), falso ante cualquier fallo. */
async function existe(ruta: string): Promise<boolean> {
    try {
        await access(ruta);
        return true;
    } catch {
        return false;
    }
}

/** Lista los .gguf de una carpeta (sin recursión profunda), o [] si no existe. */
async function modelosDe(carpeta: string): Promise<Array<{ nombre: string; bytes: number }>> {
    const lista: Array<{ nombre: string; bytes: number }> = [];
    let entradas: string[] = [];
    try {
        entradas = await readdir(carpeta);
    } catch {
        return lista;
    }
    for (const nombre of entradas) {
        if (!nombre.toLowerCase().endsWith(".gguf")) continue;
        try {
            const info = await stat(join(carpeta, nombre));
            if (info.isFile()) lista.push({ nombre, bytes: info.size });
        } catch {
            // Un archivo ilegible no rompe el listado.
        }
    }
    return lista;
}

/** GET con límite de tiempo; devuelve respuesta y latencia, o null si falla. */
async function sondear(
    url: string,
    ms: number,
): Promise<{ respuesta: Response; latenciaMs: number } | null> {
    const control = new AbortController();
    const alarma = setTimeout(() => control.abort(), ms);
    const inicio = Date.now();
    try {
        const respuesta = await fetch(url, { signal: control.signal, cache: "no-store" });
        return { respuesta, latenciaMs: Date.now() - inicio };
    } catch {
        return null;
    } finally {
        clearTimeout(alarma);
    }
}

export async function GET(): Promise<Response> {
    // ── Motor OmniVoice compilado ────────────────────────────────────────────
    const rutaMotor = join(directorioVoz(), "omnivoice.cpp", "build", "bin", "tts-server");
    let motorPresente = false;
    try {
        motorPresente = await existe(rutaMotor);
    } catch {
        motorPresente = false;
    }

    // ── Modelos GGUF (carpeta base y subcarpeta models) ──────────────────────
    let modelos: Array<{ nombre: string; bytes: number }> = [];
    try {
        const base = directorioVoz();
        const vistos = new Set<string>();
        for (const m of [
            ...(await modelosDe(base)),
            ...(await modelosDe(join(base, "models"))),
        ]) {
            if (!vistos.has(m.nombre)) {
                vistos.add(m.nombre);
                modelos.push(m);
            }
        }
    } catch {
        modelos = [];
    }

    // ── Servidor BitNet (llama-server del backend 1.58) ──────────────────────
    const rutaBitnet = join(
        process.env.ASTRAURA_158_DIR ?? join(homedir(), "Documents", "IA 1.58 bit"),
        "backend",
        "BitNet",
        "build",
        "bin",
        "llama-server",
    );
    let bitnetPresente = false;
    try {
        bitnetPresente = await existe(rutaBitnet);
    } catch {
        bitnetPresente = false;
    }

    // ── Backend Astraura 1.58 (salud HTTP) ───────────────────────────────────
    const url158 = process.env.ASTRAURA_158_LOCAL_URL ?? "http://127.0.0.1:8000";
    let backend158: { url: string; vivo: boolean; latenciaMs: number } = {
        url: url158,
        vivo: false,
        latenciaMs: 0,
    };
    try {
        const sonda = await sondear(`${url158}/api/starseed/health`, 2500);
        if (sonda) {
            backend158 = { url: url158, vivo: sonda.respuesta.ok, latenciaMs: sonda.latenciaMs };
        }
    } catch {
        // Backend apagado: se queda vivo: false.
    }

    // ── Demonio de voz (mezclador OmniVoice) ─────────────────────────────────
    const urlDemonio = process.env.STARSEED_VOZ_DAEMON_URL ?? "http://127.0.0.1:4444";
    let demonio: { url: string; vivo: boolean; listo: boolean; modelo: string | null } = {
        url: urlDemonio,
        vivo: false,
        listo: false,
        modelo: null,
    };
    try {
        const sonda = await sondear(`${urlDemonio}/status`, 2500);
        if (sonda && sonda.respuesta.ok) {
            const cuerpo = (await sonda.respuesta.json()) as {
                ok?: unknown;
                ready?: unknown;
                model?: unknown;
            };
            demonio = {
                url: urlDemonio,
                vivo: cuerpo.ok === true,
                listo: cuerpo.ready === true,
                modelo: typeof cuerpo.model === "string" ? cuerpo.model : null,
            };
        }
    } catch {
        // Demonio apagado: se queda vivo: false.
    }

    return Response.json(
        {
            generadoEn: new Date().toISOString(),
            motor: { ruta: rutaMotor, presente: motorPresente },
            modelos,
            bitnet: { ruta: rutaBitnet, presente: bitnetPresente },
            backend158,
            demonio,
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
