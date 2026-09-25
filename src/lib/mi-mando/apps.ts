/**
 * Mi Puente de Mando — «Mis apps» (PURO).
 * ─────────────────────────────────────────────────────────────────────────────
 * Las apps de una persona se guardan hoy en TRES sitios, cada uno con su
 * historia:
 *   · Lanzador (`starseed.apps.installed`): id + nombre, sin dirección.
 *   · Biblioteca (`starseed.library.saved`, tipo «app»): lo que se instala desde
 *     Explorar; aquí sí está la ruta o la web para abrirla.
 *   · Destinos de instalación (`starseed.instalaciones.v1`): EN QUÉ SITIOS vive
 *     cada app (web, este dispositivo, otra neurona, un perfil).
 * Este módulo los junta en una sola lista, sin duplicados, con la forma segura
 * de abrir cada app y la lista de sitios donde está. No inventa nada: si una
 * app no guarda dirección, no se ofrece «Abrir».
 */

import type { InstalledApp, SavedResource } from "@/lib/library-store";
import type { DestinoInstalacion } from "@/lib/instalaciones/destinos";

/** Prefijo con el que la Biblioteca guarda las apps de Explorar. */
const PREFIJO_APP_BIBLIOTECA = "ss-app-";

export type Apertura =
    | { tipo: "ruta"; destino: string }
    | { tipo: "web"; destino: string };

export type OrigenApp = "biblioteca" | "lanzador" | "instalacion";

export interface AppMia {
    /** Id principal (el primero que se encontró). */
    id: string;
    nombre: string;
    /** Cómo abrirla, o null si no hay dirección guardada. */
    apertura: Apertura | null;
    /** De qué almacenes viene (para poder quitarla de todos). */
    origenes: OrigenApp[];
    /** Ids del recurso en la Biblioteca (para quitarla). */
    idsBiblioteca: string[];
    /** Ids en el Lanzador (para quitarla). */
    idsLanzador: string[];
    /** Sitios donde vive (sin cancelados). */
    destinos: DestinoInstalacion[];
    /** Última vez que se instaló o tocó (epoch ms), para ordenar. */
    reciente: number;
}

/**
 * Decide cómo abrir una dirección guardada, o null si no es segura:
 *   · ruta interna del OS: empieza por «/» pero no por «//» (eso saldría a otro dominio);
 *   · web: solo http(s). Cualquier otro esquema (javascript:, data:, starseed://) no se abre.
 */
export function resolverApertura(url: string | undefined | null): Apertura | null {
    if (!url) return null;
    const u = url.trim();
    if (!u) return null;
    if (u.startsWith("/") && !u.startsWith("//") && !u.startsWith("/\\")) return { tipo: "ruta", destino: u };
    try {
        const parsed = new URL(u);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") return { tipo: "web", destino: parsed.toString() };
    } catch {
        return null;
    }
    return null;
}

/** Clave común para reconocer la misma app en los tres almacenes. */
export function claveApp(id: string): string {
    const limpio = id.trim().toLowerCase();
    return limpio.startsWith(PREFIJO_APP_BIBLIOTECA) ? limpio.slice(PREFIJO_APP_BIBLIOTECA.length) : limpio;
}

function nuevaApp(id: string, nombre: string): AppMia {
    return { id, nombre, apertura: null, origenes: [], idsBiblioteca: [], idsLanzador: [], destinos: [], reciente: 0 };
}

function anotarOrigen(app: AppMia, origen: OrigenApp): void {
    if (!app.origenes.includes(origen)) app.origenes.push(origen);
}

/** Junta las tres fuentes en una lista única, más recientes primero. */
export function combinarApps(
    guardados: readonly SavedResource[],
    lanzador: readonly InstalledApp[],
    destinos: readonly DestinoInstalacion[],
): AppMia[] {
    const porClave = new Map<string, AppMia>();
    const obtener = (id: string, nombre: string): AppMia => {
        const k = claveApp(id);
        let app = porClave.get(k);
        if (!app) {
            app = nuevaApp(id, nombre);
            porClave.set(k, app);
        }
        return app;
    };

    for (const r of guardados) {
        if (r.kind !== "app" || !r.id) continue;
        const app = obtener(r.id, r.title);
        anotarOrigen(app, "biblioteca");
        app.idsBiblioteca.push(r.id);
        app.apertura = app.apertura ?? resolverApertura(r.url);
        app.reciente = Math.max(app.reciente, r.savedAt || 0);
    }
    for (const a of lanzador) {
        if (!a.id) continue;
        const app = obtener(a.id, a.name);
        anotarOrigen(app, "lanzador");
        app.idsLanzador.push(a.id);
        app.reciente = Math.max(app.reciente, a.installedAt || 0);
    }
    for (const d of destinos) {
        if (d.estado === "cancelada" || !d.appId) continue;
        const app = obtener(d.appId, d.appNombre);
        anotarOrigen(app, "instalacion");
        app.destinos.push(d);
        app.reciente = Math.max(app.reciente, d.actualizada || 0);
    }

    return [...porClave.values()].sort((a, b) => b.reciente - a.reciente || a.nombre.localeCompare(b.nombre));
}

export interface ResumenApps {
    apps: number;
    /** Sitios distintos donde vive al menos una app (web, cada neurona). */
    sitios: number;
}

/** «3 apps en 2 sitios». Cuenta la web y cada neurona como un sitio. */
export function resumenApps(apps: readonly AppMia[]): ResumenApps {
    const sitios = new Set<string>();
    for (const a of apps) {
        for (const d of a.destinos) {
            if (d.estado === "cancelada" || d.estado === "fallida") continue;
            sitios.add(d.tipo === "web" ? "web" : `neurona:${d.neuronaId ?? "?"}`);
        }
    }
    return { apps: apps.length, sitios: sitios.size };
}

export const ETIQUETA_ORIGEN: Record<OrigenApp, string> = {
    biblioteca: "Biblioteca",
    lanzador: "Lanzador",
    instalacion: "Instalación",
};
