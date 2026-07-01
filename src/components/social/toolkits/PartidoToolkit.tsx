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
import { DecisionesSection } from "@/components/governance/decisiones-section";
import { getPartido, type PartidoData } from "@/data/sample-governance";
import {
  Flag,
  Megaphone,
  Users,
  Vote,
  Sparkles,
  Network,
  CalendarDays,
  Scale,
  FileText,
  Handshake,
  TrendingUp,
  Crown,
  Landmark,
} from "lucide-react";

// Humanise an event slug for display in LinkCards
function humaniseSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function PartidoToolkit({
  slug,
  accent,
  name,
}: {
  slug: string;
  accent?: string;
  name?: string;
}) {
  const data = getPartido(slug);
  const ac = accent ?? "#DC143C";

  if (!data) {
    return (
      <EmptyHint>
        Aún no hay información de este partido. Configura su programa, candidaturas y votaciones para empezar.
      </EmptyHint>
    );
  }


  return (
    <div className="space-y-2">
      {/* Header badge row */}
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <Badge
          className="text-xs font-semibold uppercase tracking-wider cursor-pointer"
          style={{ background: ac, color: "#fff" }}
        >
          Partido · {data.ideology}
        </Badge>
        {data.replicationActive && (
          <Badge
            variant="outline"
            className="text-xs cursor-pointer"
            style={{ borderColor: ac, color: ac }}
          >
            <Sparkles className="mr-1 h-3 w-3" />
            Replicación activa
          </Badge>
        )}
      </div>

      <Tabs defaultValue="programa">
        <TabsList className="flex w-full flex-nowrap justify-start overflow-x-auto gap-1 mb-4">
          <TabsTrigger value="programa" className="cursor-pointer whitespace-nowrap">
            <Megaphone className="mr-1.5 h-3.5 w-3.5" />
            Programa
          </TabsTrigger>
          <TabsTrigger value="militancia" className="cursor-pointer whitespace-nowrap">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            Militancia
          </TabsTrigger>
          <TabsTrigger value="candidaturas" className="cursor-pointer whitespace-nowrap">
            <Vote className="mr-1.5 h-3.5 w-3.5" />
            Candidaturas
          </TabsTrigger>
          <TabsTrigger value="red" className="cursor-pointer whitespace-nowrap">
            <Network className="mr-1.5 h-3.5 w-3.5" />
            Red
          </TabsTrigger>
          <TabsTrigger value="decisiones" className="cursor-pointer whitespace-nowrap">
            <Landmark className="mr-1.5 h-3.5 w-3.5" />
            Decisiones
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: PROGRAMA POLÍTICO ── */}
        <TabsContent value="programa" className="space-y-6">
          <ToolSection
            icon={<Megaphone className="h-4 w-4" />}
            title="Manifiesto"
            subtitle="Declaración de principios del partido"
            accent={ac}
          >
            <p className="text-sm leading-relaxed text-muted-foreground">
              {data.manifesto}
            </p>
          </ToolSection>

          <StatGrid cols={4}>
            <StatTile
              icon={<Users className="h-4 w-4" />}
              label="Militantes"
              value={data.members.toLocaleString("es-ES")}
              hint="personas soberanas afiliadas"
              accent={ac}
            />
            <StatTile
              icon={<Vote className="h-4 w-4" />}
              label="Votos históricos"
              value={data.votesHistory.toLocaleString("es-ES")}
              hint="votos acumulados en la red"
              accent={ac}
            />
            <StatTile
              icon={<CalendarDays className="h-4 w-4" />}
              label="Fundado"
              value={data.founded}
              hint="fecha de constitución"
              accent={ac}
            />
            <StatTile
              icon={<Sparkles className="h-4 w-4" />}
              label="Replicación"
              value={data.replicationActive ? "Activa" : "Inactiva"}
              hint="expansión de nodos activos"
              accent={ac}
            />
          </StatGrid>

          <ToolSection
            icon={<TrendingUp className="h-4 w-4" />}
            title="Ejes programáticos"
            subtitle="Avance de implementación por eje ideológico"
            accent={ac}
          >
            <div className="space-y-3">
              {data.axes.map((axis) => (
                <ProgressRow
                  key={axis.title}
                  label={axis.title}
                  value={axis.progress}
                  detail={axis.detail}
                  accent={ac}
                />
              ))}
            </div>
          </ToolSection>
        </TabsContent>

        {/* ── TAB 2: MILITANCIA ── */}
        <TabsContent value="militancia" className="space-y-6">
          <ToolSection
            icon={<Users className="h-4 w-4" />}
            title="Cuerpo Militante"
            subtitle="Base activa del partido"
            accent={ac}
          >
            <div className="space-y-4">
              <RosterStrip
                count={data.members}
                label="militantes"
                accent={ac}
                max={32}
              />
              <Separator />
              <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground leading-relaxed">
                <span style={{ color: ac }} className="font-semibold">
                  Una persona, una voz.
                </span>{" "}
                Cada militante posee un voto soberano no transferible, verificado
                mediante criptografía de conocimiento cero. La autoridad surge del
                entendimiento aplicado, nunca del linaje ni la popularidad. La
                delegación líquida es revocable en todo momento.
              </div>
            </div>
          </ToolSection>

          <ToolSection
            icon={<Crown className="h-4 w-4" />}
            title="Perfil de las candidaturas"
            subtitle="Personas activas en representación del partido"
            accent={ac}
          >
            <div className="space-y-1">
              {data.candidates.map((c, i) => (
                <PersonRow
                  key={c.name}
                  name={c.name}
                  role={c.post}
                  badge={c.badge}
                  accent={ac}
                  seed={i}
                />
              ))}
            </div>
          </ToolSection>
        </TabsContent>

        {/* ── TAB 3: CANDIDATURAS ── */}
        <TabsContent value="candidaturas" className="space-y-6">
          <ToolSection
            icon={<Vote className="h-4 w-4" />}
            title="Votación Interna Activa"
            subtitle="Voto líquido — decide la militancia"
            accent={ac}
          >
            <MiniVote
              question={data.internalVote.question}
              options={data.internalVote.options}
              baseCounts={data.internalVote.counts}
              ballotKey={`party:${data.slug}:internal`}
              ballotType="party"
              accent={ac}
            />
          </ToolSection>

          <ToolSection
            icon={<Crown className="h-4 w-4" />}
            title="Candidaturas activas"
            subtitle="Índice de apoyo interno por candidatura"
            accent={ac}
          >
            <div className="space-y-3">
              {data.candidates.map((c) => (
                <ProgressRow
                  key={c.name}
                  label={c.name}
                  value={c.support}
                  detail={`${c.support}% apoyo · ${c.post}`}
                  accent={ac}
                />
              ))}
            </div>
          </ToolSection>
        </TabsContent>

        {/* ── TAB 4: RED ── */}
        <TabsContent value="red" className="space-y-6">
          {/* Coaliciones */}
          <ToolSection
            icon={<Handshake className="h-4 w-4" />}
            title="Coaliciones"
            subtitle="Alianzas estratégicas en la red política"
            accent={ac}
          >
            {data.coalitions.length === 0 ? (
              <EmptyHint>Sin coaliciones activas.</EmptyHint>
            ) : (
              <div className="space-y-2">
                {data.coalitions.map((c) => (
                  <LinkCard
                    key={c.slug}
                    href={`/partido/${c.slug}`}
                    icon={<Flag className="h-4 w-4" />}
                    title={c.name}
                    subtitle="Coalición aliada"
                    accent={ac}
                  />
                ))}
              </div>
            )}
          </ToolSection>

          {/* Iniciativas legislativas */}
          <ToolSection
            icon={<Scale className="h-4 w-4" />}
            title="Iniciativas legislativas"
            subtitle="Propuestas presentadas a la Cámara"
            accent={ac}
          >
            {data.proposalIds.length === 0 ? (
              <EmptyHint>Sin iniciativas registradas.</EmptyHint>
            ) : (
              <div className="space-y-2">
                {data.proposalIds.map((id) => (
                  <LinkCard
                    key={id}
                    href="/network/politics"
                    icon={<FileText className="h-4 w-4" />}
                    title="Iniciativa en la Cámara"
                    subtitle={id}
                    accent={ac}
                    external
                  />
                ))}
              </div>
            )}
          </ToolSection>

          {/* Próximos actos */}
          <ToolSection
            icon={<CalendarDays className="h-4 w-4" />}
            title="Próximos actos"
            subtitle="Eventos públicos del partido"
            accent={ac}
          >
            {data.eventSlugs.length === 0 ? (
              <EmptyHint>Sin actos programados.</EmptyHint>
            ) : (
              <div className="space-y-2">
                {data.eventSlugs.map((s) => (
                  <LinkCard
                    key={s}
                    href={`/evento/${s}`}
                    icon={<CalendarDays className="h-4 w-4" />}
                    title={humaniseSlug(s)}
                    subtitle={`/evento/${s}`}
                    accent={ac}
                    external
                  />
                ))}
              </div>
            )}
          </ToolSection>
        </TabsContent>

        {/* ── TAB 5: DECISIONES (gobernanza real del partido) ── */}
        <TabsContent value="decisiones" className="space-y-6">
          <DecisionesSection kind="partido" slug={slug} accent={ac} name={name ?? data.name} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
