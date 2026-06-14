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
