// src/lib/reach/reach.ts
// ─────────────────────────────────────────────────────────────────────────────
// MODELO DE ALCANCE UNIFICADO (Reach) de StarSeed OS.
//
// "Publicar a todo StarSeed o a comunidades específicas": este módulo define un
// vocabulario ÚNICO y claro de alcance que envuelve el modelo de destinos del
// composer (`SelectedDestination` de `@/lib/publish/publish`). El composer sigue
// funcionando con sus destinos internos; el `ReachSelector` es sólo un control
// de alto nivel que se MAPEA a esos destinos mediante `reachToDestinations`.
//
// Alcances:
//   · all         → Todo StarSeed (feed público de la red).
//   · communities → Comunidades / grupos específicos (multi-selección).
//   · entities    → Entidades federativas específicas (multi-selección).
//   · profile     → Mi(s) perfil(es) (muro propio).
//   · private     → Privado (sólo se registra como referencia; no difunde).
//
// El vocabulario se alinea conceptualmente con el `Scope` de gobernanza
// (message/group/page/community/account/global) SIN importarlo ni editarlo:
//   all ≈ global · communities ≈ community/group · entities ≈ page(entidad)
//   profile ≈ account · private ≈ message.
//
// Aditivo y defensivo: no rompe el flujo de publicación existente. Si no hay
// objetivos seleccionados donde harían falta, el mapeo degrada con elegancia.
// ─────────────────────────────────────────────────────────────────────────────

import type {
    SelectedDestination,
    DestinationKindId,
} from "@/lib/publish/publish";

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Los cinco alcances de alto nivel de una publicación. */
export type ReachKind = "all" | "communities" | "entities" | "profile" | "private";

/**
 * Alcance unificado de una publicación.
 *  · `targetIds`   → ids de las entidades concretas (comunidades/grupos/entidades)
 *                    cuando `kind` es "communities" o "entities".
 *  · `targetKinds` → tipo de destino paralelo a cada id (mismo índice), para
 *                    distinguir p. ej. "comunidad" de "grupo" dentro de la misma
 *                    selección. Opcional: si falta, se infiere del `kind`.
 */
export interface Reach {
    kind: ReachKind;
    targetIds?: string[];
    targetKinds?: string[];
}

/** Metadatos de presentación de cada alcance (etiqueta + icono lucide + pista). */
export interface ReachOptionDef {
    kind: ReachKind;
    label: string;
    /** Nombre de icono de `lucide-react` (la UI lo resuelve). */
    icon: string;
    blurb: string;
    /** true si requiere seleccionar objetivos concretos. */
    needsTargets?: boolean;
    /** Tipo(s) de destino del composer al que corresponde este alcance. */
    destinationKinds: DestinationKindId[];
}

/** Catálogo de alcances (orden de presentación en el selector). */
export const REACH_OPTIONS: ReachOptionDef[] = [
    {
        kind: "all",
        label: "Todo StarSeed",
        icon: "Globe",
        blurb: "Tu publicación llega al feed público de toda la red StarSeed.",
        destinationKinds: ["red"],
    },
    {
        kind: "communities",
        label: "Comunidades específicas",
        icon: "Users2",
        blurb: "Sólo las comunidades o grupos que elijas.",
        needsTargets: true,
        destinationKinds: ["comunidad", "grupo"],
    },
    {
        kind: "entities",
        label: "Entidades federativas",
        icon: "Flag",
        blurb: "Dirigida a entidades de gobernanza federativa concretas.",
        needsTargets: true,
        destinationKinds: ["entidad_federativa"],
    },
    {
        kind: "profile",
        label: "Mi perfil",
        icon: "UserCheck",
        blurb: "Publica en tu propio muro / perfil.",
        destinationKinds: ["perfil"],
    },
    {
        kind: "private",
        label: "Privado",
        icon: "Lock",
        blurb: "Sólo para ti: se guarda como referencia, no se difunde.",
        destinationKinds: ["carpeta"],
    },
];

/** Búsqueda rápida de un alcance por su clave. */
export function reachOptionByKind(kind: ReachKind): ReachOptionDef | undefined {
    return REACH_OPTIONS.find((o) => o.kind === kind);
}

// ── Alcance por defecto ──────────────────────────────────────────────────────

/** Alcance por defecto: todo StarSeed (feed público). */
export function defaultReach(): Reach {
    return { kind: "all", targetIds: [], targetKinds: [] };
}

// ── Descripción legible ──────────────────────────────────────────────────────

/**
 * Devuelve una descripción en español del alcance, apta para la vista previa.
 * No accede a la red: trabaja sólo sobre el objeto `Reach`. `labels` (opcional)
 * mapea `targetId → nombre legible` para enriquecer el texto.
 */
export function describeReach(
    reach: Reach | null | undefined,
    labels?: Record<string, string>,
): string {
    if (!reach) return "Sin alcance definido.";
    const def = reachOptionByKind(reach.kind);
    const ids = reach.targetIds ?? [];

    switch (reach.kind) {
        case "all":
            return "Todo StarSeed: la publicación llega al feed público de la red.";
        case "profile":
            return "Tu perfil: la publicación vivirá en tu propio muro.";
        case "private":
            return "Privado: sólo tú puedes verla; se guarda como referencia sin difundirse.";
        case "communities":
        case "entities": {
            const noun =
                reach.kind === "communities" ? "comunidad(es) / grupo(s)" : "entidad(es) federativa(s)";
            if (ids.length === 0) {
                return `Aún no has elegido ${noun}. Selecciona al menos una para publicar.`;
            }
            const names = labels
                ? ids.map((id) => labels[id]).filter(Boolean)
                : [];
            const list =
                names.length > 0
                    ? names.join(", ")
                    : `${ids.length} ${ids.length === 1 ? "destino" : "destinos"}`;
            return `Dirigida a ${noun}: ${list}.`;
        }
        default:
            return def?.blurb ?? "Alcance personalizado.";
    }
}

// ── Mapeo Reach → destinos del composer ──────────────────────────────────────

/**
 * Traduce un `Reach` de alto nivel a los `SelectedDestination[]` que el composer
 * y la capa `publish()` ya entienden. Este es el PUENTE que mantiene el sistema
 * de publicación existente intacto: la UI trabaja con `Reach`, pero por debajo
 * seguimos publicando con los destinos de siempre.
 *
 *  · all         → [{ kind:"red", id:"feed" }]
 *  · communities → un destino por objetivo (comunidad o grupo, según targetKinds)
 *  · entities    → un destino "entidad_federativa" por objetivo
 *  · profile     → [{ kind:"perfil", id: <profileId|"me"> }]
 *  · private     → [{ kind:"carpeta", id:"privado" }]  (registro privado)
 *
 * `resolveLabel` (opcional) permite adjuntar un nombre legible al destino.
 * `profileId` (opcional) fija el perfil de destino en el alcance "profile".
 */
export function reachToDestinations(
    reach: Reach | null | undefined,
    opts?: {
        resolveLabel?: (id: string, kind: DestinationKindId) => string | undefined;
        profileId?: string;
    },
): SelectedDestination[] {
    if (!reach) return [{ kind: "red", id: "feed", label: "Feed público" }];
    const resolve = opts?.resolveLabel;
    const label = (id: string, kind: DestinationKindId) =>
        resolve?.(id, kind);

    switch (reach.kind) {
        case "all":
            return [{ kind: "red", id: "feed", label: "Feed público" }];

        case "profile": {
            const id = opts?.profileId || "me";
            return [{ kind: "perfil", id, label: label(id, "perfil") ?? "Mi perfil" }];
        }

        case "private":
            return [{ kind: "carpeta", id: "privado", label: "Privado" }];

        case "communities": {
            const ids = reach.targetIds ?? [];
            const kinds = reach.targetKinds ?? [];
            return ids.map((id, i) => {
                const k = (kinds[i] as DestinationKindId) || "comunidad";
                const kind: DestinationKindId = k === "grupo" ? "grupo" : "comunidad";
                return { kind, id, label: label(id, kind) };
            });
        }

        case "entities": {
            const ids = reach.targetIds ?? [];
            return ids.map((id) => ({
                kind: "entidad_federativa" as DestinationKindId,
                id,
                label: label(id, "entidad_federativa"),
            }));
        }

        default:
            return [{ kind: "red", id: "feed", label: "Feed público" }];
    }
}

/**
 * Intenta deducir un `Reach` a partir de una lista de destinos ya seleccionados
 * (p. ej. cuando el composer se prerellena con `initial.destinations`). Es una
 * heurística tolerante: si los destinos son heterogéneos, prioriza el primero.
 */
export function reachFromDestinations(
    destinations: SelectedDestination[] | null | undefined,
): Reach {
    if (!destinations || destinations.length === 0) return defaultReach();

    const first = destinations[0];
    if (destinations.some((d) => d.kind === "red")) {
        return { kind: "all", targetIds: [], targetKinds: [] };
    }
    if (first.kind === "perfil") {
        return { kind: "profile", targetIds: [], targetKinds: [] };
    }
    if (first.kind === "entidad_federativa") {
        const ent = destinations.filter((d) => d.kind === "entidad_federativa");
        return {
            kind: "entities",
            targetIds: ent.map((d) => d.id),
            targetKinds: ent.map(() => "entidad_federativa"),
        };
    }
    if (
        first.kind === "comunidad" ||
        first.kind === "grupo" ||
        first.kind === "pagina"
    ) {
        const com = destinations.filter(
            (d) => d.kind === "comunidad" || d.kind === "grupo" || d.kind === "pagina",
        );
        return {
            kind: "communities",
            targetIds: com.map((d) => d.id),
            targetKinds: com.map((d) => (d.kind === "grupo" ? "grupo" : "comunidad")),
        };
    }
    if (first.kind === "carpeta" || first.kind === "biblioteca") {
        return { kind: "private", targetIds: [], targetKinds: [] };
    }
    return defaultReach();
}
