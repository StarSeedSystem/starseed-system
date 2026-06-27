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

export const partidos: PartidoData[] = [];

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

export const federativeEntities: EFData[] = [];

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

export const assemblies: AssemblyData[] = [];

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

export const communities: CommunityData[] = [];

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

export const groups: GroupData[] = [];

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

export const eventExtras: Record<string, EventExtras> = {};

// ── LOOKUPS ───────────────────────────────────────────────────────────────
// Devuelven datos REALES si existen, o `null` cuando no hay coincidencia (sin
// inventar entidades). Las vistas de detalle muestran un estado vacío real
// ("Aún no hay…") en lugar de datos de ejemplo.
export function getPartido(slug: string): PartidoData | null {
    return partidos.find((p) => matches(slug, p)) ?? null;
}
export function listPartidos(): PartidoData[] {
    return partidos;
}
export function getFederativeEntity(slug: string): EFData | null {
    return federativeEntities.find((e) => matches(slug, e)) ?? null;
}
export function listFederativeEntities(): EFData[] {
    return federativeEntities;
}
export function getAssembly(slug: string): AssemblyData | null {
    return assemblies.find((a) => matches(slug, a)) ?? null;
}
export function getCommunity(slug: string): CommunityData | null {
    return communities.find((c) => matches(slug, c)) ?? null;
}
export function getGroup(slug: string): GroupData | null {
    return groups.find((g) => matches(slug, g)) ?? null;
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
