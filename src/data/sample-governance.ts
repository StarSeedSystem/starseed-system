// src/data/sample-governance.ts
// ─────────────────────────────────────────────────────────────────────────────
// Datos de ejemplo RICOS e INTERCONECTADOS para los toolkits de cada tipo de
// página StarSeed (Partido, Entidad Federativa, Asamblea, Comunidad, Grupo,
// Evento). Todo enlaza con el resto de la red mediante slugs reales:
//   · Propuestas legislativas → /network/politics  (ids prop-1..prop-4)
//   · Eventos                 → /evento/<slug>      (slugs de sample-events)
//   · Páginas/Comunidades     → /pagina/<slug>      (slugs de sample-entities)
//   · Biblioteca              → /library
// Sin aleatoriedad: cifras deterministas para SSR estable.
// ─────────────────────────────────────────────────────────────────────────────

import type { VoteOption } from "@/components/social/toolkits/shared";

// Helpers de slug ----------------------------------------------------------
export function govSlugify(s: string): string {
    return s
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function matches(slug: string, item: { slug: string; aliases?: string[]; name?: string }): boolean {
    const k = govSlugify(slug);
    if (item.slug === k) return true;
    if (item.aliases?.some((a) => govSlugify(a) === k)) return true;
    if (item.name && govSlugify(item.name) === k) return true;
    return false;
}

// ── PARTIDO POLÍTICO ─────────────────────────────────────────────────────
export interface ProgramAxis {
    title: string;
    detail: string;
    progress: number;
}
export interface Candidate {
    name: string;
    post: string;
    support: number; // % apoyo interno
    badge?: string;
}
export interface InternalVote {
    question: string;
    options: string[];
    counts: number[];
}
export interface PartidoData {
    slug: string;
    aliases?: string[];
    name: string;
    accent: string;
    ideology: string;
    members: number;
    founded: string;
    votesHistory: number;
    replicationActive: boolean;
    manifesto: string;
    axes: ProgramAxis[];
    candidates: Candidate[];
    coalitions: { name: string; slug: string }[];
    internalVote: InternalVote;
    proposalIds: string[]; // → /network/politics
    eventSlugs: string[]; // → /evento/<slug>
}

export const partidos: PartidoData[] = [
    {
        slug: "coalicion-verde",
        aliases: ["coalicion-verde-ontocratica", "coalición-verde", "party-2"],
        name: "Coalición Verde Ontocrática",
        accent: "#00B894",
        ideology: "Ecología regenerativa · gobernanza participativa",
        members: 2890,
        founded: "2024-08",
        votesHistory: 1203,
        replicationActive: true,
        manifesto:
            "Creemos que la abundancia ecológica y la soberanía directa son dos caras de la misma semilla. Defendemos la transición hacia comunidades post-escasez mediante energía procomún, permacultura a escala biorregional y delegación líquida del voto en quienes demuestran sabiduría aplicada.",
        axes: [
            { title: "Energía Procomún", detail: "Microrredes solares comunitarias auditadas en cadena.", progress: 72 },
            { title: "Permacultura Biorregional", detail: "Domos regenerativos y huertos verticales con IA.", progress: 54 },
            { title: "Voto Líquido Verde", detail: "Delegación revocable a expertos ecológicos.", progress: 88 },
        ],
        candidates: [
            { name: "Lucía Ferrán", post: "Portavoz Legislativa — E.F. Valle Central", support: 64, badge: "Guardiana de Datos" },
            { name: "Néstor Aliaga", post: "Coordinación Ejecutiva de Energía", support: 51 },
            { name: "Amara Sen", post: "Consejo de Educación Universal", support: 47 },
        ],
        coalitions: [
            { name: "Frente de Soberanía Digital", slug: "frente-soberania-digital" },
        ],
        internalVote: {
            question: "¿Avalar la candidatura de Lucía Ferrán a la Cámara del Valle Central?",
            options: ["A favor", "En contra", "Abstención"],
            counts: [1840, 410, 280],
        },
        proposalIds: ["prop-2", "prop-1"],
        eventSlugs: ["asamblea-energia-procomun", "taller-de-permacultura"],
    },
    {
        slug: "frente-soberania-digital",
        aliases: ["party-1"],
        name: "Frente de Soberanía Digital",
        accent: "#6C5CE7",
        ideology: "Privacidad radical · descentralización total",
        members: 1240,
        founded: "2025-01",
        votesHistory: 847,
        replicationActive: false,
        manifesto:
            "Ningún poder debe vigilar a una persona soberana. Promovemos cifrado extremo-a-extremo por defecto, bóvedas de datos personales y una red federada sin servidores centrales. La tecnología expande la conciencia; nunca la encadena.",
        axes: [
            { title: "Bóvedas de Datos", detail: "Soberanía total sobre el Registro Acásico Personal.", progress: 81 },
            { title: "Fediverso Real", detail: "Federación de nodos sin punto único de control.", progress: 60 },
            { title: "Cero Conocimiento", detail: "Una persona, un voto por criptografía ZK.", progress: 45 },
        ],
        candidates: [
            { name: "Voz Soberana #4471", post: "Defensa de la Privacidad", support: 58, badge: "Criptógrafo de la Red" },
            { name: "Kenji Mora", post: "Arquitectura Federada", support: 49 },
        ],
        coalitions: [{ name: "Coalición Verde Ontocrática", slug: "coalicion-verde" }],
        internalVote: {
            question: "¿Adoptar cifrado ZK obligatorio para todas las votaciones internas?",
            options: ["Sí, de inmediato", "Por fases", "No"],
            counts: [720, 410, 110],
        },
        proposalIds: ["prop-1", "prop-4"],
        eventSlugs: ["circulo-de-paz-mediacion"],
    },
    {
        slug: "vanguardia-transhumanista",
        aliases: ["partido-transhumanista", "transhumanistas", "party-3"],
        name: "Vanguardia Transhumanista",
        accent: "#0984E3",
        ideology: "IA aumentativa · expansión cognitiva ética",
        members: 654,
        founded: "2025-03",
        votesHistory: 412,
        replicationActive: false,
        manifesto:
            "Abogamos por el uso ético de la tecnología para erradicar el sufrimiento innecesario y ampliar las capacidades humanas. El Exocórtex personal —leal al usuario, jamás al sistema— es el derecho de cada mente a evolucionar.",
        axes: [
            { title: "Exocórtex Soberano", detail: "IA personal propiedad del individuo.", progress: 66 },
            { title: "Evolución Simbiótica", detail: "Integración bio-tecnológica con consentimiento.", progress: 38 },
            { title: "Alineación Abierta", detail: "Agentes auditables y currículo de ética IA.", progress: 72 },
        ],
        candidates: [
            { name: "Aprendiz Errante", post: "Consejo de Ética de IA", support: 55, badge: "Sabio de la Red" },
            { name: "Sombra Pixel", post: "Cultura Aumentada", support: 41 },
        ],
        coalitions: [],
        internalVote: {
            question: "¿Priorizar el currículo abierto de ética de IA esta legislatura?",
            options: ["A favor", "En contra", "Abstención"],
            counts: [380, 120, 90],
        },
        proposalIds: ["prop-3"],
        eventSlugs: ["taller-pensamiento-sistemico", "clase-magistral-cosmologia"],
    },
];

// ── ENTIDAD FEDERATIVA ───────────────────────────────────────────────────
export interface BudgetAllocation {
    area: string;
    amount: number; // en Seeds (SC)
    pct: number;
}
export interface Delegate {
    name: string;
    domain: string;
    delegatedVotes: number;
}
export interface SubEntity {
    name: string;
    kind: "comunidad" | "asamblea" | "biorregion";
    slug: string;
    members: number;
}
export interface EFData {
    slug: string;
    aliases?: string[];
    name: string;
    accent: string;
    blurb: string;
    citizens: number;
    territory: { name: string; type: string; population: number; sanghas: number };
    chamber: { activeLaws: number; inDebate: number; participation: number };
    budget: { totalSeeds: number; allocations: BudgetAllocation[] };
    delegates: Delegate[];
    subEntities: SubEntity[];
    proposalIds: string[];
    eventSlugs: string[];
}

export const federativeEntities: EFData[] = [
    {
        slug: "ef-valle-central",
        aliases: ["e-f-del-valle-central", "valle-central"],
        name: "E.F. del Valle Central",
        accent: "#007FFF",
        blurb:
            "Entidad Federativa gobernada directamente por su ciudadanía para el bienestar colectivo y el desarrollo regenerativo del Valle.",
        citizens: 2847,
        territory: { name: "Valle Central", type: "Biorregión templada", population: 2847, sanghas: 4 },
        chamber: { activeLaws: 23, inDebate: 5, participation: 78 },
        budget: {
            totalSeeds: 1_200_000,
            allocations: [
                { area: "Energía Procomún", amount: 360_000, pct: 30 },
                { area: "Educación Universal", amount: 300_000, pct: 25 },
                { area: "Salud y Cuidados", amount: 240_000, pct: 20 },
                { area: "Cultura y Multiverso", amount: 180_000, pct: 15 },
                { area: "Infraestructura", amount: 120_000, pct: 10 },
            ],
        },
        delegates: [
            { name: "Lucía Ferrán", domain: "Soberanía de Datos", delegatedVotes: 612 },
            { name: "Néstor Aliaga", domain: "Energía y Clima", delegatedVotes: 488 },
            { name: "Dra. Amara Sen", domain: "Educación", delegatedVotes: 354 },
        ],
        subEntities: [
            { name: "Sangha Norte", kind: "comunidad", slug: "sangha-norte", members: 128 },
            { name: "Sangha del Faro", kind: "comunidad", slug: "sangha-del-faro", members: 96 },
            { name: "Biorregión del Valle", kind: "biorregion", slug: "biorregion-del-valle", members: 540 },
            { name: "Asamblea Local Oikos Norte", kind: "asamblea", slug: "asamblea-local-oikos-norte", members: 312 },
        ],
        proposalIds: ["prop-1", "prop-2"],
        eventSlugs: ["asamblea-energia-procomun", "asamblea-vecinal"],
    },
    {
        slug: "ef-norte-verde",
        aliases: ["norte-verde"],
        name: "E.F. Norte Verde",
        accent: "#10B981",
        blurb:
            "Federación de comunidades del norte centrada en microrredes renovables y restauración de ecosistemas.",
        citizens: 1960,
        territory: { name: "Cordillera Norte", type: "Biorregión alpina", population: 1960, sanghas: 3 },
        chamber: { activeLaws: 17, inDebate: 3, participation: 71 },
        budget: {
            totalSeeds: 840_000,
            allocations: [
                { area: "Energía Renovable", amount: 336_000, pct: 40 },
                { area: "Restauración Ecológica", amount: 210_000, pct: 25 },
                { area: "Educación", amount: 168_000, pct: 20 },
                { area: "Cultura", amount: 126_000, pct: 15 },
            ],
        },
        delegates: [
            { name: "Néstor Aliaga", domain: "Energía", delegatedVotes: 402 },
            { name: "Iris Bloom", domain: "Restauración", delegatedVotes: 287 },
        ],
        subEntities: [
            { name: "Sangha del Faro", kind: "comunidad", slug: "sangha-del-faro", members: 96 },
            { name: "Círculo de Paz Sur", kind: "asamblea", slug: "circulo-de-paz-sur", members: 140 },
        ],
        proposalIds: ["prop-2"],
        eventSlugs: ["taller-de-permacultura"],
    },
    {
        slug: "ef-nexus-digital",
        aliases: ["nexus-digital", "consejo-global"],
        name: "E.F. Nexus Digital",
        accent: "#6C5CE7",
        blurb:
            "Entidad federativa nativa-digital que codifica la economía de Semillas y coordina el Consejo Global de la red.",
        citizens: 5210,
        territory: { name: "Nexus", type: "Entidad nativa-digital", population: 5210, sanghas: 0 },
        chamber: { activeLaws: 41, inDebate: 8, participation: 83 },
        budget: {
            totalSeeds: 2_400_000,
            allocations: [
                { area: "Infraestructura Federada", amount: 720_000, pct: 30 },
                { area: "Economía de Semillas", amount: 600_000, pct: 25 },
                { area: "Educación Universal", amount: 480_000, pct: 20 },
                { area: "Investigación IA", amount: 360_000, pct: 15 },
                { area: "Cultura Multiverso", amount: 240_000, pct: 10 },
            ],
        },
        delegates: [
            { name: "Voz Soberana #4471", domain: "Privacidad", delegatedVotes: 901 },
            { name: "Aprendiz Errante", domain: "Ética de IA", delegatedVotes: 640 },
        ],
        subEntities: [
            { name: "Biblioteca Universal — Nodo Sur", kind: "comunidad", slug: "biblioteca-universal-nodo-sur", members: 1200 },
            { name: "Multiverso Liminal", kind: "comunidad", slug: "multiverso-liminal", members: 760 },
        ],
        proposalIds: ["prop-4", "prop-3"],
        eventSlugs: ["clase-magistral-cosmologia"],
    },
];

// ── ASAMBLEA ─────────────────────────────────────────────────────────────
export interface Motion {
    title: string;
    status: "Votación Activa" | "Debate" | "Aprobada" | "Rechazada";
    votes: VoteOption[];
}
export interface MinuteRecord {
    date: string;
    title: string;
    resolution: string;
}
export interface AssemblyData {
    slug: string;
    aliases?: string[];
    name: string;
    accent: string;
    blurb: string;
    members: number;
    quorum: { reached: number; total: number };
    nextSession: string;
    agenda: { time: string; title: string; detail?: string; status?: "done" | "active" | "upcoming" }[];
    motions: Motion[];
    minutes: MinuteRecord[];
    proposalIds: string[];
    eventSlugs: string[];
}

const VOTE_COLORS = {
    favor: "hsl(var(--accent-hsl))",
    contra: "hsl(var(--destructive-hsl))",
    abst: "hsl(var(--muted-foreground-hsl))",
};

export const assemblies: AssemblyData[] = [
    {
        slug: "asamblea-energia-procomun",
        aliases: ["asamblea-de-energia-procomun", "asamblea-local-oikos-norte", "junta-oikos"],
        name: "Asamblea de Energía Procomún",
        accent: "#FFBF00",
        blurb:
            "Órgano deliberativo abierto que decide la política energética de la red mediante democracia directa.",
        members: 312,
        quorum: { reached: 198, total: 312 },
        nextSession: "Vie 20 Jun · 18:00 · Sala de Debates EVP",
        agenda: [
            { time: "18:00", title: "Apertura y verificación de quórum", status: "done" },
            { time: "18:15", title: "Votación: Ley de Energía Procomún 2026", detail: "Lectura final y voto vinculante.", status: "active" },
            { time: "18:45", title: "Debate: tarifa de créditos energéticos", detail: "Propuesta de microrredes vecinales.", status: "upcoming" },
            { time: "19:15", title: "Ruegos, preguntas y delegaciones líquidas", status: "upcoming" },
        ],
        motions: [
            {
                title: "Aprobar la Ley de Energía Procomún 2026",
                status: "Votación Activa",
                votes: [
                    { name: "A Favor", votes: 890, color: VOTE_COLORS.favor },
                    { name: "En Contra", votes: 156, color: VOTE_COLORS.contra },
                    { name: "Abstención", votes: 74, color: VOTE_COLORS.abst },
                ],
            },
            {
                title: "Crear créditos energéticos transferibles entre vecinos",
                status: "Debate",
                votes: [
                    { name: "A Favor", votes: 412, color: VOTE_COLORS.favor },
                    { name: "En Contra", votes: 388, color: VOTE_COLORS.contra },
                    { name: "Abstención", votes: 120, color: VOTE_COLORS.abst },
                ],
            },
        ],
        minutes: [
            { date: "06 Jun 2026", title: "Sesión ordinaria #14", resolution: "Aprobado el estudio de viabilidad de microrredes (78%)." },
            { date: "23 May 2026", title: "Sesión ordinaria #13", resolution: "Delegación de voto energético a Néstor Aliaga ratificada." },
        ],
        proposalIds: ["prop-2"],
        eventSlugs: ["asamblea-energia-procomun"],
    },
    {
        slug: "circulo-de-paz-mediacion",
        aliases: ["circulo-de-paz"],
        name: "Círculo de Paz — Mediación",
        accent: "#a78bfa",
        blurb:
            "Asamblea de justicia restaurativa: resuelve conflictos por mediación y acuerdo, nunca por castigo.",
        members: 140,
        quorum: { reached: 92, total: 140 },
        nextSession: "Jue 19 Jun · 19:00 · Entorno Virtual Helix",
        agenda: [
            { time: "19:00", title: "Círculo de apertura y acuerdos de convivencia", status: "active" },
            { time: "19:20", title: "Caso: disputa de límites Huerto A vs B", detail: "Escucha activa de ambas partes.", status: "upcoming" },
            { time: "20:00", title: "Construcción de acuerdo reparador", status: "upcoming" },
        ],
        motions: [
            {
                title: "Ratificar el acuerdo reparador del Huerto A/B",
                status: "Votación Activa",
                votes: [
                    { name: "A Favor", votes: 88, color: VOTE_COLORS.favor },
                    { name: "En Contra", votes: 12, color: VOTE_COLORS.contra },
                    { name: "Abstención", votes: 9, color: VOTE_COLORS.abst },
                ],
            },
        ],
        minutes: [
            { date: "05 Jun 2026", title: "Mediación #07", resolution: "Acuerdo de uso compartido del pozo aprobado por consenso." },
        ],
        proposalIds: [],
        eventSlugs: ["circulo-de-paz-mediacion"],
    },
];

// ── COMUNIDAD ────────────────────────────────────────────────────────────
export interface CommunityProject {
    title: string;
    progress: number;
    lead: string;
    needsHelp?: boolean;
}
export interface CommonsResource {
    name: string;
    type: "Herramienta" | "Espacio" | "Conocimiento" | "Energía" | "Semilla 3D";
    status: "Disponible" | "En uso" | "Mantenimiento";
}
export interface CommunityData {
    slug: string;
    aliases?: string[];
    name: string;
    accent: string;
    blurb: string;
    members: number;
    treasury: { seeds: number; inflow: number; outflow: number };
    projects: CommunityProject[];
    commons: CommonsResource[];
    mentorships: { mentor: string; topic: string; seats: number }[];
    eventSlugs: string[];
    libraryTags: string[];
}

export const communities: CommunityData[] = [
    {
        slug: "comunidad-permacultura",
        aliases: ["permacultura", "comunidad-de-permacultura"],
        name: "Comunidad de Permacultura",
        accent: "#10B981",
        blurb:
            "Aprendemos, compartimos y practicamos permacultura regenerativa para construir abundancia local.",
        members: 128,
        treasury: { seeds: 48_200, inflow: 3_400, outflow: 1_900 },
        projects: [
            { title: "Domo geodésico regenerativo central", progress: 45, lead: "Sofia T.", needsHelp: true },
            { title: "Huerto vertical con riego IA", progress: 72, lead: "Iris Bloom" },
            { title: "Compostaje comunitario distribuido", progress: 88, lead: "Kenji Mora" },
        ],
        commons: [
            { name: "Impresora 3D de domos", type: "Herramienta", status: "En uso" },
            { name: "Invernadero solar", type: "Espacio", status: "Disponible" },
            { name: "Manual de permacultura v3", type: "Conocimiento", status: "Disponible" },
            { name: "Generador Solar de Domo (asset 3D)", type: "Semilla 3D", status: "Disponible" },
        ],
        mentorships: [
            { mentor: "Iris Bloom", topic: "Diseño de huertos verticales", seats: 4 },
            { mentor: "Kenji Mora", topic: "Pensamiento sistémico aplicado", seats: 6 },
        ],
        eventSlugs: ["taller-de-permacultura", "mercado-de-trueque"],
        libraryTags: ["Permacultura", "Ecología", "Comunidad"],
    },
    {
        slug: "sangha-norte",
        aliases: ["page-com-sangha-norte"],
        name: "Sangha Norte",
        accent: "#22d3ee",
        blurb:
            "Nodo territorial del norte: vivienda compartida, cuidados mutuos y cultura contemplativa.",
        members: 128,
        treasury: { seeds: 61_000, inflow: 4_100, outflow: 2_600 },
        projects: [
            { title: "Cohousing fase II", progress: 38, lead: "Nova Reyes", needsHelp: true },
            { title: "Red de cuidados intergeneracional", progress: 64, lead: "Dra. Amara Sen" },
        ],
        commons: [
            { name: "Cocina comunitaria", type: "Espacio", status: "Disponible" },
            { name: "Biblioteca de herramientas", type: "Herramienta", status: "En uso" },
            { name: "Batería comunitaria 40kWh", type: "Energía", status: "Disponible" },
        ],
        mentorships: [{ mentor: "Nova Reyes", topic: "Facilitación de círculos", seats: 5 }],
        eventSlugs: ["asamblea-vecinal", "ritual-del-equinoccio"],
        libraryTags: ["Comunidad", "Cuidados", "Hábitat"],
    },
];

// ── GRUPO / CÍRCULO DE ESTUDIO ───────────────────────────────────────────
export interface GroupTask {
    title: string;
    done: boolean;
    owner?: string;
}
export interface GroupResource {
    name: string;
    type: "Artículo" | "Curso" | "Repo" | "Dataset" | "Video";
    href: string;
}
export interface GroupData {
    slug: string;
    aliases?: string[];
    name: string;
    accent: string;
    blurb: string;
    members: number;
    level: string;
    topic: string;
    sessions: { time: string; title: string; detail?: string; status?: "done" | "active" | "upcoming" }[];
    tasks: GroupTask[];
    resources: GroupResource[];
    eventSlugs: string[];
}

export const groups: GroupData[] = [
    {
        slug: "gobernanza-ontocratica",
        aliases: ["sg-2", "grupo-de-estudio-ia", "ia-study-group"],
        name: "Círculo: Gobernanza Ontocrática",
        accent: "#22d3ee",
        blurb:
            "Estudiamos sistemas de gobernanza descentralizada: DAOs, entidades federativas y democracia líquida.",
        members: 41,
        level: "Intermedio",
        topic: "DAOs y Entidades Federativas: comparativa",
        sessions: [
            { time: "Mié 19 Jun · 18:00", title: "DAOs vs E.F.: arquitecturas de decisión", status: "active" },
            { time: "Mié 26 Jun · 18:00", title: "Voto líquido en la práctica", status: "upcoming" },
            { time: "Mié 12 Jun · 18:00", title: "Introducción a la ontocracia", status: "done" },
        ],
        tasks: [
            { title: "Leer 'Documento Maestro del SOSD' §3", done: true, owner: "Todo el círculo" },
            { title: "Comparar 3 modelos de DAO", done: false, owner: "Kenji Mora" },
            { title: "Preparar caso E.F. Valle Central", done: false, owner: "Lucía Ferrán" },
        ],
        resources: [
            { name: "Cosmología para Sembradores", type: "Curso", href: "/pagina/cosmologia-para-sembradores" },
            { name: "Biblioteca Universal — Nodo Sur", type: "Repo", href: "/library" },
            { name: "Ley de Energía Procomún 2026", type: "Artículo", href: "/pagina/ley-de-energia-procomun-2026" },
        ],
        eventSlugs: ["taller-pensamiento-sistemico", "clase-magistral-cosmologia"],
    },
    {
        slug: "arte-generativo-webgl",
        aliases: ["sg-3"],
        name: "Círculo: Arte Generativo & WebGL",
        accent: "#c084fc",
        blurb: "Exploramos Three.js, shaders y sistemas de partículas para crear arte vivo en la red.",
        members: 33,
        level: "Principiante",
        topic: "Three.js: sistemas de partículas",
        sessions: [
            { time: "Vie 21 Jun · 19:00", title: "Sistemas de partículas con Three.js", status: "active" },
            { time: "Vie 28 Jun · 19:00", title: "Shaders GLSL desde cero", status: "upcoming" },
        ],
        tasks: [
            { title: "Montar escena base Three.js", done: true, owner: "Sombra Pixel" },
            { title: "Prototipo de flow-field", done: false, owner: "Nova Reyes" },
        ],
        resources: [
            { name: "Obra Viva: Constelación Sonora", type: "Video", href: "/pagina/obra-viva-constelacion-sonora" },
            { name: "Exposición: Aurora Sintética", type: "Artículo", href: "/pagina/exposicion-aurora-sintetica" },
        ],
        eventSlugs: ["inauguracion-aurora-sintetica", "concierto-constelacion-sonora"],
    },
];

// ── EVENTO (extras de detalle) ───────────────────────────────────────────
export interface EventAgendaItem {
    time: string;
    title: string;
    speaker?: string;
}
export interface EventExtras {
    agenda: EventAgendaItem[];
    speakers: { name: string; role: string }[];
    venue: { physical?: string; multiverse?: string };
    resources: { name: string; href: string }[];
    rsvp: { going: number; interested: number; capacity: number };
    organizerSlug?: string;
}

export const eventExtras: Record<string, EventExtras> = {
    "asamblea-energia-procomun": {
        agenda: [
            { time: "18:00", title: "Apertura y quórum" },
            { time: "18:15", title: "Votación Ley de Energía Procomún", speaker: "Néstor Aliaga" },
            { time: "18:45", title: "Debate de créditos energéticos" },
        ],
        speakers: [
            { name: "Néstor Aliaga", role: "Coordinación de Energía" },
            { name: "Lucía Ferrán", role: "Portavoz Legislativa" },
        ],
        venue: { physical: "Sala de Debates EVP — Valle Central", multiverse: "Ágora Solar (Helix)" },
        resources: [
            { name: "Ley de Energía Procomún 2026", href: "/pagina/ley-de-energia-procomun-2026" },
            { name: "Asamblea de Energía Procomún", href: "/network/politics" },
        ],
        rsvp: { going: 234, interested: 118, capacity: 500 },
        organizerSlug: "ef-valle-central",
    },
    "taller-de-permacultura": {
        agenda: [
            { time: "10:00", title: "Principios de diseño regenerativo" },
            { time: "11:00", title: "Práctica: huerto vertical con IA", speaker: "Iris Bloom" },
        ],
        speakers: [{ name: "Iris Bloom", role: "Mentora de Permacultura" }],
        venue: { physical: "Invernadero comunitario Norte", multiverse: "Domo Verde" },
        resources: [{ name: "Comunidad de Permacultura", href: "/pagina/comunidad-de-permacultura" }],
        rsvp: { going: 67, interested: 40, capacity: 120 },
        organizerSlug: "comunidad-permacultura",
    },
};

// ── LOOKUPS (siempre devuelven algo; fallback elegante) ───────────────────
export function getPartido(slug: string): PartidoData {
    return (
        partidos.find((p) => matches(slug, p)) ?? {
            ...partidos[0],
            slug: govSlugify(slug),
            aliases: [],
            name: titleFromSlug(slug),
        }
    );
}
export function listPartidos(): PartidoData[] {
    return partidos;
}
export function getFederativeEntity(slug: string): EFData {
    return (
        federativeEntities.find((e) => matches(slug, e)) ?? {
            ...federativeEntities[0],
            slug: govSlugify(slug),
            aliases: [],
            name: titleFromSlug(slug),
        }
    );
}
export function listFederativeEntities(): EFData[] {
    return federativeEntities;
}
export function getAssembly(slug: string): AssemblyData {
    return (
        assemblies.find((a) => matches(slug, a)) ?? {
            ...assemblies[0],
            slug: govSlugify(slug),
            aliases: [],
            name: titleFromSlug(slug),
        }
    );
}
export function getCommunity(slug: string): CommunityData {
    return (
        communities.find((c) => matches(slug, c)) ?? {
            ...communities[0],
            slug: govSlugify(slug),
            aliases: [],
            name: titleFromSlug(slug),
        }
    );
}
export function getGroup(slug: string): GroupData {
    return (
        groups.find((g) => matches(slug, g)) ?? {
            ...groups[0],
            slug: govSlugify(slug),
            aliases: [],
            name: titleFromSlug(slug),
        }
    );
}
export function getEventExtras(slug: string): EventExtras | undefined {
    return eventExtras[govSlugify(slug)];
}

function titleFromSlug(slug: string): string {
    return govSlugify(slug)
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}
