// ════════════════════════════════════════════════════════════════
// StarSeed Widget Data — Typed Domain Contracts
// ----------------------------------------------------------------
// These are the *shapes* every widget consumes. They are deliberately
// source-agnostic: a mock adapter, a Supabase query, a blockchain
// oracle or an external REST API can all satisfy the same contract.
// Swap the adapter (see ./adapters) without touching a single widget.
// ════════════════════════════════════════════════════════════════

export type Trend = "up" | "down" | "flat";

export interface SeriesPoint {
    t: number;   // unix ms or ordinal
    v: number;
}

export interface Metric {
    id: string;
    label: string;
    value: number;
    unit?: string;
    display?: string;        // pre-formatted value, optional
    change?: number;         // percentage change
    trend?: Trend;
    color?: string;          // theme token or hsl
    series?: SeriesPoint[];  // optional sparkline data
}

// ── Política / Parlamento ───────────────────────────────────────
export interface LawProposal {
    id: string;
    title: string;
    summary: string;
    stage: "borrador" | "firmas" | "debate" | "votacion" | "ratificada";
    progress: number;            // 0..1 of current stage
    scope: "vecinal" | "municipal" | "biorregional" | "global";
    support: number;             // votes / signatures
    threshold: number;
    impact: { taxes: number; ecology: number; sector: number }; // -1..1 predicted
    deadlineTs: number;
    youVoted?: "favor" | "contra" | null;
}

export interface Delegation {
    id: string;
    topic: string;
    delegateName: string;
    delegateKind: "persona" | "organizacion" | "junta";
    affinity: number;            // 0..1 ontological coherence
    successRate: number;         // 0..1
    divergence: number;          // 0..1 risk of voting against your history
    revocable: true;
}

// ── Economía / Ecología (Oikos) ─────────────────────────────────
export interface OikosFlow {
    energyGenerated: number;     // kWh now
    energyConsumed: number;
    waterCaptured: number;       // L
    surplusRouting: { to: string; amount: number }[];
    sources: { id: string; label: string; share: number; trend: Trend }[];
    history: SeriesPoint[];      // net energy
    comfortThreshold: number;
}

// ── Educación (Árbol de Habilidades) ────────────────────────────
export interface SkillBranch {
    id: string;
    label: string;
    mastery: number;             // 0..1 (branch thickness)
    discipline: string;
    children?: SkillBranch[];
    certified?: boolean;
    microMission?: string;
}

// ── IA (Astraura Exocortex) ─────────────────────────────────────
export interface AstrauraState {
    attention: string;           // what the AI is currently focused on
    cognitiveLoad: number;       // 0..1
    pendingTasks: number;
    interventionLevel: number;   // 0..1
    suggestions: { id: string; text: string; kind: "pausa" | "investigar" | "accion" }[];
    backgroundJobs: { id: string; label: string; progress: number }[];
}

// ── Sistema (Nodo Soberano) ─────────────────────────────────────
export interface NodeHealth {
    cpu: number;                 // 0..1
    memory: number;              // 0..1
    temperature: number;         // °C
    ipfsPeers: number;
    ledgerSync: number;          // 0..1
    contributedShare: number;    // 0..1 of idle power donated
    threads: { id: string; label: string; load: number }[];
}

// ── Archivos (Códice Akáshico) ──────────────────────────────────
export interface CodexNode {
    id: string;
    label: string;
    kind: "doc" | "image" | "audio" | "model3d" | "code";
    connections: string[];      // ids of related nodes
    createdTs: number;
    redundancy: number;          // 0..1 crypto redundancy
}

// ── Astrología (Sincronía Vital) ────────────────────────────────
export interface AstroTransit {
    body: string;
    sign: string;
    degree: number;
    aspect?: string;
    intensity: number;           // 0..1
    note: string;
}
export interface NatalSnapshot {
    sun: string;
    moon: string;
    ascendant: string;
    transits: AstroTransit[];
    coherence: number;           // 0..1 emotional sync
}

// ── Red (Mesh) ──────────────────────────────────────────────────
export interface MeshNode {
    id: string;
    label: string;
    kind: "self" | "peer" | "router" | "satellite";
    protocol: "wifi" | "lifi" | "bluetooth" | "rf";
    signal: number;              // 0..1
    encrypted: boolean;
    distance: number;            // relative 0..1 for layout radius
    angle: number;               // radians for layout
    bandwidthShared?: number;    // Mbps donated
}

// ── Entretenimiento (Portales) ──────────────────────────────────
export interface ImmersiveWorld {
    id: string;
    name: string;
    genre: string;
    activeUsers: number;
    intensity: number;           // 0..1 sensory
    mode: "vr" | "ar" | "2d";
    accent: string;              // theme color hint
}

// ── Social / Cultura genéricos reutilizables ────────────────────
export interface FeedItem {
    id: string;
    title: string;
    author: string;
    kind: string;
    ts: number;
    resonance: number;           // 0..1
}

// ── Social: posts, páginas, entidades, eventos, mensajes ────────
export interface Post {
    id: string;
    author: string;
    handle: string;
    content: string;
    ts: number;
    resonance: number;           // 0..1
    comments: number;
    boosts: number;
    tags: string[];
    scope: "vecinal" | "biorregional" | "global";
}

export interface ActivityEvent {
    id: string;
    actor: string;
    action: string;              // "votó", "publicó", "se unió"...
    target: string;
    kind: "vote" | "post" | "join" | "mission" | "delegation" | "resource";
    ts: number;
}

export interface PageRef {
    id: string;
    name: string;
    kind: "perfil" | "comunidad" | "proyecto" | "entidad";
    members: number;
    activity: number;            // 0..1 recent
    role: "fundador" | "miembro" | "moderador";
    accent: string;
}

export interface NetworkEntity {
    id: string;
    name: string;
    kind: "comunidad" | "sangha" | "colectivo" | "biorregion";
    momentum: number;            // 0..1 trending
    members: number;
    focus: string;
    accent: string;
}

export interface SocialEvent {
    id: string;
    title: string;
    place: string;
    startTs: number;
    attendees: number;
    kind: "asamblea" | "taller" | "ritual" | "obra" | "mercado";
}

export interface MessageThread {
    id: string;
    name: string;
    lastMessage: string;
    ts: number;
    unread: number;
    online: boolean;
    kind: "directo" | "grupo" | "junta";
    accent: string;
}

// ── Productividad ───────────────────────────────────────────────
export interface Project {
    id: string;
    name: string;
    progress: number;            // 0..1
    status: "activo" | "pausado" | "revision" | "completado";
    collaborators: number;
    dueTs: number;
    nextMilestone: string;
    accent: string;
}

// ── Educación: rutas de aprendizaje ─────────────────────────────
export interface LearningPath {
    id: string;
    title: string;
    discipline: string;
    progress: number;            // 0..1
    nextLesson: string;
    mentor: string;
    mentorKind: "humano" | "ia" | "hibrido";
    accent: string;
}

// ── Sistema: notificaciones ─────────────────────────────────────
export interface Notification {
    id: string;
    title: string;
    body: string;
    kind: "info" | "success" | "warning" | "governance" | "social";
    ts: number;
    read: boolean;
}

// ── Bienestar: coherencia mental ────────────────────────────────
export interface CoherenceState {
    coherence: number;           // 0..1
    focus: number;               // 0..1
    calm: number;                // 0..1
    energy: number;              // 0..1
    streakDays: number;
    suggestion: string;
    history: SeriesPoint[];
}

// ── Política: Transmutador de Quejas a Iniciativas (Alquimia Cívica) ─
export interface CivicInitiative {
    id: string;
    rawComplaint: string;        // lo que el ciudadano escribió en lenguaje natural
    draftedTitle: string;        // título redactado por la IA
    draftedProposal: string;     // propuesta formal redactada por la IA
    stage: "queja" | "redaccion" | "firmas" | "debate" | "aprobada";
    scope: "vecinal" | "municipal" | "biorregional" | "global";
    signatures: number;
    threshold: number;
    relatedLaws: string[];       // leyes preexistentes que la IA encontró
    place?: string;              // geolocalización del problema
    createdTs: number;
}

// ── Política: Auditoría de Flujo Vital (Transparencia Radical) ──
export interface TreasuryFlow {
    total: number;               // presupuesto total (créditos de abundancia)
    period: string;              // ej. "Ciclo 2026-Q2"
    sectors: { id: string; label: string; color: string; amount: number }[];
    allocations: {
        id: string;
        sector: string;          // id de sector
        label: string;
        contractor: string;      // ejecutor / nodo responsable
        amount: number;
        spent: number;           // 0..amount
        flaggedByYou: boolean;
        communityFlags: number;  // marcas de sospecha de la comunidad
    }[];
    pendingVotes: { id: string; label: string; amount: number; deadlineTs: number }[];
}

// ── Política: Termómetro de Resonancia Social ───────────────────
export type CivicEmotion = "esperanza" | "indignacion" | "urgencia" | "curiosidad" | "consenso";
export interface ResonanceState {
    window: string;              // ej. "Últimas 24 h"
    dominantEmotion: CivicEmotion;
    brokenBubble: boolean;       // modo que muestra la postura contraria
    topics: {
        id: string;
        label: string;
        heat: number;            // 0..1 intensidad de debate
        emotion: CivicEmotion;
        participants: number;
        trend: Trend;
        constructiveness: number;// 0..1 calidad del debate
        opposingView: string;    // argumento fuerte de la postura contraria
        threadHref: string;      // enlace real al epicentro del debate
    }[];
}

// ── Economía/Ecología: Ágora del Don (Red de Distribución Libre) ─
export interface GiftOffer {
    id: string;
    title: string;
    kind: "bien" | "servicio";
    category: "alimentos" | "herramientas" | "ropa" | "arte" | "tiempo" | "asesoria";
    giver: string;
    distanceKm: number;
    urgency: "baja" | "media" | "alta";
    available: boolean;
    accent: string;
}

// ── Economía/Ecología: Matriz de Patrimonio Común ───────────────
export interface CommonsResource {
    id: string;
    label: string;
    kind: "impresora3d" | "vehiculo" | "laboratorio" | "servidores" | "maquinaria";
    status: "libre" | "reservado" | "mantenimiento";
    availableInMin: number;      // 0 si libre ahora
    queue: number;               // reservas por propósito en cola
    priorityPurpose?: string;    // propósito de máxima prioridad en cola
}

// ── Economía/Ecología: Oráculo de Soberanía Alimentaria ─────────
export interface FoodState {
    harvestTodayKg: number;
    reserveDays: number;
    diet: string;                // perfil dietético del usuario
    crops: { id: string; label: string; readiness: number; kind: "fruta" | "verdura" | "grano" | "hierba"; etaDays: number }[];
    greenhouses: { id: string; label: string; yield: number; health: number }[];
    prediction: SeriesPoint[];   // rendimiento previsto 7 días
}

// ── Economía/Ecología: Trazador de Ciclo Vital / Huella Regenerativa ─
export interface RegenState {
    co2OffsetKg: number;
    treesPlanted: number;
    compostKg: number;
    waterSavedL: number;
    cycleClosed: number;         // 0..1 circularidad material
    goals: { id: string; label: string; progress: number; target: number; unit: string }[];
    scanned?: { name: string; materials: string[]; designer: string; recyclable: boolean };
    history: SeriesPoint[];
}

// ════════════════════════════════════════════════════════════════
// Cuarta generación (gen4) — contratos de dominio
// ════════════════════════════════════════════════════════════════

// ── Política: Consejo de Sabios (Meritocracia del Entendimiento) ─
export interface CouncilSage {
    id: string;
    name: string;
    domain: string;              // dominio de sabiduría (ej. "Ecología", "Justicia")
    badges: number;              // insignias verificables acumuladas
    reputation: number;          // 0..1 sabiduría aplicada verificable
    online: boolean;
    delegatedVoices: number;     // voces delegadas líquidas que sostiene
    accent: string;
}
export interface CouncilState {
    sages: CouncilSage[];
    openConsultations: { id: string; topic: string; sageId: string; urgency: "baja" | "media" | "alta"; deadlineTs: number }[];
    yourTrustGiven: number;      // nº de delegaciones que tú has otorgado
}

// ── Política: Tribunal Restaurativo (Círculos de Paz) ───────────
export interface RestorativeCase {
    id: string;
    title: string;
    stage: "apertura" | "escucha" | "acuerdo" | "reparacion" | "cerrado";
    progress: number;            // 0..1 avance de la restauración
    participants: number;        // personas en el círculo
    facilitator: string;
    harmType: string;            // tipo de daño a reparar
    restorative: boolean;        // siempre true — nunca punitivo
    nextCircleTs: number;
}
export interface JusticeState {
    activeCircles: number;
    healedThisCycle: number;     // acuerdos completados en el ciclo
    cases: RestorativeCase[];
}

// ── Economía/Oikos: Mercado de Trueque ──────────────────────────
export interface BarterListing {
    id: string;
    offers: string;              // lo que da
    wants: string;               // lo que busca
    owner: string;
    category: "alimentos" | "herramientas" | "saberes" | "tiempo" | "arte" | "tecnologia";
    distanceKm: number;
    matchScore: number;          // 0..1 afinidad con tu inventario
    accent: string;
}
export interface BarterState {
    listings: BarterListing[];
    yourMatches: number;         // coincidencias detectadas para ti
}

// ── Economía/Oikos: Energía Comunal (microred) ──────────────────
export interface EnergyGridState {
    generationKw: number;
    consumptionKw: number;
    batteryLevel: number;        // 0..1
    sharedToGrid: number;        // kW donados a vecinos (procomún)
    sources: { id: string; label: string; share: number; trend: Trend }[];
    history: SeriesPoint[];      // balance neto
    co2AvoidedKg: number;
}

// ── Educación: Mentoría Híbrida (humano + IA) ───────────────────
export interface Mentor {
    id: string;
    name: string;
    expertise: string;
    kind: "humano" | "ia" | "hibrido";
    rating: number;              // 0..1
    matchScore: number;          // 0..1 afinidad con tus rutas
    availableInMin: number;      // 0 = disponible ahora
    sessionsGiven: number;
    accent: string;
}
export interface MentorState {
    mentors: Mentor[];
    nextSession?: { mentorId: string; topic: string; ts: number };
}

// ── Educación: Biblioteca Universal ─────────────────────────────
export interface LibraryItem {
    id: string;
    title: string;
    author: string;
    kind: "doc" | "video" | "curso" | "modelo3d" | "audio" | "dataset";
    discipline: string;
    progress?: number;           // 0..1 si está en curso
    rating: number;              // 0..1
    openAccess: boolean;         // siempre true — conocimiento procomún
}
export interface LibraryState {
    featured: LibraryItem[];
    continueLearning: LibraryItem[];
    totalEntities: number;       // tamaño del Lienzo Universal de saber
    collections: { id: string; label: string; count: number; accent: string }[];
}

// ── Cultura: Multiverso (mundos inmersivos) ─────────────────────
export interface MultiverseWorld {
    id: string;
    name: string;
    theme: string;
    mode: "vr" | "ar" | "2d" | "espacial";
    activeUsers: number;
    intensity: number;           // 0..1 carga sensorial
    live: boolean;
    accent: string;
}
export interface MultiverseState {
    worlds: MultiverseWorld[];
    totalPresence: number;       // personas inmersas ahora
    yourPortals: number;         // mundos guardados por ti
}

// ── Cultura: Estudio Creativo ───────────────────────────────────
export interface StudioProject {
    id: string;
    title: string;
    medium: "música" | "visual" | "escritura" | "3d" | "video" | "mixto";
    progress: number;            // 0..1
    collaborators: number;
    updatedTs: number;
    accent: string;
}
export interface StudioState {
    projects: StudioProject[];
    tools: { id: string; label: string; kind: string }[];
    inspirationOfDay: string;
}

// ── IA/Exocórtex: Oráculo Predictivo ────────────────────────────
export interface OracleScenario {
    id: string;
    question: string;
    outcome: string;
    probability: number;         // 0..1
    confidence: number;          // 0..1 del modelo
    horizon: string;             // ej. "7 días", "1 ciclo"
    impact: "positivo" | "neutro" | "riesgo";
    drivers: string[];           // factores que la IA considera
}
export interface OracleState {
    scenarios: OracleScenario[];
    modelAccuracy: number;       // 0..1 precisión histórica
    lastUpdated: number;
}

// ── Sistema: Bóveda de Identidad Soberana ───────────────────────
export interface IdentityProfile {
    id: string;
    label: string;               // faceta pública (cívico, artístico, profesional)
    kind: "civico" | "artistico" | "profesional" | "intimo";
    visibility: "publico" | "red" | "privado";
    accent: string;
}
export interface DataShare {
    id: string;
    party: string;               // a quién diste acceso
    scope: string;               // qué dato
    revocable: true;             // siempre revocable (soberanía)
    grantedTs: number;
}
export interface IdentityState {
    accountVerified: boolean;    // verificación biométrica ZK
    zkVerifications: number;     // pruebas de conocimiento cero emitidas
    profiles: IdentityProfile[];
    keysHealthy: boolean;        // estado de las claves criptográficas
    dataShares: DataShare[];
    sovereigntyScore: number;    // 0..1 cuánto control retienes
}

// ── Astrología/Bienestar: Mapa de Energía ───────────────────────
export interface EnergyCenter {
    id: string;
    label: string;               // centro energético / chakra
    balance: number;             // 0..1
    color: string;
    note: string;
}
export interface EnergyMapState {
    overallCoherence: number;    // 0..1
    centers: EnergyCenter[];
    biorhythm: { physical: number; emotional: number; intellectual: number }; // -1..1
    cosmicInfluence: { body: string; effect: string; intensity: number }[];
    history: SeriesPoint[];
}

// ════════════════════════════════════════════════════════════════
// Quinta generación (gen5) — contratos de dominio
// ════════════════════════════════════════════════════════════════

// ── Productividad: Director de Flujo Vital ──────────────────────
export type FlowPhase = "amanecer" | "pico" | "meseta" | "descenso" | "reposo";
export type FlowTaskKind = "creativa" | "analitica" | "fisica" | "social" | "descanso";
export interface FlowState {
    energyNow: number;           // 0..1 energía télica actual
    phase: FlowPhase;
    peaks: { id: string; label: string; kind: FlowTaskKind; startHour: number; score: number }[];
    suggestion: { taskType: FlowTaskKind; reason: string };
    focusMode: boolean;          // "Modo Fortaleza" activo
    circadian: SeriesPoint[];    // curva de energía del día
}

// ── Productividad: Enjambre de Propósitos ───────────────────────
export interface SwarmNode {
    id: string;
    label: string;
    urgency: number;             // 0..1
    impact: number;              // 0..1 impacto en comunidad/vida
    status: "semilla" | "activo" | "flujo" | "revision" | "hecho";
    subtasks: number;
    accent: string;
}
export interface SwarmState {
    nodes: SwarmNode[];
    openToSwarm: number;         // subtareas soltadas al Ágora del Don
}

// ── Ubicación: Radar de Nodos de Abundancia ─────────────────────
export interface ResourceNode {
    id: string;
    label: string;
    kind: "huerto" | "impresora3d" | "agua" | "herramientas" | "sanacion" | "taller";
    distanceKm: number;
    available: boolean;
    etaMin: number;              // 0 si disponible ahora
    accent: string;
}
export interface AbundanceState {
    nodes: ResourceNode[];
    readyNow: number;
}

// ── Ubicación: Topología de Tránsito Orgánico ───────────────────
export interface TransitVehicle {
    id: string;
    kind: "capsula" | "vehiculo" | "dron" | "bici";
    label: string;
    etaMin: number;
    occupancy: number;           // 0..1
    accent: string;
}
export interface TransitState {
    vehicles: TransitVehicle[];
    activeRoutes: number;
    co2SavedKg: number;
}

// ── Privacidad: Escudo Ontológico (Membrana Criptográfica) ──────
export interface DataFlow {
    id: string;
    kind: "texto" | "audio" | "biometria" | "ubicacion";
    label: string;
    outbound: boolean;
    allowed: boolean;            // consentido por el usuario
}
export interface ShieldState {
    level: "abierta" | "equilibrada" | "cierre";  // fricción criptográfica
    trackersBlocked: number;
    flows: DataFlow[];
    onionHops: number;           // saltos de enrutamiento cebolla
    keysHealthy: boolean;
}

// ── Dispositivos: Núcleo de Simbiosis Habitacional ──────────────
export interface HabitatRoom {
    id: string;
    label: string;
    tempC: number;
    light: number;               // 0..1
    airQuality: number;          // 0..1
    accent: string;
}
export interface HabitatRobot {
    id: string;
    label: string;
    battery: number;             // 0..1
    task: string;
    active: boolean;
}
export interface HabitatState {
    rooms: HabitatRoom[];
    circadianMode: "dia" | "tarde" | "noche";
    robots: HabitatRobot[];
    energyHarmony: number;       // 0..1 sincronía con abundancia energética
}

// ── Descubrimientos: Lente de Serendipia ────────────────────────
export interface SerendipityFind {
    id: string;
    title: string;
    kind: "idea" | "arte" | "musica" | "sendero" | "persona";
    author: string;
    resonance: number;           // 0..1
    accent: string;
}
export interface SerendipityState {
    strangeness: number;         // 0..1 nivel de extrañeza
    finds: SerendipityFind[];
}

// ── Creatividad: Incubadora de Quimeras ─────────────────────────
export interface IdeaSpark {
    id: string;
    a: string;
    b: string;
    prompt: string;              // puente creativo sugerido
    saved: boolean;
}
export interface IdeaForgeState {
    conceptPool: string[];       // conceptos del Códice para colisionar
    sparks: IdeaSpark[];
    disciplines: string[];
}

// ── Perfil: Cristalería de Mérito y Abundancia ──────────────────
export interface MeritBadge {
    id: string;
    label: string;
    tier: "bronce" | "plata" | "oro" | "cristal";
    accent: string;
}
export interface MeritState {
    regenFootprint: { trees: number; hours: number; co2Kg: number };
    badges: MeritBadge[];
    skillMaturity: number;       // 0..1 madurez del árbol de habilidades
    trustScore: number;          // 0..1 coherencia ética (firma de confianza)
    topSkills: { label: string; mastery: number; accent: string }[];
}

// ── Sociedad: Monitor de Cohesión Macro-Social ──────────────────
export interface SocietyRegion {
    id: string;
    label: string;
    cohesion: number;            // 0..1
    trend: Trend;
    accent: string;
}
export interface SocietyState {
    harmonyIndex: number;        // 0..1 Índice de Armonía Global
    regions: SocietyRegion[];
    abundance: number;           // 0..1
    wellbeing: number;           // 0..1
    participation: number;       // 0..1 participación ontocrática
    fracture?: { region: string; reason: string };  // detección de fracturas
    history: SeriesPoint[];
}

// ── The full registry of domains a widget can request ───────────
export interface WidgetDataMap {
    "politics.proposals": LawProposal[];
    "politics.delegations": Delegation[];
    "politics.initiatives": CivicInitiative[];
    "politics.treasury": TreasuryFlow;
    "politics.resonance": ResonanceState;
    "oikos.gifts": GiftOffer[];
    "oikos.commons": CommonsResource[];
    "oikos.food": FoodState;
    "oikos.regen": RegenState;
    "oikos.flow": OikosFlow;
    "education.skilltree": SkillBranch;
    "ai.astraura": AstrauraState;
    "system.node": NodeHealth;
    "files.codex": CodexNode[];
    "astro.natal": NatalSnapshot;
    "network.mesh": MeshNode[];
    "entertainment.worlds": ImmersiveWorld[];
    "common.metrics": Metric[];
    "common.feed": FeedItem[];
    "social.posts": Post[];
    "common.activity": ActivityEvent[];
    "social.pages": PageRef[];
    "social.entities": NetworkEntity[];
    "social.events": SocialEvent[];
    "social.threads": MessageThread[];
    "productivity.projects": Project[];
    "education.paths": LearningPath[];
    "common.notifications": Notification[];
    "wellness.coherence": CoherenceState;
    // ── gen4 ──
    "politics.council": CouncilState;
    "politics.justice": JusticeState;
    "oikos.barter": BarterState;
    "oikos.energy": EnergyGridState;
    "education.mentors": MentorState;
    "education.library": LibraryState;
    "culture.multiverse": MultiverseState;
    "culture.studio": StudioState;
    "ai.oracle": OracleState;
    "system.identity": IdentityState;
    "astro.energy": EnergyMapState;
    // ── gen5 ──
    "productivity.flow": FlowState;
    "productivity.swarm": SwarmState;
    "location.resources": AbundanceState;
    "location.transit": TransitState;
    "privacy.shield": ShieldState;
    "devices.habitat": HabitatState;
    "discovery.serendipity": SerendipityState;
    "creativity.ideas": IdeaForgeState;
    "profile.merit": MeritState;
    "society.cohesion": SocietyState;
}

export type WidgetDataKey = keyof WidgetDataMap;
