"use client";

/*
 * ═══════════════════════════════════════════════════════════════════════════
 * CONSEJO DE AURORA · UI  (Adenda 67 · P4-4 · «Aurora política»)
 * ---------------------------------------------------------------------------
 * Superficie del patrón llm-council implementado en `src/lib/aurora/council.ts`.
 *
 *   <AuroraCouncilButton input={…}/>  → botón «Consultar al Consejo de Aurora».
 *                                        Lo usa el COMPOSITOR de propuestas con
 *                                        el título/descripción/opciones del form.
 *   <AuroraCouncilCard/>              → tarjeta autónoma del Área Política:
 *                                        escribe un tema y convoca al Consejo.
 *
 * HONESTIDAD EN PANTALLA (regla del proyecto): el informe declara SIEMPRE
 *   · qué fuente de inteligencia REAL respondió a cada perspectiva,
 *   · si todas salieron de la MISMA fuente (aviso «fuente única»),
 *   · qué dictámenes fallaron y por qué.
 * Nunca se finge pluralidad de inteligencias que no existe.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  consultCouncil,
  VERDICT_LABELS,
  type CouncilInput,
  type CouncilOpinion,
  type CouncilReport,
  type CouncilVerdict,
} from "@/lib/aurora/council";
import {
  Landmark,
  Loader2,
  Scale,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  CircleHelp,
  Sparkles,
  Info,
  AlertTriangle,
} from "lucide-react";

/* ───────────────────────────── Piezas ───────────────────────────── */

const VERDICT_STYLE: Record<CouncilVerdict, { cls: string; Icon: typeof ThumbsUp }> = {
  a_favor: { cls: "border-emerald-400/50 bg-emerald-500/10 text-emerald-200", Icon: ThumbsUp },
  con_enmiendas: { cls: "border-amber-400/50 bg-amber-500/10 text-amber-200", Icon: Scale },
  en_contra: { cls: "border-red-400/50 bg-red-500/10 text-red-200", Icon: ThumbsDown },
  indeterminado: { cls: "border-white/20 bg-white/5 text-white/60", Icon: CircleHelp },
};

function VerdictChip({ verdict, className }: { verdict: CouncilVerdict; className?: string }) {
  const { cls, Icon } = VERDICT_STYLE[verdict];
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
        cls,
        className,
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {VERDICT_LABELS[verdict]}
    </span>
  );
}

function OpinionCard({ o }: { o: CouncilOpinion }) {
  const p = o.perspective;
  return (
    <div
      className="rounded-xl border border-white/10 bg-white/[0.03] p-3 transition-colors hover:bg-white/[0.05]"
      style={{ borderLeft: `3px solid ${p.accent}` }}
    >
      <div className="mb-1.5 flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-white/90">{p.label}</span>
        <VerdictChip verdict={o.verdict} />
        <span className="ml-auto text-[10px] text-white/35">
          {o.ok ? `${o.sourceLabel ?? "fuente"} · ${o.model ?? "modelo"}` : "sin respuesta"}
        </span>
      </div>

      <p className="mb-2 text-[11px] italic text-white/45">
        Se apoya en: <span className="not-italic text-white/60">{p.fundamento}</span>{" "}
        <span className="text-white/30">({p.fuente})</span>
      </p>

      {o.ok ? (
        <>
          <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-white/75">
            {o.text}
          </pre>
          {o.amendments.length > 0 && (
            <ul className="mt-2 space-y-0.5">
              {o.amendments.map((a, i) => (
                <li key={i} className="flex gap-1.5 text-[11px] text-amber-100/70">
                  <span className="text-amber-300">›</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="flex items-start gap-1.5 text-xs text-red-200/70">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {o.error || "Este consejero no pudo dictaminar."}
        </p>
      )}
    </div>
  );
}

function ReportView({ report }: { report: CouncilReport }) {
  const good = report.opinions.filter((o) => o.ok);
  return (
    <div className="space-y-4">
      {/* Honestidad sobre las fuentes reales */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-[11px] text-white/55">
        <Info className="h-3.5 w-3.5 shrink-0 text-sky-300" />
        {report.singleSource ? (
          <span>
            <strong className="text-white/80">Fuente única.</strong> Solo hay una inteligencia disponible ahora mismo
            {report.sourcesUsed[0] ? ` (${report.sourcesUsed[0]})` : ""}: las {good.length} perspectivas las ha razonado
            la <em>misma</em> IA con roles distintos. Es deliberación de perspectivas, no de modelos. Conecta más
            fuentes en Ajustes → Inteligencia para un Consejo realmente plural.
          </span>
        ) : (
          <span>
            <strong className="text-white/80">{report.sourcesUsed.length} inteligencias distintas</strong> han
            deliberado: {report.sourcesUsed.join(" · ")}. Cada dictamen indica cuál lo firmó.
          </span>
        )}
        {report.failed > 0 && (
          <span className="text-amber-200/70">· {report.failed} dictamen(es) fallaron.</span>
        )}
        <span className="ml-auto text-white/30">{(report.ms / 1000).toFixed(1)} s</span>
      </div>

      {/* Síntesis (Chairman) */}
      {report.synthesis?.ok ? (
        <div className="rounded-xl border border-primary/30 bg-primary/[0.07] p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold text-white/90">Recomendación sintetizada</span>
            <VerdictChip verdict={report.synthesis.verdict} />
            <span className="ml-auto text-[10px] text-white/35">
              síntesis · {report.synthesis.sourceLabel ?? "fuente"}
            </span>
          </div>
          <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-white/80">
            {report.synthesis.text}
          </pre>
          <p className="mt-2 border-t border-white/10 pt-2 text-[10px] text-white/35">
            El Consejo <strong>aconseja</strong>; no decide. La decisión es de quien vota (Ontocracia · soberanía
            directa).
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-red-400/30 bg-red-500/[0.07] p-3 text-xs text-red-100/80">
          <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5" />
          {report.synthesis?.error || "El Consejo no pudo emitir una recomendación."}
        </div>
      )}

      {/* Dictámenes individuales */}
      <div className="space-y-2">
        <p className="text-[11px] uppercase tracking-wider text-white/40">
          Dictámenes por fundamento ({report.opinions.length})
        </p>
        {report.opinions.map((o) => (
          <OpinionCard key={o.perspective.id} o={o} />
        ))}
      </div>

      {/* Revisión cruzada (etapa 2 del patrón llm-council) */}
      {report.reviews.filter((r) => r.ok).length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-wider text-white/40">
            Revisión cruzada (los consejeros se evalúan entre sí, anonimizados)
          </p>
          {report.reviews
            .filter((r) => r.ok)
            .map((r) => (
              <div key={r.perspective.id} className="rounded-lg border border-white/10 bg-black/20 p-2.5">
                <p className="mb-1 text-[11px] font-medium text-white/60">{r.perspective.label} revisa:</p>
                <pre className="whitespace-pre-wrap break-words font-sans text-[11px] leading-relaxed text-white/60">
                  {r.text}
                </pre>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────── Hook compartido de convocatoria ─────────────────── */

function useCouncil() {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [report, setReport] = useState<CouncilReport | null>(null);

  const run = useCallback(async (input: CouncilInput) => {
    setBusy(true);
    setReport(null);
    setStage("Convocando al Consejo…");
    try {
      const r = await consultCouncil(input, {
        onProgress: (s) => setStage(s),
      });
      setReport(r);
    } catch {
      setReport(null);
      setStage("El Consejo no pudo reunirse.");
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, stage, report, run, setReport };
}

/* ═════════════════ Botón para el COMPOSITOR de propuestas ═════════════ */

export function AuroraCouncilButton({
  input,
  disabled,
  className,
}: {
  /** Se lee EN EL MOMENTO del clic (el formulario cambia mientras se escribe). */
  input: () => CouncilInput;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { busy, stage, report, run } = useCouncil();

  const onClick = useCallback(() => {
    const data = input();
    if (!data.title?.trim()) return;
    setOpen(true);
    void run(data);
  }, [input, run]);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onClick}
        disabled={disabled || busy}
        className={cn(
          "cursor-pointer gap-1.5 border-indigo-400/40 bg-indigo-500/10 text-indigo-100 hover:bg-indigo-500/20",
          className,
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Landmark className="h-3.5 w-3.5" />}
        Consultar al Consejo de Aurora
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Landmark className="h-5 w-5 text-indigo-300" /> Consejo de Aurora
            </DialogTitle>
            <DialogDescription>
              Cinco consejeros, cada uno anclado en un fundamento StarSeed distinto, dictaminan por separado, se
              revisan entre sí (anonimizados) y Aurora sintetiza. Patrón <code>llm-council</code>, ejecutado con el
              router gratis-primero del OS.
            </DialogDescription>
          </DialogHeader>

          {busy ? (
            <div className="flex flex-col items-center gap-2 py-10 text-sm text-white/60">
              <Loader2 className="h-6 w-6 animate-spin text-indigo-300" />
              {stage}
            </div>
          ) : report ? (
            <ReportView report={report} />
          ) : (
            <p className="py-8 text-center text-sm text-white/50">{stage || "Sin informe."}</p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ═══════════════ Tarjeta autónoma del Área Política ═══════════════ */

export function AuroraCouncilCard() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const { busy, stage, report, run } = useCouncil();

  return (
    <Card className="liquid-glass-panel border-indigo-400/25">
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 font-headline text-lg">
          <Landmark className="h-5 w-5 text-indigo-300" />
          Consejo de Aurora
          <Badge variant="outline" className="border-indigo-400/30 text-[9px] text-indigo-200/80">
            Aurora política
          </Badge>
        </CardTitle>
        <CardDescription>
          Antes de votar, escucha a los cinco fundamentos. Cada consejero dictamina desde uno de los pilares de la
          Constitución StarSeed (ontocrático · ecológico · abundancia · simbiótico · empático), se revisan entre sí
          con las identidades ocultas, y Aurora sintetiza una recomendación citando en qué fundamento se apoya cada
          una. <strong>El Consejo aconseja; decide la red.</strong>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="¿Sobre qué debe deliberar el Consejo? (título de la propuesta o pregunta)"
          className="h-9 bg-white/5 text-sm"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Contexto (opcional): qué se decide, por qué, a quién afecta…"
          className="min-h-[64px] border-white/10 bg-black/30 text-xs"
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => void run({ title, description, scope: "global" })}
            disabled={busy || !title.trim()}
            className="cursor-pointer gap-1.5 bg-indigo-600 text-white hover:bg-indigo-500"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
            Convocar al Consejo
          </Button>
          {busy && <span className="text-xs text-white/45">{stage}</span>}
        </div>

        {report && !busy && <ReportView report={report} />}
      </CardContent>
    </Card>
  );
}
