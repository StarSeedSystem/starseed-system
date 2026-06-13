// ════════════════════════════════════════════════════════════════
// StarSeed Widget Data — Adapters
// ----------------------------------------------------------------
// An adapter satisfies a WidgetDataMap contract for a given key.
// The DEFAULT registry uses deterministic-but-living mock generators
// so widgets feel real-time. To go live, register a real adapter
// (Supabase query, REST fetch, blockchain oracle, MCP call) for a key
// via `registerAdapter` — no widget code changes required.
// ════════════════════════════════════════════════════════════════

import type {
    WidgetDataMap,
    WidgetDataKey,
    SeriesPoint,
    Trend,
    Metric,
    LawProposal,
    Delegation,
    CivicInitiative,
    TreasuryFlow,
    ResonanceState,
    GiftOffer,
    CommonsResource,
    FoodState,
    RegenState,
    OikosFlow,
    SkillBranch,
    AstrauraState,
    NodeHealth,
    CodexNode,
    NatalSnapshot,
    MeshNode,
    ImmersiveWorld,
    FeedItem,
    Post,
    ActivityEvent,
    PageRef,
    NetworkEntity,
    SocialEvent,
    MessageThread,
    Project,
    LearningPath,
    Notification,
    CoherenceState,
} from "./types";

// ── Deterministic noise helpers (seeded so SSR ≈ client) ────────
function hash(str: string): number {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 4294967295;
}

// time-varying wave in [0,1], smooth, period ~ `periodMs`
function wave(seed: string, periodMs = 8000, phase = 0): number {
    const t = Date.now();
    const base = hash(seed);
    const s = Math.sin((t / periodMs) * Math.PI * 2 + phase + base * Math.PI * 2);
    return (s + 1) / 2;
}

function jitter(seed: string, lo: number, hi: number, periodMs = 8000): number {
    return lo + wave(seed, periodMs) * (hi - lo);
}

function trendFrom(delta: number): Trend {
    if (delta > 0.015) return "up";
    if (delta < -0.015) return "down";
    return "flat";
}

function series(seed: string, n = 24, periodMs = 12000): SeriesPoint[] {
    const now = Date.now();
    const pts: SeriesPoint[] = [];
    for (let i = 0; i < n; i++) {
        const s = `${seed}:${i}`;
        pts.push({
            t: now - (n - i) * 60_000,
            v: 0.3 + 0.7 * wave(s, periodMs, i * 0.4),
        });
    }
    return pts;
}

// ── The adapter type ────────────────────────────────────────────
export type Adapter<K extends WidgetDataKey> = (
    params?: Record<string, unknown>
) => WidgetDataMap[K] | Promise<WidgetDataMap[K]>;

type AdapterRegistry = { [K in WidgetDataKey]: Adapter<K> };

// ── Mock generators ─────────────────────────────────────────────
const mockMetrics: Adapter<"common.metrics"> = () => {
    const defs: Array<[string, string, number, string | undefined, string]> = [
        ["seeds", "SEEDS", 42850 + Math.round(jitter("seeds", -400, 400)), "◈", "text-primary"],
        ["karma", "Karma Flux", 892 + Math.round(jitter("karma", -40, 40)), undefined, "text-amber-400"],
        ["reput", "Reputación", Math.round(jitter("reput", 60, 99)), "%", "text-emerald-400"],
        ["voice", "Voz Cívica", Math.round(jitter("voice", 10, 80)), undefined, "text-sky-400"],
    ];
    return defs.map<Metric>(([id, label, value, unit, color]) => {
        const prev = value * (1 - jitter(id + "p", -0.06, 0.06));
        const change = ((value - prev) / prev) * 100;
        return {
            id, label, value, unit, color,
            change: Number(change.toFixed(1)),
            trend: trendFrom(change / 100),
            series: series(id, 20),
        };
    });
};

const mockFeed: Adapter<"common.feed"> = () => {
    const authors = ["Maya R.", "Nodo Aurora", "Junta Oikos", "Kael T.", "Sangha Sur"];
    const kinds = ["propuesta", "obra", "misión", "debate", "evento"];
    const titles = [
        "Excedente solar redirigido a vivero comunal",
        "Nueva carta: Resonancia del Equinoccio",
        "Debate abierto: agua como procomún",
        "Misión cumplida: alfabetización mesh",
        "Portal inmersivo 'Jardín Liminal' activo",
    ];
    const now = Date.now();
    return titles.map<FeedItem>((title, i) => ({
        id: `feed-${i}`,
        title,
        author: authors[i % authors.length],
        kind: kinds[i % kinds.length],
        ts: now - i * 1000 * 60 * (7 + i * 3),
        resonance: jitter(`feed${i}`, 0.3, 0.98),
    }));
};

const mockProposals: Adapter<"politics.proposals"> = () => {
    const stages: LawProposal["stage"][] = ["borrador", "firmas", "debate", "votacion", "ratificada"];
    const scopes: LawProposal["scope"][] = ["vecinal", "municipal", "biorregional", "global"];
    const data: Array<[string, string]> = [
        ["Renta básica de recursos", "Garantía de energía, agua y alimento como procomún por defecto."],
        ["Transparencia algorítmica", "Todo algoritmo que ejerza poder público debe ser auditable."],
        ["Mitosis de la Sangha Norte", "Dividir la comunidad al alcanzar tamaño óptimo."],
        ["Moratoria de vigilancia", "Prohibir captura biométrica bruta en espacios comunes."],
        ["Bóveda semillas abierta", "Banco de semillas libre y replicable entre nodos."],
    ];
    return data.map<LawProposal>(([title, summary], i) => {
        const support = Math.round(jitter(`prop${i}`, 120, 4800));
        const threshold = 2500 + i * 600;
        return {
            id: `prop-${i}`,
            title, summary,
            stage: stages[i % stages.length],
            progress: jitter(`progp${i}`, 0.1, 0.95),
            scope: scopes[i % scopes.length],
            support, threshold,
            impact: {
                taxes: jitter(`tx${i}`, -1, 1, 20000),
                ecology: jitter(`ec${i}`, -0.2, 1, 20000),
                sector: jitter(`se${i}`, -1, 1, 20000),
            },
            deadlineTs: Date.now() + (i + 1) * 1000 * 60 * 60 * 24 * 2,
            youVoted: i === 0 ? "favor" : i === 2 ? "contra" : null,
        };
    });
};

const mockDelegations: Adapter<"politics.delegations"> = () => {
    const data: Array<[string, string, Delegation["delegateKind"]]> = [
        ["Ecología y agua", "Junta Oikos", "junta"],
        ["Educación", "Maya Rendón", "persona"],
        ["Infraestructura mesh", "Colectivo Faro", "organizacion"],
        ["Salud comunitaria", "Dr. Kael Torres", "persona"],
    ];
    return data.map<Delegation>(([topic, delegateName, delegateKind], i) => ({
        id: `del-${i}`,
        topic, delegateName, delegateKind,
        affinity: jitter(`aff${i}`, 0.55, 0.98),
        successRate: jitter(`suc${i}`, 0.5, 0.95),
        divergence: jitter(`div${i}`, 0.02, 0.4),
        revocable: true,
    }));
};

const mockOikos: Adapter<"oikos.flow"> = () => {
    const gen = jitter("oikgen", 3.2, 9.6, 9000);
    const con = jitter("oikcon", 2.1, 7.4, 7000);
    return {
        energyGenerated: Number(gen.toFixed(2)),
        energyConsumed: Number(con.toFixed(2)),
        waterCaptured: Math.round(jitter("oikwat", 120, 640, 15000)),
        surplusRouting: [
            { to: "Vivero comunal", amount: Number(jitter("r1", 0.2, 1.8).toFixed(2)) },
            { to: "Batería Sangha", amount: Number(jitter("r2", 0.1, 1.2).toFixed(2)) },
            { to: "Red vecinal", amount: Number(jitter("r3", 0.05, 0.9).toFixed(2)) },
        ],
        sources: [
            { id: "solar", label: "Solar", share: jitter("ssolar", 0.4, 0.7), trend: "up" },
            { id: "eolica", label: "Eólica", share: jitter("seol", 0.1, 0.3), trend: "flat" },
            { id: "biogas", label: "Biogás", share: jitter("sbio", 0.05, 0.2), trend: trendFrom(jitter("sbiod", -0.05, 0.05)) },
        ],
        history: series("oikhist", 28, 16000),
        comfortThreshold: 0.62,
    };
};

const mockSkillTree: Adapter<"education.skilltree"> = () => {
    const leaf = (id: string, label: string, discipline: string, certified = false, microMission?: string): SkillBranch => ({
        id, label, discipline,
        mastery: jitter(id, 0.2, 0.98, 30000),
        certified, microMission,
    });
    return {
        id: "root",
        label: "Tu Árbol",
        discipline: "raíz",
        mastery: jitter("rootm", 0.5, 0.85, 40000),
        children: [
            {
                ...leaf("eco", "Ecología Regenerativa", "ecología", true),
                children: [
                    leaf("permaculture", "Permacultura", "ecología", true, "Diseña un bancal en espiral"),
                    leaf("water", "Ciclos de agua", "ecología", false, "Mapea captación local"),
                ],
            },
            {
                ...leaf("gov", "Gobernanza Líquida", "política"),
                children: [
                    leaf("delib", "Deliberación", "política", true),
                    leaf("crypto", "Voto ZK", "política", false, "Simula un voto anónimo"),
                ],
            },
            {
                ...leaf("tech", "Tejido Técnico", "tecnología"),
                children: [
                    leaf("mesh", "Redes Mesh", "tecnología", false, "Levanta un nodo LoRa"),
                    leaf("ai", "Exocórtex", "tecnología", true),
                ],
            },
        ],
    };
};

const mockAstraura: Adapter<"ai.astraura"> = () => ({
    attention: "Sintetizando debate de agua + tu historial de votos",
    cognitiveLoad: jitter("acl", 0.2, 0.85, 6000),
    pendingTasks: Math.round(jitter("apt", 1, 7, 20000)),
    interventionLevel: jitter("ail", 0.1, 0.6, 30000),
    suggestions: [
        { id: "s1", text: "Pausa de 12 min: tu carga cognitiva sube", kind: "pausa" },
        { id: "s2", text: "Revisar propuesta de transparencia algorítmica", kind: "investigar" },
        { id: "s3", text: "Redirigir excedente solar al vivero", kind: "accion" },
    ],
    backgroundJobs: [
        { id: "j1", label: "Indexando Códice", progress: jitter("j1", 0.1, 1, 9000) },
        { id: "j2", label: "Resumen semanal", progress: jitter("j2", 0.1, 1, 14000) },
    ],
});

const mockNode: Adapter<"system.node"> = () => ({
    cpu: jitter("ncpu", 0.1, 0.85, 4000),
    memory: jitter("nmem", 0.3, 0.78, 9000),
    temperature: Number(jitter("ntemp", 38, 64, 11000).toFixed(1)),
    ipfsPeers: Math.round(jitter("npeers", 8, 64, 20000)),
    ledgerSync: jitter("nsync", 0.9, 1, 30000),
    contributedShare: jitter("ncontrib", 0.1, 0.5, 25000),
    threads: [
        { id: "t1", label: "Consenso", load: jitter("t1", 0.1, 0.9, 5000) },
        { id: "t2", label: "IPFS", load: jitter("t2", 0.1, 0.9, 6000) },
        { id: "t3", label: "Exocórtex", load: jitter("t3", 0.1, 0.9, 7000) },
        { id: "t4", label: "Mesh", load: jitter("t4", 0.1, 0.9, 8000) },
    ],
});

const mockCodex: Adapter<"files.codex"> = () => {
    const kinds: CodexNode["kind"][] = ["doc", "image", "audio", "model3d", "code"];
    const labels = ["Manifiesto", "Carta Natal", "Sonido Aurora", "Hábitat 3D", "Widget Clima", "Acta Sangha", "Mapa Mesh", "Semilla Glyph"];
    const now = Date.now();
    return labels.map<CodexNode>((label, i) => ({
        id: `cx-${i}`,
        label,
        kind: kinds[i % kinds.length],
        connections: [`cx-${(i + 1) % labels.length}`, `cx-${(i + 2) % labels.length}`],
        createdTs: now - i * 1000 * 60 * 60 * 11,
        redundancy: jitter(`cxr${i}`, 0.4, 1, 40000),
    }));
};

const mockNatal: Adapter<"astro.natal"> = () => ({
    sun: "Acuario",
    moon: "Piscis",
    ascendant: "Escorpio",
    coherence: jitter("natcoh", 0.4, 0.95, 60000),
    transits: [
        { body: "Luna", sign: "Cáncer", degree: Math.round(jitter("td1", 0, 29, 30000)), aspect: "trígono", intensity: jitter("ti1", 0.3, 0.9, 12000), note: "Sensibilidad receptiva alta" },
        { body: "Mercurio", sign: "Géminis", degree: Math.round(jitter("td2", 0, 29, 30000)), aspect: "cuadratura", intensity: jitter("ti2", 0.2, 0.8, 14000), note: "Ideas rápidas, verifica detalles" },
        { body: "Venus", sign: "Tauro", degree: Math.round(jitter("td3", 0, 29, 30000)), intensity: jitter("ti3", 0.2, 0.7, 16000), note: "Disfrute sensorial, vínculos" },
    ],
});

const mockMesh: Adapter<"network.mesh"> = () => {
    const protocols: MeshNode["protocol"][] = ["wifi", "lifi", "bluetooth", "rf"];
    const peers: MeshNode[] = [{
        id: "self", label: "Tú", kind: "self", protocol: "wifi",
        signal: 1, encrypted: true, distance: 0, angle: 0,
    }];
    const n = 7;
    for (let i = 0; i < n; i++) {
        const kind: MeshNode["kind"] = i === 0 ? "router" : i === n - 1 ? "satellite" : "peer";
        peers.push({
            id: `mesh-${i}`,
            label: kind === "satellite" ? "Satélite" : kind === "router" ? "Router Faro" : `Nodo ${i}`,
            kind,
            protocol: protocols[i % protocols.length],
            signal: jitter(`msig${i}`, 0.25, 0.98, 5000),
            encrypted: i % 3 !== 0,
            distance: 0.35 + (i / n) * 0.6,
            angle: (i / n) * Math.PI * 2,
            bandwidthShared: Number(jitter(`mbw${i}`, 0.5, 12).toFixed(1)),
        });
    }
    return peers;
};

const mockWorlds: Adapter<"entertainment.worlds"> = () => {
    const data: Array<[string, string, ImmersiveWorld["mode"], string]> = [
        ["Jardín Liminal", "contemplativo", "vr", "#10B981"],
        ["Ágora Infinita", "social", "ar", "#007FFF"],
        ["Forja de Sueños", "creativo", "vr", "#D4AF37"],
        ["Mareas de Datos", "ritmo", "2d", "#DC143C"],
    ];
    return data.map<ImmersiveWorld>(([name, genre, mode, accent], i) => ({
        id: `world-${i}`,
        name, genre, mode, accent,
        activeUsers: Math.round(jitter(`wu${i}`, 12, 980, 10000)),
        intensity: jitter(`wi${i}`, 0.2, 0.95, 9000),
    }));
};

const mockPosts: Adapter<"social.posts"> = () => {
    const data: Array<[string, string, string, string[], Post["scope"]]> = [
        ["Maya Rendón", "maya", "El bancal en espiral ya da su primera cosecha de acelgas — abro taller abierto este sábado para replicarlo en otros nodos.", ["permacultura", "oikos"], "vecinal"],
        ["Junta Oikos", "oikos", "Excedente solar de hoy: +4.2 kW redirigidos al vivero comunal. El umbral de confort se mantuvo toda la jornada.", ["energía", "procomún"], "biorregional"],
        ["Kael Torres", "kael", "Nueva propuesta en debate: transparencia algorítmica. Todo algoritmo que ejerza poder público debe ser auditable. ¿Tu voz?", ["gobernanza", "ontocracia"], "global"],
        ["Sangha Sur", "sanghasur", "Llegamos a 144 miembros activos. Iniciamos protocolo de mitosis: dos células nuevas en lugar de crecimiento canceroso.", ["comunidad", "mitosis"], "biorregional"],
        ["Aurora N.", "aurora", "Carta sonora 'Resonancia del Equinoccio' disponible en el Multiverso. Entrada libre, intensidad ajustable.", ["arte", "multiverso"], "global"],
    ];
    const now = Date.now();
    return data.map<Post>(([author, handle, content, tags, scope], i) => ({
        id: `post-${i}`,
        author, handle, content, tags, scope,
        ts: now - i * 1000 * 60 * (12 + i * 9),
        resonance: jitter(`pres${i}`, 0.35, 0.98, 18000),
        comments: Math.round(jitter(`pcom${i}`, 0, 84, 30000)),
        boosts: Math.round(jitter(`pboo${i}`, 2, 320, 24000)),
    }));
};

const mockActivity: Adapter<"common.activity"> = () => {
    const data: Array<[string, string, string, ActivityEvent["kind"]]> = [
        ["Tú", "votaste a favor de", "Renta básica de recursos", "vote"],
        ["Maya R.", "publicó", "Taller de permacultura", "post"],
        ["Nodo Aurora", "se unió a", "Sangha Norte", "join"],
        ["Junta Oikos", "completó la misión", "Alfabetización mesh", "mission"],
        ["Tú", "delegaste", "Ecología y agua → Junta Oikos", "delegation"],
        ["Colectivo Faro", "liberó recurso", "Bóveda de semillas v2", "resource"],
    ];
    const now = Date.now();
    return data.map<ActivityEvent>(([actor, action, target, kind], i) => ({
        id: `act-${i}`, actor, action, target, kind,
        ts: now - i * 1000 * 60 * (5 + i * 7),
    }));
};

const mockPages: Adapter<"social.pages"> = () => {
    const data: Array<[string, PageRef["kind"], PageRef["role"], string]> = [
        ["Sangha Norte", "comunidad", "fundador", "#10b981"],
        ["Perfil Cívico", "perfil", "fundador", "#007FFF"],
        ["Forja de Widgets", "proyecto", "moderador", "#a855f7"],
        ["Junta Oikos", "entidad", "miembro", "#f59e0b"],
        ["Multiverso Liminal", "comunidad", "miembro", "#ec4899"],
    ];
    return data.map<PageRef>(([name, kind, role, accent], i) => ({
        id: `page-${i}`, name, kind, role, accent,
        members: Math.round(jitter(`pgm${i}`, 8, 1240, 40000)),
        activity: jitter(`pga${i}`, 0.2, 0.98, 9000),
    }));
};

const mockEntities: Adapter<"social.entities"> = () => {
    const data: Array<[string, NetworkEntity["kind"], string, string]> = [
        ["Sangha del Faro", "sangha", "energía regenerativa", "#f59e0b"],
        ["Colectivo Aurora", "colectivo", "arte y multiverso", "#ec4899"],
        ["Biorregión del Valle", "biorregion", "agua como procomún", "#38bdf8"],
        ["Círculo de Paz Sur", "comunidad", "justicia restaurativa", "#10b981"],
        ["Nodo Cripto-ZK", "colectivo", "voto anónimo verificable", "#a855f7"],
    ];
    return data.map<NetworkEntity>(([name, kind, focus, accent], i) => ({
        id: `ent-${i}`, name, kind, focus, accent,
        momentum: jitter(`emom${i}`, 0.25, 0.99, 7000),
        members: Math.round(jitter(`emem${i}`, 12, 3200, 30000)),
    }));
};

const mockEvents: Adapter<"social.events"> = () => {
    const data: Array<[string, string, SocialEvent["kind"]]> = [
        ["Asamblea Vecinal", "Parque Central", "asamblea"],
        ["Taller de Permacultura", "Vivero Comunal", "taller"],
        ["Ritual del Equinoccio", "Domo Liminal", "ritual"],
        ["Estreno: Mareas de Datos", "Multiverso", "obra"],
        ["Mercado de Trueque", "Plaza Oikos", "mercado"],
    ];
    const now = Date.now();
    return data.map<SocialEvent>(([title, place, kind], i) => ({
        id: `evt-${i}`, title, place, kind,
        startTs: now + (i + 1) * 1000 * 60 * 60 * (6 + i * 14),
        attendees: Math.round(jitter(`eva${i}`, 4, 220, 30000)),
    }));
};

const mockThreads: Adapter<"social.threads"> = () => {
    const data: Array<[string, string, MessageThread["kind"], string]> = [
        ["Maya Rendón", "¿Vienes al taller del sábado?", "directo", "#10b981"],
        ["Junta Oikos", "Excedente enrutado, gracias por el voto.", "junta", "#f59e0b"],
        ["Sangha Norte", "Iniciamos protocolo de mitosis 🌱", "grupo", "#38bdf8"],
        ["Kael Torres", "Te paso el borrador de la propuesta.", "directo", "#a855f7"],
        ["Colectivo Faro", "Nodo LoRa levantado en el cerro.", "grupo", "#ec4899"],
    ];
    const now = Date.now();
    return data.map<MessageThread>(([name, lastMessage, kind, accent], i) => ({
        id: `th-${i}`, name, lastMessage, kind, accent,
        ts: now - i * 1000 * 60 * (3 + i * 11),
        unread: i < 2 ? Math.round(jitter(`thu${i}`, 1, 5, 12000)) : 0,
        online: i % 2 === 0,
    }));
};

const mockProjects: Adapter<"productivity.projects"> = () => {
    const data: Array<[string, Project["status"], string, string]> = [
        ["Forja de Widgets v2", "activo", "Migrar widgets gen1 al kit adaptativo", "#a855f7"],
        ["Vivero Comunal", "activo", "Instalar captación de agua", "#10b981"],
        ["Nodo Mesh del Cerro", "revision", "Auditoría de cobertura LoRa", "#38bdf8"],
        ["Carta Sonora Equinoccio", "pausado", "Mezcla final en el Multiverso", "#ec4899"],
        ["Bóveda de Semillas", "completado", "Replicación entre 3 nodos", "#f59e0b"],
    ];
    const now = Date.now();
    return data.map<Project>(([name, status, nextMilestone, accent], i) => ({
        id: `proj-${i}`, name, status, nextMilestone, accent,
        progress: status === "completado" ? 1 : jitter(`prg${i}`, 0.15, 0.92, 26000),
        collaborators: Math.round(jitter(`pcol${i}`, 1, 18, 40000)),
        dueTs: now + (i + 1) * 1000 * 60 * 60 * 24 * (2 + i * 3),
    }));
};

const mockPaths: Adapter<"education.paths"> = () => {
    const data: Array<[string, string, string, string, LearningPath["mentorKind"], string]> = [
        ["Intro a la Ontocracia", "política", "Voto delegado líquido", "Exocórtex", "ia", "#a855f7"],
        ["Permacultura Aplicada", "ecología", "Diseño de bancal en espiral", "Maya Rendón", "humano", "#10b981"],
        ["Redes Mesh Soberanas", "tecnología", "Levanta un nodo LoRa", "Colectivo Faro", "hibrido", "#38bdf8"],
        ["Criptografía ZK", "tecnología", "Simula un voto anónimo", "Exocórtex", "ia", "#f59e0b"],
    ];
    return data.map<LearningPath>(([title, discipline, nextLesson, mentor, mentorKind, accent], i) => ({
        id: `path-${i}`, title, discipline, nextLesson, mentor, mentorKind, accent,
        progress: jitter(`lpr${i}`, 0.1, 0.95, 32000),
    }));
};

const mockNotifications: Adapter<"common.notifications"> = () => {
    const data: Array<[string, string, Notification["kind"]]> = [
        ["Propuesta en votación", "Renta básica de recursos entra en fase de votación. Quedan 2 días.", "governance"],
        ["Excedente enrutado", "Tu nodo donó 1.8 kW al vivero comunal hoy.", "success"],
        ["Mención de Maya R.", "Te etiquetó en el taller de permacultura.", "social"],
        ["Sincronización del Códice", "Indexado completado: 8 entidades nuevas.", "info"],
        ["Carga cognitiva alta", "Tu Exocórtex sugiere una pausa de 12 min.", "warning"],
    ];
    const now = Date.now();
    return data.map<Notification>(([title, body, kind], i) => ({
        id: `ntf-${i}`, title, body, kind,
        ts: now - i * 1000 * 60 * (4 + i * 9),
        read: i > 2,
    }));
};

const mockCoherence: Adapter<"wellness.coherence"> = () => {
    const coherence = jitter("wcoh", 0.45, 0.95, 7000);
    return {
        coherence,
        focus: jitter("wfoc", 0.3, 0.92, 9000),
        calm: jitter("wcal", 0.35, 0.96, 11000),
        energy: jitter("wene", 0.3, 0.9, 13000),
        streakDays: Math.round(jitter("wstr", 3, 28, 60000)),
        suggestion: coherence < 0.6
            ? "Respiración coherente 5-5 durante 3 min para subir tu HRV."
            : "Coherencia óptima — buen momento para deliberar o crear.",
        history: series("whist", 24, 14000),
    };
};

const mockInitiatives: Adapter<"politics.initiatives"> = () => {
    const data: Array<[string, string, string, CivicInitiative["stage"], CivicInitiative["scope"], string | undefined, string[]]> = [
        ["La calle frente a mi casa está destruida y es peligrosa de noche",
            "Rehabilitación y alumbrado solar de la Calle del Tejar",
            "Se propone repavimentar con adoquín drenante y desplegar luminarias solares autónomas en el tramo norte de la Calle del Tejar, priorizando la seguridad peatonal nocturna.",
            "firmas", "vecinal", "Calle del Tejar, Sangha Norte", ["Ord. Movilidad Suave §4", "Carta del Oikos §12"]],
        ["No hay sombra en la plaza y en verano nadie puede usarla",
            "Bosque comestible de sombra en la Plaza Central",
            "Plantación de un dosel de árboles frutales nativos para generar sombra y alimento libre en la Plaza Central, integrando riego con aguas grises recicladas.",
            "debate", "municipal", "Plaza Central", ["Ley de Soberanía Alimentaria §7"]],
        ["El agua del arroyo baja sucia desde el taller del cerro",
            "Auditoría ecológica del vertido en el Arroyo del Cerro",
            "Apertura de una investigación comunitaria sobre la calidad del agua y trazabilidad del vertido, con sensores ciudadanos y publicación abierta de resultados.",
            "redaccion", "biorregional", "Arroyo del Cerro", ["Invariante de Transparencia", "Protocolo de Aguas §3"]],
        ["Deberíamos poder votar las fiestas desde casa sin ir al centro",
            "Voto remoto verificable para festividades locales",
            "Habilitar firma criptográfica de conocimiento cero para decidir el calendario de festividades sin desplazamiento, manteniendo 'una persona, una voz'.",
            "queja", "municipal", undefined, []],
    ];
    const now = Date.now();
    return data.map<CivicInitiative>(([rawComplaint, draftedTitle, draftedProposal, stage, scope, place, relatedLaws], i) => ({
        id: `init-${i}`, rawComplaint, draftedTitle, draftedProposal, stage, scope, place, relatedLaws,
        signatures: stage === "queja" ? 0 : Math.round(jitter(`sig${i}`, 12, 1800, 30000)),
        threshold: 200 + i * 350,
        createdTs: now - i * 1000 * 60 * 60 * (6 + i * 14),
    }));
};

const mockTreasury: Adapter<"politics.treasury"> = () => {
    const sectors = [
        { id: "salud", label: "Salud y Sanación", color: "#10b981", amount: 0 },
        { id: "educacion", label: "Educación", color: "#a855f7", amount: 0 },
        { id: "infra", label: "Infraestructura", color: "#38bdf8", amount: 0 },
        { id: "ecologia", label: "Regeneración Ecológica", color: "#22c55e", amount: 0 },
        { id: "cultura", label: "Cultura y Arte", color: "#ec4899", amount: 0 },
    ];
    const allocRaw: Array<[string, string, string, number]> = [
        ["salud", "Clínica comunitaria del Cerro", "Gremio de Sanación", 48000],
        ["educacion", "Biblioteca-laboratorio Sangha Norte", "Colectivo Mayéutica", 32000],
        ["infra", "Captación pluvial + cisternas", "Brigada Hidráulica", 56000],
        ["ecologia", "Reforestación de la cuenca", "Junta de Biólogos Locales", 41000],
        ["cultura", "Anfiteatro de frecuencias", "Telar Ciberdélico", 18500],
        ["infra", "Red mesh LoRa del valle", "Colectivo Faro", 23000],
    ];
    const now = Date.now();
    const allocations = allocRaw.map(([sector, label, contractor, amount], i) => {
        const spent = Math.round(amount * jitter(`spent${i}`, 0.15, 0.95, 40000));
        return {
            id: `alloc-${i}`, sector, label, contractor, amount, spent,
            flaggedByYou: false,
            communityFlags: i === 4 ? Math.round(jitter("cf4", 3, 40, 30000)) : Math.round(jitter(`cf${i}`, 0, 6, 30000)),
        };
    });
    for (const s of sectors) s.amount = allocations.filter(a => a.sector === s.id).reduce((t, a) => t + a.amount, 0);
    return {
        total: sectors.reduce((t, s) => t + s.amount, 0),
        period: "Ciclo 2026 · Q2",
        sectors,
        allocations,
        pendingVotes: [
            { id: "pv-0", label: "Ampliación del vivero vertical", amount: 27000, deadlineTs: now + 1000 * 60 * 60 * 38 },
            { id: "pv-1", label: "Flota de drones de reparto", amount: 64000, deadlineTs: now + 1000 * 60 * 60 * 92 },
        ],
    };
};

const mockResonance: Adapter<"politics.resonance"> = () => {
    const topics: Array<[string, ResonanceState["topics"][number]["emotion"], string, string]> = [
        ["Renta básica de recursos", "esperanza", "La automatización destruirá el incentivo a contribuir si todo es gratuito.", "/network/politics?t=renta"],
        ["Vertido en el Arroyo del Cerro", "indignacion", "El taller emplea a 30 familias; cerrarlo de golpe causaría más daño social.", "/network/politics?t=arroyo"],
        ["Calendario de festividades", "consenso", "Demasiadas fiestas reducen la productividad de los gremios esenciales.", "/network/culture?t=fiestas"],
        ["Moratoria de vigilancia", "urgencia", "Sin cámaras, la respuesta ante emergencias médicas en la calle se ralentiza.", "/network/politics?t=vigilancia"],
        ["Mitosis de la Sangha Norte", "curiosidad", "Dividir la comunidad podría romper vínculos afectivos ya consolidados.", "/hub?t=mitosis"],
    ];
    const emotions: ResonanceState["topics"][number]["emotion"][] = topics.map(t => t[1]);
    const dominant = emotions[Math.floor(jitter("resdom", 0, emotions.length - 0.01, 24000))];
    return {
        window: "Últimas 24 h",
        dominantEmotion: dominant,
        brokenBubble: false,
        topics: topics.map(([label, emotion, opposingView, threadHref], i) => {
            const prev = wave(`heatp${i}`, 18000, -0.6);
            const heat = wave(`heat${i}`, 18000);
            return {
                id: `res-${i}`, label, emotion, opposingView, threadHref,
                heat,
                participants: Math.round(jitter(`rpart${i}`, 40, 5200, 26000)),
                trend: trendFrom(heat - prev),
                constructiveness: jitter(`rcon${i}`, 0.25, 0.95, 22000),
            };
        }).sort((a, b) => b.heat - a.heat),
    };
};

const mockGifts: Adapter<"oikos.gifts"> = () => {
    const data: Array<[string, GiftOffer["kind"], GiftOffer["category"], string, GiftOffer["urgency"], string]> = [
        ["Cestas de tomate y albahaca", "bien", "alimentos", "Huerto del Sur", "alta", "#10b981"],
        ["Taladro percutor + brocas", "bien", "herramientas", "Taller Comunal", "baja", "#f59e0b"],
        ["Asesoría en permacultura (2h)", "servicio", "asesoria", "Maya Rendón", "media", "#22c55e"],
        ["Abrigos de invierno (varios)", "bien", "ropa", "Ropería Libre", "media", "#38bdf8"],
        ["Mural colaborativo: busco manos", "servicio", "arte", "Telar Ciberdélico", "baja", "#ec4899"],
        ["Cuidado de niñes esta tarde", "servicio", "tiempo", "Círculo de Crianza", "alta", "#a855f7"],
    ];
    return data.map<GiftOffer>(([title, kind, category, giver, urgency, accent], i) => ({
        id: `gift-${i}`, title, kind, category, giver, urgency, accent,
        distanceKm: Math.round(jitter(`gd${i}`, 0.2, 8.5, 40000) * 10) / 10,
        available: i !== 3 || wave("gav3", 20000) > 0.4,
    }));
};

const mockCommons: Adapter<"oikos.commons"> = () => {
    const data: Array<[string, CommonsResource["kind"], string]> = [
        ["Impresora 3D industrial", "impresora3d", "Prótesis comunitaria"],
        ["Furgoneta eléctrica autónoma", "vehiculo", "Reparto de cosecha"],
        ["Laboratorio biotecnológico", "laboratorio", "Síntesis de medicina comunal"],
        ["Granja de servidores (cómputo)", "servidores", "Simulación climática"],
        ["Tractor autónomo", "maquinaria", "Siembra de precisión"],
    ];
    return data.map<CommonsResource>(([label, kind, priorityPurpose], i) => {
        const r = wave(`cs${i}`, 16000 + i * 2000);
        const status: CommonsResource["status"] = r > 0.7 ? "libre" : r > 0.25 ? "reservado" : "mantenimiento";
        return {
            id: `commons-${i}`, label, kind, status,
            availableInMin: status === "libre" ? 0 : Math.round(jitter(`cmin${i}`, 15, 320, 30000)),
            queue: Math.round(jitter(`cq${i}`, 0, 7, 30000)),
            priorityPurpose: status === "reservado" ? priorityPurpose : undefined,
        };
    });
};

const mockFood: Adapter<"oikos.food"> = () => {
    const crops: FoodState["crops"] = ([
        { id: "c0", label: "Tomate", readiness: jitter("fr0", 0.5, 1, 30000), kind: "verdura", etaDays: 0 },
        { id: "c1", label: "Maíz nativo", readiness: jitter("fr1", 0.3, 0.95, 36000), kind: "grano", etaDays: 4 },
        { id: "c2", label: "Fresa", readiness: jitter("fr2", 0.6, 1, 28000), kind: "fruta", etaDays: 1 },
        { id: "c3", label: "Albahaca", readiness: jitter("fr3", 0.7, 1, 24000), kind: "hierba", etaDays: 0 },
        { id: "c4", label: "Calabaza", readiness: jitter("fr4", 0.2, 0.8, 40000), kind: "verdura", etaDays: 9 },
    ] as FoodState["crops"]).map<FoodState["crops"][number]>((c) => ({ ...c, etaDays: c.readiness >= 0.95 ? 0 : c.etaDays }));
    return {
        harvestTodayKg: Math.round(jitter("fhar", 40, 320, 26000)),
        reserveDays: Math.round(jitter("frd", 18, 64, 50000)),
        diet: "Vegano · sin gluten",
        crops,
        greenhouses: [
            { id: "g0", label: "Hidroponía A", yield: jitter("gy0", 0.6, 0.98, 30000), health: jitter("gh0", 0.7, 1, 22000) },
            { id: "g1", label: "Bosque comestible", yield: jitter("gy1", 0.4, 0.9, 34000), health: jitter("gh1", 0.6, 0.98, 26000) },
        ],
        prediction: series("fpred", 7, 18000),
    };
};

const mockRegen: Adapter<"oikos.regen"> = () => ({
    co2OffsetKg: Math.round(jitter("rco2", 120, 1850, 60000)),
    treesPlanted: Math.round(jitter("rtree", 3, 64, 90000)),
    compostKg: Math.round(jitter("rcomp", 8, 240, 50000)),
    waterSavedL: Math.round(jitter("rwat", 200, 9800, 70000)),
    cycleClosed: jitter("rcyc", 0.55, 0.98, 24000),
    goals: [
        { id: "rg0", label: "Reforestación anual", progress: Math.round(jitter("rg0", 8, 48, 80000)), target: 60, unit: "árboles" },
        { id: "rg1", label: "Compostaje", progress: Math.round(jitter("rg1", 40, 240, 50000)), target: 300, unit: "kg" },
        { id: "rg2", label: "Ahorro de agua", progress: Math.round(jitter("rg2", 2, 9, 60000)), target: 12, unit: "m³" },
    ],
    scanned: {
        name: "Silla modular impresa",
        materials: ["PLA de maíz", "micelio prensado", "aluminio reciclado"],
        designer: "Forja Abierta · CC-BY",
        recyclable: true,
    },
    history: series("rhist", 24, 16000),
});

// ── Default registry (all mock) ─────────────────────────────────
// Partial: las generaciones posteriores (gen4+) se auto-registran en
// runtime vía `registerAdapter` (side-effect de ./gen4-adapters), así
// que no todas las claves de WidgetDataMap viven aquí literalmente.
const defaultRegistry: Partial<AdapterRegistry> = {
    "common.metrics": mockMetrics,
    "common.feed": mockFeed,
    "politics.proposals": mockProposals,
    "politics.delegations": mockDelegations,
    "politics.initiatives": mockInitiatives,
    "politics.treasury": mockTreasury,
    "politics.resonance": mockResonance,
    "oikos.gifts": mockGifts,
    "oikos.commons": mockCommons,
    "oikos.food": mockFood,
    "oikos.regen": mockRegen,
    "oikos.flow": mockOikos,
    "education.skilltree": mockSkillTree,
    "ai.astraura": mockAstraura,
    "system.node": mockNode,
    "files.codex": mockCodex,
    "astro.natal": mockNatal,
    "network.mesh": mockMesh,
    "entertainment.worlds": mockWorlds,
    "social.posts": mockPosts,
    "common.activity": mockActivity,
    "social.pages": mockPages,
    "social.entities": mockEntities,
    "social.events": mockEvents,
    "social.threads": mockThreads,
    "productivity.projects": mockProjects,
    "education.paths": mockPaths,
    "common.notifications": mockNotifications,
    "wellness.coherence": mockCoherence,
};

// live overrides registered at runtime (real APIs / Supabase / oracles)
const overrides = new Map<WidgetDataKey, Adapter<WidgetDataKey>>();

/**
 * Replace the data source for a domain key without touching widgets.
 * @example registerAdapter("oikos.flow", async () => fetchFromSupabase())
 */
export function registerAdapter<K extends WidgetDataKey>(key: K, adapter: Adapter<K>): void {
    overrides.set(key, adapter as Adapter<WidgetDataKey>);
}

export function clearAdapter(key: WidgetDataKey): void {
    overrides.delete(key);
}

export function getAdapter<K extends WidgetDataKey>(key: K): Adapter<K> {
    const adapter = (overrides.get(key) as Adapter<K> | undefined) ?? (defaultRegistry[key] as Adapter<K> | undefined);
    if (!adapter) {
        throw new Error(`No hay adaptador registrado para "${key}". ¿Olvidaste importar la capa que llama registerAdapter("${key}", …)?`);
    }
    return adapter;
}

/** Resolve a domain key to its (possibly async) value. */
export async function fetchWidgetData<K extends WidgetDataKey>(
    key: K,
    params?: Record<string, unknown>
): Promise<WidgetDataMap[K]> {
    return await getAdapter(key)(params);
}

/** Synchronous resolve — only valid for mock/sync adapters (used for SSR seed). */
export function fetchWidgetDataSync<K extends WidgetDataKey>(
    key: K,
    params?: Record<string, unknown>
): WidgetDataMap[K] | null {
    const adapter = (overrides.get(key) as Adapter<K> | undefined) ?? (defaultRegistry[key] as Adapter<K> | undefined);
    if (!adapter) return null;
    const result = adapter(params);
    return result instanceof Promise ? null : result;
}
