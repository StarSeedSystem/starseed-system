"use client";

/**
 * VOZ EN TIEMPO REAL de Astraura — el reproductor de la conversación (2026-09-22).
 * ─────────────────────────────────────────────────────────────────────────────
 * Alex: «cuando pauso el audio no se detiene, se tarda mucho y se detiene para cargar…
 * debe ser una respuesta de voz por cada mensaje continuo sin interrupciones y con la misma
 * voz». Lo que había detrás, medido:
 *   · Cada cláusula era un `<audio>` suelto pedido al daemon OmniVoice (RTF ≈ 4 en el M1):
 *     entre frase y frase, el silencio de esperar la siguiente síntesis.
 *   · Si una síntesis tardaba, la cadena caía al siguiente motor (Kokoro, el navegador…)
 *     PARA ESA FRASE: la voz cambiaba de timbre a mitad de respuesta.
 *   · «Pausar» pausaba `speechSynthesis` y el mixer, pero no el `<audio>` del motor local ni
 *     la cola: la frase en curso seguía y la siguiente arrancaba sola.
 *
 * Esto lo sustituye en la conversación:
 *   · UNA sola voz por conversación (estilo fijo de Supertonic, `voz_rt.py`); si el motor
 *     falla no se cambia de voz a media frase: se reintenta y, si no hay forma, se calla.
 *   · Las frases se piden en cuanto llegan (en cadena, el servidor las hace en orden) y se
 *     PROGRAMAN en un único AudioContext una detrás de otra, sin huecos: la siguiente ya
 *     está lista antes de que acabe la anterior (el motor va a ~0,3× tiempo real).
 *   · Pausar = suspender el AudioContext: se congela al instante, en la misma sílaba, y
 *     reanudar sigue desde ahí. Detener = cortar todo y vaciar la cola.
 *   · Mientras hay conversación, un latido cada 20 s mantiene la concesión que da prioridad
 *     a la voz y a BitNet sobre el enjambre de la Mac (`prioridad_conversacion.py`).
 */

const BASE = "/api/voz-rt";
const CLAVE_VOZ = "starseed.voz-rt.voz";
const CLAVE_DESACTIVADA = "starseed.voz-rt.desactivada";
const LATIDO_MS = 20_000;
/** Sin ningún turno durante este tiempo, la conversación se da por acabada sola. */
const CONVERSACION_INACTIVA_MS = 180_000;

/** Voz por personalidad: fija, para que cada una suene siempre igual. */
const VOZ_POR_PERSONA: Record<string, string> = {
    aurora: "F1",
    astraura: "F1",
    astraura_prime: "F1",
    atenea: "F2",
    hermione: "F3",
    mnemosyne: "F4",
    kallisti: "F5",
    hephaestus: "M1",
    hermes: "M2",
    logos: "M3",
    oneiros: "M4",
};

/** Muletillas: lo que diría una persona mientras piensa. Se precalculan al empezar. */
export const MULETILLAS = ["Mmm, a ver…", "Vale, déjame pensarlo.", "Claro.", "Buena pregunta."];

export interface EstadoVozRT {
    disponible: boolean;
    hablando: boolean;
    pausada: boolean;
}

type Oyente = (e: EstadoVozRT) => void;

interface Pendiente {
    gen: number;
    promesa: Promise<AudioBuffer | null>;
}

/** La voz elegida para una personalidad (preferencia guardada > mapa > F1). PURA salvo localStorage. */
export function vozDePersona(personaId?: string): string {
    try {
        const elegida = typeof window !== "undefined" ? window.localStorage.getItem(CLAVE_VOZ) : null;
        if (elegida && /^[FM][1-5]$/.test(elegida)) return elegida;
    } catch {
        /* sin almacenamiento */
    }
    const id = (personaId || "").toLowerCase().replace(/\s+/g, "_");
    return VOZ_POR_PERSONA[id] ?? "F1";
}

class VozRT {
    private ctx: AudioContext | null = null;
    private gen = 0;
    private cola: Pendiente[] = [];
    private bombeando = false;
    private finProgramado = 0;
    private fuentes = new Set<AudioBufferSourceNode>();
    private cortes = new Set<AbortController>();
    private latido: ReturnType<typeof setInterval> | null = null;
    private disponibleCache: { at: number; v: boolean } | null = null;
    private oyentes = new Set<Oyente>();
    private muletillas = new Map<string, AudioBuffer>();
    private ultimaMuletilla = -1;
    private ultimaActividad = 0;
    pausada = false;

    on(f: Oyente): () => void {
        this.oyentes.add(f);
        return () => this.oyentes.delete(f);
    }

    private avisar() {
        const e: EstadoVozRT = { disponible: !!this.disponibleCache?.v, hablando: this.hablando(), pausada: this.pausada };
        for (const f of this.oyentes) {
            try {
                f(e);
            } catch {
                /* un oyente roto no para la voz */
            }
        }
    }

    hablando(): boolean {
        return this.fuentes.size > 0 || this.cola.length > 0;
    }

    /** Disponibilidad ya conocida, sin esperar (para caminos síncronos como `speakQueued`). */
    listoYa(): boolean {
        return !!this.disponibleCache?.v && Date.now() - this.disponibleCache.at < 60_000;
    }

    /** Cambia con cada `detener()`: sirve para saber si un turno fue cortado. */
    generacion(): number {
        return this.gen;
    }

    /** ¿Está el servidor de voz en tiempo real listo? Cacheado 10 s. Nunca lanza. */
    async disponible(): Promise<boolean> {
        if (typeof window === "undefined") return false;
        // Alex puede volver al motor de siempre: localStorage «starseed.voz-rt.desactivada» = "1".
        try {
            if (window.localStorage.getItem(CLAVE_DESACTIVADA) === "1") {
                this.disponibleCache = { at: Date.now(), v: false };
                return false;
            }
        } catch {
            /* sin almacenamiento: sigue */
        }
        if (this.disponibleCache && Date.now() - this.disponibleCache.at < 10_000) return this.disponibleCache.v;
        let v = false;
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 2500);
            const r = await fetch(`${BASE}/status`, { cache: "no-store", signal: ctrl.signal });
            clearTimeout(t);
            const j = (await r.json()) as { listo?: boolean };
            v = r.ok && !!j.listo;
        } catch {
            v = false;
        }
        this.disponibleCache = { at: Date.now(), v };
        return v;
    }

    private contexto(): AudioContext | null {
        if (typeof window === "undefined") return null;
        if (!this.ctx) {
            const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
        }
        return this.ctx;
    }

    /** Empieza (o mantiene) la conversación: latido de prioridad y muletillas precalculadas. */
    iniciarConversacion(quien = "orbe", voz?: string): void {
        this.ultimaActividad = Date.now();
        if (this.latido) return;
        const latir = () => {
            // Nadie habla desde hace 3 min: se acabó la conversación y el enjambre recupera
            // la RAM. Así no depende de que alguien «cierre» el orbe.
            if (Date.now() - this.ultimaActividad > CONVERSACION_INACTIVA_MS && !this.hablando()) {
                this.terminarConversacion();
                return;
            }
            void fetch(`${BASE}/latido`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ quien }),
            }).catch(() => undefined);
        };
        latir();
        this.latido = setInterval(latir, LATIDO_MS);
        if (typeof window !== "undefined") {
            window.addEventListener(
                "pagehide",
                () => {
                    try {
                        navigator.sendBeacon?.(`${BASE}/fin`);
                    } catch {
                        /* */
                    }
                },
                { once: true },
            );
        }
        const v = voz || vozDePersona();
        for (const m of MULETILLAS) {
            void this.sintetizar(m, v, 1.05, this.gen).then((b) => {
                if (b) this.muletillas.set(`${v}|${m}`, b);
            });
        }
    }

    /** Fin de la conversación: el enjambre recupera su RAM. */
    terminarConversacion(): void {
        if (this.latido) clearInterval(this.latido);
        this.latido = null;
        void fetch(`${BASE}/fin`, { method: "POST" }).catch(() => undefined);
    }

    private async sintetizar(texto: string, voz: string, velocidad: number, gen: number): Promise<AudioBuffer | null> {
        const ctx = this.contexto();
        if (!ctx) return null;
        for (let intento = 0; intento < 2; intento++) {
            if (gen !== this.gen) return null;
            const corte = new AbortController();
            this.cortes.add(corte);
            try {
                const r = await fetch(`${BASE}/tts`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ texto, voz, velocidad, lang: "es" }),
                    signal: corte.signal,
                });
                if (r.status === 204) return null;
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                const datos = await r.arrayBuffer();
                if (gen !== this.gen) return null;
                return await ctx.decodeAudioData(datos);
            } catch {
                if (corte.signal.aborted) return null;
                // Un reintento con la MISMA voz; nunca otra voz a mitad de respuesta.
            } finally {
                this.cortes.delete(corte);
            }
        }
        return null;
    }

    /** Encola una cláusula: se pide ya y sonará justo detrás de la anterior. */
    encolar(texto: string, opciones: { voz?: string; velocidad?: number } = {}): void {
        const t = (texto || "").trim();
        if (!t) return;
        this.ultimaActividad = Date.now();
        const gen = this.gen;
        const voz = opciones.voz || vozDePersona();
        this.cola.push({ gen, promesa: this.sintetizar(t, voz, opciones.velocidad ?? 1.05, gen) });
        this.avisar();
        void this.bombear();
    }

    /** Dice una muletilla ya calculada (si la hay) sin repetir la última. */
    muletilla(voz?: string): boolean {
        const v = voz || vozDePersona();
        const disponibles = MULETILLAS.map((m, i) => ({ i, b: this.muletillas.get(`${v}|${m}`) })).filter(
            (x) => x.b && x.i !== this.ultimaMuletilla,
        );
        if (!disponibles.length) return false;
        const elegida = disponibles[Math.floor(Math.random() * disponibles.length)];
        this.ultimaMuletilla = elegida.i;
        this.cola.push({ gen: this.gen, promesa: Promise.resolve(elegida.b as AudioBuffer) });
        void this.bombear();
        return true;
    }

    private async bombear(): Promise<void> {
        if (this.bombeando) return;
        this.bombeando = true;
        try {
            while (this.cola.length) {
                const cabeza = this.cola[0];
                const buffer = await cabeza.promesa;
                this.cola.shift();
                if (cabeza.gen !== this.gen || !buffer) continue;
                const ctx = this.contexto();
                if (!ctx) break;
                if (ctx.state === "suspended" && !this.pausada) {
                    try {
                        await ctx.resume();
                    } catch {
                        /* sin gesto del usuario aún */
                    }
                }
                const src = ctx.createBufferSource();
                src.buffer = buffer;
                src.connect(ctx.destination);
                const cuando = Math.max(ctx.currentTime + 0.02, this.finProgramado);
                src.start(cuando);
                this.finProgramado = cuando + buffer.duration;
                this.fuentes.add(src);
                this.avisar();
                src.onended = () => {
                    this.fuentes.delete(src);
                    this.avisar();
                };
            }
        } finally {
            this.bombeando = false;
        }
    }

    /** Pausa en el acto (la misma sílaba); `reanudar` sigue desde ahí. */
    pausar(): void {
        this.pausada = true;
        void this.ctx?.suspend().catch(() => undefined);
        this.avisar();
    }

    reanudar(): void {
        this.pausada = false;
        void this.ctx?.resume().catch(() => undefined);
        this.avisar();
    }

    /** Corta todo: lo que suena, lo que se está calculando y lo que esperaba turno. */
    detener(): void {
        this.gen++;
        for (const c of this.cortes) c.abort();
        this.cortes.clear();
        for (const f of this.fuentes) {
            try {
                f.onended = null;
                f.stop();
            } catch {
                /* ya parada */
            }
        }
        this.fuentes.clear();
        this.cola = [];
        this.finProgramado = 0;
        if (this.pausada) {
            this.pausada = false;
            void this.ctx?.resume().catch(() => undefined);
        }
        this.avisar();
    }

    /** Resuelve cuando no queda nada por sonar (o se detuvo). */
    async esperarFin(maxMs = 240_000): Promise<void> {
        const hasta = Date.now() + maxMs;
        while (this.hablando() && Date.now() < hasta) {
            await new Promise((ok) => setTimeout(ok, 120));
        }
    }
}

let instancia: VozRT | null = null;

/** El reproductor único de la voz en tiempo real (uno por pestaña). */
export function vozRT(): VozRT {
    if (!instancia) instancia = new VozRT();
    return instancia;
}

/**
 * Frases para la voz: corta tras . ! ? … ; : y junta los trozos muy cortos con el siguiente
 * (la primera frase sale sola en cuanto tiene 12 caracteres, para que el primer audio llegue
 * pronto). Ninguna pasa de `max` (el servidor recorta a 600): una frase larguísima se parte
 * por la última coma o espacio. PURA.
 */
export function frasesParaVoz(texto: string, max = 260): string[] {
    const limpio = (texto || "").replace(/\s+/g, " ").trim();
    if (!limpio) return [];
    const frases = limpio.match(/[^.!?…;:]+(?:[.!?…;:]+|$)/g) ?? [limpio];
    const fuera: string[] = [];
    let actual = "";
    const partir = (frase: string): string => {
        let resto = frase;
        while (resto.length > max) {
            let corte = resto.lastIndexOf(",", max);
            if (corte < max / 2) corte = resto.lastIndexOf(" ", max);
            if (corte <= 0) corte = max;
            fuera.push(resto.slice(0, corte + 1).trim());
            resto = resto.slice(corte + 1).trim();
        }
        return resto;
    };
    for (const bruta of frases) {
        const f = bruta.trim();
        if (!f) continue;
        const junta = actual ? `${actual} ${f}` : f;
        const umbral = fuera.length ? 40 : 12;
        if (junta.length <= max && actual.length < umbral) {
            actual = junta;
            continue;
        }
        if (actual) fuera.push(actual);
        actual = partir(f);
    }
    if (actual) fuera.push(...(actual.length > max ? [partir(actual)] : [actual]));
    return fuera.filter(Boolean);
}

export interface OpcionesDecir {
    /** Semántica de `speak()`: calla lo que sonaba y di esto ya. Sin él, se encola detrás. */
    cortar?: boolean;
    onInicio?: () => void;
    /** Solo el ÚLTIMO turno encolado avisa del fin, y nunca si alguien lo cortó. */
    onFin?: () => void;
}

let ultimoTurno = 0;

function decirCon(v: VozRT, texto: string, personaId: string | undefined, o: OpcionesDecir): boolean {
    const frases = frasesParaVoz(texto);
    if (!frases.length) return false;
    if (o.cortar) v.detener();
    const voz = vozDePersona(personaId);
    const yaSonaba = v.hablando();
    v.iniciarConversacion("orbe", voz);
    for (const f of frases) v.encolar(f, { voz });
    if (!yaSonaba) o.onInicio?.();
    const turno = ++ultimoTurno;
    const gen = v.generacion();
    void v.esperarFin().then(() => {
        if (turno === ultimoTurno && gen === v.generacion()) o.onFin?.();
    });
    return true;
}

/**
 * Dice `texto` con la voz en tiempo real — la MISMA voz fija de la conversación en vivo —
 * para todo lo que habla Aurora (confirmaciones, alertas, lectura de pantalla, chat).
 * Devuelve false sin hacer nada si el servicio no está listo o Alex lo desactivó: el
 * llamador sigue con su motor de siempre.
 */
export async function decirRT(texto: string, personaId?: string, o: OpcionesDecir = {}): Promise<boolean> {
    const v = vozRT();
    if (!(await v.disponible())) return false;
    return decirCon(v, texto, personaId, o);
}

/** Como `decirRT` pero sin esperar (orden garantizado entre llamadas seguidas). */
export function decirRTYa(texto: string, personaId?: string, o: OpcionesDecir = {}): boolean {
    const v = vozRT();
    const listo = v.listoYa();
    void v.disponible();
    return listo ? decirCon(v, texto, personaId, o) : false;
}
