/**
 * Cristalería de Mérito · piezas PURAS (Ola 0929-C).
 *
 * Las insignias son las REALES del ecosistema (`badges`) y las tuyas son las otorgadas a tu
 * perfil (`profile_badges`), igual que en la página Insignias (`src/lib/badges/badges.ts`). Nada
 * de puntuaciones de «confianza» o «huella» inventadas: el mérito es lo verificable.
 */

export interface Insignia {
    id: string;
    code: string;
    nombre: string;
    descripcion: string | null;
    area: "general" | "politica" | "educacion" | "cultura";
    /** ISO de cuándo te la otorgaron (null = aún no es tuya). */
    ganada: string | null;
    /** true = la avaló otra persona (mérito), false = la ganaste haciendo. */
    avalada: boolean;
}

export const AREAS: Record<Insignia["area"], { nombre: string; color: string }> = {
    politica: { nombre: "Política", color: "#DC143C" },
    educacion: { nombre: "Educación", color: "#007FFF" },
    cultura: { nombre: "Cultura", color: "#B24BF3" },
    general: { nombre: "General", color: "#10B981" },
};

function area(v: unknown): Insignia["area"] {
    return v === "politica" || v === "educacion" || v === "cultura" ? v : "general";
}

/** Cómo se gana cada insignia conocida y dónde se hace (las demás, en la página Insignias). */
export const COMO_GANAR: Record<string, { como: string; ruta: string; boton: string }> = {
    verified: { como: "Verifica la identidad soberana de tu cuenta.", ruta: "/cuenta?section=seguridad", boton: "Ir a Seguridad" },
    creator: { como: "Publica un recurso o una creación en la Tienda.", ruta: "/store", boton: "Ir a la Tienda" },
    builder: { como: "Despliega una app o un cerebro en la red.", ruta: "/cerebro", boton: "Ir a Cerebro" },
    scholar: { como: "Contribuye conocimiento (artículos, cursos, wiki); la comunidad lo avala.", ruta: "/network/education", boton: "Ir a Educación" },
    legislator: { como: "Impulsa una propuesta hasta que sea norma; la comunidad lo avala.", ruta: "/decisiones", boton: "Ir a Decisiones" },
    mediator: { como: "Media en un conflicto en un Círculo de Paz; la comunidad lo avala.", ruta: "/network/politics", boton: "Ir a Política" },
    exam_passed: { como: "Aprueba un examen de un curso.", ruta: "/network/education", boton: "Ir a Educación" },
};

/**
 * Catálogo + las tuyas → la cristalería: primero las ganadas (la más reciente antes), luego
 * las pendientes por área y nombre. Una insignia tuya que no esté en el catálogo también entra.
 */
export function cristaleria(
    catalogo: Array<Record<string, any>>,
    mias: Array<{ awarded_at?: string | null; awarded_by?: string | null; badge?: Record<string, any> | null }>,
    uid: string | null,
): Insignia[] {
    const por = new Map<string, Insignia>();
    for (const b of catalogo) {
        if (!b || typeof b.id !== "string") continue;
        por.set(b.id, { id: b.id, code: String(b.code ?? ""), nombre: String(b.name ?? b.code ?? "Insignia"), descripcion: typeof b.description === "string" ? b.description : null, area: area(b.area), ganada: null, avalada: false });
    }
    for (const m of mias) {
        const b = m?.badge;
        if (!b || typeof b.id !== "string") continue;
        const base = por.get(b.id) ?? { id: b.id, code: String(b.code ?? ""), nombre: String(b.name ?? "Insignia"), descripcion: typeof b.description === "string" ? b.description : null, area: area(b.area), ganada: null, avalada: false };
        por.set(b.id, { ...base, ganada: m.awarded_at ?? new Date(0).toISOString(), avalada: !!m.awarded_by && m.awarded_by !== uid });
    }
    const orden: Record<Insignia["area"], number> = { politica: 0, educacion: 1, cultura: 2, general: 3 };
    return [...por.values()].sort((a, b) =>
        Number(!!b.ganada) - Number(!!a.ganada)
        || (a.ganada && b.ganada ? Date.parse(b.ganada) - Date.parse(a.ganada) : 0)
        || orden[a.area] - orden[b.area]
        || a.nombre.localeCompare(b.nombre, "es"));
}

/** La siguiente a ganar: la primera pendiente que tenga camino conocido. */
export function siguiente(cs: Insignia[]): Insignia | null {
    return cs.find((c) => !c.ganada && COMO_GANAR[c.code]) ?? cs.find((c) => !c.ganada) ?? null;
}

/** Vértices de un cristal hexagonal (punta arriba) centrado en (cx, cy). */
export function hexagono(cx: number, cy: number, r: number): string {
    return Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 2;
        return `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
    }).join(" ");
}
