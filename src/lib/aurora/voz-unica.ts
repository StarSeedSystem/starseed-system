"use client";

/**
 * UNA SOLA PUERTA DE VOZ de Astraura (Ola 1015V · VZF1015I · `voz-fusionada-astraura.md` §3). NO cambia cómo
 * suena: elige el motor como `engine.speak` (voz en tiempo real —Supertonic, voz F1— si está lista; si no, la
 * cadena del registro y el navegador de suelo). Solo ordena QUIÉN habla: la conversación manda (sus frases en
 * fila) y corta lo de menos; ventana, lectura y Genesis (`mando`) sustituyen a su nivel; un aviso espera al
 * silencio ≤ 8 s o se descarta con registro; guía y ritos, en cola. `callar()` calla a TODOS. Nada lanza.
 */
import { auroraTransport } from "@/lib/aurora/open-aurora";
import { decirRT, vozRT } from "@/lib/aurora/voz-rt";
import type { ContextoVoz } from "@/lib/aurora/tts-oss/conversacion-fluida";

export type ContextoVozUnica = "conversacion" | "aviso" | "ventana" | "guia" | "rito" | "lectura" | "mando" | "llamada";
/** Empezó a sonar / terminó (o lo cortaron): para la orbe y el medio-dúplex de quien llama. */
export interface AvisosMotor { alEmpezar?: () => void; alTerminar?: () => void }
/** `prioridad` sustituye a la del contexto (3 manda, 2 sustituye a su nivel, 1 cede). */
export interface OpcionesVozUnica extends AvisosMotor { contexto: ContextoVozUnica; persona?: string; prioridad?: number }

/** Todo lo de fuera, inyectable: se prueba sin audio, sin red y sin reloj. */
export interface MotoresVoz {
    rt: { disponible(): Promise<boolean>; hablando(): boolean; detener(): void; decir(t: string, persona: string | undefined, a: AvisosMotor): Promise<boolean> };
    cadena(t: string, contexto: ContextoVozUnica, a: AvisosMotor): Promise<boolean>; // `speakWithConfiguredEngine`
    suelo(t: string, a: AvisosMotor): Promise<boolean>; // la voz del navegador: el suelo que siempre está
    callarResto(): void | Promise<void>; // cola clásica del motor, mezclador, motor local, navegador y rito
    ahora(): number; esperar(ms: number): Promise<void>; registrar(motivo: string): void;
}

export const PRIORIDAD: Record<ContextoVozUnica, number> = { conversacion: 3, llamada: 3, ventana: 2, lectura: 2, mando: 2, aviso: 1, guia: 1, rito: 1 };
export const ESPERA_AVISO_MS = 8_000, ESPERA_COLA_MS = 120_000;
const CONVERSA = new Set<ContextoVozUnica>(["conversacion", "llamada"]), EN_COLA = new Set<ContextoVozUnica>(["guia", "rito"]);
/** Contexto de la cadena de motores: en conversación manda la latencia MEDIDA. */
const contextoDeCadena = (c: ContextoVozUnica): ContextoVoz =>
    c === "conversacion" || c === "llamada" ? "conversacion"
        : c === "lectura" || c === "ventana" || c === "mando" ? "lectura"
            : "narracion";
const intento = async (f: () => Promise<boolean> | boolean): Promise<boolean> => { try { return await f(); } catch { return false; } };
export function crearPuertaVoz(m: MotoresVoz) {
    let gen = 0, ultimo = 0, callando = false, actual: { id: number; p: number; rt: boolean; hasta: number } | null = null;
    let colas = { charla: Promise.resolve(false), cola: Promise.resolve(false) };
    // Cada motor por separado (uno roto no deja al resto hablando); `callando` ignora la vuelta a `callar()` de `engine.interrupt`.
    const cortarTodo = (): Promise<boolean> => {
        callando = true;
        try { m.rt.detener(); } catch { /* sigue con el resto */ }
        try { return intento(async () => { await m.callarResto(); return true; }); } finally { callando = false; }
    };
    /** Lo que suena ahora (p = 0: silencio). Voz en vivo que no pasó por aquí = conversación. */
    const ocupado = (): { p: number; rt: boolean } => {
        let rt = false; // sin voz en vivo (o rota): callada
        try { rt = m.rt.hablando(); } catch { rt = false; }
        if (actual && (actual.rt ? rt : m.ahora() < actual.hasta)) return { p: actual.p, rt: actual.rt };
        actual = null;
        return { p: rt ? PRIORIDAD.conversacion : 0, rt };
    };
    const sonar = async (t: string, o: OpcionesVozUnica, p: number, miGen: number): Promise<boolean> => {
        const ya = ocupado(), vivo = () => miGen === gen; // corta lo que suena, salvo conversación sobre conversación (va en fila)
        if (ya.p > 0 && !(CONVERSA.has(o.contexto) && ya.p >= p)) await cortarTodo();
        if (!vivo()) return false;
        const id = ++ultimo;
        actual = { id, p, rt: false, hasta: m.ahora() + Math.min(240_000, 8_000 + t.length * 95) };
        const a: AvisosMotor = { alEmpezar: o.alEmpezar, alTerminar: () => { if (actual?.id === id) actual = null; o.alTerminar?.(); } };
        if ((await intento(() => m.rt.disponible())) && vivo() && (await intento(() => m.rt.decir(t, o.persona, a)))) {
            if (actual?.id === id) actual.rt = true;
            return true;
        }
        if (vivo() && ((await intento(() => m.cadena(t, o.contexto, a))) || (vivo() && (await intento(() => m.suelo(t, a)))))) return true;
        if (actual?.id === id) actual = null;
        return false;
    };
    const hablar = (texto: string, o: OpcionesVozUnica): Promise<boolean> => {
        const t = (texto || "").trim(), c = o.contexto, p = o.prioridad ?? PRIORIDAD[c] ?? 1, miGen = gen;
        if (!t) return Promise.resolve(false);
        const carril = CONVERSA.has(c) ? "charla" : EN_COLA.has(c) ? "cola" : null, max = carril ? ESPERA_COLA_MS : ESPERA_AVISO_MS;
        // La conversación solo espera a una frase suya que no vaya en vivo (esas no encolan solas).
        const espera = (s: { p: number; rt: boolean }) => (CONVERSA.has(c) ? s.p >= p && !s.rt : c === "aviso" || carril ? s.p >= p : s.p > p);
        const turno = async (): Promise<boolean> => {
            for (const limite = m.ahora() + max; ; await m.esperar(200)) {
                if (miGen !== gen) return false;
                if (!espera(ocupado())) return sonar(t, o, p, miGen);
                if (m.ahora() < limite) continue;
                await intento(() => { m.registrar(`[voz-unica] «${c}» descartado: ${max / 1000} s sin silencio («${t.slice(0, 40)}»)`); return true; });
                return false;
            }
        };
        if (!carril) return turno().catch(() => false);
        return (colas[carril] = colas[carril].then(turno).catch(() => false));
    };
    const callar = (): void => {
        if (callando) return;
        gen++, actual = null, colas = { charla: Promise.resolve(false), cola: Promise.resolve(false) };
        void cortarTodo();
    };
    return { hablar, callar, ocupado };
}
/** Los motores de verdad: los mismos que usan hoy `engine.speak`, `engine.interrupt` y `callarRito`. */
function motoresReales(): MotoresVoz {
    const synth = () => (typeof window !== "undefined" ? window.speechSynthesis : undefined);
    const router = () => import("@/lib/aurora/tts-oss/speak-router");
    return {
        rt: { disponible: () => vozRT().disponible(), hablando: () => vozRT().hablando(), detener: () => vozRT().detener(),
            decir: (t, persona, a) => decirRT(t, persona, { onInicio: a.alEmpezar, onFin: a.alTerminar }) },
        cadena: async (t, c, a) => (await router()).speakWithConfiguredEngine(t, { contexto: contextoDeCadena(c), onStart: a.alEmpezar, onEnd: a.alTerminar }),
        suelo: async (t, a) => {
            const s = synth(), u = s ? new SpeechSynthesisUtterance(t) : null;
            if (!s || !u) return false;
            u.voice = (await import("@/lib/aurora/tts-oss/browser-voices")).getBestBrowserVoice(); // la mejor, elegida sola
            u.lang = u.voice?.lang || "es-ES";
            u.onstart = () => a.alEmpezar?.(), u.onend = u.onerror = () => a.alTerminar?.();
            s.speak(u);
            return true;
        },
        callarResto: async () => {
            try { synth()?.cancel(); } catch { /* sin voz del navegador */ }
            auroraTransport.interrupt(); // la cola clásica de `engine.speakQueued`, si la orbe está montada
            const [rito, local, r] = await Promise.all([import("@/lib/aurora/voz-rito"), import("@/lib/aurora/motor-local"), router()]);
            rito.callarRito(), local.abortarSintesisAnteriores(); // temporizadores del rito y motor local
            await r.stopConfiguredEngine(); // mezclador OmniVoice, Kokoro, Kitten, neuronal y xAI
        },
        ahora: () => Date.now(), esperar: (ms) => new Promise((ok) => setTimeout(ok, ms)), registrar: (motivo) => console.info(motivo),
    };
}
let unica: ReturnType<typeof crearPuertaVoz> | null = null;
const puerta = () => (unica ??= crearPuertaVoz(motoresReales()));
/** La puerta única: todo lo que dice Astraura entra por aquí, y un único `callar()` para todo. */
export const hablar = (texto: string, o: OpcionesVozUnica): Promise<boolean> => puerta().hablar(texto, o);
export const callar = (): void => puerta().callar(); // vozRT, colas, mezclador, motor local, navegador y rito
