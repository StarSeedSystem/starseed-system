/**
 * Lente de Serendipia · lógica PURA (Ola 0929-C).
 *
 * Cada día la lente elige UN hallazgo real del propio OS: una app del catálogo del lanzador o un
 * paquete de la Biblioteca (apps, widgets, diseños, fuentes de IA, funciones…). La «rareza»
 * decide cuánto se aleja de lo que ya usas: «cercano» prefiere lo que comparte etiquetas con tus
 * paquetes instalados; «inesperado», lo que no se parece a nada tuyo. Lo que marcas como «ya lo
 * conozco» no vuelve a salir.
 */

export type OrigenHallazgo = "app" | "paquete";

export interface Hallazgo {
    id: string;
    origen: OrigenHallazgo;
    /** Tipo legible («App», «Widget», «Diseño», «Fuente de IA»…). */
    tipo: string;
    titulo: string;
    descripcion: string;
    /** Ruta interna o URL externa (null = abrir en la Biblioteca). */
    href: string | null;
    externo: boolean;
    /** Nombre del icono lucide (se resuelve en la UI). */
    icono: string;
    color: string;
    etiquetas: string[];
}

export const TIPO_PAQUETE: Record<string, string> = {
    app: "App", widget: "Widget", page: "Página", publication: "Publicación", board: "Pizarra", research: "Investigación",
    project: "Proyecto", design: "Diseño", animation: "Animación", function: "Habilidad", "ai-source": "Fuente de IA", repo: "Repositorio", agent: "Agente",
};

/** Paleta por tipo (armónica con los acentos de familia del marco). */
const COLOR_TIPO: Record<string, string> = {
    App: "#39ff14", Widget: "#22d3ee", Diseño: "#f472b6", Animación: "#f472b6", Habilidad: "#fbbf24", "Fuente de IA": "#22d3ee",
    Agente: "#b69cff", Repositorio: "#94a3b8", Pizarra: "#fb923c", Investigación: "#7c5cff", Proyecto: "#fb923c", Página: "#10b981", Publicación: "#10b981",
};

export function colorTipo(tipo: string): string {
    return COLOR_TIPO[tipo] ?? "#fb923c";
}

export interface PaqueteMin {
    id: string; kind: string; name: string; description: string; icon: string; tags: string[]; payload: Record<string, unknown>; comingSoon?: boolean;
}

export function desdePaquete(p: PaqueteMin): Hallazgo | null {
    if (p.comingSoon) return null;
    const ruta = typeof p.payload?.route === "string" ? (p.payload.route as string) : null;
    const url = typeof p.payload?.url === "string" ? (p.payload.url as string) : typeof p.payload?.repo === "string" ? (p.payload.repo as string) : null;
    const tipo = TIPO_PAQUETE[p.kind] ?? "Paquete";
    return {
        id: `pkg:${p.id}`, origen: "paquete", tipo, titulo: p.name, descripcion: p.description,
        href: ruta ?? (url && /^https:\/\//.test(url) ? url : null), externo: !ruta && !!url && /^https:\/\//.test(url),
        icono: p.icon || "Package", color: colorTipo(tipo), etiquetas: (p.tags ?? []).map((t) => t.toLowerCase()),
    };
}

export interface AppMin { id: string; name: string; description: string; accent: string; category: string; open: { primary: string; route?: string; href?: string }; status?: string }

export function desdeApp(a: AppMin, icono: string): Hallazgo | null {
    if (a.status === "soon" || a.status === "coming-soon") return null;
    const href = a.open.route ?? a.open.href ?? null;
    return {
        id: `app:${a.id}`, origen: "app", tipo: "App", titulo: a.name, descripcion: a.description,
        href, externo: !a.open.route && !!a.open.href, icono, color: /^#/.test(a.accent) ? a.accent : colorTipo("App"), etiquetas: [a.category, a.id],
    };
}

/** Afinidad 0-1: etiquetas en común con lo que ya tienes instalado. */
export function afinidad(h: Hallazgo, mias: Set<string>): number {
    if (!mias.size || !h.etiquetas.length) return 0;
    const comunes = h.etiquetas.filter((e) => mias.has(e)).length;
    return Math.min(1, comunes / Math.min(3, h.etiquetas.length));
}

function azar(semilla: number): () => number {
    let s = Math.abs(Math.floor(semilla)) % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/**
 * El hallazgo del día. `rareza` 0 = cercano, 1 = inesperado. Se ordena por distancia a la
 * afinidad buscada y se elige, de forma determinista por día y vuelta, entre los 8 mejores.
 */
export function elegirHallazgo(todos: Hallazgo[], dia: number, vuelta: number, vistos: Set<string>, rareza: number, mias: Set<string>): Hallazgo | null {
    const candidatos = todos.filter((h) => !vistos.has(h.id));
    if (!candidatos.length) return null;
    const objetivo = 1 - Math.max(0, Math.min(1, rareza));
    const r = azar(dia * 31337 + vuelta * 7919 + Math.round(rareza * 10));
    const orden = candidatos
        .map((h) => ({ h, d: Math.abs(afinidad(h, mias) - objetivo) + r() * 0.35 }))
        .sort((a, b) => a.d - b.d);
    const top = orden.slice(0, Math.min(8, orden.length));
    return top[Math.floor(r() * top.length)].h;
}

export const RAREZAS = [
    { valor: 0, texto: "Cercano" },
    { valor: 0.5, texto: "Equilibrado" },
    { valor: 1, texto: "Inesperado" },
] as const;
