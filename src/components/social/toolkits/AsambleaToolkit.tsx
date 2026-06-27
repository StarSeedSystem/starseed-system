"use client";

import Link from "next/link";
import React, { useState } from "react";
import {
  ToolSection,
  StatTile,
  StatGrid,
  VoteBar,
  MiniVote,
  RosterStrip,
  ProgressRow,
  PersonRow,
  LinkCard,
  Timeline,
  Chip,
  EmptyHint,
  GOLD,
} from "@/components/social/toolkits/shared";
import { GlassCard } from "@/components/ui/glass-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { getAssembly, type AssemblyData } from "@/data/sample-governance";
import {
  Vote,
  ListChecks,
  Gavel,
  ScrollText,
  Clock,
  Users,
  CalendarDays,
  FileText,
  Network,
  CheckCircle2,
} from "lucide-react";

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function AsambleaToolkit({
  slug,
  accent,
  name,
}: {
  slug: string;
  accent?: string;
  name?: string;
}) {
  const data = getAssembly(slug);
  const ac = accent ?? "#FFBF00";

  if (!data) {
    return (
      <EmptyHint>
        Aún no hay información de esta asamblea. Crea su primera sesión, orden del día y mociones para empezar.
      </EmptyHint>
    );
  }

  const quorumReached = data.quorum.reached >= data.quorum.total * 0.5;
  const quorumLabel = quorumReached ? "Quórum alcanzado" : "Quórum pendiente";

  return (
    <div className="flex flex-col gap-6">
      <Tabs defaultValue="agenda">
        <TabsList className="flex w-full flex-nowrap justify-start overflow-x-auto">
          <TabsTrigger value="agenda" className="cursor-pointer flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Orden del día
          </TabsTrigger>
          <TabsTrigger value="mociones" className="cursor-pointer flex items-center gap-1.5">
            <Gavel className="w-3.5 h-3.5" />
            Mociones
          </TabsTrigger>
          <TabsTrigger value="actas" className="cursor-pointer flex items-center gap-1.5">
            <ScrollText className="w-3.5 h-3.5" />
            Actas
          </TabsTrigger>
          <TabsTrigger value="red" className="cursor-pointer flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5" />
            Red
          </TabsTrigger>
        </TabsList>

        {/* ── TAB: AGENDA ─────────────────────────────────────────────────── */}
        <TabsContent value="agenda" className="mt-4 space-y-4">
          <StatGrid cols={3}>
            <StatTile
              icon={<Users className="w-4 h-4" />}
              label="Miembros"
              value={String(data.members)}
              accent={ac}
            />
            <StatTile
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="Quórum"
              value={`${data.quorum.reached}/${data.quorum.total}`}
              accent={ac}
            />
            <StatTile
              icon={<Vote className="w-4 h-4" />}
              label="Estado"
              value={quorumLabel}
              hint={quorumReached ? "Sesión válida" : "Se requiere más asistencia"}
              accent={quorumReached ? ac : "#DC143C"}
            />
          </StatGrid>

          <ToolSection
            icon={<Clock className="w-4 h-4" />}
            title="Orden del día"
            subtitle={data.nextSession}
            accent={ac}
          >
            <Timeline entries={data.agenda} accent={ac} />
          </ToolSection>
        </TabsContent>

        {/* ── TAB: MOCIONES ───────────────────────────────────────────────── */}
        <TabsContent value="mociones" className="mt-4">
          {data.motions.length === 0 ? (
            <EmptyHint>No hay mociones registradas para esta asamblea.</EmptyHint>
          ) : (
            <div className="space-y-6">
              {data.motions.map((motion, i) => (
                <ToolSection
                  key={i}
                  icon={<Gavel className="w-4 h-4" />}
                  title={motion.title}
                  accent={ac}
                  action={<Chip accent={ac}>{motion.status}</Chip>}
                >
                  <VoteBar
                    options={motion.votes}
                    quorum={data.quorum}
                    accent={ac}
                  />
                  {(motion.status === "Votación Activa" || motion.status === "Debate") && (
                    <div className="mt-4">
                      <MiniVote
                        question="Emite tu voto soberano"
                        options={motion.votes.map((v) => v.name)}
                        baseCounts={motion.votes.map((v) => v.votes)}
                        ballotKey={`motion:${data.slug}#${i}`}
                        ballotType="motion"
                        accent={ac}
                      />
                    </div>
                  )}
                </ToolSection>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── TAB: ACTAS ──────────────────────────────────────────────────── */}
        <TabsContent value="actas" className="mt-4">
          <ToolSection
            icon={<ScrollText className="w-4 h-4" />}
            title="Actas y acuerdos"
            subtitle="Registro histórico de sesiones y resoluciones vinculantes"
            accent={ac}
          >
            {data.minutes.length === 0 ? (
              <EmptyHint>Aún no se han registrado actas para esta asamblea.</EmptyHint>
            ) : (
              <div className="space-y-3">
                {data.minutes.map((minute, i) => (
                  <GlassCard key={i} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <Chip accent={ac}>{minute.date}</Chip>
                        </div>
                        <p className="font-medium text-sm leading-snug mb-1">
                          {minute.title}
                        </p>
                        <p className="text-muted-foreground text-sm leading-relaxed">
                          {minute.resolution}
                        </p>
                      </div>
                    </div>
                  </GlassCard>
                ))}
              </div>
            )}
          </ToolSection>
        </TabsContent>

        {/* ── TAB: RED ────────────────────────────────────────────────────── */}
        <TabsContent value="red" className="mt-4">
          <ToolSection
            icon={<Network className="w-4 h-4" />}
            title="Conexiones"
            subtitle="Iniciativas legislativas y eventos vinculados a esta asamblea"
            accent={ac}
          >
            {data.proposalIds.length === 0 && data.eventSlugs.length === 0 ? (
              <EmptyHint>
                Esta asamblea aún no tiene conexiones registradas con propuestas o eventos.
              </EmptyHint>
            ) : (
              <div className="space-y-3">
                {data.proposalIds.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      Iniciativas legislativas
                    </p>
                    {data.proposalIds.map((id) => (
                      <LinkCard
                        key={id}
                        href="/network/politics"
                        icon={<FileText className="w-4 h-4" />}
                        title="Iniciativa vinculada"
                        subtitle={id}
                        accent={ac}
                        external={false}
                      />
                    ))}
                  </div>
                )}

                {data.proposalIds.length > 0 && data.eventSlugs.length > 0 && (
                  <Separator className="my-2" />
                )}

                {data.eventSlugs.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                      Eventos relacionados
                    </p>
                    {data.eventSlugs.map((s) => (
                      <LinkCard
                        key={s}
                        href={`/evento/${s}`}
                        icon={<CalendarDays className="w-4 h-4" />}
                        title={humanizeSlug(s)}
                        subtitle={`/evento/${s}`}
                        accent={ac}
                        external={false}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </ToolSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
