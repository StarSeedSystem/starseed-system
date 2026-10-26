/**
 * Biblioteca y Librería para los diseños de iconos (Ola 1025U · V1b) — usa SOLO las vías que ya existen:
 *
 *   · Guardar     → `saveItem` de la Biblioteca de la persona (`type: "file"`, JSON `starseed.iconos`),
 *                   igual que el mezclador de temas y las variaciones públicas.
 *   · Compartir   → `PublishDialog` (la UI) con la categoría «Diseños de iconos» (`iconos`).
 *   · Leer        → los guardados con la etiqueta `starseed-iconos`, y los públicos de `iconos`.
 *
 * Todo lo que se lee (también lo propio, que pudo venir de otra cuenta o de un archivo importado) pasa
 * por `leerPaquete`: ningún diseño llega al dock sin validar.
 */

import {
    libraryRef,
    listLibrary,
    readLibrarySnapshot,
    saveItem,
    type SavedItem,
} from "@/lib/library/entity-library";
import { listPublicItems, type PublicItem } from "@/lib/library/public-catalog";
import type { EntityRef } from "@/lib/sync/entity-state";
import {
    ETIQUETA_BIBLIOTECA,
    MAX_PAQUETE_CARACTERES,
    MIME_PAQUETE,
    empaquetarDiseno,
    empaquetarPlantilla,
    leerPaquete,
    paqueteATexto,
    type PaqueteIconos,
    type TipoPaquete,
} from "./paquete";
import type { DisenoIcono, PlantillaIconos } from "./modelo";

export const CATEGORIA_LIBRERIA = "iconos" as const;

export interface ElementoIconos {
    /** Id del elemento (en la Biblioteca o en la Librería pública). */
    id: string;
    origen: "biblioteca" | "libreria";
    tipo: TipoPaquete;
    nombre: string;
    autor?: string;
    licencia?: string;
    plantilla?: PlantillaIconos;
    diseno?: DisenoIcono;
    /** Cuándo se guardó o publicó (ISO), si se conoce. */
    fecha?: string;
}

export interface ListaElementos {
    elementos: ElementoIconos[];
    /** Elementos con la etiqueta pero cuyo contenido no es un paquete válido (se muestran como aviso, no como error). */
    descartados: number;
    /** `true` si la lista salió de la copia local porque la nube no respondió. */
    soloLocal?: boolean;
}

function titulo(nombre: string, tipo: TipoPaquete): string {
    return `${nombre}.starseed-iconos${tipo === "plantilla" ? "" : "-icono"}.json`;
}

export interface GuardadoOk { ok: true; item: SavedItem }
export interface GuardadoFallo { ok: false; error: string }

/** Un `refId` único por guardado: `saveItem` deduplica por (tipo, refId, ruta, url) y dos diseños no son lo mismo. */
function refIdUnico(): string {
    const azar = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10);
    return `iconos-${Date.now().toString(36)}-${azar}`;
}

/** Guarda un diseño o una plantilla en la Biblioteca de la persona. Devuelve el item listo para publicarlo. */
export async function guardarEnBiblioteca(
    ref: EntityRef,
    contenido: { tipo: "diseno"; diseno: DisenoIcono; nombre: string; autor?: string; licencia?: string } | { tipo: "plantilla"; plantilla: PlantillaIconos },
): Promise<GuardadoOk | GuardadoFallo> {
    const paquete: PaqueteIconos =
        contenido.tipo === "diseno"
            ? empaquetarDiseno(contenido.diseno, new Date(), { autor: contenido.autor, licencia: contenido.licencia })
            : empaquetarPlantilla(contenido.plantilla);
    const nombre = contenido.tipo === "diseno" ? contenido.nombre : contenido.plantilla.nombre;
    const text = paqueteATexto(paquete);
    if (text.length > MAX_PAQUETE_CARACTERES) return { ok: false, error: "Es demasiado grande para guardarlo." };
    const tags = [ETIQUETA_BIBLIOTECA, "dock", contenido.tipo];
    const title = titulo(nombre, contenido.tipo);
    try {
        const res = await saveItem(
            ref,
            { type: "file", refId: refIdUnico(), title, mime: MIME_PAQUETE, language: "json", content: text, tags, description: "Diseño de iconos del dock de StarSeed" },
            null,
        );
        if (!res.ok) return { ok: false, error: "No se pudo guardar en tu Biblioteca." };
        const item: SavedItem = {
            id: res.id, type: "file", title, tags, folderId: null,
            addedAt: new Date().toISOString(), addedBy: "", mime: MIME_PAQUETE, language: "json", content: text,
        };
        return { ok: true, item };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "No se pudo guardar en tu Biblioteca." };
    }
}

function desdeItem(it: SavedItem): ElementoIconos | null {
    if (!it.tags?.includes(ETIQUETA_BIBLIOTECA) || typeof it.content !== "string") return null;
    const l = leerPaquete(it.content);
    if (!l.ok || !l.tipo) return null;
    if (l.tipo === "plantilla" && l.plantilla) {
        return { id: it.id, origen: "biblioteca", tipo: "plantilla", nombre: l.plantilla.nombre, autor: l.plantilla.autor, licencia: l.plantilla.licencia, plantilla: l.plantilla, fecha: it.addedAt };
    }
    if (l.tipo === "diseno" && l.diseno) {
        return { id: it.id, origen: "biblioteca", tipo: "diseno", nombre: l.diseno.nombre ?? it.title.replace(/\.starseed-iconos.*$/, ""), autor: l.autor, licencia: l.licencia, diseno: l.diseno, fecha: it.addedAt };
    }
    return null;
}

/** Lo guardado por la persona. Intenta traer la nube; si no responde, usa la copia local y lo dice. */
export async function listarGuardados(ref: EntityRef): Promise<ListaElementos> {
    let soloLocal = false;
    let doc;
    try { doc = await listLibrary(ref); } catch { soloLocal = true; doc = readLibrarySnapshot(ref); }
    const conEtiqueta = doc.items.filter((it) => it.tags?.includes(ETIQUETA_BIBLIOTECA));
    const elementos: ElementoIconos[] = [];
    let descartados = 0;
    for (const it of conEtiqueta) {
        const e = desdeItem(it);
        if (e) elementos.push(e); else descartados++;
    }
    return { elementos, descartados, ...(soloLocal ? { soloLocal } : {}) };
}

function desdePublico(p: PublicItem): ElementoIconos | null {
    const c = p.payload?.content;
    if (typeof c !== "string" || c.length > MAX_PAQUETE_CARACTERES) return null;
    const l = leerPaquete(c);
    if (!l.ok || !l.tipo) return null;
    if (l.tipo === "plantilla" && l.plantilla) {
        return { id: p.id, origen: "libreria", tipo: "plantilla", nombre: l.plantilla.nombre, autor: l.plantilla.autor, licencia: l.plantilla.licencia, plantilla: l.plantilla, fecha: p.createdAt };
    }
    if (l.tipo === "diseno" && l.diseno) {
        return { id: p.id, origen: "libreria", tipo: "diseno", nombre: l.diseno.nombre ?? p.name.replace(/\.starseed-iconos.*$/, ""), autor: l.autor, licencia: l.licencia, diseno: l.diseno, fecha: p.createdAt };
    }
    return null;
}

/** Lo público de la Librería en «Diseños de iconos». Si la red falla, devuelve vacío (la UI lo cuenta). */
export async function listarPublicos(): Promise<ListaElementos> {
    const filas = await listPublicItems({ category: CATEGORIA_LIBRERIA });
    const elementos: ElementoIconos[] = [];
    let descartados = 0;
    for (const f of filas) {
        const e = desdePublico(f);
        if (e) elementos.push(e); else descartados++;
    }
    return { elementos, descartados };
}

/** Mi biblioteca personal (la primera de «mis destinos»). */
export function refPersonal(uid: string): EntityRef {
    return libraryRef("user", uid);
}
