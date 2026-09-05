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

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

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

const CLAVES: Record<string, string[]> = {
    xkiro: ["XKIRO_API_KEY"],
    nim: ["NVIDIA_API_KEY", "NVIDIA_SHARED_KEY"],
    aihubmix: ["AIHUBMIX_API_KEY"],
    tokenrouter: ["TOKENROUTER_API_KEY"],
    openrouter: ["OPENROUTER_API_KEY", "OPENROUTER_SHARED_KEY"],
    gemini: ["GEMINI_API_KEY", "GOOGLE_API_KEY", "NEXT_PUBLIC_GOOGLE_API_KEY"],
};

const URLS: Record<string, string> = {
    xkiro: "https://api.xkiro.com/v1/chat/completions",
    nim: "https://integrate.api.nvidia.com/v1/chat/completions",
    aihubmix: "https://aihubmix.com/v1/chat/completions",
    tokenrouter: "https://api.tokenrouter.com/v1/chat/completions",
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    ollama: "http://127.0.0.1:11434/v1/chat/completions",
};

/** Catálogo fijo de lo que el enjambre ya usa (verificado en las olas 238-241). */
const FIJOS: Array<Omit<ModeloDisponible, "salud">> = [
    { id: "nim/moonshotai/kimi-k3", proveedor: "nim", nombre: "Kimi K3", gratis: true, contexto: 262144, papel: "escritor" },
    { id: "nim/deepseek-ai/deepseek-v4-flash-0731", proveedor: "nim", nombre: "DeepSeek V4 Flash", gratis: true, contexto: 131072, papel: "escritor" },
    { id: "nim/deepseek-ai/deepseek-v4-pro-0813", proveedor: "nim", nombre: "DeepSeek V4 Pro", gratis: true, contexto: 131072, papel: "escritor" },
    { id: "nim/nvidia/nemotron-3-super-120b-a12b", proveedor: "nim", nombre: "Nemotron 3 Super 120B", gratis: true, contexto: 131072, papel: "general" },
    { id: "aihubmix/coding-glm-5.3-free", proveedor: "aihubmix", nombre: "GLM 5.3 (coding, gratis)", gratis: true, contexto: 128000, papel: "revisor" },
    { id: "aihubmix/gemini-3.7-flash-free", proveedor: "aihubmix", nombre: "Gemini 3.7 Flash (gratis)", gratis: true, contexto: 1000000, papel: "revisor" },
    { id: "tokenrouter/z-ai/glm-5.3-free", proveedor: "tokenrouter", nombre: "GLM 5.3 (tokenrouter)", gratis: true, contexto: 128000, papel: "revisor" },
    { id: "openrouter/nvidia/nemotron-3-super-120b-a12b:free", proveedor: "openrouter", nombre: "Nemotron 3 Super (OpenRouter)", gratis: true, contexto: 131072, papel: "revisor" },
    { id: "gemini/gemini-2.5-flash-lite", proveedor: "gemini", nombre: "Gemini 2.5 Flash Lite", gratis: true, contexto: 1048576, papel: "revisor" },
    { id: "gemini/gemini-2.5-flash", proveedor: "gemini", nombre: "Gemini 2.5 Flash", gratis: true, contexto: 1048576, papel: "general" },
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
            });
        }
        modelos.sort((a, b) => a.id.localeCompare(b.id));
        cacheXkiro = { t: Date.now(), modelos };
        return modelos;
    } catch {
        return cacheXkiro?.modelos ?? [];
    }
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

/** Salud por proveedor según el supervisor del enjambre (archivo compartido). */
async function saludProveedores(): Promise<Record<string, string>> {
    try {
        const d = JSON.parse(await readFile(path.join(homedir(), ".starseed", "salud-proveedores.json"), "utf-8")) as Record<string, { estado?: string }>;
        const salida: Record<string, string> = {};
        for (const [p, v] of Object.entries(d)) salida[p] = v?.estado ?? "desconocido";
        return salida;
    } catch {
        return {};
    }
}

/** Todos los modelos usables ahora, con salud y si hay clave. */
export async function listarModelos(): Promise<ModeloDisponible[]> {
    const [xk, ol, salud] = await Promise.all([modelosXkiro(), modelosOllama(), saludProveedores()]);
    const conClave: Record<string, boolean> = {};
    for (const p of Object.keys(CLAVES)) conClave[p] = Boolean(await claveDe(...CLAVES[p]));
    const todos = [...FIJOS.map((m) => ({ ...m, salud: "desconocido" })), ...xk, ...ol];
    return todos.map((m) => ({
        ...m,
        salud: m.proveedor === "ollama" ? m.salud : !conClave[m.proveedor] ? "sin-clave" : salud[m.proveedor] ?? "desconocido",
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
        const url = URLS[proveedor];
        if (!url) throw new Error(`Proveedor desconocido: ${proveedor}.`);
        const clave = proveedor === "ollama" ? "ollama" : await claveDe(...(CLAVES[proveedor] ?? []));
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
