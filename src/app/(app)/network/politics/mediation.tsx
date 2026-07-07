"use client";

// StarSeed · Área Política · Judicial — Justicia RESTAURATIVA (no punitiva):
// procesos de mediación / Círculos de Paz. Persistido vía entity_state con
// espejo local (ver src/lib/governance/political.ts). Aditivo y honesto: si
// la sincronización con la red falla, se avisa y se sigue funcionando local.

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Gavel, HeartHandshake, Loader2, Plus, WifiOff } from "lucide-react";
import {
  loadMediationCases,
  createMediationCase,
  updateMediationCase,
  MEDIATION_STAGE_LABEL,
  type MediationCase,
  type MediationStage,
} from "@/lib/governance/political";

const STAGE_ORDER: MediationStage[] = ["solicitada", "facilitador_asignado", "en_circulo", "acuerdo"];
const STAGE_CLS: Record<MediationStage, string> = {
  solicitada: "border-white/20 text-white/60",
  facilitador_asignado: "border-sky-400/40 text-sky-200 bg-sky-500/10",
  en_circulo: "border-amber-400/40 text-amber-200 bg-amber-500/10",
  acuerdo: "border-emerald-400/40 text-emerald-200 bg-emerald-500/10",
  sin_acuerdo: "border-red-400/40 text-red-200 bg-red-500/10",
};

export function MediationPanel() {
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
    const res = await loadMediationCases();
    setCases(res.list);
    setDegraded(res.degraded);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function submit() {
    if (!title.trim()) {
      toast.error("Ponle un título al caso.");
      return;
    }
    setBusy("new");
    const res = await createMediationCase({
      title,
      description,
      participants: participants.split(",").map((p) => p.trim()).filter(Boolean),
    });
    if (res.ok) {
      toast.success(res.degraded ? "Caso guardado en este dispositivo (sin conexión a la red)" : "Proceso de mediación iniciado");
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
    const res = await updateMediationCase(c.id, { stage });
    if (res.ok) {
      toast.success(`Caso actualizado a «${MEDIATION_STAGE_LABEL[stage]}»`);
      await load();
    } else {
      toast.error(res.error ?? "No se pudo actualizar el caso.");
    }
    setBusy(null);
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card className="md:col-span-2 border-dashed border-2 bg-muted/10">
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Gavel className="w-5 h-5" /> Nueva Disputa
          </CardTitle>
          <CardDescription>
            Presenta un caso para mediación comunitaria descentralizada — sin castigo, restauración del vínculo.
          </CardDescription>
          {degraded && (
            <Badge variant="outline" className="mx-auto mt-1 gap-1 text-[9px] border-amber-400/40 text-amber-200 bg-amber-500/10">
              <WifiOff className="h-2.5 w-2.5" /> guardado local en este dispositivo
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          {showForm && (
            <div className="mx-auto max-w-md space-y-2 text-left">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del caso" className="h-9 text-sm" />
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe el conflicto…" className="min-h-[72px] text-sm" />
              <Input value={participants} onChange={(e) => setParticipants(e.target.value)} placeholder="Partes implicadas (separadas por coma)" className="h-9 text-sm" />
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-center gap-2 pb-6">
          {showForm ? (
            <>
              <Button onClick={submit} disabled={busy === "new"} className="gap-1.5">
                {busy === "new" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Iniciar Proceso de Mediación
              </Button>
              <Button variant="ghost" onClick={() => setShowForm(false)}>Cancelar</Button>
            </>
          ) : (
            <Button onClick={() => setShowForm(true)}>Iniciar Proceso de Mediación</Button>
          )}
        </CardFooter>
      </Card>

      {loading ? (
        <div className="md:col-span-2 flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando casos…
        </div>
      ) : cases.length === 0 ? (
        <div className="md:col-span-2 py-8 text-center text-sm text-muted-foreground">
          Aún no hay procesos de mediación activos.
        </div>
      ) : (
        cases.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <div className="flex justify-between items-start gap-2">
                <div>
                  <CardTitle className="text-base">{c.title}</CardTitle>
                  <CardDescription>Círculo de Paz · Mediación restaurativa</CardDescription>
                </div>
                <Badge variant="outline" className={cn("text-[10px]", STAGE_CLS[c.stage])}>
                  {MEDIATION_STAGE_LABEL[c.stage]}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="text-sm space-y-3">
              <p className="text-muted-foreground">{c.description || "Sin descripción adicional."}</p>
              {c.participants.length > 0 && (
                <div className="flex flex-col gap-2 p-3 bg-muted/30 rounded-lg">
                  <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Partes Involucradas</span>
                  <div className="flex gap-2 flex-wrap">
                    {c.participants.map((p) => (
                      <Badge key={p} variant="outline" className="bg-background">{p}</Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <HeartHandshake className="w-3 h-3" /> {c.createdByLabel ?? "Alguien"} · {new Date(c.createdAt).toLocaleDateString("es-ES")}
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-1.5">
              {STAGE_ORDER.filter((s) => s !== c.stage).map((s) => (
                <Button key={s} size="sm" variant="ghost" className="h-7 border text-[11px]" disabled={busy === c.id} onClick={() => advance(c, s)}>
                  {MEDIATION_STAGE_LABEL[s]}
                </Button>
              ))}
              {c.stage !== "sin_acuerdo" && (
                <Button size="sm" variant="ghost" className="h-7 border text-[11px] text-red-300" disabled={busy === c.id} onClick={() => advance(c, "sin_acuerdo")}>
                  Sin acuerdo
                </Button>
              )}
            </CardFooter>
          </Card>
        ))
      )}
    </div>
  );
}

export default MediationPanel;
