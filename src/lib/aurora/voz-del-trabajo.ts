"use client";
/**
 * VOZ DEL TRABAJO Y ACUSE (Ola 1015V · VZF1015O · `voz-fusionada-astraura.md` §4)
 * Acuse ≤ 0,8 s y frases cortas del trabajo («Empiezo X», «Llevo 3 de 5», «Listo: X»): una cada 8 s como
 * mucho, nunca encima de la persona y nunca en modo silencio. Decisiones PURAS con reloj inyectable; no lanza.
 */
import { subscribe, type BgTask } from "./background/task-manager";

export const INTERVALO_TRABAJO_MS = 8_000;
export type TipoFraseTrabajo = "empiezo" | "progreso" | "listo" | "visto-bueno" | "error";
export interface FraseTrabajo { id: string; tipo: TipoFraseTrabajo; texto: string }
export interface PasoAgente { tarea: string; paso: number; total: number }
export interface EstadoNarracion { ahora: number; ultimaEn: number; personaHablando: boolean; enSilencio: boolean }
export const ACUSES: Record<string, readonly string[]> = {
    aurora: ["Voy.", "Lo miro.", "Dame un segundo."],
    hermes: ["Enseguida.", "Me pongo.", "Un momento."],
    astraura: ["Marchando.", "Voy contigo.", "Lo veo."],
};
/** Lista de acuses de una persona (o los de Aurora si no tiene la suya). */
export function acusesDe(persona?: string): readonly string[] {
    return ACUSES[(persona ?? "").trim().toLowerCase()] ?? ACUSES.aurora;
}
/** Acuse determinista: `turno` avanza por persona; ni azar ni reloj. */
export function elegirAcuse(persona: string | undefined, turno: number): string {
    const lista = acusesDe(persona);
    return lista[Number.isFinite(turno) ? Math.abs(Math.trunc(turno)) % lista.length : 0];
}
const limpiar = (s: string): string => s.replace(/\s+/g, " ").trim().replace(/[.!?]+$/, "");
const recortar = (s: string, max = 60): string => (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s);
/** Un cambio de tarea → una frase corta; `null` si no hay nada que contar. */
export function fraseDeTarea(t: BgTask): FraseTrabajo | null {
    const titulo = recortar(limpiar(t.title || ""));
    if (!titulo) return null;
    if (t.status === "done") return { id: t.id, tipo: "listo", texto: `Listo: ${titulo}` };
    if (t.status === "error") return { id: t.id, tipo: "error", texto: `No pude con ${titulo}` };
    if (/visto bueno|aprobaci[oó]n|aprob|permiso/i.test(limpiar(t.detail ?? ""))) {
        return { id: t.id, tipo: "visto-bueno", texto: `Necesito tu visto bueno para ${titulo}` };
    }
    if (t.status !== "running") return null;
    if (typeof t.progress === "number" && t.progress > 0 && t.progress < 100) {
        return { id: t.id, tipo: "progreso", texto: `Llevo el ${Math.round(t.progress)} % de ${titulo}` };
    }
    return { id: t.id, tipo: "empiezo", texto: `Empiezo ${titulo}` };
}
/** Solo los cambios reales entre dos fotos de `aurora:bg-tasks`. */
export function frasesDeCambio(antes: readonly BgTask[], despues: readonly BgTask[]): FraseTrabajo[] {
    const previas = new Map(antes.map((t) => [t.id, t]));
    const frases: FraseTrabajo[] = [];
    for (const t of despues) {
        const a = previas.get(t.id);
        if (a && a.status === t.status && a.progress === t.progress && a.detail === t.detail && a.title === t.title) continue;
        const f = fraseDeTarea(t);
        if (f) frases.push(f);
    }
    return frases;
}
/** Un paso de agente («3 de 5») → frase; `null` si la tarea no tiene nombre. */
export function fraseDePaso(p: PasoAgente): FraseTrabajo | null {
    const total = Math.max(1, Math.round(p.total));
    const paso = Math.max(0, Math.min(total, Math.round(p.paso)));
    const tarea = recortar(limpiar(p.tarea || ""));
    if (!tarea) return null;
    if (paso >= total) return { id: tarea, tipo: "listo", texto: `Listo: ${tarea}` };
    if (paso <= 0) return { id: tarea, tipo: "empiezo", texto: `Empiezo ${tarea}` };
    return { id: tarea, tipo: "progreso", texto: `Llevo ${paso} de ${total} de ${tarea}` };
}
/** El freno: ni en silencio, ni encima de la persona, ni antes de `intervalo`. */
export function puedeNarrar(e: EstadoNarracion, intervalo = INTERVALO_TRABAJO_MS): boolean {
    return !e.enSilencio && !e.personaHablando && (e.ultimaEn <= 0 || e.ahora - e.ultimaEn >= intervalo);
}
export interface MotoresTrabajo {
    hablar(texto: string, o: { contexto: "aviso"; persona?: string }): Promise<boolean> | boolean;
    ahora(): number; personaHablando(): boolean; enSilencio(): boolean; registrar?(motivo: string): void;
}
export interface VozDelTrabajo {
    acusar(persona?: string): Promise<boolean>;
    narrarCambios(antes: readonly BgTask[], despues: readonly BgTask[]): Promise<FraseTrabajo | null>;
    narrarPaso(paso: PasoAgente): Promise<FraseTrabajo | null>;
    estado(): EstadoNarracion;
}
const hablarPorLaPuerta = (texto: string, o: { contexto: "aviso"; persona?: string }) => import("./voz-unica").then((m) => m.hablar(texto, o));
export function crearVozDelTrabajo(m: Partial<MotoresTrabajo> = {}): VozDelTrabajo {
    const p: MotoresTrabajo = {
        hablar: m.hablar ?? hablarPorLaPuerta,
        ahora: m.ahora ?? (() => Date.now()),
        personaHablando: m.personaHablando ?? (() => false), // la tarea de interrupción da la señal real
        enSilencio: m.enSilencio ?? (() => { try { return typeof window !== "undefined" && window.localStorage.getItem("starseed.voz.silencio") === "1"; } catch { return false; } }),
        registrar: m.registrar,
    };
    let ultimaEn = 0, turno = 0;
    const estado = (): EstadoNarracion => ({ ahora: p.ahora(), ultimaEn, personaHablando: p.personaHablando(), enSilencio: p.enSilencio() });
    const narrar = async (f: FraseTrabajo | null): Promise<FraseTrabajo | null> => {
        if (!f) return null;
        if (!puedeNarrar(estado())) { p.registrar?.(`[voz-del-trabajo] «${f.texto}» callado: ritmo, persona o silencio`); return null; }
        ultimaEn = p.ahora();
        try { await p.hablar(f.texto, { contexto: "aviso" }); } catch { /* nunca lanza */ }
        return f;
    };
    return {
        acusar: async (persona) => {
            try { return await p.hablar(elegirAcuse(persona, turno++), { contexto: "aviso", persona }); } catch { return false; }
        },
        narrarCambios: (antes, despues) => {
            const f = frasesDeCambio(antes, despues);
            return narrar(f.find((x) => x.tipo !== "progreso") ?? f[0] ?? null);
        },
        narrarPaso: (paso) => narrar(fraseDePaso(paso)),
        estado,
    };
}
let unica: VozDelTrabajo | null = null;
export const vozDelTrabajo = (): VozDelTrabajo => (unica ??= crearVozDelTrabajo());
/** Engancha la voz a `aurora:bg-tasks`; `suscribir` se inyecta en las pruebas. */
export function escucharTareas(voz: VozDelTrabajo, suscribir = subscribe): () => void {
    let antes: readonly BgTask[] = [];
    return suscribir((despues) => {
        void voz.narrarCambios(antes, despues);
        antes = despues;
    });
}
