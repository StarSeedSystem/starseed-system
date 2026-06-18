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
import { getFederativeEntity, type EFData } from "@/data/sample-governance";
import {
  Landmark,
  Scale,
  Users,
  BarChart3,
  Coins,
  Map,
  Vote,
  FileText,
  CalendarDays,
  Gavel,
  HeartHandshake,
  Building2,
  Network,
  ArrowUpRight,
  Wallet,
  ShieldCheck,
} from "lucide-react";

// Humanise a slug → "Taller De Permacultura"
function humaniseSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// Sub-entity kind → href
function subEntityHref(kind: EFData["subEntities"][number]["kind"], slug: string): string {
  if (kind === "asamblea") return `/grupo/${slug}`;
  return `/pagina/${slug}`;
}

export function EntidadFederativaToolkit({
  slug,
  accent,
  name,
}: {
  slug: string;
  accent?: string;
  name?: string;
}) {
  const data = getFederativeEntity(slug);
  const ac = accent ?? data.accent;

  return (
    <div className="space-y-2">
      {/* Header badge row */}
      <div className="flex flex-wrap items-center gap-2 pb-1">
        <Badge
          className="text-xs font-semibold uppercase tracking-wider cursor-pointer"
          style={{ background: ac, color: "#fff" }}
        >
          <Landmark className="mr-1.5 h-3 w-3" />
          Entidad Federativa
        </Badge>
        <Badge
          variant="outline"
          className="text-xs cursor-pointer"
          style={{ borderColor: ac, color: ac }}
        >
          <ShieldCheck className="mr-1 h-3 w-3" />
          Soberanía Directa
        </Badge>
        <span className="text-xs text-muted-foreground">{data.blurb}</span>
      </div>

      <Tabs defaultValue="legislativo">
        <TabsList className="flex w-full flex-nowrap justify-start overflow-x-auto gap-1 mb-4">
          <TabsTrigger value="legislativo" className="cursor-pointer whitespace-nowrap">
            <Scale className="mr-1.5 h-3.5 w-3.5" />
            Legislativo
          </TabsTrigger>
          <TabsTrigger value="ejecutivo" className="cursor-pointer whitespace-nowrap">
            <Wallet className="mr-1.5 h-3.5 w-3.5" />
            Ejecutivo
          </TabsTrigger>
          <TabsTrigger value="judicial" className="cursor-pointer whitespace-nowrap">
            <HeartHandshake className="mr-1.5 h-3.5 w-3.5" />
            Judicial
          </TabsTrigger>
          <TabsTrigger value="territorio" className="cursor-pointer whitespace-nowrap">
            <Map className="mr-1.5 h-3.5 w-3.5" />
            Territorio
          </TabsTrigger>
          <TabsTrigger value="voto-liquido" className="cursor-pointer whitespace-nowrap">
            <Network className="mr-1.5 h-3.5 w-3.5" />
            Voto Líquido
          </TabsTrigger>
        </TabsList>

        {/* ── TAB 1: LEGISLATIVO ── */}
        <TabsContent value="legislativo" className="space-y-6">
          <ToolSection
            icon={Scale}
            title="Cámara Legislativa"
            subtitle={`Marco normativo de ${data.name} — elaborado por la ciudadanía soberana`}
            accent={ac}
          >
            <StatGrid cols={3}>
              <StatTile
                icon={FileText}
                label="Leyes activas"
                value={data.chamber.activeLaws}
                hint="normas vigentes en la E.F."
                accent={ac}
              />
              <StatTile
                icon={BarChart3}
                label="En debate"
                value={data.chamber.inDebate}
                hint="iniciativas en deliberación"
                accent={ac}
              />
              <StatTile
                icon={Users}
                label="Participación"
                value={`${data.chamber.participation}%`}
                hint="ciudadanía activa en la cámara"
                accent={ac}
              />
            </StatGrid>
          </ToolSection>

          {data.proposalIds.length > 0 && (
            <ToolSection
              icon={FileText}
              title="Iniciativas en votación"
              subtitle="Propuestas legislativas abiertas a voto ciudadano"
              accent={ac}
            >
              <div className="space-y-2">
                {data.proposalIds.map((id) => (
                  <LinkCard
                    key={id}
                    href="/network/politics"
                    icon={FileText}
                    title="Iniciativa en votación"
                    subtitle={id}
                    accent={ac}
                    external
                  />
                ))}
              </div>
            </ToolSection>
          )}

          <ToolSection
            icon={Vote}
            title="Pulso Legislativo"
            subtitle="Voto ciudadano sobre la agenda normativa actual"
            accent={ac}
          >
            <MiniVote
              question={`¿Apruebas las prioridades legislativas de ${data.name}?`}
              ballotKey={`ef:${data.slug}:legislativo`}
              ballotType="proposal"
              accent={ac}
            />
          </ToolSection>
        </TabsContent>

        {/* ── TAB 2: EJECUTIVO ── */}
        <TabsContent value="ejecutivo" className="space-y-6">
          <ToolSection
            icon={Wallet}
            title="Presupuesto Participativo"
            subtitle="La ciudadanía decide directamente cómo se distribuyen los recursos comunes"
            accent={ac}
          >
            <div className="mb-5">
              <StatTile
                icon={Coins}
                label="Presupuesto anual"
                value={`${(data.budget.totalSeeds / 1000).toLocaleString("es-ES")}k SC`}
                hint="Semillas Comunes gestionadas por la ciudadanía"
                accent={ac}
              />
            </div>

            <div className="space-y-3">
              {data.budget.allocations.map((a) => (
                <ProgressRow
                  key={a.area}
                  label={a.area}
                  value={a.pct}
                  detail={`${(a.amount / 1000).toLocaleString("es-ES")}k SC · ${a.pct}%`}
                  accent={ac}
                />
              ))}
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-xs leading-relaxed text-muted-foreground">
              <span style={{ color: ac }} className="font-semibold">
                Excedente participativo.
              </span>{" "}
              Los fondos no asignados en el presupuesto base son distribuidos directamente por la ciudadanía mediante votación abierta al final de cada trimestre. Ninguna autoridad ejecutiva puede reasignar el excedente sin mandato popular.
            </div>
          </ToolSection>

          <ToolSection
            icon={BarChart3}
            title="Destino del excedente trimestral"
            subtitle="¿A qué área prioritaria asignas los fondos no ejecutados?"
            accent={ac}
          >
            <MiniVote
              question="¿A qué área destinar el excedente de este trimestre?"
              ballotKey={`ef:${data.slug}:presupuesto`}
              ballotType="budget"
              options={data.budget.allocations.map((a) => a.area).slice(0, 3)}
              accent={ac}
            />
          </ToolSection>
        </TabsContent>

        {/* ── TAB 3: JUDICIAL ── */}
        <TabsContent value="judicial" className="space-y-6">
          <ToolSection
            icon={HeartHandshake}
            title="Justicia Restaurativa"
            subtitle="Sin castigo — restauración de vínculos comunitarios mediante mediación y Círculos de Paz"
            accent={ac}
          >
            <p className="text-sm leading-relaxed text-muted-foreground">
              El sistema judicial de{" "}
              <span style={{ color: ac }} className="font-semibold">
                {data.name}
              </span>{" "}
              no aplica sanciones punitivas. Cada conflicto se aborda como una oportunidad de sanar el tejido comunitario. Los{" "}
              <span className="font-medium text-foreground">Círculos de Paz</span> reúnen a las partes implicadas, personas facilitadoras formadas en mediación y, cuando procede, a testigos comunitarios. El objetivo no es determinar culpa sino restaurar el equilibrio y acordar compromisos concretos. El proceso es confidencial y el resultado es vinculante por consenso.
            </p>

            <Separator className="my-4" />

            <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Casos activos
            </p>

            <div className="space-y-2">
              {/* Sample deterministic case */}
              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ background: `${ac}22`, color: ac }}
                >
                  <Gavel className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">
                    Disputa de límites — Huerto A vs Huerto B
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Conflicto sobre uso compartido de riego entre dos huertos comunitarios.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Chip accent="#FFBF00">En mediación</Chip>
                    <Chip accent={ac}>Círculo de Paz convocado</Chip>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3.5">
                <span
                  className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                  style={{ background: `${ac}22`, color: ac }}
                >
                  <Gavel className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">
                    Uso de espacios comunes — Sala Polivalente Norte
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Desacuerdo sobre calendarización de actividades entre dos grupos de la Sangha.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Chip accent="#10B981">Acuerdo alcanzado</Chip>
                  </div>
                </div>
              </div>
            </div>
          </ToolSection>

          <ToolSection
            icon={Gavel}
            title="Círculo de Paz — Mediación"
            subtitle="Asamblea facilitadora de procesos restaurativos en la red"
            accent={ac}
          >
            <div className="space-y-2">
              <LinkCard
                href="/evento/circulo-de-paz-mediacion"
                icon={Gavel}
                title="Círculo de Paz — Mediación restaurativa"
                subtitle="Taller abierto de mediación comunitaria"
                accent={ac}
                external
              />
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-xs leading-relaxed text-muted-foreground">
                <span style={{ color: ac }} className="font-semibold">
                  Cómo solicitar mediación.
                </span>{" "}
                Cualquier ciudadana o ciudadano puede abrir un proceso restaurativo desde su perfil. El Círculo de Paz asignará facilitadoras en un plazo máximo de 72 horas. La participación es voluntaria para la parte requirente e invitada, aunque el rechazo reiterado puede ser considerado en el registro de conducta comunitaria.
              </div>
            </div>
          </ToolSection>
        </TabsContent>

        {/* ── TAB 4: TERRITORIO ── */}
        <TabsContent value="territorio" className="space-y-6">
          <ToolSection
            icon={Map}
            title="Territorio"
            subtitle={`${data.territory.name} — ${data.territory.type}`}
            accent={ac}
          >
            <StatGrid cols={4}>
              <StatTile
                icon={ShieldCheck}
                label="Ciudadanía"
                value={data.citizens.toLocaleString("es-ES")}
                hint="personas con voto soberano"
                accent={ac}
              />
              <StatTile
                icon={Users}
                label="Población"
                value={data.territory.population.toLocaleString("es-ES")}
                hint="habitantes del territorio"
                accent={ac}
              />
              <StatTile
                icon={Landmark}
                label="Sanghas"
                value={data.territory.sanghas}
                hint="comunidades físicas activas"
                accent={ac}
              />
              <StatTile
                icon={Map}
                label="Tipo"
                value={data.territory.type}
                hint="clasificación territorial"
                accent={ac}
              />
            </StatGrid>

            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.02] p-3.5 text-xs leading-relaxed text-muted-foreground">
              <span style={{ color: ac }} className="font-semibold">
                Soberanía territorial.
              </span>{" "}
              Los límites de esta Entidad Federativa son definidos por consenso de su ciudadanía, no por fronteras administrativas heredadas. Cualquier modificación territorial requiere referéndum con participación mínima del 60 % del censo.
            </div>
          </ToolSection>

          <ToolSection
            icon={Building2}
            title="Sub-entidades federadas"
            subtitle="Nodos comunitarios y asambleas que integran esta Entidad Federativa"
            accent={ac}
          >
            {data.subEntities.length === 0 ? (
              <EmptyHint>Sin sub-entidades registradas.</EmptyHint>
            ) : (
              <div className="space-y-2">
                {data.subEntities.map((se) => (
                  <LinkCard
                    key={se.slug}
                    href={subEntityHref(se.kind, se.slug)}
                    icon={Network}
                    title={se.name}
                    subtitle={`${se.kind} · ${se.members.toLocaleString("es-ES")} miembros`}
                    accent={ac}
                  />
                ))}
              </div>
            )}
          </ToolSection>
        </TabsContent>

        {/* ── TAB 5: VOTO LÍQUIDO ── */}
        <TabsContent value="voto-liquido" className="space-y-6">
          <ToolSection
            icon={Network}
            title="Delegación de Voto Líquido"
            subtitle="Delega tu voto de forma revocable a personas con sabiduría aplicada verificada"
            accent={ac}
          >
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              La{" "}
              <span style={{ color: ac }} className="font-semibold">
                democracia líquida
              </span>{" "}
              de {data.name} permite que cada ciudadana delegue su voto en expertas reconocidas por la comunidad en ámbitos específicos. La delegación es{" "}
              <span className="font-medium text-foreground">siempre revocable</span>, nunca alienada. Puedes delegar, reasignar o votar directamente en cada iniciativa con independencia de tu delegación activa.
            </p>

            <div className="space-y-2">
              {data.delegates.map((d, i) => (
                <PersonRow
                  key={d.name}
                  name={d.name}
                  role={d.domain}
                  badge={`${d.delegatedVotes.toLocaleString("es-ES")} votos`}
                  accent={ac}
                  seed={i + 7}
                />
              ))}
            </div>
          </ToolSection>

          <ToolSection
            icon={Vote}
            title="Renovación de delegación"
            subtitle="Ciclo trimestral de revisión del voto líquido"
            accent={ac}
          >
            <MiniVote
              question="¿Renovar tu delegación de voto este ciclo?"
              ballotKey={`ef:${data.slug}:delegacion`}
              ballotType="delegation"
              options={["Mantener", "Revocar", "Reasignar"]}
              accent={ac}
            />
          </ToolSection>

          {data.eventSlugs.length > 0 && (
            <ToolSection
              icon={CalendarDays}
              title="Sesiones abiertas"
              subtitle="Asambleas y sesiones de voto líquido abiertas a la ciudadanía"
              accent={ac}
            >
              <div className="space-y-2">
                {data.eventSlugs.map((s) => (
                  <LinkCard
                    key={s}
                    href={`/evento/${s}`}
                    icon={CalendarDays}
                    title={humaniseSlug(s)}
                    subtitle={`/evento/${s}`}
                    accent={ac}
                    external
                  />
                ))}
              </div>
            </ToolSection>
          )}

          <ToolSection
            icon={ShieldCheck}
            title="Garantías de la democracia directa"
            subtitle="Principios irrenunciables del sistema de voto en esta Entidad Federativa"
            accent={ac}
          >
            <div className="space-y-2">
              {[
                { label: "Una persona, una voz", detail: "Verificación biométrica ZK — sin datos brutos almacenados." },
                { label: "Voto secreto garantizado", detail: "Criptografía de conocimiento cero en todas las votaciones vinculantes." },
                { label: "Delegación revocable", detail: "Puedes retirar tu delegación en cualquier momento, incluso durante una votación activa." },
                { label: "Transparencia de resultados", detail: "Todos los escrutinios son públicos y auditables por cualquier ciudadana." },
                { label: "Quórum mínimo exigible", detail: "Las leyes requieren participación mínima del 50 % del censo activo." },
              ].map((item, i) => (
                <div
                  key={item.label}
                  className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-3"
                >
                  <span
                    className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                    style={{ background: `${ac}22`, color: ac }}
                  >
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-medium leading-tight">{item.label}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </ToolSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
