// src/app/(app)/network/politics/page.tsx
'use client'

import { useState } from "react";
import { PoliticalProposalCard } from "@/components/political-proposal-card";
import ProposalComposer from "@/components/governance/proposal-composer";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BarChart, Scale, Users, Landmark, Flag, ArrowUpRight, Loader2, ScrollText, MapPin } from "lucide-react";
import { SectionHeader } from "@/components/network/section-header";
import { SectionPostsFeed } from "@/components/network/section-posts-feed";
import { createClient } from "@/utils/supabase/client";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import type { Proposal } from "@/lib/governance/types";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { listFederativeEntities, listPartidos } from "@/data/sample-governance";

import { ExecutiveProjectsBoard, JudicialCaseList } from "./components";
import { OntocraciaDecisionesCard } from "./ontocracia-decisiones";
import { SystemShowcase } from "@/components/showcase/SystemShowcase";
// (Adenda 67 · P4-4) «Aurora política»: el Consejo de Aurora — patrón
// llm-council ejecutado con el router gratis-primero del OS. Cinco consejeros,
// uno por fundamento StarSeed; cada dictamen cita en qué fundamento se apoya.
import { AuroraCouncilCard } from "@/components/governance/aurora-council";

// Ámbitos relevantes para el Área Política (mismo criterio que en el resto del front).
const POLITICAL_SCOPES = ["global", "community", "page", "group", "account"];
// Las consultas judiciales viven en su propia pestaña (components.tsx) — se excluyen aquí.
const JUDICIAL_KINDS = ["consulta_constitucional", "impugnacion"];

async function loadLegislativeProposals(): Promise<Proposal[]> {
    if (typeof window === "undefined") return [];
    try {
        const supabase = createClient();
        const { data, error } = await supabase
            .from("proposals")
            .select("*")
            .in("scope", POLITICAL_SCOPES)
            .order("created_at", { ascending: false })
            .limit(50);
        if (error) return [];
        return ((data as Proposal[]) ?? []).filter((p) => !JUDICIAL_KINDS.includes(p.kind));
    } catch {
        return [];
    }
}

type LegislativeFilter = "open" | "all";

/** Feed real de propuestas legislativas del Área Política (motor de Ontocracia). */
function LegislativeFeed() {
    const { rows, loading, reload } = useRealtimeRows<Proposal>("proposals", loadLegislativeProposals);
    const [filter, setFilter] = useState<LegislativeFilter>("open");

    // Nota: el parche en vivo de useRealtimeRows añade/reemplaza filas sin
    // reaplicar el filtro del loader (kind judicial) — lo reforzamos aquí para
    // que un INSERT/UPDATE ajeno no cuele una consulta judicial en Legislativo.
    const base = rows.filter((p) => !JUDICIAL_KINDS.includes(p.kind));
    const filtered = filter === "open" ? base.filter((p) => p.status === "open") : base;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    Iniciativas legislativas ({filtered.length})
                </span>
                <div className="ml-auto flex gap-1.5">
                    {([
                        { id: "open", label: "Abiertas" },
                        { id: "all", label: "Todas" },
                    ] as { id: LegislativeFilter; label: string }[]).map((f) => (
                        <button
                            key={f.id}
                            onClick={() => setFilter(f.id)}
                            className={cn(
                                "cursor-pointer rounded-full border px-2.5 py-1 text-[11px]",
                                filter === f.id
                                    ? "border-primary/50 bg-primary/10 text-primary"
                                    : "border-white/10 text-muted-foreground hover:text-foreground",
                            )}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" /> Cargando iniciativas…
                </div>
            ) : filtered.length === 0 ? (
                <p className="rounded-lg border border-dashed border-white/10 py-6 text-center text-sm text-muted-foreground">
                    Aún no hay iniciativas legislativas {filter === "open" ? "abiertas" : ""} en la red. Lanza la primera con
                    "+ Nueva Iniciativa".
                </p>
            ) : (
                <div className="space-y-4">
                    {filtered.map((p) => (
                        <PoliticalProposalCard key={p.id} proposal={p} onChange={reload} />
                    ))}
                </div>
            )}
        </div>
    );
}

/** Lanzador de gobernanza: enlaza a las páginas de detalle de E.F. y partidos. */
function GovernanceLauncher() {
    const efs = listFederativeEntities();
    const partidos = listPartidos();
    return (
        <Card className="mb-6 liquid-glass-panel">
            <CardHeader className="pb-3">
                <CardTitle className="font-headline text-lg">Mapa de Gobernanza</CardTitle>
                <CardDescription>Entra a las Entidades Federativas y Partidos de la red.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
                <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <Landmark className="h-3.5 w-3.5" /> Entidades Federativas
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {efs.map((ef) => (
                            <Link
                                key={ef.slug}
                                href={`/entidad/${ef.slug}`}
                                className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 cursor-pointer transition-all hover:border-white/25"
                            >
                                <span className="flex items-center gap-2 text-sm font-medium">
                                    <span className="h-2 w-2 rounded-full" style={{ background: ef.accent }} />
                                    {ef.name}
                                </span>
                                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {ef.citizens.toLocaleString("es-ES")}
                                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
                <div>
                    <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                        <Flag className="h-3.5 w-3.5" /> Partidos Políticos
                    </p>
                    <div className="flex flex-col gap-1.5">
                        {partidos.map((p) => (
                            <Link
                                key={p.slug}
                                href={`/partido/${p.slug}`}
                                className="group flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 cursor-pointer transition-all hover:border-white/25"
                            >
                                <span className="flex items-center gap-2 text-sm font-medium">
                                    <span className="h-2 w-2 rounded-full" style={{ background: p.accent }} />
                                    {p.name}
                                </span>
                                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                                    {p.members.toLocaleString("es-ES")}
                                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

const NEW_INITIATIVE_TYPES: { id: "law" | "project"; label: string; kind: string }[] = [
    { id: "law", label: "Propuesta de Ley", kind: "decision" },
    { id: "project", label: "Proyecto Ejecutivo", kind: "project" },
];

export default function PoliticsPage() {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [initiativeType, setInitiativeType] = useState<"law" | "project">("law");
    const selectedKind = NEW_INITIATIVE_TYPES.find((t) => t.id === initiativeType)?.kind ?? "decision";

    return (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
                {/* ── Cabecera consistente de sección + acciones rápidas (Adenda 63 §8) ── */}
                <SectionHeader
                    dest="politica"
                    icon={Scale}
                    title="Ecosistema Político"
                    description="Democracia directa: propone, delibera, vota y ejecuta con la red (Ontocracia)."
                    actions={
                        <>
                            <DialogTrigger asChild>
                                <Button
                                    size="sm"
                                    className="shrink-0 cursor-pointer gap-1.5 rounded-full border border-primary/50 bg-primary/20 text-primary shadow-lg backdrop-blur hover:bg-primary/30"
                                >
                                    <ScrollText className="h-3.5 w-3.5" /> Nueva propuesta
                                </Button>
                            </DialogTrigger>
                            <Button
                                asChild
                                size="sm"
                                variant="outline"
                                className="shrink-0 cursor-pointer gap-1.5 rounded-full border-white/15 bg-white/[0.03] backdrop-blur"
                            >
                                <Link href="/hub/mapa">
                                    <MapPin className="h-3.5 w-3.5" /> Propuestas del mapa
                                </Link>
                            </Button>
                        </>
                    }
                />

                <Tabs defaultValue="legislativo" className="w-full">
                    <TabsList className="grid w-full grid-cols-3 h-auto">
                        <TabsTrigger value="legislativo" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] py-2"><Scale className="mr-1.5 sm:mr-2 h-4 w-4 shrink-0" />Legislativo</TabsTrigger>
                        <TabsTrigger value="ejecutivo" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] py-2"><Users className="mr-1.5 sm:mr-2 h-4 w-4 shrink-0" />Ejecutivo</TabsTrigger>
                        <TabsTrigger value="judicial" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] py-2"><BarChart className="mr-1.5 sm:mr-2 h-4 w-4 shrink-0" />Judicial</TabsTrigger>
                    </TabsList>

                    <TabsContent value="legislativo" className="mt-6 animate-in fade-in-50 duration-500 slide-in-from-bottom-2">
                        <div className="space-y-6">
                            {/* Ontocracia · Decisiones (en vivo) — teaser + deep-link a /decisiones */}
                            <OntocraciaDecisionesCard />

                            {/* Consejo de Aurora (Adenda 67 · P4-4): delibera sobre cualquier
                                propuesta desde los cinco fundamentos StarSeed antes de votar. */}
                            <AuroraCouncilCard />

                            {/* Feed real y avanzado: opciones dinámicas, enmiendas, voto líquido,
                                registro verificable, cuenta regresiva y contexto de Aurora. */}
                            <LegislativeFeed />

                            {/* Publicaciones de la sección (os_posts · cola "politica" de la
                                Zona de Publicación, con realtime) — Adenda 63 §8. */}
                            <SectionPostsFeed dest="politica" />
                        </div>
                    </TabsContent>

                    <TabsContent value="ejecutivo" className="mt-6 animate-in fade-in-50 duration-500 slide-in-from-bottom-2">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold font-headline">Tablero de Proyectos</h2>
                            <p className="text-muted-foreground">Gestión transparente de recursos y ejecución de mandatos comunitarios.</p>
                        </div>
                        <ExecutiveProjectsBoard />
                    </TabsContent>

                    <TabsContent value="judicial" className="mt-6 animate-in fade-in-50 duration-500 slide-in-from-bottom-2">
                        <div className="mb-6">
                            <h2 className="text-2xl font-bold font-headline">Sistema de Justicia Restaurativa</h2>
                            <p className="text-muted-foreground">Resolución de conflictos enfocada en la mediación y la armonía comunitaria.</p>
                        </div>
                        <JudicialCaseList />
                    </TabsContent>
                </Tabs>

                <div className="mt-8">
                    <GovernanceLauncher />
                </div>

                <SystemShowcase system="politico" />
            </div>

            <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Crear Nueva Iniciativa</DialogTitle>
                    <DialogDescription>
                        Lanza una propuesta legislativa u proyecto ejecutivo. Ambas se deciden por votación democrática
                        (Ontocracia); si se aprueba, aparece en el tablero del Ejecutivo para su ejecución. Para casos
                        judiciales, usa "Nueva consulta" en la pestaña Judicial.
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                    <div className="grid gap-2">
                        <Label htmlFor="type" className="text-right">Tipo</Label>
                        <select
                            id="type"
                            value={initiativeType}
                            onChange={(e) => setInitiativeType(e.target.value as "law" | "project")}
                            className="col-span-3 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        >
                            {NEW_INITIATIVE_TYPES.map((t) => (
                                <option key={t.id} value={t.id}>{t.label}</option>
                            ))}
                        </select>
                    </div>
                    <ProposalComposer
                        key={initiativeType}
                        scope="global"
                        political
                        initial={{ kind: selectedKind }}
                        onCreated={() => setDialogOpen(false)}
                    />
                </div>
            </DialogContent>
        </Dialog >
    );
}
