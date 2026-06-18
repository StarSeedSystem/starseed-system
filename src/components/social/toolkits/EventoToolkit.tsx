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
import { getEventExtras, type EventExtras } from "@/data/sample-governance";
import {
  CalendarClock,
  Users,
  MapPin,
  Boxes,
  Mic2,
  Sparkles,
  Network,
  Globe,
  FileText,
  ArrowUpRight,
  Ticket,
} from "lucide-react";

const fallback: EventExtras = {
  agenda: [],
  speakers: [],
  venue: {},
  resources: [],
  rsvp: { going: 0, interested: 0, capacity: 0 },
};

export function EventoToolkit({
  slug,
  accent,
  name,
}: {
  slug: string;
  accent?: string;
  name?: string;
}) {
  const data = getEventExtras(slug) ?? fallback;
  const ac = accent ?? GOLD;

  const ocupacion =
    data.rsvp.capacity > 0
      ? Math.round((data.rsvp.going / data.rsvp.capacity) * 100)
      : 0;

  const hasResources = data.resources.length > 0;
  const hasOrganizer = !!data.organizerSlug;
  const hasNetworkContent = hasResources || hasOrganizer;

  return (
    <div className="flex flex-col gap-6">
      <Tabs defaultValue="programa">
        <TabsList className="flex w-full flex-nowrap justify-start overflow-x-auto">
          <TabsTrigger
            value="programa"
            className="cursor-pointer flex items-center gap-1.5"
          >
            <CalendarClock className="w-3.5 h-3.5" />
            Programa
          </TabsTrigger>
          <TabsTrigger
            value="asistentes"
            className="cursor-pointer flex items-center gap-1.5"
          >
            <Users className="w-3.5 h-3.5" />
            Asistentes
          </TabsTrigger>
          <TabsTrigger
            value="ubicacion"
            className="cursor-pointer flex items-center gap-1.5"
          >
            <MapPin className="w-3.5 h-3.5" />
            Ubicación
          </TabsTrigger>
          <TabsTrigger
            value="red"
            className="cursor-pointer flex items-center gap-1.5"
          >
            <Network className="w-3.5 h-3.5" />
            Red
          </TabsTrigger>
        </TabsList>

        {/* ── PROGRAMA ── */}
        <TabsContent value="programa" className="mt-6 space-y-6">
          <ToolSection
            icon={CalendarClock}
            title="Programa del evento"
            subtitle={
              name
                ? `Agenda oficial · ${name}`
                : "Agenda oficial del evento"
            }
            accent={ac}
          >
            {data.agenda.length === 0 ? (
              <EmptyHint>El programa se publicará pronto.</EmptyHint>
            ) : (
              <Timeline
                entries={data.agenda.map((a) => ({
                  time: a.time,
                  title: a.title,
                  detail: a.speaker
                    ? `Ponente: ${a.speaker}`
                    : undefined,
                }))}
                accent={ac}
              />
            )}
          </ToolSection>

          <ToolSection
            icon={Mic2}
            title="Ponentes"
            subtitle="Personas que presentan en este evento"
            accent={ac}
          >
            {data.speakers.length === 0 ? (
              <EmptyHint>Los ponentes se anunciarán próximamente.</EmptyHint>
            ) : (
              <div className="space-y-2">
                {data.speakers.map((s) => (
                  <PersonRow
                    key={s.name}
                    name={s.name}
                    role={s.role}
                    accent={ac}
                  />
                ))}
              </div>
            )}
          </ToolSection>
        </TabsContent>

        {/* ── ASISTENTES ── */}
        <TabsContent value="asistentes" className="mt-6 space-y-6">
          <ToolSection
            icon={Users}
            title="Asistencia"
            subtitle="Estado actual de inscripciones y aforo"
            accent={ac}
          >
            <StatGrid cols={3}>
              <StatTile
                icon={Ticket}
                label="Confirmados"
                value={data.rsvp.going.toString()}
                hint="RSVP confirmado"
                accent={ac}
              />
              <StatTile
                icon={Sparkles}
                label="Interesados"
                value={data.rsvp.interested.toString()}
                hint="Pendientes de confirmar"
                accent={ac}
              />
              <StatTile
                icon={Boxes}
                label="Aforo"
                value={
                  data.rsvp.capacity > 0
                    ? data.rsvp.capacity.toString()
                    : "Sin límite"
                }
                hint="Capacidad máxima"
                accent={ac}
              />
            </StatGrid>

            <div className="mt-4">
              <ProgressRow
                label="Ocupación"
                value={ocupacion}
                detail={`${data.rsvp.going}/${data.rsvp.capacity}`}
                accent={ac}
              />
            </div>

            <div className="mt-5">
              <RosterStrip
                count={data.rsvp.going}
                label="asistentes"
                accent={ac}
              />
            </div>
          </ToolSection>

          <ToolSection
            icon={Ticket}
            title="Tu RSVP"
            subtitle="Indica si asistirás a este evento"
            accent={ac}
          >
            <MiniVote
              question="¿Asistirás a este evento?"
              options={["Voy", "Me interesa", "No puedo"]}
              ballotKey={`evento:${slug}:rsvp`}
              ballotType="rsvp"
              accent={ac}
            />
          </ToolSection>
        </TabsContent>

        {/* ── UBICACIÓN ── */}
        <TabsContent value="ubicacion" className="mt-6 space-y-6">
          <ToolSection
            icon={MapPin}
            title="Ubicación"
            subtitle="Este evento se transmite y coordina en ambos planos: físico y Multiverso"
            accent={ac}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {/* Espacio físico */}
              <GlassCard className="p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                    style={{
                      borderColor: `${ac}44`,
                      background: `${ac}14`,
                      color: ac,
                    }}
                  >
                    <MapPin className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Espacio físico
                    </p>
                    <p className="text-sm font-semibold leading-snug">
                      {data.venue.physical ?? "Por confirmar"}
                    </p>
                  </div>
                </div>
              </GlassCard>

              {/* Multiverso */}
              <GlassCard className="p-4">
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border"
                    style={{
                      borderColor: `${ac}44`,
                      background: `${ac}14`,
                      color: ac,
                    }}
                  >
                    <Globe className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                      Multiverso
                    </p>
                    <p className="text-sm font-semibold leading-snug">
                      {data.venue.multiverse ?? "—"}
                    </p>
                  </div>
                </div>
              </GlassCard>
            </div>

            <p className="mt-4 text-xs text-muted-foreground leading-relaxed">
              El evento se transmite y coordina en ambos planos simultáneamente.
              Puedes participar desde el espacio físico o conectarte desde el
              Multiverso de la red StarSeed.
            </p>
          </ToolSection>
        </TabsContent>

        {/* ── RED ── */}
        <TabsContent value="red" className="mt-6 space-y-6">
          <ToolSection
            icon={Network}
            title="Recursos & anfitrión"
            subtitle="Documentos relacionados y organizador del evento"
            accent={ac}
          >
            {!hasNetworkContent ? (
              <EmptyHint>
                No hay recursos ni anfitrión vinculados a este evento todavía.
              </EmptyHint>
            ) : (
              <div className="space-y-3">
                {data.resources.map((r) => (
                  <LinkCard
                    key={r.href}
                    href={r.href}
                    icon={FileText}
                    title={r.name}
                    subtitle="Recurso del evento"
                    accent={ac}
                    external
                  />
                ))}

                {data.organizerSlug && (
                  <LinkCard
                    href={`/pagina/${data.organizerSlug}`}
                    icon={Sparkles}
                    title="Organiza este evento"
                    subtitle={data.organizerSlug}
                    accent={ac}
                    external
                  />
                )}
              </div>
            )}
          </ToolSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
