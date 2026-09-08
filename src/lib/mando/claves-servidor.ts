/**
 * Claves de proveedor desde el Puente de Mando (solo servidor, sin "use client")
 * ─────────────────────────────────────────────────────────────────────────────
 * Guarda, prueba y olvida la clave de un proveedor escribiéndola SOLO en
 * `~/.starseed/env` (chmod 600), nunca en el repositorio ni en memoria. De una
 * clave solo sale su NOMBRE de variable y una HUELLA; jamás su valor.
 * (2026-09-08, Ola 286 · F1)
 */

import { createHash } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { PROVEEDORES_CATALOGO, type ProveedorInfo } from "@/lib/mando/proveedores-catalogo";

/** Prefijos de clave conocidos por id de proveedor (para `validarClaveDeProveedor`). */
const PREFIJOS_DE_PROVEEDOR: Record<string, string> = {
    nim: "nvapi-",
    openrouter: "sk-or-",
    groq: "gsk_",
    aihubmix: "sk-",
    tokenrouter: "tr_",
};

/** Nombres admitidos para una variable de entorno: `NOMBRE` o `NOMBRE_SUFIJO`. */
const RE_VARIABLE = /^[A-Z][A-Z0-9_]{2,60}$/;

/** Prefijo de las pasarelas OpenAI-compatibles declaradas por entorno. */
const RE_PASARELA_URL = /^STARSEED_PASARELA_([A-Z0-9]+)_URL$/;

export function huellaClave(valor: string): string {
    return `${valor.slice(0, 6)}…(${valor.length})`;
}

export function validarClaveDeProveedor(
    idProveedor: string,
    valor: string,
): { ok: true } | { ok: false; error: string } {
    const prefijo = PREFIJOS_DE_PROVEEDOR[idProveedor];
    if (prefijo !== undefined && !valor.startsWith(prefijo)) {
        return { ok: false, error: `La clave de ${infoDe(idProveedor)?.nombre ?? idProveedor} debe empezar por «${prefijo}».` };
    }
    return { ok: true };
}

/** Ruta absoluta de `~/.starseed/env` (chmod 600). */
function rutaEnv(): string {
    return path.join(homedir(), ".starseed", "env");
}

/**
 * Variables que `guardarClave` acepta para un proveedor del catálogo o una
 * pasarela declarada por entorno. Para una pasarela (id `STARSEED_PASARELA_<N>`)
 * admite sus cuatro nombres `_URL/_KEY/_MODELOS/_RPM` aunque no estén en el
 * catálogo (que es estático y no conoce las pasarelas que Alex declara en vivo).
 */
function variablesAdmitidas(idProveedor: string, variable: string): boolean {
    const info = infoDe(idProveedor);
    if (info && info.variables.includes(variable)) return true;
    const m = RE_PASARELA_URL.exec(variable);
    if (m) return true;
    const pasarela = /^STARSEED_PASARELA_[A-Z0-9]+_(KEY|MODELOS|RPM)$/.test(variable);
    return pasarela;
}

/**
 * Escribe `variable=valor` en `~/.starseed/env` respetando el resto de líneas.
 * Escritura atómica: borrador `.tmp` + `rename`, chmod 600, crea el archivo y
 * el directorio si faltan. El valor nunca se registra ni devuelve.
 */
export async function guardarClave(
    idProveedor: string,
    variable: string,
    valor: string,
): Promise<{ ok: boolean; huella?: string; error?: string }> {
    if (!RE_VARIABLE.test(variable)) {
        return { ok: false, error: "Nombre de variable no válido." };
    }
    if (!variablesAdmitidas(idProveedor, variable)) {
        return { ok: false, error: `La variable «${variable}» no es de este proveedor.` };
    }
    const ruta = rutaEnv();
    const lineas: string[] = [];
    let existia = false;
    try {
        const contenido = await readFile(ruta, "utf-8");
        for (const linea of contenido.split("\n")) {
            const l = linea.trimEnd();
            if (!l) continue;
            const i = l.indexOf("=");
            const nombre = i < 0 ? l.trim() : l.slice(0, i).trim();
            if (nombre === variable) {
                existia = true;
                lineas.push(`${variable}=${valor}`);
            } else {
                lineas.push(l);
            }
        }
    } catch {
        // Sin archivo previo: se crea de cero.
    }
    if (!existia) lineas.push(`${variable}=${valor}`);
    const nuevo = lineas.join("\n") + "\n";
    try {
        await writeFile(ruta + ".tmp", nuevo, { mode: 0o600 });
        await rename(ruta + ".tmp", ruta);
        await chmod(ruta, 0o600);
    } catch (e) {
        return { ok: false, error: `No se pudo escribir ${ruta}: ${(e as Error).message}` };
    }
    return { ok: true, huella: huellaClave(valor) };
}

/** Borra la línea `variable=…` de `~/.starseed/env` (sin tocar el resto). */
export async function olvidarClave(variable: string): Promise<{ ok: boolean; error?: string }> {
    const ruta = rutaEnv();
    let contenido = "";
    try {
        contenido = await readFile(ruta, "utf-8");
    } catch {
        return { ok: true };
    }
    const lineas = contenido.split("\n").filter((linea) => {
        const l = linea.trimEnd();
        if (!l) return true;
        const i = l.indexOf("=");
        const nombre = i < 0 ? l.trim() : l.slice(0, i).trim();
        return nombre !== variable;
    });
    try {
        await writeFile(ruta + ".tmp", lineas.join("\n"), { mode: 0o600 });
        await rename(ruta + ".tmp", ruta);
        await chmod(ruta, 0o600);
    } catch (e) {
        return { ok: false, error: `No se pudo escribir ${ruta}: ${(e as Error).message}` };
    }
    return { ok: true };
}

/** Agente de usuario propio: algunos Cloudflare rechazan el UA por defecto. */
const UA = "starseed-mando/1 (+starseed-os)";

/**
 * Prueba la clave contra `<base>/models` con `Authorization: Bearer`, 8 s de
 * timeout, y cuenta cuántos modelos devuelve. Nunca registra el valor. Un 401
 * o 403 significa «la clave fue rechazada».
 */
export async function probarClave(
    base: string,
    valor: string,
): Promise<{ ok: boolean; modelos?: number; error?: string }> {
    const ctrl = new AbortController();
    const temporizador = setTimeout(() => ctrl.abort(), 8000);
    try {
        const r = await fetch(`${base.replace(/\/+$/, "")}/models`, {
            headers: { Authorization: `Bearer ${valor}`, "User-Agent": UA },
            signal: ctrl.signal,
            cache: "no-store",
        });
        if (r.status === 401 || r.status === 403) {
            return { ok: false, error: "la clave fue rechazada" };
        }
        if (!r.ok) {
            return { ok: false, error: `El proveedor respondió ${r.status}.` };
        }
        const d = (await r.json()) as { data?: unknown };
        const modelos = Array.isArray(d.data) ? d.data.length : 0;
        return { ok: true, modelos };
    } catch (e) {
        const esAbort = (e as Error).name === "AbortError";
        return { ok: false, error: esAbort ? "El proveedor tardó demasiado en responder." : "No se pudo contactar con el proveedor." };
    } finally {
        clearTimeout(temporizador);
    }
}

function infoDe(id: string): ProveedorInfo | undefined {
    return PROVEEDORES_CATALOGO.find((p) => p.id === id);
}