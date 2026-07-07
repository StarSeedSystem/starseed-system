"use client";

/*
 * curriculum — Catálogo de TEMAS EDUCATIVOS (árbol categoría → tema → subtema)
 * para el Módulo Educación de StarSeed OS.
 * ---------------------------------------------------------------------------
 * `entity_state` (contrato en src/lib/sync/entity-state.ts) no permite un
 * ámbito "global" editable por cualquiera con RLS pública — cada fila
 * pertenece a UN dueño (user/group/page/…). Por eso el árbol educativo se
 * modela en DOS CAPAS, honestas y simples:
 *
 *   1. CATÁLOGO BUILTIN (este archivo, en código): compartido por TODA la
 *      red sin necesidad de tabla ni RLS — siempre resoluble por cualquiera.
 *   2. EXTENSIONES PERSONALES (entity_state kind="user"): temas/subtemas que
 *      cada persona añade para SU PROPIO mapa de conocimiento. Son privados
 *      a su ámbito (coherente con la RLS real de entity_state).
 *
 * Los GRUPOS/PÁGINAS sólo pueden vincularse (Temario) a nodos del catálogo
 * BUILTIN — nunca a una extensión personal de otra persona — porque el resto
 * de miembros no podría resolver un nodo que vive en el ámbito privado de
 * alguien más. Ver src/lib/education/group-education.ts.
 *
 * "Actividad" (tamaño en el grafo) se calcula con datos REALES: nº de cursos
 * + artículos (src/lib/data.ts) cuyo `tags` incluye el nombre del nodo — la
 * misma convención que ya usa ThemeNetworkView en la página de Educación.
 * Ahora mismo esos catálogos están vacíos, así que la actividad será 0 en la
 * mayoría de nodos: es HONESTO mostrarlo así en vez de inventar números.
 */

import {
    getEntityState,
    setEntityState,
    currentUserRef,
} from "@/lib/sync/entity-state";
import { courses, articles, type Course, type Article } from "@/lib/data";

// ─────────────────────────────────────────────────────────────────────────
// Tipos
// ─────────────────────────────────────────────────────────────────────────

export type EduNodeKind = "category" | "topic" | "subtopic";

export interface EduNode {
    id: string;
    kind: EduNodeKind;
    name: string;
    blurb?: string;
    /** null sólo para categorías raíz. */
    parentId: string | null;
    /** true = extensión añadida por una persona (no viene del catálogo builtin). */
    custom?: boolean;
}

export interface EduTreeNode extends EduNode {
    depth: number;
    children: EduTreeNode[];
}

function n(
    id: string,
    kind: EduNodeKind,
    name: string,
    parentId: string | null,
    blurb?: string,
): EduNode {
    return { id, kind, name, parentId, blurb };
}

// ─────────────────────────────────────────────────────────────────────────
// Catálogo BUILTIN — árbol categoría → tema → subtema (código, universal)
// ─────────────────────────────────────────────────────────────────────────

export const BUILTIN_NODES: EduNode[] = [
    // Ciencia ----------------------------------------------------------------
    n("cat-ciencia", "category", "Ciencia", null, "El estudio sistemático del universo mediante observación y experimentación."),
    n("top-fisica", "topic", "Física", "cat-ciencia"),
    n("sub-mecanica-clasica", "subtopic", "Mecánica Clásica", "top-fisica"),
    n("sub-fisica-cuantica", "subtopic", "Física Cuántica", "top-fisica"),
    n("sub-relatividad", "subtopic", "Relatividad", "top-fisica"),
    n("sub-termodinamica", "subtopic", "Termodinámica", "top-fisica"),
    n("top-quimica", "topic", "Química", "cat-ciencia"),
    n("sub-quimica-organica", "subtopic", "Química Orgánica", "top-quimica"),
    n("sub-bioquimica", "subtopic", "Bioquímica", "top-quimica"),
    n("top-biologia", "topic", "Biología", "cat-ciencia"),
    n("sub-genetica", "subtopic", "Genética", "top-biologia"),
    n("sub-neurociencia", "subtopic", "Neurociencia", "top-biologia"),
    n("sub-evolucion", "subtopic", "Ecología Evolutiva", "top-biologia"),
    n("top-astronomia", "topic", "Astronomía", "cat-ciencia"),
    n("sub-cosmologia", "subtopic", "Cosmología", "top-astronomia"),
    n("sub-astrobiologia", "subtopic", "Astrobiología", "top-astronomia"),

    // Matemáticas --------------------------------------------------------------
    n("cat-matematicas", "category", "Matemáticas", null, "El lenguaje formal de la estructura, la cantidad y el cambio."),
    n("top-algebra", "topic", "Álgebra", "cat-matematicas"),
    n("sub-algebra-lineal", "subtopic", "Álgebra Lineal", "top-algebra"),
    n("sub-teoria-grupos", "subtopic", "Teoría de Grupos", "top-algebra"),
    n("top-calculo", "topic", "Cálculo", "cat-matematicas"),
    n("sub-calculo-diferencial", "subtopic", "Cálculo Diferencial", "top-calculo"),
    n("sub-calculo-integral", "subtopic", "Cálculo Integral", "top-calculo"),
    n("top-estadistica", "topic", "Estadística y Probabilidad", "cat-matematicas"),
    n("sub-bayesiana", "subtopic", "Inferencia Bayesiana", "top-estadistica"),
    n("sub-estocasticos", "subtopic", "Procesos Estocásticos", "top-estadistica"),
    n("top-logica", "topic", "Lógica y Fundamentos", "cat-matematicas"),
    n("sub-teoria-conjuntos", "subtopic", "Teoría de Conjuntos", "top-logica"),
    n("sub-logica-matematica", "subtopic", "Lógica Matemática", "top-logica"),

    // Tecnología ---------------------------------------------------------------
    n("cat-tecnologia", "category", "Tecnología", null, "Herramientas y técnicas para extender las capacidades humanas."),
    n("top-ia", "topic", "Inteligencia Artificial", "cat-tecnologia"),
    n("sub-aprendizaje-automatico", "subtopic", "Aprendizaje Automático", "top-ia"),
    n("sub-redes-neuronales", "subtopic", "Redes Neuronales", "top-ia"),
    n("sub-etica-ia", "subtopic", "Ética de la IA", "top-ia"),
    n("top-programacion", "topic", "Programación", "cat-tecnologia"),
    n("sub-estructuras-datos", "subtopic", "Estructuras de Datos", "top-programacion"),
    n("sub-desarrollo-web", "subtopic", "Desarrollo Web", "top-programacion"),
    n("top-redes-descentralizadas", "topic", "Redes Descentralizadas", "cat-tecnologia"),
    n("sub-blockchain", "subtopic", "Blockchain", "top-redes-descentralizadas"),
    n("sub-fediverso", "subtopic", "Fediverso y Protocolos Abiertos", "top-redes-descentralizadas"),
    n("top-realidad-extendida", "topic", "Realidad Extendida", "cat-tecnologia"),
    n("sub-realidad-virtual", "subtopic", "Realidad Virtual", "top-realidad-extendida"),
    n("sub-interfaces-bci", "subtopic", "Interfaces Cerebro-Máquina", "top-realidad-extendida"),

    // Sociedad -------------------------------------------------------------
    n("cat-sociedad", "category", "Sociedad", null, "Estructuras sociales, relaciones humanas y organización colectiva."),
    n("top-gobernanza", "topic", "Gobernanza", "cat-sociedad"),
    n("sub-democracia-directa", "subtopic", "Democracia Directa", "top-gobernanza"),
    n("sub-voto-liquido", "subtopic", "Voto Líquido", "top-gobernanza"),
    n("sub-derecho-restaurativo", "subtopic", "Derecho Restaurativo", "top-gobernanza"),
    n("top-etica", "topic", "Ética", "cat-sociedad"),
    n("sub-etica-aplicada", "subtopic", "Ética Aplicada", "top-etica"),
    n("sub-filosofia-moral", "subtopic", "Filosofía Moral", "top-etica"),
    n("top-economia", "topic", "Economía", "cat-sociedad"),
    n("sub-economia-post-escasez", "subtopic", "Economía Post-Escasez", "top-economia"),
    n("sub-economia-circular", "subtopic", "Economía Circular", "top-economia"),
    n("top-comunicacion", "topic", "Comunicación", "cat-sociedad"),
    n("sub-facilitacion-grupos", "subtopic", "Facilitación de Grupos", "top-comunicacion"),
    n("sub-mediacion-conflictos", "subtopic", "Mediación de Conflictos", "top-comunicacion"),

    // Ecología ------------------------------------------------------------
    n("cat-ecologia", "category", "Ecología", null, "Relaciones entre los seres vivos y su entorno físico."),
    n("top-sostenibilidad", "topic", "Sostenibilidad", "cat-ecologia"),
    n("sub-energias-renovables", "subtopic", "Energías Renovables", "top-sostenibilidad"),
    n("sub-permacultura", "subtopic", "Permacultura", "top-sostenibilidad"),
    n("top-biorregionalismo", "topic", "Biorregionalismo", "cat-ecologia"),
    n("sub-gestion-agua", "subtopic", "Gestión del Agua", "top-biorregionalismo"),
    n("sub-soberania-alimentaria", "subtopic", "Soberanía Alimentaria", "top-biorregionalismo"),
    n("top-regeneracion", "topic", "Regeneración", "cat-ecologia"),
    n("sub-agricultura-regenerativa", "subtopic", "Agricultura Regenerativa", "top-regeneracion"),
    n("sub-restauracion-ecosistemas", "subtopic", "Restauración de Ecosistemas", "top-regeneracion"),

    // Conciencia ----------------------------------------------------------
    n("cat-conciencia", "category", "Conciencia", null, "La naturaleza de la experiencia consciente y su cultivo."),
    n("top-filosofia-mente", "topic", "Filosofía de la Mente", "cat-conciencia"),
    n("sub-fenomenologia", "subtopic", "Fenomenología", "top-filosofia-mente"),
    n("sub-problema-dificil", "subtopic", "El Problema Difícil de la Conciencia", "top-filosofia-mente"),
    n("top-practicas-contemplativas", "topic", "Prácticas Contemplativas", "cat-conciencia"),
    n("sub-meditacion", "subtopic", "Meditación", "top-practicas-contemplativas"),
    n("sub-respiracion-consciente", "subtopic", "Respiración Consciente", "top-practicas-contemplativas"),
    n("top-psicologia", "topic", "Psicología", "cat-conciencia"),
    n("sub-psicologia-transpersonal", "subtopic", "Psicología Transpersonal", "top-psicologia"),
    n("sub-psicologia-positiva", "subtopic", "Psicología Positiva", "top-psicologia"),

    // Salud y Biotecnología ------------------------------------------------
    n("cat-salud-biotec", "category", "Salud y Biotecnología", null, "Evolución simbiótica ética y bienestar integral."),
    n("top-biotecnologia", "topic", "Biotecnología", "cat-salud-biotec"),
    n("sub-bioingenieria", "subtopic", "Bioingeniería", "top-biotecnologia"),
    n("sub-longevidad", "subtopic", "Longevidad y Biohacking", "top-biotecnologia"),
    n("top-salud-integrativa", "topic", "Salud Integrativa", "cat-salud-biotec"),
    n("sub-nutricion", "subtopic", "Nutrición", "top-salud-integrativa"),
    n("sub-medicina-preventiva", "subtopic", "Medicina Preventiva", "top-salud-integrativa"),
    n("top-transhumanismo", "topic", "Transhumanismo", "cat-salud-biotec"),
    n("sub-etica-transhumanista", "subtopic", "Ética Transhumanista", "top-transhumanismo"),
    n("sub-interfaces-bio-digitales", "subtopic", "Interfaces Bio-Digitales", "top-transhumanismo"),
];

export const CATEGORY_COLORS: Record<string, string> = {
    "cat-ciencia": "#22d3ee",
    "cat-matematicas": "#a78bfa",
    "cat-tecnologia": "#fbbf24",
    "cat-sociedad": "#007FFF",
    "cat-ecologia": "#10B981",
    "cat-conciencia": "#f472b6",
    "cat-salud-biotec": "#fb7185",
};

const FALLBACK_COLORS = ["#38bdf8", "#c084fc", "#facc15", "#4ade80", "#fb923c", "#f87171", "#2dd4bf"];

function hashStr(s: string): number {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return h;
}

/** Color determinista por categoría raíz (builtin curado; fallback por hash para raíces nuevas del usuario). */
export function colorForRoot(rootId: string): string {
    return CATEGORY_COLORS[rootId] ?? FALLBACK_COLORS[hashStr(rootId) % FALLBACK_COLORS.length];
}

// ─────────────────────────────────────────────────────────────────────────
// Extensiones personales (entity_state kind="user")
// ─────────────────────────────────────────────────────────────────────────

const EXT_KEY = "education:topics:ext";

export interface EduExtNode extends EduNode {
    createdAt: string;
}

/** Extensiones (temas/subtemas propios) de la persona autenticada. [] sin sesión o error. */
export async function loadUserExtensions(): Promise<EduExtNode[]> {
    const ref = await currentUserRef();
    if (!ref) return [];
    const row = await getEntityState<EduExtNode[]>(ref, EXT_KEY);
    return Array.isArray(row?.value) ? (row!.value as EduExtNode[]) : [];
}

export interface AddNodeInput {
    kind: EduNodeKind;
    name: string;
    blurb?: string;
    /** null = nueva categoría raíz propia. */
    parentId: string | null;
}

/** Añade un tema/subtema/categoría propio. Devuelve el nodo creado o null (sin sesión / nombre vacío). */
export async function addUserNode(input: AddNodeInput): Promise<EduExtNode | null> {
    const name = input.name.trim();
    if (!name) return null;
    const ref = await currentUserRef();
    if (!ref) return null;
    const current = await loadUserExtensions();
    const node: EduExtNode = {
        id: `ext-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        kind: input.kind,
        name,
        blurb: input.blurb?.trim() || undefined,
        parentId: input.parentId,
        custom: true,
        createdAt: new Date().toISOString(),
    };
    const next = [...current, node];
    const saved = await setEntityState<EduExtNode[]>(ref, EXT_KEY, next);
    return saved ? node : null;
}

/** Elimina una extensión propia (y cualquier hijo directo, para no dejar huérfanos). */
export async function removeUserNode(id: string): Promise<boolean> {
    const ref = await currentUserRef();
    if (!ref) return false;
    const current = await loadUserExtensions();
    const next = current.filter((it) => it.id !== id && it.parentId !== id);
    const saved = await setEntityState<EduExtNode[]>(ref, EXT_KEY, next);
    return !!saved;
}

// ─────────────────────────────────────────────────────────────────────────
// Construcción del árbol (genérico: sirve para builtin, para builtin+ext, o
// para cualquier lista plana de EduNode con parentId).
// ─────────────────────────────────────────────────────────────────────────

export function buildForest(nodes: EduNode[]): EduTreeNode[] {
    const byId = new Map<string, EduTreeNode>();
    for (const nd of nodes) byId.set(nd.id, { ...nd, depth: 0, children: [] });

    const roots: EduTreeNode[] = [];
    for (const nd of byId.values()) {
        const parent = nd.parentId ? byId.get(nd.parentId) : undefined;
        if (parent) parent.children.push(nd);
        else roots.push(nd);
    }

    const assignDepth = (list: EduTreeNode[], depth: number) => {
        for (const it of list) {
            it.depth = depth;
            assignDepth(it.children, depth + 1);
        }
    };
    assignDepth(roots, 0);

    const sortRec = (list: EduTreeNode[]) => {
        list.sort((a, b) => a.name.localeCompare(b.name, "es"));
        list.forEach((l) => sortRec(l.children));
    };
    sortRec(roots);

    return roots;
}

export function flattenTree(roots: EduTreeNode[]): EduTreeNode[] {
    const out: EduTreeNode[] = [];
    const walk = (list: EduTreeNode[]) => {
        for (const it of list) {
            out.push(it);
            walk(it.children);
        }
    };
    walk(roots);
    return out;
}

/** Camino raíz→nodo (breadcrumb) por id. */
export function nodePath(nodeId: string, byId: Map<string, EduNode>): EduNode[] {
    const path: EduNode[] = [];
    let cur = byId.get(nodeId);
    const guard = new Set<string>();
    while (cur && !guard.has(cur.id)) {
        path.unshift(cur);
        guard.add(cur.id);
        cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    return path;
}

export function rootIdOf(nodeId: string, byId: Map<string, EduNode>): string {
    const path = nodePath(nodeId, byId);
    return path[0]?.id ?? nodeId;
}

// ─────────────────────────────────────────────────────────────────────────
// Contenido vinculado + "actividad" (datos reales, no inventados)
// ─────────────────────────────────────────────────────────────────────────

function norm(s: string): string {
    return s.trim().toLowerCase();
}

export interface LinkedContent {
    courses: Course[];
    articles: Article[];
}

/** Publicaciones (cursos/artículos) cuyo `tags` incluye el nombre del nodo (convención ya usada en la página de Educación). */
export function contentForNode(name: string): LinkedContent {
    const key = norm(name);
    return {
        courses: courses.filter((c) => c.tags.some((t) => norm(t) === key)),
        articles: articles.filter((a) => a.tags.some((t) => norm(t) === key)),
    };
}

export function directActivity(name: string): number {
    const linked = contentForNode(name);
    return linked.courses.length + linked.articles.length;
}

/** Actividad acumulada de un nodo + todos sus descendientes (para el tamaño en el grafo). */
export function subtreeActivity(node: EduTreeNode): number {
    let total = directActivity(node.name);
    for (const ch of node.children) total += subtreeActivity(ch);
    return total;
}

export function searchNodes(query: string, nodes: EduNode[]): EduNode[] {
    const q = norm(query);
    if (!q) return [];
    return nodes.filter((it) => norm(it.name).includes(q) || (it.blurb ? norm(it.blurb).includes(q) : false));
}

// ─────────────────────────────────────────────────────────────────────────
// API de alto nivel
// ─────────────────────────────────────────────────────────────────────────

export interface CurriculumData {
    /** builtin + extensiones personales (si hay sesión), aplanado. */
    nodes: EduNode[];
    tree: EduTreeNode[];
    flat: EduTreeNode[];
    byId: Map<string, EduNode>;
}

/** Catálogo completo para la vista personal (Mapa del Conocimiento): builtin + mis extensiones. */
export async function loadCurriculum(): Promise<CurriculumData> {
    const ext = await loadUserExtensions();
    const nodes = [...BUILTIN_NODES, ...ext];
    const tree = buildForest(nodes);
    const flat = flattenTree(tree);
    const byId = new Map<string, EduNode>(nodes.map((it) => [it.id, it]));
    return { nodes, tree, flat, byId };
}

/** Sólo el catálogo builtin (universal) — para vincular temas a un GRUPO/PÁGINA, siempre resoluble por cualquier miembro. */
export function builtinTree(): EduTreeNode[] {
    return buildForest(BUILTIN_NODES);
}
export function builtinFlat(): EduTreeNode[] {
    return flattenTree(builtinTree());
}
export function builtinById(): Map<string, EduNode> {
    return new Map(BUILTIN_NODES.map((it) => [it.id, it]));
}
