"use client";

/**
 * MOTOR DE VOZ LOCAL DE ASTRAURA (Adenda 217 · 2026-09-02)
 * ─────────────────────────────────────────────────────────────────────────────
 * Cliente del daemon `native/astraura-voice/daemon.mjs` (127.0.0.1:4444): el
 * motor neuronal OmniVoice en GGUF cuantizado, corriendo en la propia máquina
 * por llama.cpp/ggml (Metal en Apple, CPU en el resto). Sin red, sin cuenta,
 * misma voz en cualquier equipo. Es la pieza que hace real «voz local para
 * cualquier dispositivo».
 *
 * LO QUE SE ENCONTRÓ AL CONECTARLO (y explica días de silencio):
 *   · El daemon llevaba desde agosto fallando CADA síntesis con «timeout de
 *     síntesis (180000 ms)». Causa: la configuración apuntaba al modelo
 *     Q4_K_M, pero el binario `omnivoice-tts` solo carga F32 / BF16 / Q8_0.
 *     Con Q8_0 (ya descargado) sintetiza a la primera.
 *   · El rito nunca lo consultaba: solo lo usaba la cadena OmniVoice general.
 *
 * CÓMO SE CONSIGUE «INSTANTÁNEO» con un modelo que en un M1 de 8 GB tarda
 * ~4× tiempo real: ANTICIPANDO. Los textos del rito se conocen de antemano,
 * así que se sintetizan en segundo plano mientras lees el paso anterior, y el
 * daemon cachea cada WAV por hash. Cuando llegas al paso, el audio ya está.
 * La primera frase de todas se espera con la semilla girando; las demás no.
 */

import type { Timbre } from "@/lib/aurora/timbres";

export const MOTOR_LOCAL_URL = "http://127.0.0.1:4444";

/**
 * (Adenda 217) DOS CAMINOS AL DAEMON, y por qué:
 *  · `/api/voz-local/*` — por el propio servidor del OS (mismo origen). Es el
 *    que funciona en navegadores embebidos, paneles aislados y Tauri, donde una
 *    petición directa a 127.0.0.1 no sale. Solo sirve si el servidor corre en
 *    la misma máquina que el daemon (desarrollo, Tauri, autoalojado).
 *  · `http://127.0.0.1:4444/*` — directo. Es el que sirve cuando el servidor
 *    está en la nube (Vercel) y no ve el 127.0.0.1 del usuario.
 * Se prueba el proxy; si responde 502/404 se recuerda y se va directo.
 */
let proxyMuerto = false;

async function pedir(ruta: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    const { timeoutMs = 5000, ...resto } = init;
    const intentar = async (base: string) => {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), timeoutMs);
        try {
            return await fetch(`${base}/${ruta}`, { ...resto, signal: ctrl.signal });
        } finally {
            clearTimeout(t);
        }
    };
    if (!proxyMuerto) {
        try {
            const r = await intentar("/api/voz-local");
            if (r.status !== 502 && r.status !== 404) return r;
            proxyMuerto = true; // el servidor no ve el daemon: a partir de ahora, directo
        } catch {
            proxyMuerto = true;
        }
    }
    return intentar(MOTOR_LOCAL_URL);
}

export interface EstadoMotorLocal {
    vivo: boolean;
    listo: boolean;
    caliente: boolean;
    modelo: string;
    quant: string;
    backend: string;
}

const APAGADO: EstadoMotorLocal = { vivo: false, listo: false, caliente: false, modelo: "", quant: "", backend: "" };

let estadoCache: { at: number; v: EstadoMotorLocal } | null = null;

/** Estado del daemon, cacheado 5 s. Nunca lanza. */
export async function estadoMotorLocal(): Promise<EstadoMotorLocal> {
    if (typeof window === "undefined") return APAGADO;
    if (estadoCache && Date.now() - estadoCache.at < 5000) return estadoCache.v;
    try {
        const r = await pedir("status", { timeoutMs: 2500 });
        const j = (await r.json()) as { ok?: boolean; ready?: boolean; warm?: boolean; model?: string; quant?: string; backend?: string };
        const v: EstadoMotorLocal = {
            vivo: !!j?.ok,
            listo: !!j?.ready,
            caliente: !!j?.warm,
            modelo: j?.model ?? "",
            quant: j?.quant ?? "",
            backend: j?.backend ?? "",
        };
        estadoCache = { at: Date.now(), v };
        return v;
    } catch {
        estadoCache = { at: Date.now(), v: APAGADO };
        return APAGADO;
    }
}

/** Pide al daemon que cargue el modelo ya, para que la primera frase no espere. */
export function precalentarMotorLocal(): void {
    if (typeof window === "undefined") return;
    void pedir("warm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lang: "Spanish" }),
        timeoutMs: 8000,
    }).catch(() => null);
}

/* ── Caché de anticipación ─────────────────────────────────────────────────── */

const audios = new Map<string, Promise<Blob | null>>();

function clave(texto: string, t: Timbre): string {
    return `${t.id}|${t.local.speed}|${texto.trim()}`;
}

/**
 * Sintetiza `texto` con el timbre dado. Devuelve el WAV como Blob, o null si el
 * daemon no pudo. Las peticiones idénticas se comparten (una sola síntesis).
 */
export function sintetizarLocal(texto: string, t: Timbre): Promise<Blob | null> {
    const k = clave(texto, t);
    const previa = audios.get(k);
    if (previa) return previa;

    const p = (async () => {
        try {
            const r = await pedir("tts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                timeoutMs: 120_000,
                body: JSON.stringify({
                    text: texto.trim(),
                    lang: "Spanish",
                    speed: t.local.speed,
                    // El carácter del timbre viaja como instrucción de estilo; el
                    // daemon la sanea contra su vocabulario y la ignora si no aplica.
                    instruct: t.local.instruct || undefined,
                    // Clonación: la referencia de Aurora para los timbres que la piden.
                    ref_wav_path: t.local.ref || undefined,
                }),
            });
            if (!r.ok) return null;
            const b = await r.blob();
            return b.size > 44 ? b : null;
        } catch {
            return null;
        }
    })();

    audios.set(k, p);
    // Un fallo no se cachea: la próxima vez se vuelve a intentar.
    void p.then((b) => { if (!b) audios.delete(k); });
    return p;
}

/** Anticipa varias frases en segundo plano (no espera, no lanza). */
export function anticiparLocal(textos: string[], t: Timbre): void {
    for (const texto of textos) {
        if (texto && texto.trim()) void sintetizarLocal(texto, t);
    }
}

/* ── Reproducción ──────────────────────────────────────────────────────────── */

let audioActual: HTMLAudioElement | null = null;
let urlActual: string | null = null;

/** Corta la reproducción local en curso. Idempotente. */
export function pararLocal(): void {
    try { audioActual?.pause(); } catch { /* */ }
    if (urlActual) { try { URL.revokeObjectURL(urlActual); } catch { /* */ } }
    audioActual = null;
    urlActual = null;
}

/**
 * Reproduce un WAV. Resuelve `true` en cuanto EMPIEZA a sonar de verdad
 * (evento `playing`), `false` si el navegador lo bloquea o falla.
 */
export function reproducirLocal(blob: Blob, opts: { onEnd?: () => void } = {}): Promise<boolean> {
    return new Promise((resolve) => {
        pararLocal();
        try {
            const url = URL.createObjectURL(blob);
            const a = new Audio(url);
            a.preload = "auto";
            audioActual = a;
            urlActual = url;
            let arranco = false;
            a.onplaying = () => { arranco = true; resolve(true); };
            a.onended = () => { if (urlActual === url) pararLocal(); opts.onEnd?.(); };
            a.onerror = () => { if (!arranco) resolve(false); pararLocal(); opts.onEnd?.(); };
            a.play().catch(() => { if (!arranco) resolve(false); pararLocal(); opts.onEnd?.(); });
            // Si en 4 s no ha empezado a sonar, se da por fallido.
            setTimeout(() => { if (!arranco) resolve(false); }, 4000);
        } catch {
            resolve(false);
        }
    });
}


/* ── Canalización por frases ───────────────────────────────────────────────── */

/**
 * Parte en frases por puntuación fuerte. Las muy cortas se pegan a la
 * siguiente para no encolar migajas.
 */
export function partirEnFrases(texto: string): string[] {
    const bruto = texto.replace(/\s+/g, " ").trim().split(/(?<=[.!?…])\s+/).filter(Boolean);
    const out: string[] = [];
    for (const f of bruto) {
        if (out.length && f.length < 18) out[out.length - 1] += ` ${f}`;
        else out.push(f);
    }
    return out.length ? out : [texto];
}

let turnoFrases = 0;

/**
 * (Adenda 217) Habla un texto largo SIN esperar a sintetizarlo entero:
 *  1. Se sintetiza la PRIMERA frase sola (corta → pocos segundos) y se
 *     reproduce en cuanto está.
 *  2. Mientras suena, las siguientes se sintetizan en orden y se encadenan
 *     sin hueco.
 * Con un modelo que en un M1 va a ~4× tiempo real, esto baja el primer sonido
 * de «todo el párrafo» a «una frase». Resuelve `true` en cuanto EMPIEZA a
 * sonar la primera; `false` si ni la primera pudo.
 */
export async function hablarLocalPorFrases(texto: string, t: Timbre, onInicio?: () => void): Promise<boolean> {
    const mio = ++turnoFrases;
    const frases = partirEnFrases(texto);

    // Lanza todas las síntesis ya (comparten caché); se reproducen en orden.
    const blobs = frases.map((f) => sintetizarLocal(f, t));

    const primera = await blobs[0];
    if (mio !== turnoFrases) return false;
    if (!primera) return false;

    let arranco = false;
    for (let i = 0; i < frases.length; i++) {
        if (mio !== turnoFrases) return arranco;
        const b = i === 0 ? primera : await blobs[i];
        if (mio !== turnoFrases) return arranco;
        if (!b) continue; // una frase fallida no calla las demás

        const fin = new Promise<void>((res) => {
            void reproducirLocal(b, { onEnd: res }).then((ok) => {
                if (i === 0) { arranco = ok; if (ok) { try { onInicio?.(); } catch { /* */ } } }
                if (!ok) res();
            });
        });
        await fin;
    }
    return arranco;
}

/** Mantiene el daemon despierto mientras dure `hasta()` (p. ej. el rito). */
export function mantenerCaliente(hasta: () => boolean): () => void {
    precalentarMotorLocal();
    const id = window.setInterval(() => {
        if (!hasta()) { window.clearInterval(id); return; }
        precalentarMotorLocal();
    }, 90_000);
    return () => window.clearInterval(id);
}
