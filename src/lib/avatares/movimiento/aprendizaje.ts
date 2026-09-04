"use client";

/**
 * APRENDIZAJE DE MOVIMIENTO «VIDA STARSEED» (Ola 229 · M6 · 1/2)
 * ─────────────────────────────────────────────────────────────────────────────
 * El estilo de movimiento de una personalidad SE AFINA con el uso real:
 * cada señal del usuario («gustado», «interrumpido», «ignorado», «repetido»)
 * actualiza un perfil local (media móvil suave con topes de seguridad) que
 * modula los gestos antes de pedirlos al motor (`moverAvatar`).
 *
 * Se apoya en el sistema primario 1.58-bit (Astraura) SOLO como mejoría
 * (`sugerirGesto` le pide una frase de movimiento con tope de 1,5 s y, si no
 * responde, cae a la derivación local `gestoDesdeTexto`). Sin IA, sin red y
 * sin almacenamiento, todo lo demás funciona igual.
 */

import type { Gesto } from "./motor";

/** Clave de persistencia local del mapa personalidad → perfil. */
export const CLAVE_PERFILES_MOVIMIENTO = "starseed.movimiento.perfil.v1";

/** Topes duros: el estilo puede evolucionar, nunca descontrolarse. */
export const TOPE_MIN = 0.4;
export const TOPE_MAX = 1.6;

/** Perfil de movimiento aprendido de una personalidad. */
export interface PerfilMovimiento {
    personalidadId: string;
    /** Escala de amplitud corporal (1 = neutro, topes 0,4–1,6). */
    amplitud: number;
    /** Escala de velocidad/ritmo (1 = neutro, topes 0,4–1,6). */
    ritmo: number;
    /** Escala de expresividad general (1 = neutro, topes 0,4–1,6). */
    expresividad: number;
    /** Afinidad por gesto (`gesto` sólito): valores en -10…10. */
    preferencias: Record<string, number>;
    /** Número de señales registradas (peso acumulado del aprendizaje). */
    muestras: number;
    /** ISO 8601 de la última actualización. */
    actualizado: string;
}

/** Señal de uso que registra la interfaz después de mostrar un gesto. */
export interface SenalMovimiento {
    tipo: "repetido" | "interrumpido" | "gustado" | "ignorado";
    gesto: string;
    emocion?: string;
}

/** Factor del gesto a la escala topada, calidad nula de flotantes. */
function tope(v: number): number {
    const n = Number(v.toFixed(4));
    return Math.min(TOPE_MAX, Math.max(TOPE_MIN, n));
}

function perfilBase(personalidadId: string): PerfilMovimiento {
    return {
        personalidadId,
        amplitud: 1,
        ritmo: 1,
        expresividad: 1,
        preferencias: {},
        muestras: 0,
        actualizado: new Date(0).toISOString(),
    };
}

/** Almacenamiento local seguro: pongáis o no pongáis, nunca lanza. */
function almacen(): Storage | null {
    try {
        const s = (globalThis as { localStorage?: Storage }).localStorage;
        return s ?? null;
    } catch {
        return null;
    }
}

function leerMapa(): Record<string, PerfilMovimiento> {
    const s = almacen();
    if (!s) return {};
    try {
        const crudo = s.getItem(CLAVE_PERFILES_MOVIMIENTO);
        if (!crudo) return {};
        const datos: unknown = JSON.parse(crudo);
        if (datos && typeof datos === "object" && !Array.isArray(datos)) {
            return datos as Record<string, PerfilMovimiento>;
        }
    } catch { /* dato corrupto: se empieza de nuevo */ }
    return {};
}

function escribirMapa(mapa: Record<string, PerfilMovimiento>): void {
    const s = almacen();
    if (!s) return;
    try {
        s.setItem(CLAVE_PERFILES_MOVIMIENTO, JSON.stringify(mapa));
    } catch { /* sin cuota: el aprendizaje de esta sesión sigue en memoria */ }
}

/** Perfil guardado de una personalidad, o el perfil base (neutro) si no existe. */
export function perfilDe(personalidadId: string): PerfilMovimiento {
    const guardado = leerMapa()[personalidadId];
    if (
        guardado &&
        typeof guardado === "object" &&
        typeof guardado.amplitud === "number" &&
        typeof guardado.ritmo === "number" &&
        typeof guardado.expresividad === "number" &&
        typeof guardado.muestras === "number" &&
        guardado.preferencias &&
        typeof guardado.preferencias === "object"
    ) {
        return guardado;
    }
    return perfilBase(personalidadId);
}

/** Ajuste objetivo (-1…1) que propone cada señal sobre cada dimensión. */
const AJUSTES: Record<SenalMovimiento["tipo"], { amplitud: number; ritmo: number; expresividad: number; preferencia: number }> = {
    // Gustado: sube amplitud y expresividad (el usuario premia el estilo).
    gustado: { amplitud: 0.6, ritmo: 0.2, expresividad: 0.8, preferencia: 1 },
    // Interrumpido: baja amplitud y ritmo (el gesto molestó o sobraba).
    interrumpido: { amplitud: -0.8, ritmo: -0.5, expresividad: -0.4, preferencia: -1 },
    // Ignorado: baja la expresividad (el gesto pasó desapercibido).
    ignorado: { amplitud: -0.2, ritmo: -0.1, expresividad: -0.6, preferencia: -0.5 },
    // Repetido: leve contracción (hacer lo mismo una y otra vez cansa).
    repetido: { amplitud: -0.3, ritmo: -0.1, expresividad: -0.2, preferencia: -0.25 },
};

/**
 * Registra una señal de uso y actualiza el perfil de la personalidad con una
 * media móvil suave (el paso se achica a medida que crecen las muestras, con
 * un mínimo del 5 % para no congelarse nunca). Todo queda entre los topes
 * 0,4–1,6: el estilo evoluciona, nunca se descontrola. Persiste en local.
 */
export function registrarUso(personalidadId: string, senal: SenalMovimiento): PerfilMovimiento {
    const perfil = perfilDe(personalidadId);
    const ajuste = AJUSTES[senal.tipo];

    // Paso adaptable: al principio aprende rápido, después se estabiliza.
    const paso = Math.max(0.05, 0.3 / (1 + perfil.muestras));

    const mover = (actual: number, direccion: number): number =>
        tope(actual + paso * direccion * 0.5);

    const preferencias = { ...perfil.preferencias };
    const claveGesto = `${senal.gesto}${senal.emocion ? `|${senal.emocion}` : ""}`;
    preferencias[claveGesto] = Math.min(
        10,
        Math.max(-10, (preferencias[claveGesto] ?? 0) + ajuste.preferencia),
    );

    const siguiente: PerfilMovimiento = {
        ...perfil,
        amplitud: mover(perfil.amplitud, ajuste.amplitud),
        ritmo: mover(perfil.ritmo, ajuste.ritmo),
        expresividad: mover(perfil.expresividad, ajuste.expresividad),
        preferencias,
        muestras: perfil.muestras + 1,
        actualizado: new Date().toISOString(),
    };

    escribirMapa({ ...leerMapa(), [personalidadId]: siguiente });
    return siguiente;
}

/**
 * Modula un Gesto con el perfil aprendido ANTES de pedirlo al motor: la
 * energía sube/baja con la media de las tres escalas y la duración se estira
 * al revés del ritmo. Con un perfil recién creado (0 muestras, todo en 1) el
 * gesto pasa intacto. Preferencia negativa de ese gesto concreto: lo aplana.
 */
export function aplicarPerfil(gesto: Gesto, perfil: PerfilMovimiento): Gesto {
    if (perfil.muestras === 0) return { ...gesto };

    const media = (perfil.amplitud + perfil.ritmo + perfil.expresividad) / 3;
    const claveGesto = `${gesto.prompt}${gesto.emocion ? `|${gesto.emocion}` : ""}`;
    const afinidad = perfil.preferencias[claveGesto] ?? 0; // -10…10

    const energiaBase = gesto.energia ?? 0.5;
    const energia = Math.min(1, Math.max(0, energiaBase * media * (1 + afinidad * 0.03)));

    const duracionMs = gesto.duracionMs
        ? Math.round(gesto.duracionMs / perfil.ritmo)
        : gesto.duracionMs;

    return { ...gesto, energia: Number(energia.toFixed(4)), duracionMs };
}

/**
 * Resumen en una frase del estilo aprendido, listo para pasarse como contexto
 * al modelo 1.58-bit (system prompt / turno de chat de Astraura).
 */
export function resumenParaModelo(personalidadId: string): string {
    const p = perfilDe(personalidadId);
    if (p.muestras === 0) {
        return `La personalidad «${personalidadId}» aún no tiene estilo de movimiento aprendido; usa un estilo neutro.`;
    }
    const niveles: string[] = [];
    const nivel = (v: number): string => (v < 0.8 ? "bajo" : v > 1.2 ? "alto" : "medio");
    niveles.push(`amplitud ${nivel(p.amplitud)}`, `ritmo ${nivel(p.ritmo)}`, `expresividad ${nivel(p.expresividad)}`);
    const favoritos = Object.entries(p.preferencias)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([g]) => g);
    const extra = favoritos.length > 0 ? ` Gestos preferidos: ${favoritos.join(", ")}.` : "";
    return `Estilo de movimiento aprendido de «${personalidadId}» (${p.muestras} señales): ${niveles.join(", ")}.${extra}`;
}

/**
 * Gestor mínimo local: deriva un Gesto directamente del texto, sin IA. Es la
 * rueda de repuesto de `sugerirGesto` cuando el sistema primario no responde.
 */
export function gestoDesdeTexto(texto: string): Gesto {
    const limpio = texto.replace(/\s+/g, " ").trim().slice(0, 160);
    return {
        prompt: limpio || "respiración suave y presencia tranquila",
        emocion: undefined,
        energia: 0.5,
    };
}

/** Límite duro para pedir la frase al modelo local: 1,5 s netos. */
const ESPERA_SUGERENCIA_MS = 1500;

/**
 * Pide al sistema primario (Astraura 1.58-bit, vía el router de inteligencia
 * del OS) UNA frase corta de movimiento acorde al texto y al estilo aprendido.
 * Si no llega respuesta en 1,5 s —o falla—, cae a `gestoDesdeTexto`. Nunca lanza.
 */
export async function sugerirGesto(texto: string, personalidadId: string): Promise<Gesto> {
    const respaldo = gestoDesdeTexto(texto);
    try {
        const peticion: Promise<Gesto | null> = (async () => {
            const { astrauraChat } = await import("@/ai/astraura/router");
            const respuesta = await astrauraChat({
                messages: [
                    {
                        role: "system",
                        content:
                            "Eres el traductor de movimiento de los avatares StarSeed. " +
                            resumenParaModelo(personalidadId) +
                            " Responde SOLO con una frase corta (máximo 12 palabras) describiendo el gesto corporal, sin comillas ni explicaciones.",
                    },
                    { role: "user", content: texto.slice(0, 500) },
                ],
                maxTokens: 40,
                temperature: 0.4,
            });
            const frase = (respuesta?.text ?? "").replace(/["«»]/g, "").trim();
            if (!frase) return null;
            return { ...respaldo, prompt: frase.slice(0, 160) };
        })();

        const conEspera = await Promise.race([
            peticion,
            new Promise<null>((resuelve) => setTimeout(() => resuelve(null), ESPERA_SUGERENCIA_MS)),
        ]);
        return conEspera ?? respaldo;
    } catch {
        return respaldo;
    }
}
