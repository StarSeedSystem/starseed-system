/**
 * GET /api/voz/forja (Ola 246 · forja de voz 1.58 · Tarea F3b)
 * ─────────────────────────────────────────────────────────────────────────────
 * Radiografía de lo que hay DE VERDAD en esta neurona para la forja de voz y el
 * backend 1.58: el motor OmniVoice compilado, los modelos GGUF descargados, el
 * servidor BitNet, el backend Astraura 1.58 y el demonio de voz.
 *
 * Cada comprobación va en su propio try/catch: un componente ausente nunca
 * rompe el resto del informe. Nunca se devuelven contenidos de archivos ni
 * secretos; solo presencia, nombres base, tamaños y estado de salud.
 *
 * ⚠️ Vercel: no usar `process.cwd()` ni rutas relativas al proyecto (el
 * trazador de archivos metería el repo entero en la función). Solo rutas
 * absolutas del usuario construidas desde `homedir()` o variables de entorno.
 *
 * Corrección F3b (revisión bloqueante de F3):
 *  - SIN FUGA DE RUTAS: la respuesta nunca expone rutas absolutas del sistema.
 *    `motor` y `bitnet` devuelven `{ presente, binario }`, donde `binario` es
 *    SOLO el nombre del archivo (`tts-server`, `llama-server`), nunca la ruta;
 *    no existe ningún campo `ruta`/`rutaMotor`/`rutaBitnet`. Los modelos GGUF
 *    son `{ nombre, bytes }` con el nombre base únicamente.
 *  - PUERTA DE SESIÓN: misma que `/api/voz/salud`. En producción se exige un
 *    usuario autenticado (`supabase.auth.getUser()`); en desarrollo no se exige,
 *    porque el demonio y el backend viven en 127.0.0.1.
 *  - I/O ACOTADA: las dos peticiones a 127.0.0.1 (backend 1.58 y demonio) se
 *    disparan en paralelo con `Promise.all`; las comprobaciones de disco son en
 *    serie y acotadas a 5 operaciones de I/O como máximo.
 */

import { homedir } from "node:os";
import { join, basename } from "node:path";
import { access, readdir, stat } from "node:fs/promises";
import { createClient } from "@/utils/supabase/server";

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
            if (info.isFile()) lista.push({ nombre: basename(nombre), bytes: info.size });
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
    // Puerta de sesión (misma que /api/voz/salud): solo exigida en producción.
    if (process.env.NODE_ENV === "production") {
        try {
            const supabase = await createClient();
            const { data, error } = await supabase.auth.getUser();
            if (error || !data.user) {
                return Response.json({ error: "Necesitas iniciar sesión." }, { status: 401 });
            }
        } catch {
            return Response.json({ error: "No se pudo verificar la sesión." }, { status: 401 });
        }
    }

    // ── Comprobaciones de disco (en serie, acotadas) ─────────────────────────
    // 5 operaciones de I/O: access del motor (1), access del bitnet (2),
    // readdir base (3), readdir models (4) y el stat acumulado de los .gguf (5).
    // El binario del motor vive en `omnivoice.cpp/build/tts-server` (sin `bin/`).
    // Por compatibilidad se comprueba también la variante antigua
    // `omnivoice.cpp/build/bin/tts-server`; `presente` es true si existe cualquiera.
    const rutasMotor = [
        join(directorioVoz(), "omnivoice.cpp", "build", "tts-server"),
        join(directorioVoz(), "omnivoice.cpp", "build", "bin", "tts-server"),
    ];
    let motorPresente = false;
    try {
        for (const rutaMotor of rutasMotor) {
            if (await existe(rutaMotor)) {
                motorPresente = true;
                break;
            }
        }
    } catch {
        motorPresente = false;
    }

    let modelos: Array<{ nombre: string; bytes: number }> = [];
    try {
        const base = directorioVoz();
        const vistos = new Set<string>();
        for (const m of [
            ...(await modelosDe(base)),
            ...(await modelosDe(join(base, "models"))),
            ...(await modelosDe(join(base, "omnivoice.cpp", "models"))),
        ]) {
            if (!vistos.has(m.nombre)) {
                vistos.add(m.nombre);
                modelos.push(m);
            }
        }
    } catch {
        modelos = [];
    }

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

    // ── Peticiones a 127.0.0.1 (en paralelo) ─────────────────────────────────
    const url158 = process.env.ASTRAURA_158_LOCAL_URL ?? "http://127.0.0.1:8000";
    const urlDemonio = process.env.STARSEED_VOZ_DAEMON_URL ?? "http://127.0.0.1:4444";

    const [sonda158, sondaDemonio] = await Promise.all([
        sondear(`${url158}/api/starseed/health`, 4000),
        sondear(`${urlDemonio}/status`, 4000),
    ]);

    let backend158: { url: string; vivo: boolean; latenciaMs: number } = {
        url: url158,
        vivo: false,
        latenciaMs: 0,
    };
    if (sonda158) {
        backend158 = { url: url158, vivo: sonda158.respuesta.ok, latenciaMs: sonda158.latenciaMs };
    }

    let demonio: {
        url: string;
        vivo: boolean;
        listo: boolean;
        modelo: string | null;
        caliente: boolean;
    } = {
        url: urlDemonio,
        vivo: false,
        listo: false,
        modelo: null,
        caliente: false,
    };
    if (sondaDemonio && sondaDemonio.respuesta.ok) {
        try {
            const cuerpo = (await sondaDemonio.respuesta.json()) as {
                ok?: unknown;
                ready?: unknown;
                model?: unknown;
                warm?: unknown;
            };
            demonio = {
                url: urlDemonio,
                vivo: cuerpo.ok === true,
                listo: cuerpo.ready === true,
                modelo: typeof cuerpo.model === "string" ? cuerpo.model : null,
                caliente: cuerpo.warm === true,
            };
        } catch {
            // Respuesta no JSON: se queda vivo: false.
        }
    }

    return Response.json(
        {
            generadoEn: new Date().toISOString(),
            // Solo el último segmento de cada carpeta base, nunca la ruta completa.
            carpetas: {
                voz: basename(directorioVoz()),
                astraura158: basename(
                    process.env.ASTRAURA_158_DIR ?? join(homedir(), "Documents", "IA 1.58 bit"),
                ),
            },
            motor: { presente: motorPresente, binario: "tts-server" },
            modelos,
            bitnet: { presente: bitnetPresente, binario: "llama-server" },
            backend158,
            demonio,
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}