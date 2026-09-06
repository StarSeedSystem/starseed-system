/**
 * PERFIL NEURONAL POR TIMBRE (Tarea F4 · Ola 263 · Forja fase 2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Variaciones por personalidad sobre EL MISMO modelo local: un timbre se
 * traduce aquí a los parámetros exactos del demonio OmniVoice
 * (`native/astraura-voice/daemon.mjs`).
 *
 * Por qué este archivo es un ESPEJO del demonio y no una invención:
 * el demonio sanea `instruct` contra un vocabulario CERRADO en inglés
 * (`VALID_INSTRUCT_TOKENS`) y DESCARTA TODO el instruct si un solo token no
 * está. Un timbre con texto libre sonaría igual que cualquier otro (caería al
 * default de la personalidad) y nadie sabría por qué. Aquí se valida antes,
 * se informa de lo ignorado y se calcula la misma semilla determinista que el
 * demonio, para que «este timbre suena así» sea verdad siempre.
 *
 * Módulo PURO: sin React, sin DOM, sin localStorage.
 */

import type { Timbre } from "@/lib/aurora/timbres";

/**
 * Vocabulario cerrado de `instructions` del demonio (`VALID_INSTRUCT_TOKENS`,
 * daemon.mjs ~línea 94). Los acentos solo tienen sentido si el servidor del
 * idioma es inglés (el español se fija con `--lang`, no aquí), pero forman
 * parte del vocabulario y el demonio los acepta.
 */
export const VOCABULARIO_INSTRUCT = {
    genero: ["female", "male"],
    edad: ["child", "teenager", "young adult", "middle-aged", "elderly"],
    tono: ["very low pitch", "low pitch", "moderate pitch", "high pitch", "very high pitch"],
    otros: ["whisper"],
    acento: [
        "american accent",
        "australian accent",
        "british accent",
        "canadian accent",
        "chinese accent",
        "indian accent",
        "japanese accent",
        "korean accent",
        "portuguese accent",
        "russian accent",
    ],
} as const;

type GrupoVocabulario = keyof typeof VOCABULARIO_INSTRUCT;

/** Orden canónico de los grupos en el instruct final (el del demonio). */
const ORDEN_GRUPOS: GrupoVocabulario[] = ["genero", "edad", "tono", "otros", "acento"];

function grupoDe(token: string): GrupoVocabulario | null {
    for (const grupo of ORDEN_GRUPOS) {
        if ((VOCABULARIO_INSTRUCT[grupo] as readonly string[]).includes(token)) return grupo;
    }
    return null;
}

/**
 * Valida un instruct en texto libre contra el vocabulario del demonio.
 *
 * A diferencia de `sanitizeInstruct` (todo o nada), aquí se conserva lo
 * aprovechable: máximo UN token por grupo (excepto `otros`, que admite
 * varios), reordenados en el orden canónico género→edad→tono→otros→acento.
 * Todo lo demás se devuelve en `ignorados` para que la interfaz pueda decir
 * «esto no llegó a la voz».
 */
export function validarInstruct(texto: string): { valido: string; tokens: string[]; ignorados: string[] } {
    const partes = texto
        .split(",")
        .map((p) => p.trim().toLowerCase().replace(/\s+/g, " "))
        .filter(Boolean);

    const vistos = new Set<GrupoVocabulario>();
    const porGrupo: Record<GrupoVocabulario, string[]> = {
        genero: [],
        edad: [],
        tono: [],
        otros: [],
        acento: [],
    };
    const ignorados: string[] = [];

    for (const parte of partes) {
        const grupo = grupoDe(parte);
        if (!grupo) {
            ignorados.push(parte);
            continue;
        }
        // Un solo representante por grupo: el segundo tono/género/edad/acento
        // sobra; en `otros` caben varios (p.ej. futuros efectos compatibles).
        if (grupo !== "otros" && vistos.has(grupo)) {
            ignorados.push(parte);
            continue;
        }
        vistos.add(grupo);
        porGrupo[grupo].push(parte);
    }

    const tokens = ORDEN_GRUPOS.flatMap((g) => porGrupo[g]);
    return { valido: tokens.join(", "), tokens, ignorados };
}

/**
 * Semilla determinista por clave: LA MISMA fórmula del demonio
 * (`daemon.mjs` ~línea 1314): hash `h = (h*31 + código) >>> 0` sobre la clave
 * y semilla `700000 + (h % 90000)`. Que coincida es lo que hace que «la voz
 * de Aurora» sea siempre la misma en cualquier equipo.
 */
export function semillaPorDefecto(clave: string): number {
    let h = 0;
    for (const ch of clave) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return 700000 + (h % 90000);
}

/**
 * Los parámetros exactos que se mandan al motor local para este timbre:
 * `instruct`/`seed`/`speed` van en el `POST /tts` del demonio; `pitch` es el
 * desplazamiento de tono del post-proceso local (1 = natural).
 */
export interface PerfilNeuronal {
    voz: string;
    speed: number;
    instruct: string;
    seed: number;
    pitch: number;
    /** Tokens del instruct original que no pertenecen al vocabulario y se descartaron. */
    ignorados: string[];
}

function acotar(n: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, n));
}

/**
 * Traduce un timbre a su perfil neuronal.
 *
 *  · instruct: `local.instruct` validado; si queda vacío, se deriva del
 *    género del timbre (femenina→`female`, masculina→`male`, neutra→sin
 *    género, que es un instruct válido más libre de marca).
 *  · speed:  `local.speed` acotado a [0.6, 1.6] (fuera suena a caricatura).
 *  · seed:   `local.seed` si el timbre la fija, si no la del demonio por id.
 *  · pitch:  `local.pitch ?? 1` acotado a [0.7, 1.4].
 */
export function perfilNeuronal(t: Timbre): PerfilNeuronal {
    const v = validarInstruct(t.local.instruct ?? "");
    let instruct = v.valido;
    if (!instruct) {
        if (t.genero === "femenina") instruct = "female";
        else if (t.genero === "masculina") instruct = "male";
    }
    return {
        voz: t.local.voz,
        speed: acotar(t.local.speed, 0.6, 1.6),
        instruct,
        seed: t.local.seed ?? semillaPorDefecto(t.id),
        pitch: acotar(t.local.pitch ?? 1, 0.7, 1.4),
        ignorados: v.ignorados,
    };
}
