// ════════════════════════════════════════════════════════════════
// Gen5 Widget Data Adapters — self-registering mock sources
// ----------------------------------------------------------------
// Deterministic, live-feeling data for the gen5 widgets. Each domain
// is swappable for a real user source (Supabase, REST, on-chain
// oracle, MCP, local device bridge) at runtime via registerAdapter —
// widgets never change. Importing this module registers all adapters.
// ════════════════════════════════════════════════════════════════

import { registerAdapter } from "./adapters";
import type {
    FlowState, SwarmState, AbundanceState, TransitState, ShieldState,
    HabitatState, SerendipityState, IdeaForgeState, MeritState, SocietyState,
    SeriesPoint, Trend, FlowPhase, FlowTaskKind,
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
// productivity.flow — Director de Flujo Vital
// ════════════════════════════════════════════════════════════════
function buildFlow(): FlowState {
    const hour = new Date().getHours();
    const r = seeded(tick(60000) + hour);
    // curva circadiana: pico mañana + pico tarde
    const circadian: SeriesPoint[] = Array.from({ length: 24 }, (_, h) => {
        const morning = Math.exp(-((h - 10) ** 2) / 18);
        const afternoon = Math.exp(-((h - 17) ** 2) / 22) * 0.85;
        return { t: h, v: Math.round(Math.min(1, morning + afternoon) * 1000) / 1000 };
    });
    const energyNow = circadian[hour]?.v ?? 0.5;
    const phase: FlowPhase = hour < 7 ? "reposo" : hour < 11 ? "amanecer" : hour < 14 ? "pico" : hour < 18 ? "meseta" : hour < 22 ? "descenso" : "reposo";
    const peaks: FlowState["peaks"] = [
        { id: "p0", label: "Trabajo profundo", kind: "analitica", startHour: 9, score: 0.92 },
        { id: "p1", label: "Creación libre", kind: "creativa", startHour: 11, score: 0.86 },
        { id: "p2", label: "Movimiento", kind: "fisica", startHour: 14, score: 0.7 },
        { id: "p3", label: "Encuentros", kind: "social", startHour: 17, score: 0.78 },
        { id: "p4", label: "Reposo consciente", kind: "descanso", startHour: 21, score: 0.6 },
    ];
    const best = peaks.reduce((a, b) => (Math.abs(b.startHour - hour) < Math.abs(a.startHour - hour) ? b : a));
    const reasons: Record<FlowTaskKind, string> = {
        analitica: "tu energía télica favorece el foco analítico ahora",
        creativa: "ventana óptima para divergencia creativa",
        fisica: "buen momento para mover el cuerpo y oxigenar",
        social: "tu ritmo invita a encuentros y colaboración",
        descanso: "el cuerpo pide recuperación para sostener el flujo",
    };
    return {
        energyNow,
        phase,
        peaks,
        suggestion: { taskType: best.kind, reason: reasons[best.kind] },
        focusMode: false,
        circadian,
    };
}

// ════════════════════════════════════════════════════════════════
// productivity.swarm — Enjambre de Propósitos
// ════════════════════════════════════════════════════════════════
const SWARM = [
    { label: "Diseñar logo de la iniciativa", status: "activo" },
    { label: "Bancal en espiral del huerto", status: "flujo" },
    { label: "Documentar protocolo mesh", status: "revision" },
    { label: "Curar muestras sonoras 432Hz", status: "semilla" },
    { label: "Prototipo de ladrillo biológico", status: "activo" },
    { label: "Traducir constitución a EN", status: "flujo" },
] as const;
const SWARM_ACCENTS = ["#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#38bdf8"];
function buildSwarm(): SwarmState {
    const nodes = SWARM.map((p, i) => {
        const rr = seeded(tick() + i * 7);
        return {
            id: `swarm-${i}`,
            label: p.label,
            urgency: rr(),
            impact: rr(),
            status: p.status,
            subtasks: 1 + Math.floor(rr() * 8),
            accent: SWARM_ACCENTS[i % SWARM_ACCENTS.length],
        };
    }).sort((a, b) => b.urgency * b.impact - a.urgency * a.impact);
    return { nodes, openToSwarm: 2 + Math.floor(seeded(tick())() * 5) };
}

// ════════════════════════════════════════════════════════════════
// location.resources — Radar de Nodos de Abundancia
// ════════════════════════════════════════════════════════════════
const RESOURCES = [
    { label: "Huerto urbano — cosecha lista", kind: "huerto" },
    { label: "Impresora 3D pública", kind: "impresora3d" },
    { label: "Dispensario de agua pura", kind: "agua" },
    { label: "Banco de herramientas", kind: "herramientas" },
    { label: "Centro de sanación", kind: "sanacion" },
    { label: "Taller de carpintería", kind: "taller" },
] as const;
const RES_ACCENTS = ["#10b981", "#f59e0b", "#38bdf8", "#a855f7", "#f43f5e", "#22d3ee"];
function buildAbundance(): AbundanceState {
    const nodes = RESOURCES.map((r, i) => {
        const rr = seeded(tick() + i * 11);
        const eta = rr() > 0.5 ? 0 : Math.floor(rr() * 40);
        return {
            id: `res-${i}`,
            label: r.label,
            kind: r.kind,
            distanceKm: Math.round(rr() * 60) / 10,
            available: eta === 0,
            etaMin: eta,
            accent: RES_ACCENTS[i % RES_ACCENTS.length],
        };
    }).sort((a, b) => a.distanceKm - b.distanceKm);
    return { nodes, readyNow: nodes.filter((n) => n.available).length };
}

// ════════════════════════════════════════════════════════════════
// location.transit — Topología de Tránsito Orgánico
// ════════════════════════════════════════════════════════════════
const TRANSIT = [
    { kind: "capsula", label: "Cápsula de tránsito" },
    { kind: "vehiculo", label: "Vehículo autónomo" },
    { kind: "dron", label: "Dron de carga" },
    { kind: "bici", label: "Bici compartida" },
] as const;
const TRANSIT_ACCENTS = ["#38bdf8", "#10b981", "#f59e0b", "#a855f7"];
function buildTransit(): TransitState {
    const vehicles = TRANSIT.map((v, i) => {
        const rr = seeded(tick() + i * 13);
        return {
            id: `veh-${i}`,
            kind: v.kind,
            label: v.label,
            etaMin: 1 + Math.floor(rr() * 18),
            occupancy: rr(),
            accent: TRANSIT_ACCENTS[i % TRANSIT_ACCENTS.length],
        };
    }).sort((a, b) => a.etaMin - b.etaMin);
    const r = seeded(tick());
    return { vehicles, activeRoutes: 6 + Math.floor(r() * 18), co2SavedKg: 40 + Math.floor(r() * 160) };
}

// ════════════════════════════════════════════════════════════════
// privacy.shield — Escudo Ontológico
// ════════════════════════════════════════════════════════════════
const FLOWS = [
    { kind: "texto", label: "Mensajes cifrados", outbound: true, allowed: true },
    { kind: "ubicacion", label: "Ubicación → asamblea", outbound: true, allowed: true },
    { kind: "biometria", label: "Biometría (local)", outbound: false, allowed: true },
    { kind: "audio", label: "Audio ambiental", outbound: true, allowed: false },
] as const;
function buildShield(): ShieldState {
    const r = seeded(tick());
    return {
        level: "equilibrada",
        trackersBlocked: 18 + Math.floor(r() * 240),
        flows: FLOWS.map((f, i) => ({ id: `flow-${i}`, ...f })),
        onionHops: 3 + Math.floor(seeded(tick() + 1)() * 4),
        keysHealthy: r() > 0.06,
    };
}

// ════════════════════════════════════════════════════════════════
// devices.habitat — Núcleo de Simbiosis Habitacional
// ════════════════════════════════════════════════════════════════
const ROOMS = [
    { label: "Estudio", accent: "#38bdf8" },
    { label: "Descanso", accent: "#a855f7" },
    { label: "Cocina", accent: "#f59e0b" },
    { label: "Invernadero", accent: "#10b981" },
];
const HAB_ROBOTS = [
    { label: "Unidad de limpieza", task: "Aspirando estudio" },
    { label: "Brazo de cocina", task: "Preparando comida comunal" },
    { label: "Dron de jardín", task: "Riego hidropónico" },
];
function buildHabitat(): HabitatState {
    const hour = new Date().getHours();
    const circadianMode: HabitatState["circadianMode"] = hour < 12 ? "dia" : hour < 19 ? "tarde" : "noche";
    const rooms = ROOMS.map((rm, i) => {
        const rr = seeded(tick() + i * 17);
        return {
            id: `room-${i}`,
            label: rm.label,
            tempC: Math.round((19 + rr() * 5) * 10) / 10,
            light: circadianMode === "noche" ? 0.2 + rr() * 0.25 : 0.55 + rr() * 0.4,
            airQuality: 0.6 + rr() * 0.38,
            accent: rm.accent,
        };
    });
    const robots = HAB_ROBOTS.map((rb, i) => {
        const rr = seeded(tick() + i * 19);
        return { id: `bot-${i}`, label: rb.label, battery: 0.35 + rr() * 0.6, task: rb.task, active: rr() > 0.4 };
    });
    return { rooms, circadianMode, robots, energyHarmony: 0.55 + seeded(tick())() * 0.4 };
}

// ════════════════════════════════════════════════════════════════
// discovery.serendipity — Lente de Serendipia
// ════════════════════════════════════════════════════════════════
const FINDS = [
    { title: "Micelio como arquitectura viva", kind: "idea", author: "Nodo Hongo" },
    { title: "Mural generativo en la Plaza Sur", kind: "arte", author: "Telar Ciberdélico" },
    { title: "Raga modal en 432 Hz", kind: "musica", author: "Liwen" },
    { title: "Sendero de los almendros en flor", kind: "sendero", author: "Cartógrafo" },
    { title: "Afín en permacultura árida", kind: "persona", author: "Maya R." },
    { title: "Colisión: Zen × Termodinámica", kind: "idea", author: "Astraura" },
] as const;
const FIND_ACCENTS = ["#a855f7", "#ec4899", "#06b6d4", "#10b981", "#f59e0b", "#8b5cf6"];
function buildSerendipity(): SerendipityState {
    const finds = FINDS.map((f, i) => {
        const rr = seeded(tick() + i * 23);
        return { id: `find-${i}`, title: f.title, kind: f.kind, author: f.author, resonance: rr(), accent: FIND_ACCENTS[i % FIND_ACCENTS.length] };
    }).sort((a, b) => b.resonance - a.resonance);
    return { strangeness: 0.45 + seeded(tick())() * 0.4, finds };
}

// ════════════════════════════════════════════════════════════════
// creativity.ideas — Incubadora de Quimeras
// ════════════════════════════════════════════════════════════════
const CONCEPTS = [
    "Micelio fúngico", "Arquitectura de rascacielos", "Mecánica cuántica", "Budismo Zen",
    "Permacultura", "Inteligencia colectiva", "Música modal", "Criptografía",
    "Biomímesis", "Economía del don", "Geometría sagrada", "Robótica blanda",
];
const BRIDGES = [
    "¿Y si la estructura de uno guiara el crecimiento del otro?",
    "Busca el patrón compartido entre ambos sistemas.",
    "Imagina el segundo como metáfora operativa del primero.",
    "¿Qué emerge si los fusionas en un único organismo?",
];
function buildIdeaForge(): IdeaForgeState {
    const r = seeded(tick(45000));
    const sparks: IdeaForgeState["sparks"] = Array.from({ length: 3 }, (_, i) => {
        const a = pick(CONCEPTS, seeded(tick(45000) + i * 5)());
        let b = pick(CONCEPTS, seeded(tick(45000) + i * 9 + 1)());
        if (b === a) b = CONCEPTS[(CONCEPTS.indexOf(a) + 3) % CONCEPTS.length];
        return { id: `spark-${i}`, a, b, prompt: pick(BRIDGES, seeded(tick(45000) + i * 3)()), saved: false };
    });
    return {
        conceptPool: CONCEPTS,
        sparks,
        disciplines: ["Tecnología", "Biología", "Sociología", "Música", "Filosofía", "Ecología"],
    };
}

// ════════════════════════════════════════════════════════════════
// profile.merit — Cristalería de Mérito y Abundancia
// ════════════════════════════════════════════════════════════════
function buildMerit(): MeritState {
    const r = seeded(tick(30000));
    return {
        regenFootprint: {
            trees: 40 + Math.floor(r() * 120),
            hours: 120 + Math.floor(r() * 400),
            co2Kg: 200 + Math.floor(r() * 800),
        },
        badges: [
            { id: "b0", label: "Tejedor de Paz", tier: "cristal", accent: "#22d3ee" },
            { id: "b1", label: "Botánica aplicada", tier: "oro", accent: "#fbbf24" },
            { id: "b2", label: "Mentor verificado", tier: "plata", accent: "#cbd5e1" },
            { id: "b3", label: "Donante de cómputo", tier: "bronce", accent: "#f59e0b" },
        ],
        skillMaturity: 0.55 + r() * 0.4,
        trustScore: 0.7 + r() * 0.28,
        topSkills: [
            { label: "Ecología Regenerativa", mastery: 0.6 + r() * 0.35, accent: "#10b981" },
            { label: "Gobernanza Líquida", mastery: 0.5 + r() * 0.4, accent: "#FFBF00" },
            { label: "Síntesis Sonora", mastery: 0.4 + r() * 0.45, accent: "#ec4899" },
        ],
    };
}

// ════════════════════════════════════════════════════════════════
// society.cohesion — Monitor de Cohesión Macro-Social
// ════════════════════════════════════════════════════════════════
const REGIONS = [
    { label: "Sangha Norte", accent: "#38bdf8" },
    { label: "Biorregión Costa", accent: "#10b981" },
    { label: "Valle Central", accent: "#f59e0b" },
    { label: "Sangha Sur", accent: "#a855f7" },
    { label: "Meseta Alta", accent: "#ec4899" },
];
function buildSociety(): SocietyState {
    const regions = REGIONS.map((rg, i) => {
        const rr = seeded(tick() + i * 29);
        return { id: `reg-${i}`, label: rg.label, cohesion: 0.45 + rr() * 0.5, trend: trendOf(seeded(tick() + i * 31)()), accent: rg.accent };
    });
    const r = seeded(tick());
    const harmony = regions.reduce((a, x) => a + x.cohesion, 0) / regions.length;
    const lowest = [...regions].sort((a, b) => a.cohesion - b.cohesion)[0];
    return {
        harmonyIndex: harmony,
        regions,
        abundance: 0.6 + r() * 0.35,
        wellbeing: 0.55 + seeded(tick() + 2)() * 0.4,
        participation: 0.5 + seeded(tick() + 3)() * 0.45,
        fracture: lowest && lowest.cohesion < 0.55 ? { region: lowest.label, reason: "tensión por reparto de recursos" } : undefined,
        history: series(tick() + 70, 16, 0.62, 0.18),
    };
}

// ── register all gen5 adapters (idempotent) ─────────────────────
let _registered = false;
export function registerGen5Adapters() {
    if (_registered) return;
    _registered = true;
    registerAdapter("productivity.flow", buildFlow);
    registerAdapter("productivity.swarm", buildSwarm);
    registerAdapter("location.resources", buildAbundance);
    registerAdapter("location.transit", buildTransit);
    registerAdapter("privacy.shield", buildShield);
    registerAdapter("devices.habitat", buildHabitat);
    registerAdapter("discovery.serendipity", buildSerendipity);
    registerAdapter("creativity.ideas", buildIdeaForge);
    registerAdapter("profile.merit", buildMerit);
    registerAdapter("society.cohesion", buildSociety);
}

// self-register on import (side-effect)
registerGen5Adapters();
