"use client";

import Link from "next/link";
import React, { useState } from "react";
import {
    ToolSection,
    StatTile,
    StatGrid,
    MiniVote,
    RosterStrip,
    ProgressRow,
    PersonRow,
    LinkCard,
    Chip,
    EmptyHint,
    EntityQuickActions,
    GOLD,
} from "@/components/social/toolkits/shared";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// Carril de pestañas: `SectionTabs` (menú unificado del OS). (Adenda 68 §C)
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { SectionTabs, type SectionTabItem } from "@/components/ui/section-tabs";
import { Separator } from "@/components/ui/separator";
import { DecisionesSection } from "@/components/governance/decisiones-section";
import { getCommunity, type CommunityData } from "@/data/sample-governance";
import {
    Sprout,
    Hammer,
    Boxes,
    Coins,
    GraduationCap,
    CalendarDays,
    Library,
    Users,
    HandHeart,
    Network,
    Wallet,
    ArrowUpRight,
    Landmark,
} from "lucide-react";

const TABS: SectionTabItem[] = [
    { value: "proyectos", label: "Proyectos", icon: Hammer },
    { value: "procomun", label: "Procomún", icon: Boxes },
    { value: "tesoreria", label: "Tesorería", icon: Wallet },
    { value: "mentorias", label: "Mentorías", icon: GraduationCap },
    { value: "decisiones", label: "Decisiones", icon: Landmark },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function titleFromEventSlug(slug: string): string {
    return slug
        .split("-")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function statusColor(status: CommunityData["commons"][number]["status"]): string {
    switch (status) {
        case "Disponible":
            return "text-emerald-400 border-emerald-400/40";
        case "En uso":
            return "text-amber-400 border-amber-400/40";
        case "Mantenimiento":
        default:
            return "text-muted-foreground border-white/20";
    }
}

// ── Sub-tab: Proyectos ────────────────────────────────────────────────────────

function TabProyectos({ data, ac }: { data: CommunityData; ac: string }) {
    return (
        <ToolSection
            icon={Hammer}
            title="Proyectos comunitarios"
            accent={ac}
            action={
                <RosterStrip
                    count={data.members}
                    label="miembros"
                    accent={ac}
                    seed={data.slug}
                />
            }
        >
            {data.projects.length === 0 ? (
                <EmptyHint>No hay proyectos activos aún. ¡Propón el primero!</EmptyHint>
            ) : (
                <div className="space-y-5">
                    {data.projects.map((p, i) => (
                        <div key={i} className="space-y-1.5">
                            <ProgressRow
                                label={p.title}
                                value={p.progress}
                                detail={`${p.progress}%`}
                                accent={ac}
                            />
                            <p className="text-xs text-muted-foreground pl-0.5">
                                Lidera:{" "}
                                <span className="text-foreground/70 font-medium">{p.lead}</span>
                            </p>
                            {p.needsHelp && (
                                <div className="flex items-center gap-2 flex-wrap pt-0.5">
                                    <Chip accent={ac}>Busca colaboración</Chip>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="cursor-pointer h-7 text-xs"
                                        style={{ borderColor: `${ac}55`, color: ac }}
                                    >
                                        Contribuir
                                    </Button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </ToolSection>
    );
}

// ── Sub-tab: Procomún ─────────────────────────────────────────────────────────

function TabProcomun({ data, ac }: { data: CommunityData; ac: string }) {
    return (
        <ToolSection
            icon={Boxes}
            title="Recursos del procomún"
            subtitle="Bienes compartidos de la comunidad"
            accent={ac}
        >
            {data.commons.length === 0 ? (
                <EmptyHint>Sin recursos registrados en el procomún todavía.</EmptyHint>
            ) : (
                <>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {data.commons.map((r, i) => (
                            <GlassCard key={i} className="p-3 space-y-2">
                                <p className="font-medium text-sm leading-tight">{r.name}</p>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <Chip accent={ac}>{r.type}</Chip>
                                    <Badge
                                        variant="outline"
                                        className={`text-[10px] ${statusColor(r.status)}`}
                                    >
                                        {r.status}
                                    </Badge>
                                </div>
                            </GlassCard>
                        ))}
                    </div>
                    <Separator className="my-4 opacity-20" />
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        <span className="font-medium text-foreground/70">Lienzo Universal:</span>{" "}
                        Cada recurso es una Entidad Única referenciada en la red — no duplicada. Las
                        actualizaciones se reflejan en todas las instancias de forma instantánea.
                    </p>
                </>
            )}
        </ToolSection>
    );
}

// ── Sub-tab: Tesorería ────────────────────────────────────────────────────────

function TabTesoreria({ data, ac }: { data: CommunityData; ac: string }) {
    const { treasury } = data;
    return (
        <div className="space-y-6">
            <ToolSection
                icon={Wallet}
                title="Tesorería de Semillas"
                accent={ac}
            >
                <StatGrid cols={3}>
                    <StatTile
                        label="Balance"
                        value={`${treasury.seeds.toLocaleString("es-ES")} SC`}
                        accent={ac}
                    />
                    <StatTile
                        label="Ingresos / mes"
                        value={`+${treasury.inflow.toLocaleString("es-ES")} SC`}
                        accent="#10B981"
                        hint="Donaciones conscientes"
                    />
                    <StatTile
                        label="Gastos / mes"
                        value={`-${treasury.outflow.toLocaleString("es-ES")} SC`}
                        accent="#DC143C"
                        hint="Proyectos y procomún"
                    />
                </StatGrid>
                <Separator className="my-4 opacity-20" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                    La economía de la comunidad se basa en la{" "}
                    <span className="text-foreground/70 font-medium">donación consciente</span> y el
                    modelo de{" "}
                    <span className="text-foreground/70 font-medium">abundancia regenerativa</span>:
                    los excedentes se reinvierten en automatización y procomún, acercando la red a la
                    gratuidad sistémica.
                </p>
            </ToolSection>

            <GlassCard className="p-[clamp(1rem,2.5vw,1.5rem)]">
                <MiniVote
                    question="¿Aprobar el presupuesto comunitario del próximo ciclo?"
                    options={["A favor", "En contra", "Abstención"]}
                    baseCounts={[74, 12, 9]}
                    ballotKey={`comunidad:${data.slug}:presupuesto`}
                    ballotType="budget"
                    accent={ac}
                />
            </GlassCard>
        </div>
    );
}

// ── Sub-tab: Mentorías ────────────────────────────────────────────────────────

function TabMentorias({ data, ac }: { data: CommunityData; ac: string }) {
    return (
        <div className="space-y-6">
            <ToolSection
                icon={GraduationCap}
                title="Mentorías abiertas"
                subtitle="Aprendizaje mutuo impulsado por la comunidad"
                accent={ac}
            >
                {data.mentorships.length === 0 ? (
                    <EmptyHint>No hay mentorías abiertas en este momento.</EmptyHint>
                ) : (
                    <div className="space-y-2.5">
                        {data.mentorships.map((m, i) => (
                            <PersonRow
                                key={i}
                                seed={i}
                                name={m.mentor}
                                role={m.topic}
                                badge={`${m.seats} plazas`}
                                accent={ac}
                                action={
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="cursor-pointer h-7 text-xs shrink-0"
                                        style={{ borderColor: `${ac}55`, color: ac }}
                                    >
                                        Apuntarme
                                    </Button>
                                }
                            />
                        ))}
                    </div>
                )}
            </ToolSection>

            <ToolSection
                icon={Network}
                title="Red & Biblioteca"
                subtitle="Recursos vinculados a esta comunidad"
                accent={ac}
            >
                <div className="space-y-2">
                    {data.eventSlugs.length === 0 && (
                        <EmptyHint>Sin eventos vinculados próximamente.</EmptyHint>
                    )}
                    {data.eventSlugs.map((s) => (
                        <LinkCard
                            key={s}
                            href={`/evento/${s}`}
                            icon={CalendarDays}
                            title={titleFromEventSlug(s)}
                            accent={ac}
                            external
                        />
                    ))}
                    {data.libraryTags.length > 0 && (
                        <LinkCard
                            href="/library"
                            icon={Library}
                            title="Biblioteca de la comunidad"
                            subtitle={data.libraryTags.join(" · ")}
                            accent={ac}
                            external
                        />
                    )}
                </div>
            </ToolSection>
        </div>
    );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function ComunidadToolkit({
    slug,
    accent,
    name,
}: {
    slug: string;
    accent?: string;
    name?: string;
}) {
    const data = getCommunity(slug);
    const ac = accent ?? GOLD;
    // `Tabs` controlado: lo exige el carril externo (`SectionTabs`).
    const [tab, setTab] = useState("proyectos");

    // Acciones por defecto de la entidad (Adenda 63 §8). Las comunidades son
    // páginas (os_pages · kind "comunidad") → entityKind "page".
    const quickActions = (
        <EntityQuickActions
            slug={slug}
            name={name ?? data?.name}
            accent={ac}
            entityKind="page"
            libraryKind="community"
            entityHref={`/pagina/${slug}`}
            memberCount={data?.members}
            membersLabel="miembros"
        />
    );

    if (!data) {
        return (
            <div>
                {quickActions}
                <EmptyHint>
                    Aún no hay información de esta comunidad. Crea el primer proyecto, recurso del procomún o mentoría para empezar.
                </EmptyHint>
            </div>
        );
    }


    return (
        <div className="space-y-6">
            {quickActions}
            {/* Cabecera de la comunidad */}
            <div className="flex items-start gap-3">
                <span
                    className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border"
                    style={{ borderColor: `${ac}44`, background: `${ac}14`, color: ac }}
                >
                    <Sprout className="h-5 w-5" />
                </span>
                <div>
                    <h2 className="font-headline text-lg font-semibold leading-tight">
                        {name ?? data.name}
                    </h2>
                    {data.blurb && (
                        <p className="mt-0.5 text-sm text-muted-foreground leading-snug max-w-prose">
                            {data.blurb}
                        </p>
                    )}
                </div>
            </div>

            {/* Tabs — carril unificado del OS (`SectionTabs`). */}
            <Tabs value={tab} onValueChange={setTab}>
                <SectionTabs
                    items={TABS}
                    value={tab}
                    onValueChange={setTab}
                    size="sm"
                    ariaLabel="Herramientas de la comunidad"
                />

                <TabsContent value="proyectos" className="mt-4">
                    <TabProyectos data={data} ac={ac} />
                </TabsContent>

                <TabsContent value="procomun" className="mt-4">
                    <TabProcomun data={data} ac={ac} />
                </TabsContent>

                <TabsContent value="tesoreria" className="mt-4">
                    <TabTesoreria data={data} ac={ac} />
                </TabsContent>

                <TabsContent value="mentorias" className="mt-4">
                    <TabMentorias data={data} ac={ac} />
                </TabsContent>

                <TabsContent value="decisiones" className="mt-4">
                    <DecisionesSection kind="comunidad" slug={slug} accent={ac} name={name ?? data.name} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
