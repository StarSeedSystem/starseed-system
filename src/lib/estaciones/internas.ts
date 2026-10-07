/**
 * Estaciones internas: lo que ya vive en el OS (servidores de apps públicos, dashboards
 * compartidos y juegos en vivo) expuesto como estaciones de SOLO LECTURA.
 * Nunca lanza: cada fuente que falla se salta. No se guardan en `os_estaciones`.
 */
import type { Estacion, TipoEstacion } from "./tipos";
import { detectarFormato } from "./formato";
import type { AppServerSummary } from "@/lib/servers/app-servers";
import type { ResumenEspacio } from "@/lib/vivo/tabla/espacio";

export interface DepsEstacionesInternas {
    listServers?: (scope: "public") => Promise<AppServerSummary[]>;
    listarDashboardsVivos?: () => Promise<ResumenEspacio[]>;
    listarJuegosVivos?: () => Promise<{ refId: string; titulo: string }[]>;
}

/** kind del servidor → tipo de estación. */
export function tipoDeKind(kind: string): TipoEstacion {
    if (kind === "juego") return "juego";
    if (kind === "programa") return "programa";
    if (kind === "entorno") return "xr";
    return "app";
}

function base(id: string, tipo: TipoEstacion, titulo: string, enlace: string): Estacion {
    return {
        id,
        owner_id: "starseed",
        ambito_tipo: "persona",
        entidad_ref: null,
        titulo: titulo.trim() || "Sin título",
        descripcion: "",
        tipo,
        fuente: "starseed",
        enlace,
        formato: detectarFormato(enlace, tipo).formato,
        imagen: null,
        idioma: "es",
        categorias: [],
        licencia: "propia-abierta",
        visibilidad: "publica",
        empieza_en: null,
        termina_en: null,
        ultimo_latido: null,
        pausada: false,
        en_malla: false,
        espectadores: 0,
        created_at: new Date(0).toISOString(),
        updated_at: new Date(0).toISOString(),
    };
}

export function estacionDeServidor(s: AppServerSummary): Estacion {
    const tipo = tipoDeKind(s.kind);
    const enlace = s.appRoute ?? `/servidores-apps?panel=${encodeURIComponent(s.slug)}`;
    const e = base(`interna:servidor:${s.id}`, tipo, s.name, enlace);
    e.descripcion = s.description ?? "";
    e.ultimo_latido = s.createdAt || null;
    e.updated_at = s.createdAt || e.updated_at;
    return e;
}

export function estacionDeDashboard(d: ResumenEspacio): Estacion {
    const enlace = `/dashboard-compartido/${encodeURIComponent(d.refId)}`;
    const e = base(`interna:dashboard:${d.refId}`, "dashboard", d.titulo, enlace);
    e.ultimo_latido = d.actualizado || null;
    e.updated_at = d.actualizado || e.updated_at;
    return e;
}

export function estacionDeJuego(j: { refId: string; titulo: string }): Estacion {
    const enlace = `/juego/${encodeURIComponent(j.refId)}`;
    return base(`interna:juego:${j.refId}`, "juego", j.titulo, enlace);
}

/** Carga perezosa de las fuentes reales: cada una que falte se salta. */
async function depsReales(): Promise<Required<DepsEstacionesInternas>> {
    const [servers, dashboard, juegos] = await Promise.all([
        import("@/lib/servers/app-servers").catch(() => null),
        import("@/lib/vivo/dashboard").catch(() => null),
        import("@/lib/vivo/juegos/espacio-vivo").catch(() => null),
    ]);
    return {
        listServers: servers ? servers.listServers : async () => [],
        listarDashboardsVivos: dashboard ? dashboard.listarDashboardsVivos : async () => [],
        listarJuegosVivos: juegos ? async () => juegos.listarEspaciosVivos("juego") : async () => [],
    };
}

/** Estaciones internas vivas del OS. Nunca lanza; cada fuente que falla se salta. */
export async function estacionesInternas(deps: DepsEstacionesInternas = {}): Promise<Estacion[]> {
    const reales =
        deps.listServers && deps.listarDashboardsVivos && deps.listarJuegosVivos
            ? null
            : await depsReales();
    const d: Required<DepsEstacionesInternas> = {
        listServers: deps.listServers ?? reales!.listServers,
        listarDashboardsVivos: deps.listarDashboardsVivos ?? reales!.listarDashboardsVivos,
        listarJuegosVivos: deps.listarJuegosVivos ?? reales!.listarJuegosVivos,
    };
    const [servidores, dashboards, juegos] = await Promise.all([
        d.listServers("public").catch(() => [] as AppServerSummary[]),
        d.listarDashboardsVivos().catch(() => [] as ResumenEspacio[]),
        d.listarJuegosVivos().catch(() => [] as { refId: string; titulo: string }[]),
    ]);
    const out: Estacion[] = [];
    for (const s of servidores) out.push(estacionDeServidor(s));
    for (const g of dashboards) out.push(estacionDeDashboard(g));
    for (const j of juegos) out.push(estacionDeJuego(j));
    return out;
}
