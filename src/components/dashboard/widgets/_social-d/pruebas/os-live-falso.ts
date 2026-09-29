/**
 * os-live de mentira para las pruebas del paquete D: filas en memoria, sin red ni realtime.
 * Se usa con `vi.mock("@/lib/widget-data/os-live", () => osLiveFalso(estado))`.
 */
import type { OsGroupRow, OsMembershipRow, OsPageRow, OsPostRow, OsEventRow } from "@/lib/widget-data/os-live";

export interface EstadoOsLive {
    uid: string | null;
    paginas: OsPageRow[];
    grupos: OsGroupRow[];
    posts: OsPostRow[];
    eventos: OsEventRow[];
    membresias: OsMembershipRow[];
    cargando: boolean;
    propias: Record<string, unknown[]>;
}

export function estadoOsLive(): EstadoOsLive {
    return { uid: "yo", paginas: [], grupos: [], posts: [], eventos: [], membresias: [], cargando: false, propias: {} };
}

export function osLiveFalso(e: EstadoOsLive) {
    const filas = <T,>(rows: T[]) => ({ rows, loading: e.cargando, reload: async () => undefined });
    const propias = (tabla: string) => ({
        rows: (e.propias[tabla] ?? []) as never[],
        loading: e.cargando,
        authPending: false,
        needsAuth: e.uid === null,
        reload: async () => undefined,
    });
    return {
        useCurrentUid: () => ({ uid: e.uid, ready: true }),
        useLivePages: () => filas(e.paginas),
        useLiveGroups: () => filas(e.grupos),
        useLivePosts: () => filas(e.posts),
        useLiveEvents: () => filas(e.eventos),
        useMyMemberships: () => filas(e.membresias),
        useMyBrains: () => propias("brains"),
        useMyVaults: () => propias("vaults"),
        useMyMemories: () => propias("memories"),
        useMyDocuments: () => propias("documents"),
        useMyConversations: () => propias("conversations"),
        tsOf: (iso: string | null | undefined) => (iso ? Date.parse(iso) || 0 : 0),
        isUpcoming: (iso: string | null | undefined) => !!iso && Date.parse(iso) >= Date.now(),
        rowAccent: (a: string | null | undefined) => a || "#7FB8FF",
    };
}

export function pagina(slug: string, extra: Partial<OsPageRow> = {}): OsPageRow {
    return {
        id: `id-${slug}`, slug, name: slug.replace(/-/g, " "), kind: "comunidad", description: `Comunidad ${slug}`, tags: [],
        accent: "#10b981", avatar_url: null, cover_url: null, member_count: 12, owner_id: "otra", created_at: "2026-01-01T00:00:00Z", ...extra,
    };
}

export function grupo(slug: string, extra: Partial<OsGroupRow> = {}): OsGroupRow {
    return {
        id: `id-${slug}`, slug, name: slug.replace(/-/g, " "), kind: "circulo", description: `Grupo ${slug}`, tags: [],
        accent: "#6366f1", avatar_url: null, cover_url: null, member_count: 5, owner_id: "otra", created_at: "2026-01-01T00:00:00Z", ...extra,
    };
}
