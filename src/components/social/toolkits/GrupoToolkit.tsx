"use client";

import Link from "next/link";
import React, { useState } from "react";
import {
  ToolSection,
  StatTile,
  StatGrid,
  RosterStrip,
  ProgressRow,
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
import { getGroup, type GroupData } from "@/data/sample-governance";
import {
  Users2,
  CalendarClock,
  ListTodo,
  BookOpen,
  CheckCircle2,
  Circle,
  GraduationCap,
  FileText,
  Github,
  Database,
  Video,
  CalendarDays,
  Network,
} from "lucide-react";

// ── Helpers ───────────────────────────────────────────────────────────────────

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function resourceIcon(type: GroupData["resources"][number]["type"]) {
  switch (type) {
    case "Artículo":
      return FileText;
    case "Curso":
      return GraduationCap;
    case "Repo":
      return Github;
    case "Dataset":
      return Database;
    case "Video":
      return Video;
    default:
      return FileText;
  }
}

// ── Sub-tabs ──────────────────────────────────────────────────────────────────

function TabSesiones({ data, ac }: { data: GroupData; ac: string }) {
  return (
    <ToolSection
      icon={<CalendarClock size={16} />}
      title="Sesiones de estudio"
      subtitle="Calendario del círculo de aprendizaje"
      accent={ac}
    >
      <div className="space-y-6">
        <StatGrid cols={3}>
          <StatTile
            icon={<Users2 size={14} />}
            label="Miembros"
            value={data.members.toString()}
            hint="participantes activos"
            accent={ac}
          />
          <StatTile
            label="Nivel"
            value={data.level}
            hint="dificultad del círculo"
            accent={ac}
          />
          <StatTile
            label="Tema"
            value={data.topic}
            hint="foco del período actual"
            accent={ac}
          />
        </StatGrid>

        <Separator className="opacity-20" />

        <Timeline entries={data.sessions} accent={ac} />
      </div>
    </ToolSection>
  );
}

function TabTareas({ data, ac }: { data: GroupData; ac: string }) {
  const [done, setDone] = useState<boolean[]>(() =>
    data.tasks.map((t) => t.done)
  );

  function toggle(idx: number) {
    setDone((prev) => {
      const next = [...prev];
      next[idx] = !next[idx];
      return next;
    });
  }

  const completedCount = done.filter(Boolean).length;
  const total = done.length;
  const progress = total === 0 ? 0 : Math.round((completedCount / total) * 100);

  return (
    <ToolSection
      icon={<ListTodo size={16} />}
      title="Tareas del círculo"
      subtitle="Seguimiento de compromisos de aprendizaje"
      accent={ac}
    >
      <div className="space-y-4">
        {total === 0 ? (
          <EmptyHint>No hay tareas asignadas en este círculo todavía.</EmptyHint>
        ) : (
          <>
            <ProgressRow
              label="Progreso"
              value={progress}
              detail={`${completedCount} / ${total} completadas`}
              accent={ac}
            />

            <Separator className="opacity-20" />

            <ul className="space-y-2">
              {data.tasks.map((task, idx) => (
                <li key={idx}>
                  <button
                    type="button"
                    onClick={() => toggle(idx)}
                    className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors duration-150 hover:bg-white/5 cursor-pointer"
                  >
                    {done[idx] ? (
                      <CheckCircle2
                        size={18}
                        className="mt-0.5 shrink-0"
                        style={{ color: ac }}
                      />
                    ) : (
                      <Circle
                        size={18}
                        className="mt-0.5 shrink-0 text-white/30"
                      />
                    )}

                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span
                        className={`text-sm font-medium leading-snug transition-all duration-150 ${
                          done[idx]
                            ? "text-white/40 line-through"
                            : "text-white/90"
                        }`}
                      >
                        {task.title}
                      </span>

                      {task.owner && (
                        <span className="text-xs text-white/40">
                          {task.owner}
                        </span>
                      )}
                    </div>

                    {done[idx] && (
                      <Chip accent={ac}>Completada</Chip>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </ToolSection>
  );
}

function TabRecursos({ data, ac }: { data: GroupData; ac: string }) {
  return (
    <ToolSection
      icon={<BookOpen size={16} />}
      title="Recursos compartidos"
      subtitle="Materiales de estudio y referencia del círculo"
      accent={ac}
    >
      <div className="space-y-3">
        {data.resources.length === 0 ? (
          <EmptyHint>
            El círculo aún no ha añadido recursos compartidos.
          </EmptyHint>
        ) : (
          data.resources.map((res, idx) => {
            const Icon = resourceIcon(res.type);
            return (
              <LinkCard
                key={idx}
                href={res.href}
                icon={<Icon size={15} />}
                title={res.name}
                subtitle={res.type}
                accent={ac}
              />
            );
          })
        )}
      </div>
    </ToolSection>
  );
}

function TabEventos({ data, ac }: { data: GroupData; ac: string }) {
  return (
    <ToolSection
      icon={<Network size={16} />}
      title="Eventos & encuentros"
      subtitle="Actividades presenciales y virtuales vinculadas al círculo"
      accent={ac}
    >
      <div className="space-y-3">
        {data.eventSlugs.length === 0 ? (
          <EmptyHint>
            No hay eventos próximos asociados a este círculo.
          </EmptyHint>
        ) : (
          data.eventSlugs.map((s, idx) => (
            <LinkCard
              key={idx}
              href={`/evento/${s}`}
              icon={<CalendarDays size={15} />}
              title={humanizeSlug(s)}
              subtitle="Encuentro del círculo"
              accent={ac}
              external={false}
            />
          ))
        )}
      </div>
    </ToolSection>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function GrupoToolkit({
  slug,
  accent,
  name,
}: {
  slug: string;
  accent?: string;
  name?: string;
}) {
  const data = getGroup(slug);
  const ac = accent ?? "#22d3ee";

  if (!data) {
    return (
      <EmptyHint>
        Aún no hay información de este círculo. Crea la primera sesión, tarea o recurso para empezar.
      </EmptyHint>
    );
  }


  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="rounded-full px-3 py-1 text-xs font-semibold tracking-wide"
          style={{ background: `${ac}22`, color: ac, border: `1px solid ${ac}44` }}
        >
          Círculo de estudio
        </span>
        <span className="text-sm text-white/50">{data.blurb}</span>
      </div>

      <Tabs defaultValue="sesiones">
        <TabsList className="flex w-full flex-nowrap justify-start overflow-x-auto gap-1 bg-white/5 p-1 rounded-xl">
          <TabsTrigger
            value="sesiones"
            className="cursor-pointer whitespace-nowrap data-[state=active]:text-white"
            style={
              {
                "--tw-ring-color": ac,
              } as React.CSSProperties
            }
          >
            <CalendarClock size={13} className="mr-1.5 inline" />
            Sesiones
          </TabsTrigger>
          <TabsTrigger
            value="tareas"
            className="cursor-pointer whitespace-nowrap"
          >
            <ListTodo size={13} className="mr-1.5 inline" />
            Tareas
          </TabsTrigger>
          <TabsTrigger
            value="recursos"
            className="cursor-pointer whitespace-nowrap"
          >
            <BookOpen size={13} className="mr-1.5 inline" />
            Recursos
          </TabsTrigger>
          <TabsTrigger
            value="eventos"
            className="cursor-pointer whitespace-nowrap"
          >
            <Network size={13} className="mr-1.5 inline" />
            Eventos
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sesiones" className="mt-4">
          <TabSesiones data={data} ac={ac} />
        </TabsContent>

        <TabsContent value="tareas" className="mt-4">
          <TabTareas data={data} ac={ac} />
        </TabsContent>

        <TabsContent value="recursos" className="mt-4">
          <TabRecursos data={data} ac={ac} />
        </TabsContent>

        <TabsContent value="eventos" className="mt-4">
          <TabEventos data={data} ac={ac} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
