"use client";

// ════════════════════════════════════════════════════════════════
// LibraryStorageSelector — Servidor + Almacenamiento + Cerebros de contexto
// ----------------------------------------------------------------
// Panel de la Librería para elegir:
//   • El SERVIDOR que respalda la librería (de los servidores de tus cerebros
//     o uno libre por texto).
//   • El MÉTODO de almacenamiento (StarSeed soberano / local / externo).
//   • QUÉ cerebro(s) de contexto respaldan esta librería, con nivel de acceso
//     (lectura/escritura) y sincronización.
//
// Persiste vía el contrato compartido `@/lib/library/brain-links` (claves
// `starseed.library.storage.v1` / `starseed.library.brains.v1`). El panel de
// Cerebros CONSUME el mismo modelo, por lo que los cambios aquí se reflejan
// allí y viceversa.
//
// Defensivo/SSR-safe: guardas, try/catch, degradación elegante. UI español.
// ════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Server,
  HardDrive,
  BrainCircuit,
  Check,
  Loader2,
  Plus,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

import { listBrains, type Brain, type BrainServer } from "@/lib/brains/brains";
import {
  loadLibraryStorageConfig,
  patchLibraryStorageConfig,
  loadLibraryBrainLinks,
  setLibraryBrainLink,
  unlinkLibraryBrain,
  subscribeLibraryLinks,
  LIBRARY_STORAGE_META,
  type LibraryStorageConfig,
  type LibraryStorageMethod,
  type LibraryBrainLink,
  type LibraryBrainAccess,
} from "@/lib/library/brain-links";

const STORAGE_ORDER: LibraryStorageMethod[] = ["starseed", "local", "external"];

export function LibraryStorageSelector() {
  const [config, setConfig] = useState<LibraryStorageConfig>({ storage: "starseed", brainIds: [] });
  const [links, setLinks] = useState<LibraryBrainLink[]>([]);
  const [brains, setBrains] = useState<Brain[]>([]);
  const [brainsLoading, setBrainsLoading] = useState(true);
  const [customServer, setCustomServer] = useState("");

  // ── Carga inicial + suscripción a cambios (vive en sincronía con Cerebros) ──
  const refreshLocal = useCallback(() => {
    try {
      setConfig(loadLibraryStorageConfig());
      setLinks(loadLibraryBrainLinks());
    } catch {
      /* estado por defecto ya presente */
    }
  }, []);

  useEffect(() => {
    refreshLocal();
    const unsub = subscribeLibraryLinks(refreshLocal);
    let alive = true;
    (async () => {
      setBrainsLoading(true);
      try {
        const list = await listBrains();
        if (alive) setBrains(list);
      } catch {
        if (alive) setBrains([]);
      } finally {
        if (alive) setBrainsLoading(false);
      }
    })();
    return () => {
      alive = false;
      unsub();
    };
  }, [refreshLocal]);

  // Servidores disponibles: todos los servidores de todos los cerebros.
  const availableServers = useMemo(() => {
    const out: { value: string; label: string; brain: string }[] = [];
    for (const b of brains) {
      for (const s of b.servers || []) {
        out.push({ value: s.id, label: serverLabel(s), brain: b.name });
      }
    }
    return out;
  }, [brains]);

  const selectedServerLabel = useMemo(() => {
    if (!config.server) return null;
    const hit = availableServers.find((s) => s.value === config.server);
    return hit ? `${hit.label} · ${hit.brain}` : config.server;
  }, [config.server, availableServers]);

  // ── Acciones de almacenamiento ──
  const onStorageMethod = (method: LibraryStorageMethod) => {
    try {
      const next = patchLibraryStorageConfig({ storage: method });
      setConfig(next);
      toast.success(`Almacenamiento: ${LIBRARY_STORAGE_META[method].label}.`);
    } catch {
      toast.error("No se pudo cambiar el método de almacenamiento.");
    }
  };

  const onSelectServer = (serverId: string) => {
    try {
      const next = patchLibraryStorageConfig({ server: serverId || undefined });
      setConfig(next);
    } catch {
      toast.error("No se pudo seleccionar el servidor.");
    }
  };

  const onSetCustomServer = () => {
    const name = customServer.trim();
    if (!name) {
      toast.error("Indica un nombre/URL de servidor.");
      return;
    }
    try {
      const next = patchLibraryStorageConfig({ server: name });
      setConfig(next);
      setCustomServer("");
      toast.success(`Servidor «${name}» asignado a la librería.`);
    } catch {
      toast.error("No se pudo asignar el servidor.");
    }
  };

  // ── Acciones de cerebros de contexto ──
  const linkFor = (brainId: string): LibraryBrainLink | undefined =>
    links.find((l) => l.brainId === brainId);

  const onToggleBrain = (brain: Brain) => {
    const current = linkFor(brain.id);
    try {
      if (current && current.access !== "none") {
        unlinkLibraryBrain(brain.id);
        toast.success(`«${brain.name}» desvinculado de la librería.`);
      } else {
        setLibraryBrainLink(brain.id, { access: "read", sync: true });
        toast.success(`«${brain.name}» ahora respalda la librería (lectura + sync).`);
      }
      refreshLocal();
    } catch {
      toast.error("No se pudo actualizar el vínculo del cerebro.");
    }
  };

  const onBrainAccess = (brainId: string, access: LibraryBrainAccess) => {
    try {
      setLibraryBrainLink(brainId, { access });
      refreshLocal();
    } catch {
      toast.error("No se pudo cambiar el acceso.");
    }
  };

  const onBrainSync = (brainId: string, sync: boolean) => {
    try {
      setLibraryBrainLink(brainId, { sync });
      refreshLocal();
    } catch {
      toast.error("No se pudo cambiar la sincronización.");
    }
  };

  const linkedCount = links.filter((l) => l.access !== "none").length;

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground">
          <Server className="h-3.5 w-3.5" /> Servidor · Almacenamiento · Cerebro de contexto
        </div>
        <Badge variant="outline" className="gap-1 text-[10px]">
          <BrainCircuit className="h-3 w-3 text-cyan-300" /> {linkedCount} cerebro(s) vinculado(s)
        </Badge>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Elige dónde vive tu librería y qué cerebro(s) la respaldan. Estos ajustes se comparten con
        la sección Cerebros: lo que cambies aquí se refleja allí.
      </p>

      {/* Método de almacenamiento */}
      <section className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <HardDrive className="h-4 w-4 text-cyan-300" /> Método de almacenamiento
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {STORAGE_ORDER.map((m) => {
            const meta = LIBRARY_STORAGE_META[m];
            const active = (config.storage ?? "starseed") === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onStorageMethod(m)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-colors cursor-pointer",
                  active
                    ? "border-cyan-400/50 bg-cyan-500/10 text-cyan-100"
                    : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10",
                )}
              >
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  <span aria-hidden>{meta.emoji}</span> {meta.label}
                  {active && <Check className="h-3.5 w-3.5 text-cyan-300" />}
                </span>
                <span className="text-[10px] text-muted-foreground leading-snug">{meta.hint}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Servidor */}
      <section className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Server className="h-4 w-4 text-cyan-300" /> Servidor de respaldo
        </div>
        {brainsLoading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando servidores de tus cerebros…
          </div>
        ) : availableServers.length > 0 ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={config.server ?? ""} onValueChange={onSelectServer}>
              <SelectTrigger className="h-9 bg-black/30 text-xs sm:max-w-sm">
                <SelectValue placeholder="Elige un servidor de tus cerebros" />
              </SelectTrigger>
              <SelectContent>
                {availableServers.map((s) => (
                  <SelectItem key={s.value} value={s.value} className="text-xs">
                    {s.label} · {s.brain}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedServerLabel && (
              <Badge variant="outline" className="gap-1 text-[10px] text-cyan-300 border-cyan-300/40">
                <Check className="h-3 w-3" /> {selectedServerLabel}
              </Badge>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            No hay servidores en tus cerebros todavía. Puedes indicar uno manualmente abajo o
            añadir servidores en la sección Cerebros.
          </p>
        )}

        {/* Servidor manual (fuente libre) */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center pt-1">
          <Input
            value={customServer}
            onChange={(e) => setCustomServer(e.target.value)}
            placeholder="…o escribe un servidor/URL propio (p. ej. https://mi-servidor:8800)"
            className="h-8 bg-black/30 text-xs sm:max-w-sm"
          />
          <Button size="sm" variant="outline" className="h-8 gap-1 text-[11px]" onClick={onSetCustomServer}>
            <Plus className="h-3 w-3" /> Asignar
          </Button>
        </div>
      </section>

      {/* Cerebros de contexto */}
      <section className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <BrainCircuit className="h-4 w-4 text-cyan-300" /> Cerebros de contexto que la respaldan
        </div>
        {brainsLoading ? (
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cargando cerebros…
          </div>
        ) : brains.length === 0 ? (
          <p className="text-[11px] text-amber-300/80">
            Aún no tienes cerebros. Crea uno en la sección Cerebros para respaldar tu librería con
            su contexto.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {brains.map((b) => {
              const link = linkFor(b.id);
              const linked = !!link && link.access !== "none";
              return (
                <div
                  key={b.id}
                  className={cn(
                    "rounded-lg border p-3 flex flex-col gap-2 transition-colors",
                    linked ? "border-cyan-400/30 bg-cyan-500/[0.06]" : "border-white/5 bg-black/20",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Switch checked={linked} onCheckedChange={() => onToggleBrain(b)} />
                      <span className="text-sm font-semibold truncate">{b.name}</span>
                    </div>
                    <Badge variant="outline" className="text-[8px] shrink-0">
                      {b.scope}
                    </Badge>
                  </div>

                  {linked && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={link?.access ?? "read"}
                        onValueChange={(v) => onBrainAccess(b.id, v as LibraryBrainAccess)}
                      >
                        <SelectTrigger className="h-7 w-[120px] bg-black/30 text-[11px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="read" className="text-xs">Lectura</SelectItem>
                          <SelectItem value="write" className="text-xs">Escritura</SelectItem>
                        </SelectContent>
                      </Select>
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer">
                        <Switch
                          checked={!!link?.sync}
                          onCheckedChange={(v) => onBrainSync(b.id, v)}
                        />
                        <RefreshCw className="h-3 w-3" /> Sincronizar
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Helper: etiqueta legible de un servidor de cerebro ──
function serverLabel(s: BrainServer): string {
  const kind = typeof s.kind === "string" ? s.kind : "online";
  return s.name || s.endpoint || `${kind}`;
}

export default LibraryStorageSelector;
