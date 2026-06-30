"use client";

// ════════════════════════════════════════════════════════════════
// /install — Pantalla de instalación CON PERMISO de una fuente/librería
// en un cerebro. Se abre desde un enlace compartible generado por el gestor
// de Fuentes (`buildInstallLink`). NUNCA instala automáticamente: lee los
// parámetros, muestra una confirmación con el alcance (usuario/comunidad) y
// sólo persiste la instalación cuando el usuario pulsa "Instalar".
//
// Enlace: /install?src=<id>&kind=<k>&scope=<user|community>[&brain=<id>]
//
// Defensivo: useSearchParams envuelto en <Suspense>, force-dynamic para
// evitar el bailout de prerender estático en el build de Vercel.
// ════════════════════════════════════════════════════════════════

export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BrainCircuit,
  Check,
  ChevronLeft,
  Loader2,
  ShieldCheck,
  User,
  Users,
  ExternalLink,
  PackageCheck,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

import { parseInstallParams } from "@/lib/library/install";
import {
  findSource,
  installSourceInBrain,
  isSourceInstalledInBrain,
  type InstallScope,
} from "@/lib/library/sources-store";
import { listBrains, type Brain } from "@/lib/brains/brains";

function InstallPageInner() {
  const params = useSearchParams();
  const parsed = useMemo(() => parseInstallParams(params), [params]);

  const [brains, setBrains] = useState<Brain[]>([]);
  const [loading, setLoading] = useState(true);
  const [brainId, setBrainId] = useState<string>(parsed.brainId);
  const [scope, setScope] = useState<InstallScope>(parsed.scope);
  const [installed, setInstalled] = useState(false);

  // Resolvemos la fuente del enlace contra la librería (seed + usuario).
  const source = useMemo(() => (parsed.sourceId ? findSource(parsed.sourceId) : undefined), [parsed.sourceId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const list = await listBrains();
        if (!alive) return;
        setBrains(list);
        // Si el enlace trae un cerebro válido lo respetamos; si no, el primero.
        setBrainId((prev) => {
          if (prev && list.some((b) => b.id === prev)) return prev;
          return list[0]?.id ?? "";
        });
      } catch {
        if (alive) setBrains([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const alreadyInstalled = useMemo(() => {
    if (!brainId || !source) return false;
    try {
      return isSourceInstalledInBrain(brainId, source.id);
    } catch {
      return false;
    }
  }, [brainId, source, installed]);

  const targetBrain = brains.find((b) => b.id === brainId) || null;

  function onConfirm() {
    if (!source) {
      toast.error("La fuente del enlace no existe en la librería.");
      return;
    }
    if (!brainId) {
      toast.error("Elige un cerebro destino.");
      return;
    }
    try {
      installSourceInBrain(brainId, source, scope);
      setInstalled(true);
      toast.success(
        `«${source.label}» instalada en ${targetBrain?.name ?? "el cerebro"} con permisos de ${
          scope === "community" ? "comunidad" : "usuario"
        }.`,
      );
    } catch {
      toast.error("No se pudo completar la instalación.");
    }
  }

  return (
    <div className="relative min-h-full w-full font-inter">
      <div className="mx-auto w-full max-w-[640px] px-[clamp(0.75rem,3vw,2rem)] py-[clamp(1rem,3vw,2rem)]">
        {/* Cabecera */}
        <header className="mb-5 flex items-center gap-3">
          <Link
            href="/agent?tab=fuentes"
            aria-label="Volver a Fuentes"
            className="group flex size-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl transition-all hover:border-cyan-400/50 hover:bg-cyan-500/15 cursor-pointer"
          >
            <ChevronLeft className="size-5 text-white/70 transition-colors group-hover:text-cyan-300" />
          </Link>
          <div className="flex items-center gap-2.5">
            <span className="grid size-11 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-500/10">
              <PackageCheck className="size-5 text-cyan-300" />
            </span>
            <div>
              <h1 className="text-lg font-semibold text-white">Instalar fuente con permiso</h1>
              <p className="text-[12px] text-white/50">Confirmación explícita antes de instalar en tu cerebro.</p>
            </div>
          </div>
        </header>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-5 backdrop-blur-xl space-y-5">
          {/* Fuente no resuelta */}
          {!source ? (
            <div className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-4">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div className="space-y-1">
                <div className="text-sm font-semibold text-amber-100">Enlace de instalación no válido</div>
                <p className="text-[12px] text-white/60">
                  {parsed.sourceId
                    ? `No encontramos la fuente «${parsed.sourceId}» en la librería. Puede que el enlace sea antiguo o que la fuente ya no exista.`
                    : "El enlace no indica ninguna fuente a instalar."}
                </p>
                <Link href="/agent?tab=fuentes" className="text-[12px] text-cyan-300 hover:underline">
                  Ir al gestor de Fuentes →
                </Link>
              </div>
            </div>
          ) : (
            <>
              {/* Resumen de la fuente */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-semibold text-white">{source.label}</span>
                  <Badge variant="outline" className="text-[10px] text-cyan-200 border-cyan-300/40">
                    {parsed.kind}
                  </Badge>
                </div>
                {source.description && <p className="text-[12px] text-white/60">{source.description}</p>}
                {source.url?.startsWith("http") && (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-cyan-300 hover:underline"
                  >
                    {source.url} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>

              {/* Aviso de permiso */}
              <div className="flex items-start gap-3 rounded-xl border border-cyan-400/20 bg-cyan-500/[0.05] p-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-cyan-300" />
                <p className="text-[12px] text-white/70">
                  Esta instalación requiere tu permiso explícito. Nada se instala hasta que pulses{" "}
                  <span className="font-semibold text-white">Instalar</span>. Elige el cerebro y el alcance del permiso.
                </p>
              </div>

              {loading ? (
                <div className="flex items-center gap-2 text-[12px] text-white/50">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando tus cerebros…
                </div>
              ) : brains.length === 0 ? (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/[0.06] p-4 text-[12px] text-white/70">
                  Aún no tienes cerebros disponibles (o no has iniciado sesión). Crea uno en la sección{" "}
                  <Link href="/cerebros" className="text-cyan-300 hover:underline">
                    Cerebros
                  </Link>{" "}
                  y vuelve a abrir este enlace.
                </div>
              ) : (
                <>
                  {/* Cerebro destino */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-white/50">Cerebro destino</label>
                    <Select value={brainId} onValueChange={setBrainId}>
                      <SelectTrigger className="h-10 bg-black/40 text-sm">
                        <SelectValue placeholder="Elige cerebro" />
                      </SelectTrigger>
                      <SelectContent>
                        {brains.map((b) => (
                          <SelectItem key={b.id} value={b.id} className="text-sm">
                            <span className="flex items-center gap-2">
                              <BrainCircuit className="h-3.5 w-3.5 text-cyan-300/70" /> {b.name}
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Alcance / permiso */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] uppercase tracking-widest text-white/50">Permiso / alcance</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setScope("user")}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                          scope === "user"
                            ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
                            : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        <User className="h-4 w-4 shrink-0" />
                        <span>
                          <span className="block font-semibold">Usuario</span>
                          <span className="block text-[10px] text-white/50">Solo para ti</span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setScope("community")}
                        className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${
                          scope === "community"
                            ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-100"
                            : "border-white/10 bg-white/5 text-white/60 hover:bg-white/10"
                        }`}
                      >
                        <Users className="h-4 w-4 shrink-0" />
                        <span>
                          <span className="block font-semibold">Comunidad</span>
                          <span className="block text-[10px] text-white/50">Permiso compartido</span>
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Frase de confirmación */}
                  <p className="text-[13px] text-white/80">
                    Instalar <span className="font-semibold text-white">{source.label}</span> en{" "}
                    <span className="font-semibold text-cyan-200">{targetBrain?.name ?? "—"}</span> con permisos de{" "}
                    <span className="font-semibold text-emerald-200">
                      {scope === "community" ? "comunidad" : "usuario"}
                    </span>
                    .
                  </p>

                  {/* Acción */}
                  {installed || alreadyInstalled ? (
                    <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/[0.08] p-3">
                      <span className="flex items-center gap-2 text-[13px] text-emerald-100">
                        <Check className="h-4 w-4" /> Instalada en {targetBrain?.name ?? "el cerebro"}.
                      </span>
                      <Link href="/agent?tab=fuentes">
                        <Button size="sm" variant="outline" className="h-8 text-[12px]">
                          Ir a Fuentes
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="flex justify-end gap-2">
                      <Link href="/agent?tab=fuentes">
                        <Button size="sm" variant="ghost" className="h-9 text-[12px]">
                          Cancelar
                        </Button>
                      </Link>
                      <Button size="sm" className="h-9 gap-1 text-[12px]" onClick={onConfirm} disabled={!brainId}>
                        <Check className="h-4 w-4" /> Instalar
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function InstallPage() {
  return (
    <Suspense fallback={null}>
      <InstallPageInner />
    </Suspense>
  );
}
