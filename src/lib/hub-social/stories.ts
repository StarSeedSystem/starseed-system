"use client";

/**
 * ── hub-social/stories — Historias de conexión ───────────────────────────────
 *
 * Micro-línea de tiempo por vínculo, construida SOLO con datos reales del grafo:
 * cuándo empezó el vínculo (created_at de os_follows/os_memberships), su
 * naturaleza (sigues / participas / administras), su sistema, y los hitos
 * derivables con honestidad (conexiones en el mismo sistema, etiquetas en común
 * con tu red). Nada inventado: si no hay fecha registrada, se dice claramente.
 */

import {
    UserPlus, Users2, ShieldCheck, GitMerge, Compass, Tags, CalendarClock,
    type LucideIcon,
} from "lucide-react";
import { SYSTEM_META } from "@/lib/hub-social/meta";
import type { GraphNode } from "@/lib/hub-social/graph";

export interface StoryMilestone {
    id: string;
    icon: LucideIcon;
    title: string;
    detail?: string;
    /** ISO del hito, si se conoce. */
    at?: string;
    tone: string;
}

const dateFmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

export function formatStoryDate(iso?: string): string | null {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return dateFmt.format(d);
}

export function relativeSince(iso?: string): string | null {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (Number.isNaN(then)) return null;
    const days = Math.floor((Date.now() - then) / 86_400_000);
    if (days < 1) return "hoy";
    if (days < 30) return `hace ${days} d`;
    const months = Math.floor(days / 30);
    if (months < 12) return `hace ${months} ${months === 1 ? "mes" : "meses"}`;
    const years = Math.floor(months / 12);
    return `hace ${years} ${years === 1 ? "año" : "años"}`;
}

/** Construye la historia (hitos ordenados) de un vínculo concreto. */
export function buildStory(node: GraphNode, mine: GraphNode[]): StoryMilestone[] {
    const milestones: StoryMilestone[] = [];
    const sys = SYSTEM_META[node.system];

    // 1) Inicio del vínculo.
    const started = node.bonds.includes("member") ? "Te uniste" : "Empezaste a seguir";
    const startIcon = node.bonds.includes("member") ? Users2 : UserPlus;
    milestones.push({
        id: "start",
        icon: startIcon,
        title: node.since ? `${started} · ${formatStoryDate(node.since)}` : started,
        detail: node.since ? `El vínculo nació ${relativeSince(node.since)}.` : "Fecha de inicio no registrada por el sistema.",
        at: node.since,
        tone: node.accent,
    });

    // 2) Sistema al que pertenece.
    milestones.push({
        id: "system",
        icon: Compass,
        title: `Pertenece al sistema ${sys.label.toLowerCase()}`,
        detail: sys.tip,
        tone: sys.color,
    });

    // 3) Vínculo recíproco (sigues Y participas).
    if (node.bonds.includes("follow") && node.bonds.includes("member")) {
        milestones.push({
            id: "reciprocal",
            icon: GitMerge,
            title: "Vínculo recíproco (Sinapsis)",
            detail: "Sigues esta entidad y además participas en ella: un lazo doble.",
            tone: "#E9C46A",
        });
    }

    // 4) Administración / raíz.
    if (node.bonds.includes("admin")) {
        milestones.push({
            id: "admin",
            icon: ShieldCheck,
            title: "La administras",
            detail: "Eres fundador o administrador: sostienes esta entidad como Raíz.",
            tone: "#34d399",
        });
    }

    // 5) Conexiones en el mismo sistema (contexto real).
    const sameSystem = mine.filter((n) => n.system === node.system && n.slug !== node.slug).length;
    if (sameSystem > 0) {
        milestones.push({
            id: "same-system",
            icon: Compass,
            title: `${sameSystem} conexión${sameSystem === 1 ? "" : "es"} más en el mismo sistema`,
            detail: "Comparte familia cromática con otras entidades de tu red.",
            tone: sys.color,
        });
    }

    // 6) Etiquetas en común con tu red.
    if (node.tags.length > 0) {
        const mySlugs = new Set(mine.map((n) => n.slug));
        const tagSet = new Set(node.tags.map((t) => t.toLowerCase()));
        let shared = 0;
        for (const other of mine) {
            if (other.slug === node.slug || !mySlugs.has(other.slug)) continue;
            if (other.tags.some((t) => tagSet.has(t.toLowerCase()))) shared += 1;
        }
        if (shared > 0) {
            milestones.push({
                id: "shared-tags",
                icon: Tags,
                title: `Afinidad temática con ${shared} de tus conexiones`,
                detail: "Comparte etiquetas con otras entidades que ya te importan.",
                tone: node.accent,
            });
        }
    }

    // 7) Cierre honesto si apenas hay datos.
    if (milestones.length <= 2) {
        milestones.push({
            id: "seed",
            icon: CalendarClock,
            title: "Historia joven",
            detail: "Este vínculo aún está sembrando su historia. Participa para que crezca.",
            tone: "#64748b",
        });
    }

    return milestones;
}
