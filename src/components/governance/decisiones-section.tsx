"use client";

// StarSeed · Ontocracia — Sección "Decisiones" embebible en páginas de detalle
// (entidad / grupo / comunidad / partido / página). Monta el GovernancePanel real
// con el `scopeRef` de la entidad para que cada comunidad/grupo tenga SU propia
// superficie de gobernanza (propuestas + votación + comandos), y además el panel
// de VOTO LÍQUIDO DELEGADO acotado a ese mismo tema.
//
// Es aditivo: no toca el motor ni las páginas que ya funcionan; sólo compone
// piezas existentes. `scope` mapea el tipo de entidad al ámbito de gobernanza.

import { useMemo } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { Landmark } from "lucide-react";
import GovernancePanel from "@/components/governance/governance-panel";
import DelegationPanel from "@/components/governance/delegation-panel";

// Mapa de tipo de entidad → ámbito de gobernanza del motor. Comunidades,
// entidades federativas, asambleas y partidos comparten el ámbito "community"
// (viven como páginas/colectivos de gobernanza); los grupos usan "group".
const KIND_TO_SCOPE: Record<string, string> = {
  comunidad: "community",
  community: "community",
  ef: "community",
  entidad: "community",
  asamblea: "community",
  partido: "community",
  page: "page",
  pagina: "page",
  grupo: "group",
  group: "group",
};

export function decisionScopeFor(kind: string): string {
  return KIND_TO_SCOPE[kind?.toLowerCase?.() ?? ""] ?? "community";
}

export function DecisionesSection({
  kind,
  slug,
  accent,
  name,
}: {
  /** Tipo de entidad (comunidad, ef, partido, grupo, page…). */
  kind: string;
  /** Slug/ID de la entidad → se usa como scopeRef del ámbito de gobernanza. */
  slug: string;
  accent?: string;
  name?: string;
}) {
  const scope = useMemo(() => decisionScopeFor(kind), [kind]);
  const scopeRef = slug;

  return (
    <div className="space-y-6">
      <GlassCard className="p-[clamp(1rem,2.5vw,1.5rem)]">
        <div className="mb-1 flex items-center gap-2" style={{ color: accent ?? "#10B981" }}>
          <Landmark className="h-5 w-5" />
          <h3 className="font-headline text-base font-semibold leading-tight">
            Decisiones de {name ?? "esta entidad"}
          </h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Gobernanza soberana de este espacio: propón cambios, vota (voto público) y deja que las decisiones
          aprobadas ejecuten comandos. Cada entidad tiene su propia superficie democrática.
        </p>
      </GlassCard>

      {/* Voto líquido delegado, acotado al tema de esta entidad. */}
      <DelegationPanel scope={scope} scopeRef={scopeRef} accent={accent} />

      {/* Motor de decisiones real, anclado a este scope/scopeRef. */}
      <GovernancePanel scope={scope} scopeRef={scopeRef} />
    </div>
  );
}

export default DecisionesSection;
