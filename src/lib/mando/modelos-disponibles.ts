/**
 * Modelos disponibles para el asistente del Mando y cómo llamarlos (solo servidor)
 * ─────────────────────────────────────────────────────────────────────────────
 * Catálogo vivo de TODOS los modelos que esta máquina puede usar ahora mismo —
 * xKiro (los gratuitos de su catálogo), NVIDIA NIM, aihubmix, tokenrouter, OpenRouter,
 * Gemini y Ollama local— con la salud que publica el supervisor del enjambre, y una
 * única función `llamarModelo()` que habla con cualquiera de ellos.
 *
 * Claves: `process.env` primero y, si faltan, los archivos de entorno de la máquina
 * (`~/.starseed/env`, `~/.hermes/.env`, chmod 600). Nunca se devuelven al cliente:
 * el catálogo solo dice si un proveedor «tiene clave».
 */

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

import { raizDelProyecto } from "@/lib/mando/raiz";
import { PROVEEDORES_CATALOGO } from "@/lib/mando/proveedores-catalogo";

export interface ModeloDisponible {
    /** `proveedor/modelo`, tal como se pide a `llamarModelo`. */
    id: string;
    proveedor: string;
    nombre: string;
    gratis: boolean;
    contexto: number | null;
    /** vivo · caido · sin-clave · desconocido (según el supervisor del enjambre). */
    salud: string;
    /** Papel habitual en el enjambre, para orientar al usuario. */
    papel: "escritor" | "revisor" | "local" | "general";
    /** El enjambre escribe código con este modelo (Ola 269). */
    escritor?: boolean;
    /** Solo se usa para tareas de texto/Markdown, nunca para código (Ola 269). */
    soloMarkdown?: boolean;
    /** Detalle vivo del supervisor del enjambre para su proveedor (sin cupo, 429…). */
    saludDetalle?: SaludProveedor | null;
    /** `proveedor/modelo` del último revisor que respondió bien (global del enjambre). */
    ultimoRevisorOk?: string | null;
}

/** Una clave de un proveedor según el supervisor: nombre y huella, nunca el valor. */
export interface ClaveSalud {
    var: string;
    medio: string;
    huella: string;
    /** Hasta cuándo está agotada («AAAA-MM-DD HH:MM:SS»), si lo está. */
    agotadaHasta: string | null;
}

/** Detalle de salud de un proveedor según el supervisor del enjambre (Ola 269). */
export interface SaludProveedor {
    estado: string | null;
    /** Hasta cuándo queda sin cupo («AAAA-MM-DD HH:MM:SS»), si el proveedor lo anunció. */
    sinCupoHasta: string | null;
    /** Motivo del último corte o agotamiento, si lo hay. */
    motivo: string | null;
    /** Momento del último 429 («AAAA-MM-DD HH:MM:SS»). */
    ultimo429: string | null;
    /** Claves conocidas (P9 · Ola 271): variables, medios y huellas, nunca valores. */
    claves: ClaveSalud[];
    /** Variable de la clave activa, si la hay. */
    clavesActiva: string | null;
    /** Momento del sondeo («AAAA-MM-DD HH:MM:SS» · `t` o `desde`), para detectar datos viejos. */
    t: string | null;
}

/** Resultado de interpretar `salud-proveedores.json`: detalle por proveedor y revisor global. */
export interface SaludRevisores {
    porProveedor: Record<string, SaludProveedor>;
    /** `proveedor/modelo` del último revisor que dio una respuesta útil. */
    ultimoRevisorOk: string | null;
}

export interface MensajeModelo {
    rol: "system" | "user" | "assistant";
    texto: string;
}

export interface RespuestaModelo {
    texto: string;
    modelo: string;
    proveedor: string;
    latenciaMs: number;
    tokens: { entrada: number; salida: number } | null;
}

const UA = "starseed-mando-asistente/1 (+starseed-os)";
let envExtra: Record<string, string> | null = null;
let cacheXkiro: { t: number; modelos: ModeloDisponible[] } | null = null;

/** Lee KEY=VALOR de los archivos de entorno de la máquina (una vez por proceso). */
async function leerEnvExtra(): Promise<Record<string, string>> {
    if (envExtra) return envExtra;
    const salida: Record<string, string> = {};
    for (const ruta of ["~/.starseed/env", "~/.hermes/.env"]) {
        try {
            const contenido = await readFile(ruta.replace(/^~/, homedir()), "utf-8");
            for (const linea of contenido.split("\n")) {
                const l = linea.trim();
                if (!l || l.startsWith("#") || !l.includes("=")) continue;
                const i = l.indexOf("=");
                const k = l.slice(0, i).trim();
                const v = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
                if (k && v && !(k in salida)) salida[k] = v;
            }
        } catch {
            // sin archivo
        }
    }
    envExtra = salida;
    return salida;
}

/** Valor de una variable: entorno del proceso o archivos de entorno. */
export async function claveDe(...nombres: string[]): Promise<string | null> {
    for (const n of nombres) {
        const v = process.env[n];
        if (v && v.trim()) return v.trim();
    }
    const extra = await leerEnvExtra();
    for (const n of nombres) {
        if (extra[n]) return extra[n];
    }
    return null;
}

/** Una clave de proveedor presente de verdad en esta máquina (nunca su valor). */
export interface ClavePresente {
    /** Nombre de la variable, p. ej. `NVIDIA_API_KEY` o `XKIRO_API_KEY_2`. */
    var: string;
    /** Medio corto donde vive: `proceso` · `starseed` · `hermes` · `env.local`. */
    medio: string;
    /** sha256(valor).slice(0, 8): sirve para comparar sin exponer nada. */
    huella: string;
}

// Caché por ruta absoluta: el archivo de entorno se lee una vez por proceso.
const cacheArchivosEnv = new Map<string, Record<string, string>>();

/** Lee un archivo KEY=VALOR (una vez por proceso y ruta); devuelve {} si no existe. */
async function leerArchivoEnv(ruta: string): Promise<Record<string, string>> {
    const guardado = cacheArchivosEnv.get(ruta);
    if (guardado) return guardado;
    const salida: Record<string, string> = {};
    try {
        const contenido = await readFile(ruta, "utf-8");
        for (const linea of contenido.split("\n")) {
            const l = linea.trim();
            if (!l || l.startsWith("#") || !l.includes("=")) continue;
            const i = l.indexOf("=");
            const k = l.slice(0, i).trim();
            const v = l.slice(i + 1).trim().replace(/^["']|["']$/g, "");
            if (k && v && !(k in salida)) salida[k] = v;
        }
    } catch {
        // sin archivo: ese medio no aporta claves
    }
    cacheArchivosEnv.set(ruta, salida);
    return salida;
}

/** Variables candidatas de un proveedor, con los sufijos de relevo `_2`…`_9`. */
function variablesConSufijos(base: string[]): string[] {
    const salida: string[] = [];
    for (const nombre of base) {
        salida.push(nombre);
        for (let n = 2; n <= 9; n++) salida.push(`${nombre}_${n}`);
    }
    return salida;
}

/** Una pasarela OpenAI-compatible declarada por entorno (Ola 286 · F4). */
export interface PasarelaDeclarada {
    /** Nombre corto en minúsculas (de `STARSEED_PASARELA_<NOMBRE>_URL`). */
    id: string;
    /** Variable de su clave: `STARSEED_PASARELA_<NOMBRE>_KEY`. */
    variable: string;
    /** Base `/v1` ya normalizada (sin la barra final). */
    url: string;
    /** Modelos de `_MODELOS` (separados por comas), o [] si no se declaró. */
    modelos: string[];
    /** Límite de peticiones por minuto: `_RPM` o 15 por defecto. */
    rpm: number;
}

/**
 * Detecta las pasarelas declaradas por entorno (`STARSEED_PASARELA_<NOMBRE>_URL`) y
 * devuelve una entrada por pasarela. Pura: solo lee la fuente dada y nunca expone el
 * valor de la clave (solo el nombre de la variable en `variable`). Ola 286 · F4.
 */
export function pasarelasDeclaradas(fuente: Record<string, string | undefined>): PasarelaDeclarada[] {
    const salida: PasarelaDeclarada[] = [];
    for (const [k, v] of Object.entries(fuente)) {
        const m = /^STARSEED_PASARELA_([A-Z0-9]+)_URL$/.exec(k);
        if (!m || !v) continue;
        const pref = `STARSEED_PASARELA_${m[1]}`;
        const rpmTexto = (fuente[`${pref}_RPM`] ?? "").trim();
        const rpm = Number(rpmTexto);
        salida.push({
            id: m[1].toLowerCase(),
            variable: `${pref}_KEY`,
            url: v.trim().replace(/\/+$/, ""),
            modelos: (fuente[`${pref}_MODELOS`] ?? "").split(",").map((x) => x.trim()).filter(Boolean),
            rpm: Number.isFinite(rpm) && rpm > 0 ? rpm : 15,
        });
    }
    return salida;
}

/**
 * Claves que esta máquina tiene DE VERDAD por proveedor y por medio (Ola 271 · M9B):
 * para cada proveedor del catálogo vivo recorre por separado el entorno del proceso,
 * `~/.starseed/env`, `~/.hermes/.env` y `.env.local`, y devuelve solo
 * `{var, medio, huella}` — JAMÁS el valor. Es la fuente honesta para la pestaña Flota:
 * el JSON de salud del supervisor puede estar viejo o vacío, pero estas claves valen.
 */
export async function clavesPresentes(): Promise<Record<string, ClavePresente[]>> {
    const hogar = homedir();
    // Medio corto → lista de variables de ese medio (se recorren en orden).
    const medios: Array<{ medio: string; fuente: Record<string, string | undefined> }> = [
        { medio: "proceso", fuente: process.env },
        { medio: "starseed", fuente: await leerArchivoEnv(path.join(hogar, ".starseed", "env")) },
        { medio: "hermes", fuente: await leerArchivoEnv(path.join(hogar, ".hermes", ".env")) },
        { medio: "env.local", fuente: await leerArchivoEnv(path.join(raizDelProyecto(), ".env.local")) },
    ];
    const salida: Record<string, ClavePresente[]> = {};
    for (const [proveedor, variables] of Object.entries(CLAVES)) {
        const halladas: ClavePresente[] = [];
        for (const { medio, fuente } of medios) {
            for (const nombre of variablesConSufijos(variables)) {
                const valor = fuente[nombre];
                if (typeof valor !== "string" || !valor.trim()) continue;
                // La huella permite distinguir claves sin filtrar ni un carácter del valor.
                halladas.push({
                    var: nombre,
                    medio,
                    huella: createHash("sha256").update(valor.trim(), "utf-8").digest("hex").slice(0, 8),
                });
            }
        }
        salida[proveedor] = halladas;
    }
    // Pasarelas declaradas por entorno: entran como proveedor con clave presente si su
    // variable `STARSEED_PASARELA_<NOMBRE>_KEY` tiene valor en algún medio (Ola 286 · F4).
    const fuenteGlobal: Record<string, string | undefined> = {};
    for (const { fuente } of medios) {
        for (const [k, v] of Object.entries(fuente)) {
            if (typeof v === "string" && v.trim()) fuenteGlobal[k] = v.trim();
        }
    }
    for (const pasarela of pasarelasDeclaradas(fuenteGlobal)) {
        const halladas: ClavePresente[] = [];
        for (const { medio, fuente } of medios) {
            const valor = fuente[pasarela.variable];
            if (typeof valor !== "string" || !valor.trim()) continue;
            halladas.push({
                var: pasarela.variable,
                medio,
                huella: createHash("sha256").update(valor.trim(), "utf-8").digest("hex").slice(0, 8),
            });
        }
        if (halladas.length > 0) salida[pasarela.id] = halladas;
    }
    return salida;
}

/**
 * Variables extra que el catálogo no declara pero esta máquina conoce (compartidas,
 * sufijos alternativos o variantes públicas). Se fusionan con las del catálogo en
 * `variablesDeProveedor` (el catálogo primero, sin duplicados). Ola 286 · F4.
 */
const ALIAS: Record<string, string[]> = {
    // Compartida con el servidor (clave comunitaria, no la personal).
    nim: ["NVIDIA_SHARED_KEY"],
    openrouter: ["OPENROUTER_SHARED_KEY"],
    // La pública expone el proveedor en el cliente; se revisa igual que las privadas.
    gemini: ["GOOGLE_API_KEY", "NEXT_PUBLIC_GOOGLE_API_KEY"],
};

/**
 * Unión sin duplicados de las variables de un proveedor: primero las del catálogo,
 * luego los alias que el catálogo no tenga. Pura: solo junta nombres, jamás valores.
 */
export function variablesDeProveedor(id: string, delCatalogo: string[]): string[] {
    const salida: string[] = [];
    for (const nombre of [...delCatalogo, ...(ALIAS[id] ?? [])]) {
        if (!salida.includes(nombre)) salida.push(nombre);
    }
    return salida;
}

/**
 * Diccionario vivo de variables por proveedor, construido a partir de
 * `PROVEEDORES_CATALOGO` (que ya trae `variables` por proveedor, p. ej. groq →
 * `["GROQ_API_KEY"]`) más los alias de arriba. Así el Mando reconoce las claves de
 * TODOS los proveedores del catálogo, no solo los 8 que estaban a mano (Ola 286 · F4).
 */
const CLAVES: Record<string, string[]> = Object.fromEntries(
    PROVEEDORES_CATALOGO.map((p) => [p.id, variablesDeProveedor(p.id, p.variables)]),
);

/** Proveedores que responden sin clave (a cupo reducido): el catálogo no los marca «sin-clave». */
const SIN_CLAVE_OK = new Set(["llm7"]);

const URLS: Record<string, string> = {
    xkiro: "https://api.xkiro.com/v1/chat/completions",
    nim: "https://integrate.api.nvidia.com/v1/chat/completions",
    aihubmix: "https://aihubmix.com/v1/chat/completions",
    tokenrouter: "https://api.tokenrouter.com/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    ollama: "http://127.0.0.1:11434/v1/chat/completions",
    llm7: "https://api.llm7.io/v1/chat/completions",
    freetheai: "https://api.freetheai.xyz/v1/chat/completions",
};

/** Catálogo fijo de lo que el enjambre ya usa (verificado en las olas 238-241). */
const FIJOS: Array<Omit<ModeloDisponible, "salud">> = [
    { id: "nim/moonshotai/kimi-k3", proveedor: "nim", nombre: "Kimi K3", gratis: true, contexto: 262144, papel: "escritor", escritor: true },
    { id: "nim/deepseek-ai/deepseek-v4-flash-0731", proveedor: "nim", nombre: "DeepSeek V4 Flash", gratis: true, contexto: 131072, papel: "escritor", escritor: true },
    { id: "nim/deepseek-ai/deepseek-v4-pro-0813", proveedor: "nim", nombre: "DeepSeek V4 Pro", gratis: true, contexto: 131072, papel: "escritor", escritor: true },
    { id: "nim/nvidia/nemotron-3-super-120b-a12b", proveedor: "nim", nombre: "Nemotron 3 Super 120B", gratis: true, contexto: 131072, papel: "general" },
    { id: "aihubmix/coding-glm-5.3-free", proveedor: "aihubmix", nombre: "GLM 5.3 (coding, gratis)", gratis: true, contexto: 128000, papel: "revisor" },
    { id: "aihubmix/gemini-3.7-flash-free", proveedor: "aihubmix", nombre: "Gemini 3.7 Flash (gratis)", gratis: true, contexto: 1000000, papel: "revisor" },
    { id: "tokenrouter/z-ai/glm-5.3-free", proveedor: "tokenrouter", nombre: "GLM 5.3 (tokenrouter)", gratis: true, contexto: 128000, papel: "revisor", escritor: true },
    { id: "openrouter/nvidia/nemotron-3-super-120b-a12b:free", proveedor: "openrouter", nombre: "Nemotron 3 Super (OpenRouter)", gratis: true, contexto: 131072, papel: "revisor" },
    { id: "gemini/gemini-2.5-flash-lite", proveedor: "gemini", nombre: "Gemini 2.5 Flash Lite", gratis: true, contexto: 1048576, papel: "revisor" },
    { id: "gemini/gemini-2.5-flash", proveedor: "gemini", nombre: "Gemini 2.5 Flash", gratis: true, contexto: 1048576, papel: "general" },
    // Gratis y sin clave (verificado 2026-09-05: revisión real en 14 s). Solo estos dos responden anónimos.
    { id: "llm7/minimax-m2.7", proveedor: "llm7", nombre: "MiniMax M2.7 (LLM7, sin clave)", gratis: true, contexto: 196608, papel: "revisor" },
    // gpt-oss de LLM7 escribe, pero solo tareas Markdown: no es fiable para código (Ola 269).
    { id: "llm7/gpt-oss", proveedor: "llm7", nombre: "gpt-oss 20B (LLM7, sin clave)", gratis: true, contexto: 131072, papel: "revisor", escritor: true, soloMarkdown: true },
    // Con FREETHEAI_API_KEY (Discord de FreeTheAi): 10-35 req/min, 250/día.
    { id: "freetheai/gpt-oss-120b", proveedor: "freetheai", nombre: "gpt-oss 120B (FreeTheAi)", gratis: true, contexto: 131072, papel: "revisor" },
];

function objeto(v: unknown): Record<string, unknown> {
    return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Modelos gratuitos de xKiro (catálogo real, 10 min de caché). */
async function modelosXkiro(): Promise<ModeloDisponible[]> {
    if (cacheXkiro && Date.now() - cacheXkiro.t < 10 * 60 * 1000) return cacheXkiro.modelos;
    const clave = await claveDe(...CLAVES.xkiro);
    if (!clave) return [];
    try {
        const ctrl = new AbortController();
        const temporizador = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch("https://api.xkiro.com/v1/models", {
            headers: { Authorization: `Bearer ${clave}`, "User-Agent": UA },
            signal: ctrl.signal,
            cache: "no-store",
        });
        clearTimeout(temporizador);
        if (!r.ok) return [];
        const d = (await r.json()) as { data?: unknown[] };
        const lista = Array.isArray(d.data) ? d.data : [];
        const modelos: ModeloDisponible[] = [];
        for (const bruto of lista) {
            const m = objeto(bruto);
            const id = typeof m.id === "string" ? m.id : "";
            const pricing = objeto(m.pricing);
            const gratis = Number(pricing.input ?? 1) === 0 && Number(pricing.output ?? 1) === 0;
            const caps = Array.isArray(m.capabilities) ? (m.capabilities as unknown[]).map(String) : [];
            const tools = caps.length === 0 || caps.some((c) => /tool|function/i.test(c));
            if (!id || !gratis || !tools) continue;
            modelos.push({
                id: `xkiro/${id}`,
                proveedor: "xkiro",
                nombre: typeof m.display_name === "string" ? m.display_name : id,
                gratis: true,
                contexto: typeof m.context_length === "number" ? m.context_length : null,
                salud: "desconocido",
                papel: /coder|code|devstral/i.test(id) ? "escritor" : "general",
                escritor: /coder|code|devstral/i.test(id) || undefined,
            });
        }
        modelos.sort((a, b) => a.id.localeCompare(b.id));
        cacheXkiro = { t: Date.now(), modelos };
        return modelos;
    } catch {
        return cacheXkiro?.modelos ?? [];
    }
}

/**
 * Pasarelas OpenAI-compatibles declaradas por entorno (mismo contrato que el orquestador):
 * `STARSEED_PASARELA_<NOMBRE>_URL` (base `/v1`), `_KEY` («sin-clave» si no exige), `_MODELOS`
 * (lista separada por comas; si falta se pide `GET /models`, hasta 40) y `_RPM`. Así entran
 * freellmapi en local (127.0.0.1:3001/v1), NavyAI o una pasarela propia sin tocar código.
 */
interface Pasarela {
    nombre: string;
    url: string;
    clave: string;
    modelos: string[];
}

async function pasarelas(): Promise<Pasarela[]> {
    const fuentes: Record<string, string> = { ...(await leerEnvExtra()) };
    for (const [k, v] of Object.entries(process.env)) if (typeof v === "string" && v.trim()) fuentes[k] = v.trim();
    const salida: Pasarela[] = [];
    for (const [k, v] of Object.entries(fuentes)) {
        const m = /^STARSEED_PASARELA_([A-Z0-9]+)_URL$/.exec(k);
        if (!m || !v) continue;
        const pref = `STARSEED_PASARELA_${m[1]}`;
        salida.push({
            nombre: m[1].toLowerCase(),
            url: v.replace(/\/+$/, ""),
            clave: fuentes[`${pref}_KEY`] || "sin-clave",
            modelos: (fuentes[`${pref}_MODELOS`] ?? "").split(",").map((x) => x.trim()).filter(Boolean),
        });
    }
    return salida;
}

let cachePasarelas: { t: number; modelos: ModeloDisponible[] } | null = null;

async function modelosPasarelas(): Promise<ModeloDisponible[]> {
    if (cachePasarelas && Date.now() - cachePasarelas.t < 10 * 60 * 1000) return cachePasarelas.modelos;
    const modelos: ModeloDisponible[] = [];
    for (const p of await pasarelas()) {
        let ids = p.modelos;
        if (ids.length === 0) {
            try {
                const ctrl = new AbortController();
                const temporizador = setTimeout(() => ctrl.abort(), 6000);
                const r = await fetch(`${p.url}/models`, { headers: { Authorization: `Bearer ${p.clave}`, "User-Agent": UA }, signal: ctrl.signal, cache: "no-store" });
                clearTimeout(temporizador);
                const d = r.ok ? ((await r.json()) as { data?: unknown[] }) : {};
                ids = (Array.isArray(d.data) ? d.data : []).map((x) => objeto(x).id).filter((x): x is string => typeof x === "string").slice(0, 40);
            } catch {
                ids = [];
            }
        }
        for (const id of ids) {
            modelos.push({ id: `${p.nombre}/${id}`, proveedor: p.nombre, nombre: `${id} (${p.nombre})`, gratis: true, contexto: null, salud: "desconocido", papel: "revisor" });
        }
    }
    cachePasarelas = { t: Date.now(), modelos };
    return modelos;
}

/** Modelos cargables en Ollama local (si está). */
async function modelosOllama(): Promise<ModeloDisponible[]> {
    try {
        const ctrl = new AbortController();
        const temporizador = setTimeout(() => ctrl.abort(), 1200);
        const r = await fetch("http://127.0.0.1:11434/api/tags", { signal: ctrl.signal, cache: "no-store" });
        clearTimeout(temporizador);
        if (!r.ok) return [];
        const d = (await r.json()) as { models?: Array<{ name?: string }> };
        return (d.models ?? [])
            .map((m) => m.name ?? "")
            .filter(Boolean)
            .map((n) => ({ id: `ollama/${n}`, proveedor: "ollama", nombre: `${n} (local)`, gratis: true, contexto: null, salud: "vivo", papel: "local" as const }));
    } catch {
        return [];
    }
}

/** Solo si el valor es una cadena con algo dentro. */
function texto(v: unknown): string | null {
    return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Interpreta el contenido (ya parseado) de `salud-proveedores.json`, que escribe el
 * supervisor del enjambre: por proveedor `{estado, t, sin_cupo_hasta?, motivo?, ultimo_429?}`
 * y, como clave global, `ultimo_revisor_ok` («proveedor/modelo»). Función pura (Ola 269):
 * ante una entrada vacía o deforme devuelve nulls, nunca lanza.
 */
export function interpretarSalud(json: unknown): SaludRevisores {
    const d = objeto(json);
    const porProveedor: Record<string, SaludProveedor> = {};
    let ultimoRevisorOk: string | null = null;
    for (const [proveedor, v] of Object.entries(d)) {
        if (proveedor === "ultimo_revisor_ok") {
            ultimoRevisorOk = texto(v);
            continue;
        }
        const entrada = objeto(v);
        if (Object.keys(entrada).length === 0) continue;
        const clavesBrutas = objeto(entrada.claves);
        const listaClaves = Array.isArray(clavesBrutas.claves) ? clavesBrutas.claves : [];
        const claves: ClaveSalud[] = listaClaves.map((c) => {
            const k = objeto(c);
            return {
                var: texto(k.var) ?? "",
                medio: texto(k.medio) ?? "",
                huella: texto(k.huella) ?? "",
                agotadaHasta: texto(k.agotada_hasta),
            };
        });
        porProveedor[proveedor] = {
            estado: texto(entrada.estado),
            sinCupoHasta: texto(entrada.sin_cupo_hasta),
            motivo: texto(entrada.motivo),
            ultimo429: texto(entrada.ultimo_429),
            claves,
            clavesActiva: texto(clavesBrutas.activa),
            t: texto(entrada.t) ?? texto(entrada.desde),
        };
    }
    return { porProveedor, ultimoRevisorOk };
}

/** Lee el archivo de salud que comparte el supervisor (null si no existe o está roto). */
async function leerSaludJson(): Promise<unknown> {
    try {
        return JSON.parse(await readFile(path.join(homedir(), ".starseed", "salud-proveedores.json"), "utf-8")) as unknown;
    } catch {
        return null;
    }
}

/** Salud detallada del supervisor, para el panel de flota (Ola 269). */
export async function saludRevisores(): Promise<SaludRevisores> {
    return interpretarSalud(await leerSaludJson());
}

/** JSON tal cual de `salud-proveedores.json` (para `proveedoresDisponibles` con sus fechas). */
export async function saludCruda(): Promise<unknown> {
    return leerSaludJson();
}

/** Estado textual por proveedor a partir del JSON ya leído (degrada lo viejo a «desconocido»). */
function estadosSalud(json: unknown): Record<string, string> {
    const salida: Record<string, string> = {};
    for (const [p, v] of Object.entries(objeto(json))) {
        const entrada = objeto(v);
        if (typeof entrada.estado !== "string") continue; // p. ej. la clave global ultimo_revisor_ok
        // Un sondeo de hace más de 10 min no dice nada del ahora (en la Mac el archivo se
        // queda con la última ola): «caído» viejo se degrada a «desconocido».
        const t = texto(entrada.t);
        const ms = t ? Date.parse(t.replace(" ", "T") + (t.length <= 19 ? "Z" : "")) : NaN;
        const viejo = !Number.isFinite(ms) || Date.now() - ms > 10 * 60 * 1000;
        salida[p] = viejo ? "desconocido" : entrada.estado;
    }
    return salida;
}

/** Todos los modelos usables ahora, con salud y si hay clave. */
export async function listarModelos(): Promise<ModeloDisponible[]> {
    const [xk, ol, pa, saludJson] = await Promise.all([modelosXkiro(), modelosOllama(), modelosPasarelas(), leerSaludJson()]);
    const salud = estadosSalud(saludJson);
    const detalles = interpretarSalud(saludJson);
    const conClave: Record<string, boolean> = {};
    for (const p of Object.keys(CLAVES)) conClave[p] = SIN_CLAVE_OK.has(p) || Boolean(await claveDe(...CLAVES[p]));
    for (const m of pa) conClave[m.proveedor] = true;
    const todos = [...FIJOS.map((m) => ({ ...m, salud: "desconocido" })), ...xk, ...ol, ...pa];
    return todos.map((m) => ({
        ...m,
        salud: m.proveedor === "ollama" ? m.salud : !conClave[m.proveedor] ? "sin-clave" : salud[m.proveedor] ?? "desconocido",
        saludDetalle: detalles.porProveedor[m.proveedor] ?? null,
        ultimoRevisorOk: detalles.ultimoRevisorOk,
    }));
}

/** Separa `proveedor/modelo` (el modelo puede llevar barras). */
export function partirModelo(id: string): { proveedor: string; modelo: string } {
    const i = id.indexOf("/");
    return i < 0 ? { proveedor: "nim", modelo: id } : { proveedor: id.slice(0, i), modelo: id.slice(i + 1) };
}

/**
 * Llama a un modelo con mensajes (system/user/assistant). OpenAI-compatible para
 * xkiro/nim/aihubmix/tokenrouter/openrouter/ollama; API nativa para Gemini. Lanza con
 * un mensaje claro si no hay clave o el proveedor falla.
 */
export async function llamarModelo(
    id: string,
    mensajes: MensajeModelo[],
    opciones: { maxTokens?: number; timeoutMs?: number; temperatura?: number } = {},
): Promise<RespuestaModelo> {
    const { proveedor, modelo } = partirModelo(id);
    const maxTokens = opciones.maxTokens ?? 2500;
    const timeoutMs = opciones.timeoutMs ?? 120_000;
    const temperatura = opciones.temperatura ?? 0.3;
    const inicio = Date.now();
    const ctrl = new AbortController();
    const temporizador = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        if (proveedor === "gemini") {
            const clave = await claveDe(...CLAVES.gemini);
            if (!clave) throw new Error("Sin clave de Gemini en esta máquina.");
            const system = mensajes.filter((m) => m.rol === "system").map((m) => m.texto).join("\n\n");
            const contents = mensajes
                .filter((m) => m.rol !== "system")
                .map((m) => ({ role: m.rol === "assistant" ? "model" : "user", parts: [{ text: m.texto }] }));
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${clave}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
                    contents,
                    generationConfig: { temperature: temperatura, maxOutputTokens: maxTokens },
                }),
                signal: ctrl.signal,
            });
            if (!r.ok) throw new Error(`Gemini respondió ${r.status}.`);
            const d = (await r.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } };
            const texto = (d.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
            return {
                texto,
                modelo,
                proveedor,
                latenciaMs: Date.now() - inicio,
                tokens: d.usageMetadata ? { entrada: d.usageMetadata.promptTokenCount ?? 0, salida: d.usageMetadata.candidatesTokenCount ?? 0 } : null,
            };
        }
        const pasarela = (await pasarelas()).find((p) => p.nombre === proveedor);
        const url = pasarela ? `${pasarela.url}/chat/completions` : URLS[proveedor];
        if (!url) throw new Error(`Proveedor desconocido: ${proveedor}.`);
        const clave = pasarela ? pasarela.clave : proveedor === "ollama" ? "ollama" : (await claveDe(...(CLAVES[proveedor] ?? []))) ?? (SIN_CLAVE_OK.has(proveedor) ? "sin-clave" : null);
        if (!clave) throw new Error(`Sin clave de ${proveedor} en esta máquina (variable ${(CLAVES[proveedor] ?? []).join(" o ")}).`);
        const r = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}`, "User-Agent": UA },
            body: JSON.stringify({
                model: modelo,
                messages: mensajes.map((m) => ({ role: m.rol, content: m.texto })),
                temperature: temperatura,
                max_tokens: maxTokens,
            }),
            signal: ctrl.signal,
        });
        if (!r.ok) {
            let detalle = "";
            try {
                const e = (await r.json()) as { error?: { message?: string } | string };
                detalle = typeof e.error === "string" ? e.error : e.error?.message ?? "";
            } catch {
                // sin cuerpo
            }
            throw new Error(`${proveedor} respondió ${r.status}${detalle ? `: ${detalle.slice(0, 160)}` : ""}.`);
        }
        const d = (await r.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        let texto = d.choices?.[0]?.message?.content ?? "";
        texto = texto.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
        // Un 200 con aviso de cuota no es una respuesta (aihubmix lo hace).
        if (texto.length < 400 && /prevent abuse of free resources|have not been recharged|free-model token quota|insufficient balance/i.test(texto)) {
            throw new Error(`${proveedor} sin cuota: ${texto.slice(0, 120)}`);
        }
        return {
            texto,
            modelo,
            proveedor,
            latenciaMs: Date.now() - inicio,
            tokens: d.usage ? { entrada: d.usage.prompt_tokens ?? 0, salida: d.usage.completion_tokens ?? 0 } : null,
        };
    } finally {
        clearTimeout(temporizador);
    }
}
