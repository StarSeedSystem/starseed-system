"use client";

// StarSeed · Área Política — Ramas EJECUTIVA y JUDICIAL (reales).
//
// EJECUTIVO: tablero de MANDATOS (decisiones legislativas ya aprobadas/
// ejecutadas) con estado de ejecución (pendiente/en ejecución/completado),
// responsable y reportes de avance — todo vive en `proposals.result.execution`
// (ver src/lib/governance/political.ts, aditivo sobre el motor real). Debajo,
// la administración de recursos comunes con asignaciones.
//
// JUDICIAL: consultas de constitucionalidad y revisión de propuestas
// impugnadas (propuestas reales del motor, kind: consulta_constitucional /
// impugnacion — con voto público como cualquier decisión), procesos de
// mediación restaurativa (Círculos de Paz) y referencia a los documentos
// constitucionales.

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { useRealtimeRows } from "@/lib/realtime/realtime";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Gavel, Loader2, Plus, Scale, UserCheck, Users } from "lucide-react";
import ProposalComposer from "@/components/governance/proposal-composer";
import PoliticalProposalCard from "@/components/political-proposal-card";
import {
  assignResponsible,
  addExecutionReport,
  setExecutionStatus,
  getExecution,
  type ExecutionStatus,
} from "@/lib/governance/political";
import type { Proposal } from "@/lib/governance/types";
import { CommonsResourcesPanel } from "./commons-resources";
import { MediationPanel } from "./mediation";
import { ConstitutionalDocsPanel } from "./constitutional-docs";

// Ámbitos relevantes para el Área Política (mismo criterio que ontocracia-decisiones.tsx).
const POLITICAL_SCOPES = ["global", "community", "page", "group", "account"];
const JUDICIAL_KINDS = ["consulta_constitucional", "impugnacion"];
const MANDATE_STATUSES = ["passed", "executed"];

async function loadMandates(): Promise<Proposal[]> {
  if (typeof window === "undefined") return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("proposals")
      .select("*")
      .in("scope", POLITICAL_SCOPES)
      .in("status", MANDATE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(60);
    if (error) return [];
    return (data as Proposal[]) ?? [];
  } catch {
    return [];
  }
}

async function loadJudicialProposals(): Promise<Proposal[]> {
  if (typeof window === "undefined") return [];
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("proposals")
      .select("*")
      .in("scope", POLITICAL_SCOPES)
      .in("kind", JUDICIAL_KINDS)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return [];
    return (data as Proposal[]) ?? [];
  } catch {
    return [];
  }
}

const COLUMNS: { id: ExecutionStatus; label: string; color: string }[] = [
  { id: "pendiente", label: "Pendiente", color: "bg-yellow-500/10 text-yellow-500" },
  { id: "en_ejecucion", label: "En Ejecución", color: "bg-blue-500/10 text-blue-500" },
  { id: "completado", label: "Completado", color: "bg-green-500/10 text-green-500" },
];

function MandateCard({ proposal, currentUserId, onChange }: { proposal: Proposal; currentUserId: string | null; onChange: () => void }) {
  const execution = getExecution(proposal);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [showReport, setShowReport] = useState(false);

  const canManage = !execution.responsible || execution.responsible === currentUserId || proposal.author === currentUserId;

  async function claim() {
    setBusy(true);
    const res = await assignResponsible(proposal.id);
    if (res.ok) {
      toast.success("Te has asignado este mandato");
      onChange();
    } else toast.error(res.error ?? "No se pudo asignar.");
    setBusy(false);
  }

  async function advance(status: ExecutionStatus) {
    setBusy(true);
    const res = await setExecutionStatus(proposal.id, status);
    if (res.ok) {
      toast.success(`Mandato actualizado a «${status.replace("_", " ")}»`);
      onChange();
    } else toast.error(res.error ?? "No se pudo actualizar.");
    setBusy(false);
  }

  async function report() {
    if (!note.trim()) return;
    setBusy(true);
    const res = await addExecutionReport(proposal.id, note);
    if (res.ok) {
      toast.success("Reporte de avance añadido");
      setNote("");
      setShowReport(false);
      onChange();
    } else toast.error(res.error ?? "No se pudo guardar el reporte.");
    setBusy(false);
  }

  return (
    <Card className="hover:border-primary/50 transition-colors">
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-base font-medium">{proposal.title}</CardTitle>
      </CardHeader>
      <CardContent className="p-4 py-2 text-sm text-muted-foreground">
        <p className="mb-3 line-clamp-2">{proposal.description || "Sin descripción."}</p>

        {execution.status !== "pendiente" && (
          <div className="mb-2">
            <div className="flex justify-between text-xs mb-1">
              <span>Progreso</span>
              <span>{execution.progress}%</span>
            </div>
            <Progress value={execution.progress} className="h-1.5" />
          </div>
        )}

        <div className="flex items-center gap-1.5 text-xs mt-2">
          <UserCheck className="w-3 h-3" />
          {execution.responsibleLabel ?? "Sin responsable asignado"}
        </div>
        {execution.reports.length > 0 && (
          <p className="mt-1 text-[11px] text-muted-foreground/70">
            {execution.reports.length} reporte{execution.reports.length === 1 ? "" : "s"} de avance · último:{" "}
            {execution.reports[execution.reports.length - 1].note.slice(0, 60)}
          </p>
        )}

        {showReport && (
          <div className="mt-2 flex gap-1.5">
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota de avance…" className="h-8 text-xs" />
            <Button size="sm" className="h-8" disabled={busy} onClick={report}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Guardar"}
            </Button>
          </div>
        )}
      </CardContent>
      <CardFooter className="p-4 pt-2 flex flex-wrap gap-1.5">
        <Badge variant="outline" className="text-[10px]">
          {proposal.status === "executed" ? "Comando ejecutado" : "Aprobada por votación"}
        </Badge>
        {canManage && execution.status !== "completado" && (
          <>
            {!execution.responsible && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-[10px]" disabled={busy} onClick={claim}>
                <UserCheck className="h-3 w-3" /> Asignarme
              </Button>
            )}
            {execution.status === "pendiente" && (
              <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={busy} onClick={() => advance("en_ejecucion")}>
                Iniciar ejecución
              </Button>
            )}
            {execution.status === "en_ejecucion" && (
              <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={busy} onClick={() => advance("completado")}>
                Marcar completado
              </Button>
            )}
            <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => setShowReport((v) => !v)}>
              + Reporte
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
}

export function ExecutiveProjectsBoard() {
  const { rows, loading, reload } = useRealtimeRows<Proposal>("proposals", loadMandates);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.auth.getUser();
        setUserId(data?.user?.id ?? null);
      } catch {
        /* sin sesión */
      }
    })();
  }, []);

  // Nota: el parche en vivo de useRealtimeRows añade/reemplaza filas sin
  // reaplicar el filtro del loader (status passed/executed) — lo reforzamos
  // aquí para que un INSERT/UPDATE de una propuesta aún abierta no aparezca
  // como mandato "pendiente" (getExecution() por defecto es "pendiente").
  const mandates = rows.filter((p) => MANDATE_STATUSES.includes(p.status));
  const byColumn = (status: string) => mandates.filter((p) => getExecution(p).status === status);

  return (
    <div className="space-y-8">
      <div className="grid md:grid-cols-3 gap-6 h-full">
        {COLUMNS.map((col) => (
          <div key={col.id} className="flex flex-col gap-4">
            <div className={cn("p-3 rounded-lg font-semibold flex items-center justify-between", col.color)}>
              <span>{col.label}</span>
              <span className="text-xs opacity-70 bg-background/20 px-2 py-1 rounded">
                {loading ? "…" : byColumn(col.id).length}
              </span>
            </div>
            <div className="space-y-4">
              {byColumn(col.id).map((p) => (
                <MandateCard key={p.id} proposal={p} currentUserId={userId} onChange={reload} />
              ))}
              {!loading && byColumn(col.id).length === 0 && (
                <p className="text-xs text-muted-foreground/60 text-center py-4">Sin mandatos en este estado.</p>
              )}
            </div>
          </div>
        ))}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Users className="h-4 w-4 text-primary" />
          <h3 className="font-headline text-lg font-semibold">Administración de recursos</h3>
        </div>
        <CommonsResourcesPanel />
      </div>
    </div>
  );
}

export function JudicialCaseList() {
  const { rows: rawRows, loading, reload } = useRealtimeRows<Proposal>("proposals", loadJudicialProposals);
  const [openNew, setOpenNew] = useState(false);
  // Nota: el parche en vivo de useRealtimeRows añade/reemplaza filas sin
  // reaplicar el filtro del loader (kind judicial) — lo reforzamos aquí para
  // que un INSERT/UPDATE ajeno no cuele una propuesta no judicial en esta lista.
  const rows = rawRows.filter((p) => JUDICIAL_KINDS.includes(p.kind));

  return (
    <div className="space-y-8">
      <ConstitutionalDocsPanel />

      <div>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Scale className="h-4 w-4 text-primary" />
          <h3 className="font-headline text-lg font-semibold">Consultas de constitucionalidad y propuestas impugnadas</h3>
          <Dialog open={openNew} onOpenChange={setOpenNew}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="ml-auto gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Nueva consulta
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Gavel className="h-4 w-4" /> Nueva consulta constitucional
                </DialogTitle>
              </DialogHeader>
              <ProposalComposer
                scope="global"
                political
                initial={{
                  kind: "consulta_constitucional",
                  options: [
                    { id: "constitucional", label: "Constitucional" },
                    { id: "inconstitucional", label: "Inconstitucional" },
                    { id: "enmienda", label: "Requiere enmienda" },
                  ],
                }}
                onCreated={() => {
                  setOpenNew(false);
                  reload();
                }}
              />
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando consultas…
          </div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Aún no hay consultas de constitucionalidad ni propuestas impugnadas.
          </p>
        ) : (
          <div className="space-y-4">
            {rows.map((p) => (
              <PoliticalProposalCard key={p.id} proposal={p} onChange={reload} />
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Gavel className="h-4 w-4 text-primary" />
          <h3 className="font-headline text-lg font-semibold">Justicia restaurativa — Círculos de Paz</h3>
        </div>
        <MediationPanel />
      </div>
    </div>
  );
}
