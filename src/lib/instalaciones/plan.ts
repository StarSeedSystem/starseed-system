/**
 * Plan de instalación (PURO): de «qué marcó la persona en el diálogo» a
 * «qué destinos se guardan y qué acciones se ejecutan».
 *
 * Se separa del diálogo por dos motivos: el diálogo y el aviso de «otra neurona pidió
 * instalar esto aquí» deben seguir EXACTAMENTE el mismo camino, y esa lógica tiene que
 * poder probarse sin navegador.
 *
 * Reglas (honestas con lo que un navegador puede hacer):
 *   · Web → queda en la Biblioteca de la cuenta; no descarga nada.
 *   · Este dispositivo con instalador para su sistema → se descarga el instalador. El
 *     navegador lo guarda en SU carpeta de Descargas: las descargas de GitHub no admiten
 *     CORS (intercambio entre dominios), así que una web no puede leer los bytes para
 *     escribirlos en otra carpeta. La carpeta de la biblioteca elegida solo se anota como
 *     el sitio al que moverlo.
 *   · Este dispositivo sin instalador (o app sin releases) → se añade a su Lanzador y se
 *     usa desde la web.
 *   · Otras neuronas → quedan «pedidas»: nada se instala en un dispositivo sin que alguien
 *     lo acepte en ESE dispositivo.
 */

import { APPS_OFICIALES, type AssetClasificado } from "@/lib/apps-oficiales/apps-oficiales";
import { STARSEED_APP_LISTINGS, type StarSeedAppListing } from "@/data/starseed-apps-listings";

import { nuevoIdDestino, type DestinoInstalacion, type EstadoDestino, type MedioInstalacion } from "./destinos";

export const CARPETA_DESCARGAS = "Descargas del navegador";

/** Lo mínimo que el diálogo necesita saber de una app para instalarla. */
export interface AppParaInstalar {
    /** Id del listado (el mismo que usan los destinos y «Mis apps»). */
    id: string;
    nombre: string;
    /** Web oficial o pública (versión en línea). */
    web?: string;
    /** Ruta interna del OS, si vive dentro. */
    ruta?: string;
    /** Clave en APPS_OFICIALES si publica releases con instaladores. */
    oficialId?: string;
}

export function appDesdeListing(l: StarSeedAppListing): AppParaInstalar {
    const oficial = APPS_OFICIALES[l.id];
    return {
        id: l.id,
        nombre: oficial?.nombre ?? l.name,
        web: oficial?.web ?? l.web,
        ruta: l.route,
        oficialId: oficial?.id,
    };
}

/** Resuelve una app por id (listados de la Librería primero, luego apps oficiales). */
export function appPorId(id: string): AppParaInstalar | null {
    const l = STARSEED_APP_LISTINGS.find((x) => x.id === id);
    if (l) return appDesdeListing(l);
    const o = APPS_OFICIALES[id];
    return o ? { id: o.id, nombre: o.nombre, web: o.web, oficialId: o.id } : null;
}

export interface NeuronaBreve {
    id: string;
    /** "" si aún no se conoce (el id basta para guardar el destino). */
    nombre: string;
}

export interface SeleccionInstalacion {
    web: boolean;
    esteDispositivo: boolean;
    /** Ids de otras neuronas de la cuenta. */
    otrasNeuronas: readonly string[];
    /** null = biblioteca de la cuenta. */
    perfil: { id: string; nombre: string } | null;
    /** Nombre de la carpeta de la biblioteca elegida en este dispositivo (solo se anota). */
    carpetaBiblioteca?: string | null;
}

export interface ContextoPlan {
    estaNeurona: NeuronaBreve | null;
    /** Neuronas de la cuenta (para los nombres). */
    neuronas: readonly NeuronaBreve[];
    /** Mejor instalador para ESTE dispositivo, si la app lo publica. */
    instalable: AssetClasificado | null;
    /** Tag del release (p. ej. «v2.0.0»). */
    version?: string;
    /** Dentro de la app nativa (Tauri) la descarga se abre en una ventana. */
    esNativa?: boolean;
    /** Destinos ya guardados: se actualizan en vez de duplicarse. */
    existentes?: readonly DestinoInstalacion[];
    ahora?: number;
    nuevoId?: () => string;
}

export type AccionInstalacion =
    | { tipo: "guardar-biblioteca"; url: string }
    | { tipo: "anadir-lanzador" }
    | { tipo: "descargar"; url: string; archivo: string; via: "enlace" | "ventana" }
    | { tipo: "avisar-neuronas"; neuronaIds: string[] };

export interface PlanInstalacion {
    destinos: DestinoInstalacion[];
    acciones: AccionInstalacion[];
    resumen: string;
    vacio: boolean;
}

function claveDestino(d: Pick<DestinoInstalacion, "appId" | "tipo" | "neuronaId" | "perfilId">): string {
    return `${d.appId}|${d.tipo}|${d.neuronaId ?? ""}|${d.perfilId ?? ""}`;
}

/** Dirección con la que la Biblioteca abre la app: dentro del OS si puede, si no su web. */
export function urlDeApertura(app: AppParaInstalar): string {
    return app.ruta || app.web || `starseed://app/${app.id}`;
}

/** Qué hacer en ESTE dispositivo (lo comparten el diálogo y el aviso de pedidos). */
export function accionesEsteDispositivo(
    instalable: AssetClasificado | null,
    esNativa = false,
): { acciones: AccionInstalacion[]; estado: EstadoDestino; medio: MedioInstalacion; archivo?: string } {
    if (instalable) {
        return {
            acciones: [
                { tipo: "descargar", url: instalable.url, archivo: instalable.nombre, via: esNativa ? "ventana" : "enlace" },
                { tipo: "anadir-lanzador" },
            ],
            estado: "descargada",
            medio: "descarga",
            archivo: instalable.nombre,
        };
    }
    return { acciones: [{ tipo: "anadir-lanzador" }], estado: "instalada", medio: "web" };
}

function carpetaTexto(carpetaBiblioteca?: string | null): string {
    return carpetaBiblioteca ? `${CARPETA_DESCARGAS} (para mover a «${carpetaBiblioteca}»)` : CARPETA_DESCARGAS;
}

/** «Se instalará en: web · este dispositivo (MacBook) · Móvil de Ana · perfil Arte». */
export function resumenSeleccion(sel: SeleccionInstalacion, ctx: Pick<ContextoPlan, "estaNeurona" | "neuronas">): string {
    const partes: string[] = [];
    if (sel.web) partes.push("web");
    if (sel.esteDispositivo) partes.push(ctx.estaNeurona?.nombre ? `este dispositivo (${ctx.estaNeurona.nombre})` : "este dispositivo");
    for (const id of sel.otrasNeuronas) {
        partes.push(ctx.neuronas.find((n) => n.id === id)?.nombre ?? "otra neurona");
    }
    if (!partes.length) return "Elige al menos un sitio donde instalarla.";
    partes.push(sel.perfil ? `perfil ${sel.perfil.nombre}` : "biblioteca de la cuenta");
    return `Se instalará en: ${partes.join(" · ")}`;
}

export function planInstalacion(app: AppParaInstalar, sel: SeleccionInstalacion, ctx: ContextoPlan): PlanInstalacion {
    const ahora = ctx.ahora ?? Date.now();
    const nuevoId = ctx.nuevoId ?? (() => nuevoIdDestino(ahora));
    const existentes = new Map((ctx.existentes ?? []).map((d) => [claveDestino(d), d]));
    const perfilId = sel.perfil?.id ?? null;
    const perfilNombre = sel.perfil?.nombre ?? null;
    const destinos: DestinoInstalacion[] = [];
    const acciones: AccionInstalacion[] = [];

    const crear = (parcial: Omit<DestinoInstalacion, "id" | "appId" | "appNombre" | "perfilId" | "perfilNombre" | "creada" | "actualizada">): void => {
        const base = { appId: app.id, tipo: parcial.tipo, neuronaId: parcial.neuronaId, perfilId };
        const previo = existentes.get(claveDestino(base));
        destinos.push({
            ...parcial,
            id: previo?.id ?? nuevoId(),
            appId: app.id,
            appNombre: app.nombre,
            perfilId,
            perfilNombre,
            creada: previo?.creada ?? ahora,
            // Siempre por delante de la versión guardada: la fusión se queda con la más reciente.
            actualizada: Math.max(ahora, (previo?.actualizada ?? 0) + 1),
        });
    };

    if (sel.web) {
        crear({ tipo: "web", estado: "instalada", medio: "web", version: ctx.version });
        acciones.push({ tipo: "guardar-biblioteca", url: urlDeApertura(app) });
    }

    if (sel.esteDispositivo) {
        const aqui = accionesEsteDispositivo(ctx.instalable, ctx.esNativa);
        acciones.push(...aqui.acciones);
        if (ctx.estaNeurona) {
            crear({
                tipo: "neurona",
                neuronaId: ctx.estaNeurona.id,
                neuronaNombre: ctx.estaNeurona.nombre || undefined,
                estado: aqui.estado,
                medio: aqui.medio,
                archivo: aqui.archivo,
                version: ctx.version,
                carpeta: aqui.archivo ? carpetaTexto(sel.carpetaBiblioteca) : undefined,
            });
        }
    }

    const otras = sel.otrasNeuronas.filter((id) => id && id !== ctx.estaNeurona?.id);
    for (const id of otras) {
        crear({
            tipo: "neurona",
            neuronaId: id,
            neuronaNombre: ctx.neuronas.find((n) => n.id === id)?.nombre ?? "Otra neurona",
            estado: "pedida",
            version: ctx.version,
            pedidaDesde: ctx.estaNeurona?.nombre || undefined,
        });
    }
    if (otras.length) acciones.push({ tipo: "avisar-neuronas", neuronaIds: otras });

    return {
        destinos,
        acciones,
        resumen: resumenSeleccion({ ...sel, otrasNeuronas: otras }, ctx),
        vacio: destinos.length === 0 && acciones.length === 0,
    };
}

/** Aceptar aquí una instalación pedida desde otra neurona: mismo camino que «Este dispositivo». */
export function planAceptarPedido(
    d: DestinoInstalacion,
    instalable: AssetClasificado | null,
    opciones: { version?: string; esNativa?: boolean } = {},
): { estado: EstadoDestino; extra: Partial<DestinoInstalacion>; acciones: AccionInstalacion[] } {
    const aqui = accionesEsteDispositivo(instalable, opciones.esNativa);
    return {
        estado: aqui.estado,
        acciones: aqui.acciones,
        extra: {
            medio: aqui.medio,
            archivo: aqui.archivo,
            version: opciones.version ?? d.version,
            carpeta: aqui.archivo ? CARPETA_DESCARGAS : undefined,
        },
    };
}

/** «en línea», «visto hace 5 min», «visto hace 3 h», «visto hace 2 días», «sin datos». */
export function vistoHace(iso: string | undefined, enLinea: boolean | undefined, ahora = Date.now()): string {
    if (enLinea) return "en línea";
    const t = iso ? Date.parse(iso) : Number.NaN;
    if (!Number.isFinite(t)) return "sin datos de conexión";
    const min = Math.max(0, Math.round((ahora - t) / 60_000));
    if (min < 1) return "visto hace un momento";
    if (min < 60) return `visto hace ${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `visto hace ${h} h`;
    const dias = Math.round(h / 24);
    return `visto hace ${dias} ${dias === 1 ? "día" : "días"}`;
}
