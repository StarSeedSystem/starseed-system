// src/lib/entity-links.ts
// ─────────────────────────────────────────────────────────────────────────────
// Convención de slugs y hrefs para que las entidades de `sample-entities.ts` y
// `sample-events.ts` sean navegables de forma PREDECIBLE entre sí, sin tocar el
// componente bloqueado `SystemShowcase`.
//
// Reglas de slug (deterministas, estables, sin dependencias):
//   · Página/Comunidad  → /pagina/<slug>     slug = slugify(title) || id
//   · Grupo/Asamblea     → /grupo/<slug>      slug = slugify(name)  || id
//   · Evento             → /evento/<slug>     slug = explícito en el dato
//   · Perfil             → /profile/<username> username = handle sin "@"
//
// Las rutas resuelven por slug y, como salvavidas, también por id, de modo que un
// enlace creado por cualquier convención razonable funcione.
// ─────────────────────────────────────────────────────────────────────────────

import type {
    SamplePage,
    SampleGroup,
    SampleProfile,
} from "@/data/sample-entities";
import { samplePages, sampleGroups } from "@/data/sample-entities";

/** Normaliza un texto a slug URL-safe (sin acentos, minúsculas, guiones). */
export function slugify(input: string): string {
    return input
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "") // quita diacríticos
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/-{2,}/g, "-");
}

/** username canónico a partir de un handle ("@lucia.civica" → "lucia.civica"). */
export function usernameFromHandle(handle: string): string {
    return handle.replace(/^@+/, "");
}

// ── Slugs por tipo ──
export function pageSlug(p: Pick<SamplePage, "id" | "title">): string {
    return slugify(p.title) || p.id;
}
export function groupSlug(g: Pick<SampleGroup, "id" | "name">): string {
    return slugify(g.name) || g.id;
}

// ── Hrefs por tipo ──
export function pageHref(p: Pick<SamplePage, "id" | "title">): string {
    return `/pagina/${pageSlug(p)}`;
}
export function groupHref(g: Pick<SampleGroup, "id" | "name">): string {
    return `/grupo/${groupSlug(g)}`;
}
export function profileHref(p: Pick<SampleProfile, "handle">): string {
    return `/profile/${usernameFromHandle(p.handle)}`;
}
export function eventHref(slug: string): string {
    return `/evento/${slug}`;
}

// ── Resolución tolerante (slug O id) ──
export function matchesPage(p: SamplePage, key: string): boolean {
    return pageSlug(p) === key || p.id === key || slugify(p.id) === key;
}
export function matchesGroup(g: SampleGroup, key: string): boolean {
    return groupSlug(g) === key || g.id === key || slugify(g.id) === key;
}
export function matchesProfile(p: SampleProfile, key: string): boolean {
    return (
        usernameFromHandle(p.handle) === key ||
        slugify(usernameFromHandle(p.handle)) === slugify(key) ||
        p.id === key
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolución por NOMBRE para entidades mostradas en los widgets del Dashboard
// (Explorar Red / Mis Páginas / Radar Social). Estos widgets se alimentan de un
// dataset propio (widget-data) cuyos elementos solo exponen un `name`/`title`.
// Para que cada tarjeta enlace a una página de detalle REAL, resolvemos el
// nombre contra `samplePages`/`sampleGroups` (por slug del nombre o por título)
// y, si no hay coincidencia, devolvemos una ruta basada en el slug del nombre
// (que la página de detalle resolverá con su propio fallback elegante).
// ─────────────────────────────────────────────────────────────────────────────

/** Busca una página cuyo título coincida (por slug) con el nombre dado. */
export function findPageByName(name: string): SamplePage | undefined {
    const key = slugify(name);
    return samplePages.find((p) => pageSlug(p) === key || slugify(p.title) === key);
}

/** Busca un grupo cuyo nombre coincida (por slug) con el nombre dado. */
export function findGroupByName(name: string): SampleGroup | undefined {
    const key = slugify(name);
    return sampleGroups.find((g) => groupSlug(g) === key || slugify(g.name) === key);
}

/**
 * Devuelve el href de detalle para una entidad de widget identificada por su
 * `name` (y, opcionalmente, su `kind`). Estrategia:
 *   1. Si existe una página con ese nombre  → /pagina/<slug>
 *   2. Si existe un grupo con ese nombre     → /grupo/<slug>
 *   3. Según el kind del widget, se enruta a /grupo (colectivos/proyectos) o a
 *      /pagina (comunidades/sanghas/biorregiones/entidades) usando el slug del
 *      nombre; la página de detalle aplicará su fallback si no hay dato.
 */
export function widgetEntityHref(name: string, kind?: string): string {
    const slug = slugify(name) || "entidad";
    const page = findPageByName(name);
    if (page) return pageHref(page);
    const group = findGroupByName(name);
    if (group) return groupHref(group);

    const k = (kind ?? "").toLowerCase();
    const groupKinds = ["colectivo", "proyecto", "circulo", "círculo"];
    if (groupKinds.includes(k)) return `/grupo/${slug}`;
    return `/pagina/${slug}`;
}

/** Href de un evento de widget identificado por su título (slug del título). */
export function widgetEventHref(title: string): string {
    return `/evento/${slugify(title) || "evento"}`;
}
