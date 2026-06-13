// ════════════════════════════════════════════════════════════════
// Gen4 Widget Data Adapters — self-registering mock sources
// ----------------------------------------------------------------
// These keep the new gen4 widgets working out of the box with
// deterministic, *live-feeling* data. Each domain is swappable for a
// real source (Supabase, REST, on-chain oracle, federated node) at
// runtime via `registerAdapter(key, fn)` — widgets never change.
// Importing this module (side-effect) registers all gen4 adapters.
// ════════════════════════════════════════════════════════════════

import { registerAdapter } from "./adapters";
import type {
    CouncilState, JusticeState, BarterState, EnergyGridState, MentorState,
    LibraryState, MultiverseState, StudioState, OracleState, IdentityState,
    EnergyMapState, SeriesPoint, Trend,
} from "./types";

// ── deterministic helpers (SSR-stable, slowly animated) ─────────
function seeded(seed: number) {
    let s = seed % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
function pick<T>(arr: T[], r: number): T {
    return arr[Math.floor(r * arr.length) % arr.length];
}
function tick(stepMs = 6000) {
    return Math.floor(Date.now() / stepMs);
}
function trendOf(r: number): Trend {
    return r > 0.62 ? "up" : r < 0.38 ? "down" : "flat";
}
function series(seed: number, n = 14, base = 0.5, amp = 0.4): SeriesPoint[] {
    const r = seeded(seed);
    const out: SeriesPoint[] = [];
    let v = base;
    for (let i = 0; i < n; i++) {
        v = Math.max(0.04, Math.min(0.98, v + (r() - 0.5) * amp));
        out.push({ t: i, v: Math.round(v * 1000) / 1000 });
    }
    return out;
}

// ════════════════════════════════════════════════════════════════
// politics.council — Consejo de Sabios
// ════════════════════════════════════════════════════════════════
const SAGE_NAMES = ["Aiko Vega", "Tomás Iriarte", "Naima Solá", "Kenji Ortega", "Liwen Cruz", "Marek Dovë"];
const SAGE_DOMAINS = ["Ecología", "Justicia Restaurativa", "Energía", "Pedagogía", "Salud Comunal", "Arquitectura Social"];
const SAGE_ACCENTS = ["#FFBF00", "#10B981", "#38bdf8", "#a855f7", "#f43f5e", "#22d3ee"];
function buildCouncil(): CouncilState {
    const r = seeded(tick());
    const sages: CouncilState["sages"] = SAGE_NAMES.map((name, i) => {
        const rr = seeded(tick() + i * 7);
        return {
            id: `sage-${i}`,
            name,
            domain: SAGE_DOMAINS[i % SAGE_DOMAINS.length],
            badges: 8 + Math.floor(rr() * 34),
            reputation: 0.62 + rr() * 0.36,
            online: rr() > 0.45,
            delegatedVoices: 40 + Math.floor(rr() * 1200),
            accent: SAGE_ACCENTS[i % SAGE_ACCENTS.length],
        };
    }).sort((a, b) => b.reputation - a.reputation);
    const openConsultations = [
        { id: "c0", topic: "Reparto del excedente energético", sageId: "sage-0", urgency: "alta" as const, deadlineTs: Date.now() + 3600_000 * 20 },
        { id: "c1", topic: "Protocolo de mediación vecinal", sageId: "sage-1", urgency: "media" as const, deadlineTs: Date.now() + 3600_000 * 52 },
        { id: "c2", topic: "Currículo libre de robótica", sageId: "sage-3", urgency: "baja" as const, deadlineTs: Date.now() + 3600_000 * 120 },
    ];
    return { sages, openConsultations, yourTrustGiven: 1 + Math.floor(r() * 4) };
}

// ════════════════════════════════════════════════════════════════
// politics.justice — Tribunal Restaurativo
// ════════════════════════════════════════════════════════════════
const CASE_TITLES = ["Conflicto por uso del taller común", "Daño accidental al huerto vecinal", "Desacuerdo en reparto de turnos", "Ruptura de confianza en proyecto", "Uso indebido de recurso compartido"];
const HARM_TYPES = ["material", "relacional", "comunitario", "confianza", "ambiental"];
const FACILITATORS = ["Círculo Norte", "Naima Solá", "Mediadores Oikos", "Tomás Iriarte"];
function buildJustice(): JusticeState {
    const stages: JusticeState["cases"][number]["stage"][] = ["apertura", "escucha", "acuerdo", "reparacion", "cerrado"];
    const cases = CASE_TITLES.map((title, i) => {
        const rr = seeded(tick() + i * 11);
        const stage = pick(stages.slice(0, 4), rr());
        return {
            id: `case-${i}`,
            title,
            stage,
            progress: 0.1 + rr() * 0.85,
            participants: 2 + Math.floor(rr() * 7),
            facilitator: pick(FACILITATORS, rr()),
            harmType: HARM_TYPES[i % HARM_TYPES.length],
            restorative: true as const,
            nextCircleTs: Date.now() + 3600_000 * (4 + Math.floor(rr() * 90)),
        };
    });
    const r = seeded(tick());
    return { activeCircles: cases.length, healedThisCycle: 6 + Math.floor(r() * 14), cases };
}

// ════════════════════════════════════════════════════════════════
// oikos.barter — Mercado de Trueque
// ════════════════════════════════════════════════════════════════
const BARTER = [
    { offers: "Excedente de tomates y albahaca", wants: "Horas de carpintería", category: "alimentos" },
    { offers: "Reparación de bicicletas", wants: "Clases de cerámica", category: "herramientas" },
    { offers: "Taller de soldadura", wants: "Verduras de temporada", category: "saberes" },
    { offers: "Diseño de carteles", wants: "Ayuda con mudanza", category: "arte" },
    { offers: "Impresión 3D de piezas", wants: "Pan de masa madre", category: "tecnologia" },
    { offers: "Cuidado de plantas", wants: "Tiempo de tutoría", category: "tiempo" },
] as const;
const BARTER_OWNERS = ["Marisol", "Tomás", "Colectivo Raíz", "Ana K.", "Nodo Verde", "Liwen"];
const BARTER_ACCENTS = ["#10B981", "#f59e0b", "#38bdf8", "#ec4899", "#22d3ee", "#a855f7"];
function buildBarter(): BarterState {
    const listings = BARTER.map((b, i) => {
        const rr = seeded(tick() + i * 13);
        return {
            id: `barter-${i}`,
            offers: b.offers,
            wants: b.wants,
            owner: BARTER_OWNERS[i % BARTER_OWNERS.length],
            category: b.category,
            distanceKm: Math.round(rr() * 80) / 10,
            matchScore: rr(),
            accent: BARTER_ACCENTS[i % BARTER_ACCENTS.length],
        };
    }).sort((a, b) => b.matchScore - a.matchScore);
    return { listings, yourMatches: listings.filter((l) => l.matchScore > 0.6).length };
}

// ════════════════════════════════════════════════════════════════
// oikos.energy — Energía Comunal
// ════════════════════════════════════════════════════════════════
function buildEnergy(): EnergyGridState {
    const r = seeded(tick());
    const gen = 18 + r() * 26;
    const con = 12 + seeded(tick() + 3)() * 22;
    const sources = [
        { id: "solar", label: "Solar", share: 0.46 + r() * 0.2, trend: trendOf(seeded(tick() + 1)()) },
        { id: "eolica", label: "Eólica", share: 0.18 + r() * 0.12, trend: trendOf(seeded(tick() + 2)()) },
        { id: "biogas", label: "Biogás", share: 0.1 + r() * 0.08, trend: trendOf(seeded(tick() + 4)()) },
        { id: "red", label: "Red externa", share: 0.06 + r() * 0.06, trend: trendOf(seeded(tick() + 5)()) },
    ];
    const sum = sources.reduce((a, s) => a + s.share, 0);
    sources.forEach((s) => (s.share = Math.round((s.share / sum) * 100) / 100));
    return {
        generationKw: Math.round(gen * 10) / 10,
        consumptionKw: Math.round(con * 10) / 10,
        batteryLevel: 0.35 + r() * 0.6,
        sharedToGrid: Math.round(Math.max(0, gen - con) * 10) / 10,
        sources,
        history: series(tick() + 9, 16, 0.55, 0.3),
        co2AvoidedKg: 120 + Math.floor(r() * 380),
    };
}

// ════════════════════════════════════════════════════════════════
// education.mentors — Mentoría Híbrida
// ════════════════════════════════════════════════════════════════
const MENTORS = [
    { name: "Dr. Sol Herrera", expertise: "Permacultura", kind: "humano" },
    { name: "Astraura Core", expertise: "Matemática viva", kind: "ia" },
    { name: "Kenji + Copiloto", expertise: "Robótica abierta", kind: "hibrido" },
    { name: "Naima Solá", expertise: "Mediación", kind: "humano" },
    { name: "Oráculo Pedagógico", expertise: "Idiomas", kind: "ia" },
    { name: "Liwen + Tutor IA", expertise: "Música modal", kind: "hibrido" },
] as const;
const MENTOR_ACCENTS = ["#A855F7", "#06b6d4", "#22d3ee", "#f43f5e", "#38bdf8", "#10b981"];
function buildMentors(): MentorState {
    const mentors = MENTORS.map((m, i) => {
        const rr = seeded(tick() + i * 17);
        return {
            id: `mentor-${i}`,
            name: m.name,
            expertise: m.expertise,
            kind: m.kind,
            rating: 0.7 + rr() * 0.29,
            matchScore: rr(),
            availableInMin: rr() > 0.5 ? 0 : Math.floor(rr() * 240),
            sessionsGiven: 12 + Math.floor(rr() * 400),
            accent: MENTOR_ACCENTS[i % MENTOR_ACCENTS.length],
        };
    }).sort((a, b) => b.matchScore - a.matchScore);
    return {
        mentors,
        nextSession: { mentorId: mentors[0].id, topic: mentors[0].expertise, ts: Date.now() + 3600_000 * 6 },
    };
}

// ════════════════════════════════════════════════════════════════
// education.library — Biblioteca Universal
// ════════════════════════════════════════════════════════════════
const LIB = [
    { title: "Fundamentos de Abundancia", author: "Asamblea Oikos", kind: "curso", discipline: "Economía" },
    { title: "Atlas de Biorregiones", author: "Red Verde", kind: "modelo3d", discipline: "Ecología" },
    { title: "Constitución Comentada", author: "Consejo de Sabios", kind: "doc", discipline: "Gobernanza" },
    { title: "Sonido y Conciencia", author: "Estudio Solfeggio", kind: "audio", discipline: "Cultura" },
    { title: "Robótica Regenerativa", author: "Kenji Ortega", kind: "video", discipline: "Tecnología" },
    { title: "Datos Abiertos de Cosecha", author: "Nodo Alimentario", kind: "dataset", discipline: "Ecología" },
] as const;
function buildLibrary(): LibraryState {
    const items = LIB.map((it, i) => {
        const rr = seeded(tick() + i * 19);
        return {
            id: `lib-${i}`,
            title: it.title,
            author: it.author,
            kind: it.kind,
            discipline: it.discipline,
            progress: rr() > 0.5 ? rr() : undefined,
            rating: 0.65 + rr() * 0.34,
            openAccess: true,
        };
    });
    const r = seeded(tick());
    return {
        featured: items.slice(0, 4),
        continueLearning: items.filter((i) => i.progress !== undefined),
        totalEntities: 184320 + Math.floor(r() * 5000),
        collections: [
            { id: "gov", label: "Gobernanza", count: 1240, accent: "#FFBF00" },
            { id: "eco", label: "Ecología", count: 3180, accent: "#10B981" },
            { id: "art", label: "Arte & Cultura", count: 2670, accent: "#EC4899" },
            { id: "tech", label: "Tecnología", count: 1990, accent: "#06B6D4" },
        ],
    };
}

// ════════════════════════════════════════════════════════════════
// culture.multiverse — Multiverso
// ════════════════════════════════════════════════════════════════
const WORLDS = [
    { name: "Jardín Solfeggio", theme: "Meditación sonora", mode: "vr" },
    { name: "Ágora Cristalina", theme: "Asamblea inmersiva", mode: "espacial" },
    { name: "Mercado Holográfico", theme: "Trueque AR", mode: "ar" },
    { name: "Galería Viva", theme: "Arte generativo", mode: "vr" },
    { name: "Bioma Norte", theme: "Exploración ecológica", mode: "2d" },
    { name: "Templo de Datos", theme: "Memoria colectiva", mode: "espacial" },
] as const;
const WORLD_ACCENTS = ["#a855f7", "#22d3ee", "#f59e0b", "#ec4899", "#10b981", "#38bdf8"];
function buildMultiverse(): MultiverseState {
    const worlds = WORLDS.map((w, i) => {
        const rr = seeded(tick() + i * 23);
        return {
            id: `world-${i}`,
            name: w.name,
            theme: w.theme,
            mode: w.mode,
            activeUsers: Math.floor(rr() * 480),
            intensity: rr(),
            live: rr() > 0.4,
            accent: WORLD_ACCENTS[i % WORLD_ACCENTS.length],
        };
    }).sort((a, b) => b.activeUsers - a.activeUsers);
    return {
        worlds,
        totalPresence: worlds.reduce((a, w) => a + w.activeUsers, 0),
        yourPortals: 2 + Math.floor(seeded(tick())() * 4),
    };
}

// ════════════════════════════════════════════════════════════════
// culture.studio — Estudio Creativo
// ════════════════════════════════════════════════════════════════
const STUDIO = [
    { title: "Álbum 'Raíces'", medium: "música" },
    { title: "Mural participativo", medium: "visual" },
    { title: "Manifiesto ilustrado", medium: "mixto" },
    { title: "Corto regenerativo", medium: "video" },
    { title: "Escultura paramétrica", medium: "3d" },
] as const;
const STUDIO_ACCENTS = ["#ec4899", "#f59e0b", "#a855f7", "#06b6d4", "#10b981"];
function buildStudio(): StudioState {
    const projects = STUDIO.map((p, i) => {
        const rr = seeded(tick() + i * 29);
        return {
            id: `studio-${i}`,
            title: p.title,
            medium: p.medium,
            progress: rr(),
            collaborators: 1 + Math.floor(rr() * 9),
            updatedTs: Date.now() - Math.floor(rr() * 3600_000 * 72),
            accent: STUDIO_ACCENTS[i % STUDIO_ACCENTS.length],
        };
    }).sort((a, b) => b.updatedTs - a.updatedTs);
    const INSPIRATION = [
        "Crea como si el futuro ya te recordara.",
        "Lo bello que se comparte se multiplica.",
        "Toda obra es una entidad viva del Lienzo Universal.",
        "Disuelve el ego: deja que la red co-cree contigo.",
    ];
    return {
        projects,
        tools: [
            { id: "canvas", label: "Lienzo Universal", kind: "visual" },
            { id: "daw", label: "Estudio Sonoro", kind: "audio" },
            { id: "model", label: "Modelador 3D", kind: "3d" },
            { id: "ai", label: "Co-creador IA", kind: "ia" },
        ],
        inspirationOfDay: pick(INSPIRATION, seeded(Math.floor(Date.now() / 86400000))()),
    };
}

// ════════════════════════════════════════════════════════════════
// ai.oracle — Oráculo Predictivo
// ════════════════════════════════════════════════════════════════
const ORACLE = [
    { question: "¿Cubrirá la cosecha la demanda del ciclo?", outcome: "Excedente del 12% probable", impact: "positivo", horizon: "1 ciclo", drivers: ["clima estable", "nuevos invernaderos"] },
    { question: "¿Se ratificará la propuesta energética?", outcome: "Aprobación con amplio consenso", impact: "positivo", horizon: "7 días", drivers: ["resonancia social alta", "delegaciones a favor"] },
    { question: "¿Riesgo de saturación en la red mesh?", outcome: "Pico de carga el fin de semana", impact: "riesgo", horizon: "3 días", drivers: ["evento cultural", "+nodos invitados"] },
    { question: "¿Tendencia de participación cívica?", outcome: "Crecimiento sostenido", impact: "neutro", horizon: "1 mes", drivers: ["nuevas iniciativas", "mentoría activa"] },
] as const;
function buildOracle(): OracleState {
    const scenarios = ORACLE.map((o, i) => {
        const rr = seeded(tick() + i * 31);
        return {
            id: `oracle-${i}`,
            question: o.question,
            outcome: o.outcome,
            probability: 0.5 + rr() * 0.48,
            confidence: 0.6 + rr() * 0.38,
            horizon: o.horizon,
            impact: o.impact,
            drivers: [...o.drivers],
        };
    }).sort((a, b) => b.probability - a.probability);
    return { scenarios, modelAccuracy: 0.82 + seeded(tick())() * 0.12, lastUpdated: Date.now() };
}

// ════════════════════════════════════════════════════════════════
// system.identity — Bóveda de Identidad Soberana
// ════════════════════════════════════════════════════════════════
function buildIdentity(): IdentityState {
    const r = seeded(tick());
    return {
        accountVerified: true,
        zkVerifications: 3 + Math.floor(r() * 9),
        profiles: [
            { id: "civ", label: "Ciudadano", kind: "civico", visibility: "publico", accent: "#FFBF00" },
            { id: "art", label: "Artista", kind: "artistico", visibility: "red", accent: "#EC4899" },
            { id: "pro", label: "Profesional", kind: "profesional", visibility: "publico", accent: "#06B6D4" },
            { id: "int", label: "Íntimo", kind: "intimo", visibility: "privado", accent: "#8B5CF6" },
        ],
        keysHealthy: r() > 0.08,
        dataShares: [
            { id: "ds0", party: "Nodo Salud Comunal", scope: "Métricas de bienestar", revocable: true, grantedTs: Date.now() - 3600_000 * 200 },
            { id: "ds1", party: "Asamblea Oikos", scope: "Voto delegado (energía)", revocable: true, grantedTs: Date.now() - 3600_000 * 40 },
            { id: "ds2", party: "Biblioteca Universal", scope: "Historial de aprendizaje", revocable: true, grantedTs: Date.now() - 3600_000 * 600 },
        ],
        sovereigntyScore: 0.78 + r() * 0.2,
    };
}

// ════════════════════════════════════════════════════════════════
// astro.energy — Mapa de Energía
// ════════════════════════════════════════════════════════════════
const CENTERS = [
    { label: "Raíz", color: "#ef4444", note: "Estabilidad y arraigo" },
    { label: "Sacro", color: "#f97316", note: "Creatividad y flujo" },
    { label: "Plexo", color: "#eab308", note: "Voluntad y acción" },
    { label: "Corazón", color: "#22c55e", note: "Conexión empática" },
    { label: "Garganta", color: "#06b6d4", note: "Expresión auténtica" },
    { label: "Tercer Ojo", color: "#6366f1", note: "Intuición y visión" },
    { label: "Corona", color: "#a855f7", note: "Conciencia expandida" },
];
function buildEnergyMap(): EnergyMapState {
    const centers = CENTERS.map((c, i) => {
        const rr = seeded(tick() + i * 37);
        return { id: `center-${i}`, label: c.label, balance: 0.4 + rr() * 0.58, color: c.color, note: c.note };
    });
    const r = seeded(tick());
    const phase = (d: number) => Math.sin((Date.now() / 86400000 / d) * Math.PI * 2);
    return {
        overallCoherence: centers.reduce((a, c) => a + c.balance, 0) / centers.length,
        centers,
        biorhythm: {
            physical: Math.round(phase(23) * 100) / 100,
            emotional: Math.round(phase(28) * 100) / 100,
            intellectual: Math.round(phase(33) * 100) / 100,
        },
        cosmicInfluence: [
            { body: "Luna", effect: "Sensibilidad emocional", intensity: 0.4 + r() * 0.5 },
            { body: "Mercurio", effect: "Claridad comunicativa", intensity: 0.3 + seeded(tick() + 2)() * 0.5 },
            { body: "Sol", effect: "Vitalidad y propósito", intensity: 0.5 + seeded(tick() + 3)() * 0.45 },
        ],
        history: series(tick() + 50, 14, 0.6, 0.22),
    };
}

// ── register all gen4 adapters (idempotent) ─────────────────────
let _registered = false;
export function registerGen4Adapters() {
    if (_registered) return;
    _registered = true;
    registerAdapter("politics.council", buildCouncil);
    registerAdapter("politics.justice", buildJustice);
    registerAdapter("oikos.barter", buildBarter);
    registerAdapter("oikos.energy", buildEnergy);
    registerAdapter("education.mentors", buildMentors);
    registerAdapter("education.library", buildLibrary);
    registerAdapter("culture.multiverse", buildMultiverse);
    registerAdapter("culture.studio", buildStudio);
    registerAdapter("ai.oracle", buildOracle);
    registerAdapter("system.identity", buildIdentity);
    registerAdapter("astro.energy", buildEnergyMap);
}

// self-register on import (side-effect)
registerGen4Adapters();
