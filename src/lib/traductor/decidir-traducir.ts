/**
 * TU1116-APP-F1 · Decidir si traducir: reglas puras para cuándo un agente traduce solo
 * ─────────────────────────────────────────────────────────────────────────────
 * Módulo PURO: sin React, sin `node:*` ni red. Solo lógica de decisión.
 * Contrato: architecture/idiomas.md §6
 */

import { IDIOMAS } from "../idiomas/idiomas";

export interface EntradaDecidirTraducir {
    readonly mensajeRecibido: string;
    readonly idiomaConversacion: string;
    readonly peticion?: string;
    readonly destinatarios?: ReadonlyArray<{ readonly personaId: string; readonly idioma: string }>;
    readonly detectado: { readonly codigo: string | null; readonly confianza: number };
}

export type RazonLlamar = "idioma-distinto" | "peticion" | "varias-personas" | "ninguna";

export interface SalidaDecidirTraducir {
    readonly llamar: boolean;
    readonly razon: RazonLlamar;
    readonly destino?: string;
}

const PATRONES_TRADUCCION: ReadonlyArray<RegExp> = [
    /\btraduce\b/i,
    /\bresponde en\s+\w+/i,
    /\ben\s+(ingl[eé]s|espa[nñ]ol|portugu[eé]s|franc[eé]s|alem[aá]n|italiano|neerland[eé]s|catal[aá]n|gallego|euskera|ruso|ucraniano|polaco|turco|[aá]rabe|hebreo|persa|urdu|hindi|bengal[ií]|chino|japon[eé]s|coreano|tailand[eé]s|vietnamita|indonesio|suajili|griego|sueco|checo|rumano|h[uú]ngaro|finland[eé]s|dan[eé]s|noruego)\b/i,
    /\btraducir a\s+\w+/i,
    /\btraducir al\s+\w+/i,
];

function esCodigoValido(codigo: string): boolean {
    return IDIOMAS.some((i) => i.codigo === codigo);
}

function contarLetras(texto: string): number {
    return [...texto].filter((ch) => /\p{L}/u.test(ch)).length;
}

function esSoloCodigoONumerosONombres(texto: string): boolean {
    const recortado = texto.trim();
    if (!recortado) return true;

    // Solo números (posiblemente con puntuación)
    if (/^[\d\s\.,;:]+$/.test(recortado)) return true;

    // URLs
    if (/^https?:\/\//i.test(recortado)) return true;
    if (/^www\./i.test(recortado)) return true;

    // Código: detectar patrones típicos de código
    const patronesCodigo = [
        /^\s*```/,
        /^\s*function\s+\w+\s*\(/,
        /^\s*const\s+\w+\s*=/,
        /^\s*let\s+\w+\s*=/,
        /^\s*var\s+\w+\s*=/,
        /^\s*import\s+/,
        /^\s*export\s+/,
        /^\s*class\s+\w+/,
        /^\s*interface\s+\w+/,
        /^\s*type\s+\w+\s*=/,
        /[{}[\]()<>;=]/,
        /^\s*\/\/|\/\*/,
    ];
    if (patronesCodigo.some((p) => p.test(recortado))) return true;

    // Nombres propios: solo palabras capitalizadas (primera mayúscula, resto minúsculas)
    // y posiblemente apellidos compuestos
    const palabras = recortado.split(/\s+/);
    if (palabras.length <= 3 && palabras.every((p) => /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+$/.test(p))) {
        return true;
    }

    return false;
}

function extraerIdiomaDePeticion(peticion: string): string | null {
    const lower = peticion.toLowerCase();

    // "responde en <idioma>"
    const matchResponde = lower.match(/\bresponde en\s+(\w+)/);
    if (matchResponde && esCodigoValido(matchResponde[1])) {
        return matchResponde[1];
    }

    // "en inglés", "en español", etc.
    const matchEn = lower.match(/\ben\s+(ingl[eé]s|espa[nñ]ol|portugu[eé]s|franc[eé]s|alem[aá]n|italiano|neerland[eé]s|catal[aá]n|gallego|euskera|ruso|ucraniano|polaco|turco|[aá]rabe|hebreo|persa|urdu|hindi|bengal[ií]|chino|japon[eé]s|coreano|tailand[eé]s|vietnamita|indonesio|suajili|griego|sueco|checo|rumano|h[uú]ngaro|finland[eé]s|dan[eé]s|noruego)/);
    if (matchEn) {
        const mapa: Record<string, string> = {
            "ingles": "en",
            "inglés": "en",
            "español": "es",
            "espanol": "es",
            "portugues": "pt",
            "portugués": "pt",
            "frances": "fr",
            "francés": "fr",
            "aleman": "de",
            "alemán": "de",
            "italiano": "it",
            "neerlandes": "nl",
            "neerlandés": "nl",
            "catalan": "ca",
            "catalán": "ca",
            "gallego": "gl",
            "euskera": "eu",
            "ruso": "ru",
            "ucraniano": "uk",
            "polaco": "pl",
            "turco": "tr",
            "arabe": "ar",
            "árabe": "ar",
            "hebreo": "he",
            "persa": "fa",
            "urdu": "ur",
            "hindi": "hi",
            "bengali": "bn",
            "bengalí": "bn",
            "chino": "zh",
            "japones": "ja",
            "japonés": "ja",
            "coreano": "ko",
            "tailandes": "th",
            "tailandés": "th",
            "vietnamita": "vi",
            "indonesio": "id",
            "suajili": "sw",
            "griego": "el",
            "sueco": "sv",
            "checo": "cs",
            "rumano": "ro",
            "hungaro": "hu",
            "húngaro": "hu",
            "finlandes": "fi",
            "finlandés": "fi",
            "danes": "da",
            "danés": "da",
            "noruego": "nb",
        };
        return mapa[matchEn[1]] ?? null;
    }

    // "traducir a <idioma>" / "traducir al <idioma>"
    const matchTraducir = lower.match(/\btraducir (?:a|al)\s+([\p{L}]+)/u);
    if (matchTraducir) {
        const mapaTraducir: Record<string, string> = {
            "ingles": "en",
            "inglés": "en",
            "español": "es",
            "espanol": "es",
            "portugues": "pt",
            "portugués": "pt",
            "frances": "fr",
            "francés": "fr",
            "aleman": "de",
            "alemán": "de",
            "italiano": "it",
            "neerlandes": "nl",
            "neerlandés": "nl",
            "catalan": "ca",
            "catalán": "ca",
            "gallego": "gl",
            "euskera": "eu",
            "ruso": "ru",
            "ucraniano": "uk",
            "polaco": "pl",
            "turco": "tr",
            "arabe": "ar",
            "árabe": "ar",
            "hebreo": "he",
            "persa": "fa",
            "urdu": "ur",
            "hindi": "hi",
            "bengali": "bn",
            "bengalí": "bn",
            "chino": "zh",
            "japones": "ja",
            "japonés": "ja",
            "coreano": "ko",
            "tailandes": "th",
            "tailandés": "th",
            "vietnamita": "vi",
            "indonesio": "id",
            "suajili": "sw",
            "griego": "el",
            "sueco": "sv",
            "checo": "cs",
            "rumano": "ro",
            "hungaro": "hu",
            "húngaro": "hu",
            "finlandes": "fi",
            "finlandés": "fi",
            "danes": "da",
            "danés": "da",
            "noruego": "nb",
        };
        return mapaTraducir[matchTraducir[1]] ?? null;
    }

    return null;
}

export function decidirTraducir(entrada: EntradaDecidirTraducir): SalidaDecidirTraducir {
    const { mensajeRecibido, idiomaConversacion, peticion, destinatarios, detectado } = entrada;

    // No llamar para código, URLs, solo números, nombres propios
    if (esSoloCodigoONumerosONombres(mensajeRecibido)) {
        return { llamar: false, razon: "ninguna" };
    }

    // Regla (a): idioma distinto con confianza ≥0.8 y ≥12 letras
    if (
        detectado.codigo !== null &&
        detectado.codigo !== idiomaConversacion &&
        detectado.confianza >= 0.8 &&
        contarLetras(mensajeRecibido) >= 12
    ) {
        return { llamar: true, razon: "idioma-distinto", destino: idiomaConversacion };
    }

    // Regla (b): petición explícita de traducción
    if (peticion) {
        const idiomaDestino = extraerIdiomaDePeticion(peticion);
        if (idiomaDestino) {
            return { llamar: true, razon: "peticion", destino: idiomaDestino };
        }
        // Patrón genérico "traduce" sin idioma específico → traducir al idioma de la conversación
        if (/\btraduce\b/i.test(peticion)) {
            return { llamar: true, razon: "peticion", destino: idiomaConversacion };
        }
    }

    // Regla (c): varias personas con idiomas distintos
    if (destinatarios && destinatarios.length > 1) {
        const idiomasUnicos = new Set(destinatarios.map((d) => d.idioma));
        if (idiomasUnicos.size > 1) {
            // Devolver el primer idioma distinto al de la conversación
            for (const d of destinatarios) {
                if (d.idioma !== idiomaConversacion) {
                    return { llamar: true, razon: "varias-personas", destino: d.idioma };
                }
            }
        }
    }

    return { llamar: false, razon: "ninguna" };
}