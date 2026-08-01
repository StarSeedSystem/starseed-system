"use client";

// StarSeed · Ontocracia · Justicia RESTAURATIVA por ENTIDAD — panel embebible
// (grupo / página / comunidad / E.F. / partido). Espeja EXACTAMENTE el panel
// global de /network/politics (mediation.tsx: MediationPanel) pero anclado al
// `entity_state` de la propia entidad, con su RLS por miembros/dueño.
//
// Invariante §6 de CLAUDE.md: «Justicia restaurativa, no punitiva». Sin castigos
// ni bloqueos: procesos de mediación (Círculos de Paz) que restauran el vínculo.
//
// Aditivo, defensivo y local-first: si la sincronización con la red falla, se
// avisa (badge «local en este dispositivo») y se sigue funcionando en local.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { GlassCard } from "@/components/ui/glass-card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Gavel, HeartHandshake, Loader2, MessageSquare, Plus, Scale, Users, WifiOff } from "lucide-react";
import { MEDIATION_STAGE_LABEL, type MediationCase, type MediationStage } from "@/lib/governance/political";
import {
  mediationRef,
  loadEntityMediationCases,
  createEntityMediationCase,
  updateEntityMediationCase,
  type MediationEntityKind,
} from "@/lib/governance/mediation-entity";

// Orden de avance «positivo» (hacia el acuerdo). "sin_acuerdo" es la salida.
const STAGE_ORDER: MediationStage[] = ["solicitada", "facilitador_asignado", "en_circulo", "acuerdo"];

const STAGE_CLS: Record<MediationStage, string> = {
  solicitada: "border-white/20 text-white/60",
  facilitador_asignado: "border-sky-400/40 text-sky-200 bg-sky-500/10",
  en_circulo: "border-amber-400/40 text-amber-200 bg-amber-500/10",
  acuerdo: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10",
  sin_acuerdo: "border-red-400/40 text-red-200 bg-red-500/10",
};

// Sustantivo legible por tipo de entidad (para la copia del encabezado).
const KIND_NOUN: Record<MediationEntityKind, string> = {
  group: "grupo",
  page: "página",
  community: "comunidad",
  ef: "entidad federativa",
  party: "partido",
};

export interface MediationSectionProps {
  /** Tipo de entidad — determina el ámbito (kind) del entity_state. */
  entityKind: MediationEntityKind;
  /** Slug/ID de la entidad → id del ámbito de mediación. */
  slug: string;
  /** Color de acento de la entidad (por defecto Emerald del tema). */
  accent?: string;
  /** Nombre legible de la entidad (para la copia). */
  name?: string;
}

export function MediationSection({ entityKind, slug, accent, name }: MediationSectionProps) {
  const [cases, setCases] = useState<MediationCase[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [participants, setParticipants] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await loadEntityMediationCases(mediationRef(entityKind, slug));
    setCases(res.list);
    setDegraded(res.degraded);
    setLoading(false);
  }, [entityKind, slug]);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!title.trim()) {
      toast.error("Ponle un título al caso.");
      return;
    }
    setBusy("new");
    const res = await createEntityMediationCase(mediationRef(entityKind, slug), {
      title,
      description,
      participants: participants.split(",").map((p) => p.trim()).filter(Boolean),
    });
    if (res.ok) {
      toast.success(
        res.degraded
          ? "Caso guardado en este dispositivo (sin conexión a la red)"
          : "Proceso de mediación iniciado",
      );
      setTitle("");
      setDescription("");
      setParticipants("");
      setShowForm(false);
      await load();
    } else {
      toast.error(res.error ?? "No se pudo iniciar el proceso.");
    }
    setBusy(null);
  }

  async function advance(c: MediationCase, stage: MediationStage) {
    setBusy(c.id);
    const res = await updateEntityMediationCase(mediationRef(entityKind, slug), c.id, { stage });
    if (res.ok) {
      toast.success(`Caso actualizado a «${MEDIATION_STAGE_LABEL[stage]}»`);
      await load();
    } else {
      toast.error(res.error ?? "No se pudo actualizar el caso.");
    }
    setBusy(null);
  }

  const accentColor = accent ?? "#10B981";
  const kindNoun = KIND_NOUN[entityKind] ?? "entidad";

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <GlassCard className="p-[clamp(1rem,2.5vw,1.5rem)]">
        <div className="mb-1 flex items-center gap-2" style={{ color: accentColor }}>
          <Scale className="h-5 w-5" />
          <h3 className="font-headline text-base font-semibold leading-tight">
            Justicia restaurativa · Círculos de Paz
          </h3>
          {degraded && (
            <Badge
              variant="outline"
              className="ml-auto gap-1 text-[9px] border-amber-400/40 text-amber-200 bg-amber-500/10"
            >
              <WifiOff className="h-2.5 w-2.5" /> local en este dispositivo
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Mediación NO punitiva de {name ?? `este ${kindNoun}`}: sin castigos ni bloqueos, restauración del
          vínculo mediante Círculos de Paz. Cada {kindNoun} gestiona sus propios casos con soberanía.
        </p>
      </GlassCard>

      {/* Nueva disputa */}
      <Card className="border-dashed border-2 bg-muted/10">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-base">
            <Gavel className="h-5 w-5" /> Nueva disputa
          </CardTitle>
          <CardDescription>
            Presenta un caso para mediación comunitaria descentralizada — sin castigo, restauración del vínculo.
          </CardDescription>
        </CardHeader>
        {showForm && (
          <CardContent>
            <div className="mx-auto max-w-md space-y-2 text-left">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Título del caso"
                className="h-9 text-sm"
              />
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe el conflicto…"
                className="min-h-[72px] text-sm"
              />
              <Input
                value={participants}
                onChange={(e) => setParticipants(e.target.value)}
                placeholder="Partes implicadas (separadas por coma)"
                className="h-9 text-sm"
              />
            </div>
          </CardContent>
        )}
        <CardFooter className="justify-center gap-2 pb-6">
          {showForm ? (
            <>
              <Button onClick={submit} disabled={busy === "new"} className="gap-1.5">
                {busy === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Iniciar proceso de mediación
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button onClick={() => setShowForm(true)} className="gap-1.5">
              <Plus className="h-4 w-4" /> Iniciar proceso de mediación
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* Lista de casos */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando casos…
        </div>
      ) : cases.length === 0 ? (
        <EmptyState
          icon={HeartHandshake}
          title="Aún no hay Círculos de Paz"
          description="Cuando surja un conflicto, abre un proceso de mediación restaurativa para resolverlo en comunidad, sin castigos ni bloqueos."
          action={
            !showForm ? (
              <Button onClick={() => setShowForm(true)} className="gap-1.5">
                <Plus className="h-4 w-4" /> Iniciar proceso de mediación
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cases.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{c.title}</CardTitle>
                    <CardDescription>Círculo de Paz · Mediación restaurativa</CardDescription>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0 text-[10px]", STAGE_CLS[c.stage])}>
                    {MEDIATION_STAGE_LABEL[c.stage]}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{c.description || "Sin descripción adicional."}</p>

                {c.participants.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-lg bg-muted/30 p-3">
                    <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Users className="h-3 w-3" /> Partes involucradas
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {c.participants.map((p) => (
                        <Badge key={p} variant="outline" className="bg-background">
                          {p}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {c.facilitator && (
                  <div className="text-xs text-muted-foreground">
                    Facilitador/a: <span className="text-white/80">{c.facilitator}</span>
                  </div>
                )}

                {c.updates.length > 0 && (
                  <div className="space-y-1.5 border-t border-white/10 pt-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Bitácora del círculo
                    </span>
                    <ul className="space-y-1.5">
                      {c.updates
                        .slice()
                        .reverse()
                        .map((u, i) => (
                          <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                            <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                            <span>
                              <span className="text-white/80">{u.byLabel ?? "Alguien"}</span>: {u.note}
                              <span className="ml-1 opacity-50">
                                · {new Date(u.at).toLocaleDateString("es-ES")}
                              </span>
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <HeartHandshake className="h-3 w-3" /> {c.createdByLabel ?? "Alguien"} ·{" "}
                  {new Date(c.createdAt).toLocaleDateString("es-ES")}
                </div>
              </CardContent>
              <CardFooter className="flex flex-wrap gap-1.5">
                {STAGE_ORDER.filter((s) => s !== c.stage).map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant="ghost"
                    className="h-7 border text-[11px]"
                    disabled={busy === c.id}
                    onClick={() => advance(c, s)}
                  >
                    {MEDIATION_STAGE_LABEL[s]}
                  </Button>
                ))}
                {c.stage !== "sin_acuerdo" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 border text-[11px] text-red-300"
                    disabled={busy === c.id}
                    onClick={() => advance(c, "sin_acuerdo")}
                  >
                    Sin acuerdo
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export default MediationSection;
