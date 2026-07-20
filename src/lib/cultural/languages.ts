"use client";

/*
 * cultural/languages — INTERCAMBIO CULTURAL POR PAREJAS DE IDIOMAS (real).
 * ---------------------------------------------------------------------------
 * El perfil declara "hablo […] / aprendo […]" + una región. Persistencia SIN
 * DDL y con matching REAL entre perfiles de la red:
 *
 *   · FUENTE PÚBLICA (para que la red pueda emparejar de verdad): se refleja en
 *     `os_profiles.tags[]` con prefijos claros — `habla:<code>`, `aprende:<code>`,
 *     `sistema:<id>`, `lugar:<slug>`, `geo:<lat>,<lng>`. Esa tabla ya es pública
 *     (RLS: searchable=true) y consultable, así que el emparejamiento y el mapa
 *     de conexiones leen datos REALES de otros ciudadanos.
 *   · ESPEJO PRIVADO de conveniencia en `user_settings.prefs.cultural` (merge no
 *     destructivo). No es la fuente de verdad del matching, solo comodidad.
 *
 * Matching honesto: dos perfiles se complementan cuando uno HABLA lo que el otro
 * APRENDE. La afinidad se explica en texto (nunca un número mágico sin sentido).
 */

import { createClient } from "@/utils/supabase/client";
import { fetchMyProfile, updateMyProfile, type OsProfile } from "@/lib/social/os-profiles";
import { mergeUserPrefs } from "@/lib/sync/user-prefs";
import { CULTURAL_SYSTEMS, systemById, type CulturalSystem } from "@/lib/cultural/systems";

/* ------------------------------------------------------------------ */
/* Dataset de idiomas                                                 */
/* ------------------------------------------------------------------ */

export interface LanguageDef {
    /** Código ISO 639-1 (o similar), en minúsculas. */
    code: string;
    /** Nombre en español. */
    label: string;
    /** Endónimo (nombre en su propia lengua). */
    native: string;
    /** Sistema cultural principal al que se asocia. */
    systemId: string;
}

/** Catálogo curado de idiomas del mundo, agrupados por sistema cultural. */
export const LANGUAGES: LanguageDef[] = [
    { code: "es", label: "Español", native: "Español", systemId: "iberoamerica" },
    { code: "pt", label: "Portugués", native: "Português", systemId: "iberoamerica" },
    { code: "qu", label: "Quechua", native: "Runa Simi", systemId: "originarios" },
    { code: "gn", label: "Guaraní", native: "Avañe'ẽ", systemId: "originarios" },
    { code: "ay", label: "Aimara", native: "Aymar aru", systemId: "originarios" },
    { code: "nah", label: "Náhuatl", native: "Nāhuatlahtōlli", systemId: "originarios" },
    { code: "en", label: "Inglés", native: "English", systemId: "anglosajon" },
    { code: "fr", label: "Francés", native: "Français", systemId: "europa" },
    { code: "de", label: "Alemán", native: "Deutsch", systemId: "europa" },
    { code: "it", label: "Italiano", native: "Italiano", systemId: "europa" },
    { code: "ca", label: "Catalán", native: "Català", systemId: "europa" },
    { code: "eu", label: "Euskera", native: "Euskara", systemId: "europa" },
    { code: "nl", label: "Neerlandés", native: "Nederlands", systemId: "europa" },
    { code: "ru", label: "Ruso", native: "Русский", systemId: "eslavo" },
    { code: "uk", label: "Ucraniano", native: "Українська", systemId: "eslavo" },
    { code: "pl", label: "Polaco", native: "Polski", systemId: "eslavo" },
    { code: "ar", label: "Árabe", native: "العربية", systemId: "arabe" },
    { code: "he", label: "Hebreo", native: "עברית", systemId: "arabe" },
    { code: "fa", label: "Persa", native: "فارسی", systemId: "arabe" },
    { code: "tr", label: "Turco", native: "Türkçe", systemId: "arabe" },
    { code: "sw", label: "Suajili", native: "Kiswahili", systemId: "africa" },
    { code: "yo", label: "Yoruba", native: "Yorùbá", systemId: "africa" },
    { code: "am", label: "Amárico", native: "አማርኛ", systemId: "africa" },
    { code: "zh", label: "Chino (mandarín)", native: "中文", systemId: "asia-oriental" },
    { code: "ja", label: "Japonés", native: "日本語", systemId: "asia-oriental" },
    { code: "ko", label: "Coreano", native: "한국어", systemId: "asia-oriental" },
    { code: "hi", label: "Hindi", native: "हिन्दी", systemId: "asia-sur" },
    { code: "bn", label: "Bengalí", native: "বাংলা", systemId: "asia-sur" },
    { code: "ta", label: "Tamil", native: "தமிழ்", systemId: "asia-sur" },
    { code: "vi", label: "Vietnamita", native: "Tiếng Việt", systemId: "sudeste-asiatico" },
    { code: "th", label: "Tailandés", native: "ไทย", systemId: "sudeste-asiatico" },
    { code: "id", label: "Indonesio", native: "Bahasa Indonesia", systemId: "sudeste-asiatico" },
    { code: "tl", label: "Tagalo", native: "Tagalog", systemId: "sudeste-asiatico" },
    { code: "mi", label: "Maorí", native: "Te Reo Māori", systemId: "oceania" },
    { code: "haw", label: "Hawaiano", native: "ʻŌlelo Hawaiʻi", systemId: "oceania" },
];

const LANG_INDEX: Record<string, LanguageDef> = Object.fromEntries(
    LANGUAGES.map((l) => [l.code, l]),
);

/** Devuelve la definición de un idioma por código (o null). */
export function languageByCode(code: string | null | undefined): LanguageDef | null {
    if (!code) return null;
    return LANG_INDEX[code.toLowerCase()] ?? null;
}

/** Etiqueta legible de un código de idioma (cae al propio código si no está). */
export function languageLabel(code: string): string {
    return languageByCode(code)?.label ?? code;
}

/** Idiomas agrupados por sistema cultural (para selectores bonitos). */
export function languagesBySystem(): { system: CulturalSystem; langs: LanguageDef[] }[] {
    return CULTURAL_SYSTEMS.map((system) => ({
        system,
        langs: LANGUAGES.filter((l) => l.systemId === system.id),
    })).filter((g) => g.langs.length > 0);
}

/* ------------------------------------------------------------------ */
/* Preferencias culturales del perfil                                 */
/* ------------------------------------------------------------------ */

export interface CulturalRegion {
    /** Etiqueta libre (ciudad/comunidad). */
    label: string;
    /** Sistema cultural declarado. */
    systemId: string;
    /** Coordenadas declaradas (para el mapa de conexiones). Opcionales. */
    lat?: number | null;
    lng?: number | null;
}

export interface CulturalPrefs {
    /** Idiomas que la persona HABLA. */
    speaks: string[];
    /** Idiomas que la persona APRENDE. */
    learns: string[];
    /** Región / sistema declarado (para el mapa y el color de sistema). */
    region?: CulturalRegion | null;
}

export const EMPTY_CULTURAL_PREFS: CulturalPrefs = { speaks: [], learns: [], region: null };

/** Prefijos de los tags-máquina en `os_profiles.tags` (públicos, filtrables). */
const TAG_SPEAK = "habla:";
const TAG_LEARN = "aprende:";
const TAG_SYSTEM = "sistema:";
const TAG_PLACE = "lugar:";
const TAG_GEO = "geo:";

/** ¿Es un tag-máquina cultural (no un interés visible del usuario)? */
export function isCulturalTag(tag: string): boolean {
    return (
        tag.startsWith(TAG_SPEAK) ||
        tag.startsWith(TAG_LEARN) ||
        tag.startsWith(TAG_SYSTEM) ||
        tag.startsWith(TAG_PLACE) ||
        tag.startsWith(TAG_GEO)
    );
}

function slugifyPlace(label: string): string {
    return label
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 40);
}

/** Reconstruye las preferencias culturales desde los tags públicos de un perfil. */
export function prefsFromTags(tags: string[] | null | undefined): CulturalPrefs {
    const speaks: string[] = [];
    const learns: string[] = [];
    let region: CulturalRegion | null = null;
    let systemId: string | null = null;
    let placeLabel: string | null = null;
    let lat: number | null = null;
    let lng: number | null = null;

    for (const raw of tags ?? []) {
        const tag = String(raw);
        if (tag.startsWith(TAG_SPEAK)) {
            const c = tag.slice(TAG_SPEAK.length).toLowerCase();
            if (c && !speaks.includes(c)) speaks.push(c);
        } else if (tag.startsWith(TAG_LEARN)) {
            const c = tag.slice(TAG_LEARN.length).toLowerCase();
            if (c && !learns.includes(c)) learns.push(c);
        } else if (tag.startsWith(TAG_SYSTEM)) {
            systemId = tag.slice(TAG_SYSTEM.length);
        } else if (tag.startsWith(TAG_PLACE)) {
            placeLabel = tag.slice(TAG_PLACE.length).replace(/-/g, " ");
        } else if (tag.startsWith(TAG_GEO)) {
            const [a, b] = tag.slice(TAG_GEO.length).split(",");
            const la = Number(a);
            const ln = Number(b);
            if (Number.isFinite(la) && Number.isFinite(ln)) {
                lat = la;
                lng = ln;
            }
        }
    }

    if (systemId || placeLabel || lat != null) {
        region = {
            label: placeLabel ?? "",
            systemId: systemId ?? "global",
            lat,
            lng,
        };
    }
    return { speaks, learns, region };
}

/** Genera los tags-máquina culturales para un set de preferencias. */
export function culturalTagsFromPrefs(prefs: CulturalPrefs): string[] {
    const out: string[] = [];
    for (const c of prefs.speaks) out.push(`${TAG_SPEAK}${c.toLowerCase()}`);
    for (const c of prefs.learns) out.push(`${TAG_LEARN}${c.toLowerCase()}`);
    if (prefs.region) {
        if (prefs.region.systemId) out.push(`${TAG_SYSTEM}${prefs.region.systemId}`);
        if (prefs.region.label) out.push(`${TAG_PLACE}${slugifyPlace(prefs.region.label)}`);
        if (typeof prefs.region.lat === "number" && typeof prefs.region.lng === "number") {
            out.push(`${TAG_GEO}${prefs.region.lat.toFixed(4)},${prefs.region.lng.toFixed(4)}`);
        }
    }
    return out;
}

/** Fusiona tags conservando los NO culturales (intereses) y sustituyendo los culturales. */
export function mergeCulturalTags(existing: string[] | null | undefined, prefs: CulturalPrefs): string[] {
    const kept = (existing ?? []).filter((t) => !isCulturalTag(String(t)));
    return [...kept, ...culturalTagsFromPrefs(prefs)];
}

/** Carga las preferencias culturales del usuario actual (desde su perfil público). */
export async function loadCulturalPrefs(): Promise<CulturalPrefs> {
    try {
        const profile = await fetchMyProfile();
        if (!profile) return { ...EMPTY_CULTURAL_PREFS };
        return prefsFromTags(profile.tags);
    } catch {
        return { ...EMPTY_CULTURAL_PREFS };
    }
}

export interface SaveCulturalResult {
    ok: boolean;
    error?: string;
    needsAuth?: boolean;
}

/**
 * Guarda las preferencias culturales:
 *  1) refleja los tags-máquina en `os_profiles.tags` (fuente pública del matching),
 *  2) espeja en `user_settings.prefs.cultural` (privado, conveniencia).
 * Nunca lanza.
 */
export async function saveCulturalPrefs(prefs: CulturalPrefs): Promise<SaveCulturalResult> {
    try {
        const profile = await fetchMyProfile();
        const nextTags = mergeCulturalTags(profile?.tags, prefs);
        const res = await updateMyProfile({ tags: nextTags, searchable: true });
        // Espejo privado (best-effort; no bloquea).
        void mergeUserPrefs({ cultural: prefs as unknown as Record<string, unknown> });
        if (!res.ok) {
            return { ok: false, error: res.error, needsAuth: res.needsAuth };
        }
        return { ok: true };
    } catch (e) {
        return { ok: false, error: (e as Error)?.message || "No se pudieron guardar tus idiomas." };
    }
}

/* ------------------------------------------------------------------ */
/* Matching REAL entre perfiles de la red                             */
/* ------------------------------------------------------------------ */

export interface CulturalProfile {
    profile: OsProfile;
    prefs: CulturalPrefs;
}

/**
 * Trae un lote de perfiles públicos con datos culturales declarados. RLS ya
 * filtra por `searchable=true`. Excluye al usuario actual. Nunca lanza.
 */
export async function listCulturalProfiles(limit = 200): Promise<CulturalProfile[]> {
    try {
        const supabase = createClient();
        const { data: me } = await supabase.auth.getUser();
        const myId = me?.user?.id ?? null;
        const { data, error } = await supabase
            .from("os_profiles")
            .select("user_id, username, display_name, avatar_url, bio, tags, searchable, updated_at")
            .not("tags", "is", null)
            .order("updated_at", { ascending: false })
            .limit(limit);
        if (error || !Array.isArray(data)) return [];
        const out: CulturalProfile[] = [];
        for (const row of data as Array<Record<string, unknown>>) {
            const userId = String(row.user_id ?? "");
            if (!userId || (myId && userId === myId)) continue;
            const tags = Array.isArray(row.tags) ? (row.tags as string[]) : [];
            const prefs = prefsFromTags(tags);
            // Solo nos interesan perfiles que hayan declarado algo cultural.
            if (prefs.speaks.length === 0 && prefs.learns.length === 0 && !prefs.region) continue;
            const profile: OsProfile = {
                userId,
                username: String(row.username ?? ""),
                displayName: String(row.display_name ?? row.username ?? "Ciudadano"),
                avatarUrl: (row.avatar_url as string) || undefined,
                bio: String(row.bio ?? ""),
                tags,
                searchable: row.searchable !== false,
                updatedAt: String(row.updated_at ?? ""),
            };
            out.push({ profile, prefs });
        }
        return out;
    } catch {
        return [];
    }
}

export interface LanguageMatch {
    profile: OsProfile;
    prefs: CulturalPrefs;
    /** Idiomas que ELLOS hablan y TÚ aprendes (te enseñan). */
    theyTeachYou: string[];
    /** Idiomas que TÚ hablas y ELLOS aprenden (les enseñas). */
    youTeachThem: string[];
    /** Puntuación 0..100 (mutuo pesa más que unidireccional). */
    affinity: number;
    /** Explicación en español de por qué encajáis. */
    reason: string;
    /** ¿Es un intercambio recíproco (ambos enseñan)? */
    reciprocal: boolean;
}

function intersect(a: string[], b: string[]): string[] {
    const setB = new Set(b.map((x) => x.toLowerCase()));
    return a.filter((x) => setB.has(x.toLowerCase()));
}

/**
 * Empareja MIS preferencias con una lista de perfiles. Devuelve solo los que
 * complementan (alguna dirección de enseñanza), ordenados por afinidad.
 */
export function matchLanguagePartners(mine: CulturalPrefs, candidates: CulturalProfile[]): LanguageMatch[] {
    const matches: LanguageMatch[] = [];
    for (const c of candidates) {
        const theyTeachYou = intersect(c.prefs.speaks, mine.learns); // ellos hablan lo que aprendo
        const youTeachThem = intersect(mine.speaks, c.prefs.learns); // yo hablo lo que aprenden
        if (theyTeachYou.length === 0 && youTeachThem.length === 0) continue;

        const reciprocal = theyTeachYou.length > 0 && youTeachThem.length > 0;
        // Recíproco: base alta. Unidireccional: media. + bonus por nº de idiomas.
        let affinity = reciprocal ? 70 : 45;
        affinity += Math.min(20, (theyTeachYou.length + youTeachThem.length) * 8);
        // Mismo sistema cultural resta un poco de "novedad"; sistemas distintos suman.
        const sameSystem =
            mine.region?.systemId && c.prefs.region?.systemId && mine.region.systemId === c.prefs.region.systemId;
        affinity += sameSystem ? 0 : 10;
        affinity = Math.max(0, Math.min(100, affinity));

        const parts: string[] = [];
        if (theyTeachYou.length > 0) {
            parts.push(`te puede enseñar ${theyTeachYou.map(languageLabel).join(", ")}`);
        }
        if (youTeachThem.length > 0) {
            parts.push(`aprende ${youTeachThem.map(languageLabel).join(", ")} que tú hablas`);
        }
        const reason = reciprocal
            ? `Intercambio recíproco: ${parts.join(" y ")}.`
            : `Complementario: ${parts.join(" y ")}.`;

        matches.push({
            profile: c.profile,
            prefs: c.prefs,
            theyTeachYou,
            youTeachThem,
            affinity,
            reason,
            reciprocal,
        });
    }
    matches.sort((a, b) => b.affinity - a.affinity);
    return matches;
}

/** Sugiere un "mentor" de OTRO sistema cultural (para el puente cultural). */
export function pickCrossSystemMentor(mine: CulturalPrefs, matches: LanguageMatch[]): LanguageMatch | null {
    if (matches.length === 0) return null;
    const mySystem = mine.region?.systemId ?? null;
    const cross = matches.find((m) => {
        const theirs = m.prefs.region?.systemId ?? null;
        return theirs && theirs !== mySystem;
    });
    return cross ?? matches[0];
}

/** Prompt de sistema para abrir un chat de intercambio en Astraura. */
export function exchangeSystemPrompt(mine: CulturalPrefs, match: LanguageMatch): string {
    const teach = match.youTeachThem.map(languageLabel).join(", ") || "tu lengua";
    const learn = match.theyTeachYou.map(languageLabel).join(", ") || "su lengua";
    const partner = systemById(match.prefs.region?.systemId).label;
    return [
        "Eres un facilitador de intercambio cultural y lingüístico de la Sociedad StarSeed.",
        `El ciudadano quiere practicar un intercambio con alguien del sistema cultural ${partner}.`,
        `Él/ella HABLA: ${mine.speaks.map(languageLabel).join(", ") || "—"} y APRENDE: ${mine.learns.map(languageLabel).join(", ") || "—"}.`,
        `La pareja puede enseñarle ${learn}; a cambio, practicarán juntos ${teach}.`,
        "Propón un primer tema de conversación cálido, tres frases útiles bilingües y una micro-actividad de 5 minutos.",
        "Responde en español, con tono acogedor y ontocrático (una persona, una voz).",
    ].join(" ");
}
