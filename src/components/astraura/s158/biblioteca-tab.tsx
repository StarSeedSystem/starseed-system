"use client";

/**
 * STUDIO 1.58 · Biblioteca StarSeed (Ola 4 · Adenda 156) — puente entre las
 * habilidades/agentes/creaciones del backend soberano y la Biblioteca del OS.
 * ----------------------------------------------------------------------------
 * Arquitectura: `architecture/astraura-158-ola4-runtime-y-pestanas.md` §3.
 *
 * Tres piezas:
 *   1. Paquetes del catálogo de la Biblioteca (`@/lib/library/packages.ts`)
 *      etiquetados como propios de Astraura (hoy: «Astraura 1.58-bit»,
 *      `app-astraura-158`), con su estado instalado/no-instalado real
 *      (`isInstalled`) y un botón «Instalar» que reutiliza `install()` (el
 *      MISMO efecto que la tienda Cydia del OS: nunca inventa una instalación
 *      falsa aquí).
 *   2. Lo que trajo la SIEMBRA 1.58 a la Biblioteca del OS: personalidades
 *      `p158-*` y agentes `agent158-*` (`astraura-158-import.ts`), contados
 *      con los getters reales del propio store — no re-implementa el conteo.
 *      «Re-sembrar» / «Quitar lo importado» piden confirmación IN-APP
 *      (`useConfirm`, Adenda 137: nunca `window.confirm`) y avisan con toast.
 *   3. Enlaces a las secciones del OS relacionadas.
 *
 * Todo defensivo (try/catch en cada lectura/escritura), SSR-safe y sin `any`.
 * Este archivo NO importa nada de `astraura-158-client.ts` que no sea el tipo
 * de `manifest` ya recibido por props: la siembra usa el manifiesto que trae
 * el panel, nunca pide red por su cuenta.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Binary, BookOpen, Bot, Cpu, Download, ExternalLink, FolderKanban, Library, Package, RefreshCw, Sparkles, Trash2, Wand2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  allPackages, install, isInstalled, subscribeLibrary,
  type InstallResult, type LibraryPackage, type PackageKind,
} from "@/lib/library/packages";
import { listPersonalAgents, subscribeAgents } from "@/lib/agents/store";
import { PERSONALITY_CHANGED_EVENT, listPersonalityProfiles } from "@/lib/aurora/personalities";
import {
  AGENT158_PREFIX, P158_PREFIX, importAstraura158, removeAstraura158Imports,
} from "@/lib/astraura/astraura-158-import";
import {
  BTN, BTN_DANGER, BTN_PRIMARY, Badge, BusyIcon, CARD, Empty, MONO, SUB, SectionTitle, Stat, useBusy, type S158TabProps,
} from "./shared";

/* ── Paquetes del catálogo etiquetados como propios de Astraura ───────────── */

/** Tags curados que marcan un paquete como parte del sistema Astraura (no un simple "lo usa"). */
const ASTRAURA_PKG_TAGS = new Set(["astraura", "bitnet", "soberano", "1.58", "158"]);

function isAstrauraPackage(pkg: LibraryPackage): boolean {
  if (pkg.id === "app-astraura-158") return true;
  return (pkg.tags ?? []).some((t) => ASTRAURA_PKG_TAGS.has(String(t ?? "").toLowerCase()));
}

const KIND_ICON: Partial<Record<PackageKind, LucideIcon>> = {
  app: Binary, agent: Bot, "ai-source": Cpu, function: Wand2, repo: Package,
};

function PackageRow({ pkg, onChanged }: { pkg: LibraryPackage; onChanged: () => void }) {
  const router = useRouter();
  const [installing, setInstalling] = useState(false);
  const installed = isInstalled(pkg.id);
  const Icon = KIND_ICON[pkg.kind] ?? Package;

  async function doInstall() {
    setInstalling(true);
    let res: InstallResult;
    try { res = await install(pkg); } catch { res = { ok: false, message: "No se pudo instalar: fallo inesperado." }; }
    setInstalling(false);
    if (!res.ok) { toast.error(`${pkg.name}: ${res.message}`); return; }
    if (res.action === "route" && res.href) {
      const href = res.href;
      toast.success(pkg.name, { description: res.message, action: { label: "Abrir", onClick: () => router.push(href) } });
    } else {
      toast.success(pkg.name, { description: res.message });
      if (res.action === "external" && res.href) { try { window.open(res.href, "_blank", "noopener,noreferrer"); } catch { /* popup bloqueado */ } }
    }
    onChanged();
  }

  return (
    <div className={cn(SUB, "flex flex-col gap-1.5 px-3 py-2")}>
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0 text-cyan-300/80" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">{pkg.name}</p>
        <Badge tone="border-white/10 text-white/55">{pkg.kind}</Badge>
        {installed
          ? <Badge tone="border-emerald-400/40 bg-emerald-500/15 text-emerald-100">instalado</Badge>
          : <Badge tone="border-white/15 bg-white/[0.04] text-white/60">no instalado</Badge>}
      </div>
      <p className="line-clamp-2 text-[10px] leading-snug text-white/60">{pkg.description}</p>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-1.5">
        <p className={MONO}>v{pkg.version} · {pkg.author}</p>
        {!installed && (
          <button
            type="button"
            className={cn(BTN, "px-1.5 py-0.5 text-[10px]")}
            disabled={installing || pkg.comingSoon}
            aria-label={`Instalar ${pkg.name}`}
            onClick={() => { void doInstall(); }}
          >
            <BusyIcon busy={installing} icon={Download} /> {pkg.comingSoon ? "Próximamente" : "Instalar"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Pestaña ────────────────────────────────────────────────────────────── */

export function BibliotecaTab({ target, manifest, refresh }: S158TabProps) {
  const confirm = useConfirm();
  const { busy, wrap } = useBusy();
  const [tick, setTick] = useState(0);
  const bump = useCallback(() => setTick((t) => t + 1), []);

  // Cualquier cambio en la Biblioteca, los agentes o las personalidades del OS
  // (incluidos los que provocan los propios botones de esta pestaña) refresca
  // los conteos en vivo, sin recargar la página.
  useEffect(() => {
    let unsubLib = () => { /* noop */ };
    try { unsubLib = subscribeLibrary(bump); } catch { /* defensivo */ }
    const unsubAgents = subscribeAgents(bump);
    window.addEventListener(PERSONALITY_CHANGED_EVENT, bump);
    return () => {
      try { unsubLib(); } catch { /* */ }
      try { unsubAgents(); } catch { /* */ }
      window.removeEventListener(PERSONALITY_CHANGED_EVENT, bump);
    };
  }, [bump]);

  const packages = useMemo<LibraryPackage[]>(() => {
    try { return allPackages().filter(isAstrauraPackage); } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const personalities = useMemo(() => {
    try { return listPersonalityProfiles().filter((p) => p.id.startsWith(P158_PREFIX)); } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const agents = useMemo(() => {
    try { return listPersonalAgents().filter((a) => a.id.startsWith(AGENT158_PREFIX)); } catch { return []; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const installedCount = useMemo(() => packages.filter((p) => isInstalled(p.id)).length, [packages]);

  async function doReseed() {
    const ok = await confirm({
      title: "¿Re-sembrar desde el backend?",
      description: "Vuelve a traer las personalidades y los agentes del backend soberano 1.58 a tu Biblioteca del OS. Es idempotente: lo ya importado se actualiza (nombre/rol del backend), y lo que hayas editado a mano en el OS se conserva.",
      confirmText: "Re-sembrar",
      cancelText: "Cancelar",
    });
    if (!ok) return;
    await wrap("reseed", async () => {
      let summary: ReturnType<typeof importAstraura158> | null = null;
      try { summary = importAstraura158(manifest); } catch { summary = null; }
      if (!summary) { toast.error("No se pudo sembrar: fallo inesperado."); return; }
      const total = summary.personalities.created + summary.personalities.updated + summary.agents.created + summary.agents.updated;
      if (total === 0 && summary.errors.length === 0) {
        toast.message("Nada que sembrar", { description: "El manifiesto del backend no trae personalidades ni agentes todavía." });
      } else {
        toast.success("Siembra 1.58 actualizada", {
          description: `${summary.personalities.created} personalidad(es) nueva(s) · ${summary.personalities.updated} actualizada(s) · ${summary.agents.created} agente(s) nuevo(s) · ${summary.agents.updated} actualizado(s)${summary.errors.length ? ` · ${summary.errors.length} error(es)` : ""}.`,
        });
      }
      bump();
      await refresh();
    });
  }

  async function doRemove() {
    const ok = await confirm({
      title: "¿Quitar lo importado del backend 1.58?",
      description: `Borra ${personalities.length} personalidad(es) «p158-*» y ${agents.length} agente(s) «agent158-*» de tu Biblioteca, junto con el sistema primario que fijaron. El backend soberano no se toca: puedes volver a sembrar cuando quieras.`,
      confirmText: "Quitar",
      cancelText: "Cancelar",
      destructive: true,
    });
    if (!ok) return;
    await wrap("remove", async () => {
      let result: { personalities: number; agents: number } | null = null;
      try { result = removeAstraura158Imports(); } catch { result = null; }
      if (!result) { toast.error("No se pudo quitar la importación."); return; }
      toast.success("Importación 1.58 retirada", { description: `${result.personalities} personalidad(es) y ${result.agents} agente(s) eliminados de tu Biblioteca.` });
      bump();
      await refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={Library}
          title={`Paquetes de Astraura en la Biblioteca (${packages.length})`}
          tone="text-cyan-300"
          hint="Lo que el catálogo del OS declara sobre el sistema soberano Astraura 1.58-bit, y si ya está instalado en esta cuenta."
          right={<button type="button" className={BTN} onClick={bump} aria-label="Recargar paquetes"><RefreshCw className="h-3 w-3" aria-hidden="true" /></button>}
        />
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {packages.length === 0 && <Empty text="El catálogo de la Biblioteca no trae (todavía) paquetes etiquetados «astraura»." />}
          {packages.map((p) => <PackageRow key={p.id} pkg={p} onChanged={bump} />)}
        </div>
        {packages.length > 0 && <p className="mt-2 text-[10px] text-white/45">{installedCount} de {packages.length} instalado(s) en esta cuenta.</p>}
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle
          icon={Sparkles}
          title="Lo que trajo la siembra 1.58"
          tone="text-fuchsia-300"
          hint="Personalidades y agentes que el backend soberano sembró en tu Biblioteca del OS (idempotente, un id estable por cada uno). Se editan como cualquier personalidad/agente propio."
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Stat label="Personalidades p158-*" value={personalities.length} hint={personalities.length ? personalities.map((p) => p.name).slice(0, 4).join(" · ") : "sin sembrar todavía"} />
          <Stat label="Agentes agent158-*" value={agents.length} hint={agents.length ? agents.map((a) => a.name).slice(0, 4).join(" · ") : "sin sembrar todavía"} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className={BTN_PRIMARY}
            disabled={busy !== "" || !manifest}
            aria-label="Re-sembrar personalidades y agentes desde el backend soberano 1.58"
            title={!manifest ? `Sin conexión con el backend (${target}): conéctate para poder re-sembrar.` : undefined}
            onClick={() => { void doReseed(); }}
          >
            <BusyIcon busy={busy === "reseed"} icon={Download} /> Re-sembrar desde el backend
          </button>
          <button
            type="button"
            className={BTN_DANGER}
            disabled={busy !== "" || (personalities.length === 0 && agents.length === 0)}
            aria-label="Quitar personalidades y agentes importados del backend 1.58"
            onClick={() => { void doRemove(); }}
          >
            <BusyIcon busy={busy === "remove"} icon={Trash2} /> Quitar lo importado
          </button>
        </div>
        {!manifest && <p className="mt-2 text-[10px] text-white/50">Sin conexión con el backend ({target}): «Re-sembrar» queda deshabilitado. «Quitar lo importado» no necesita conexión: solo toca tu Biblioteca.</p>}
      </div>

      <div className={cn(CARD, "p-3")}>
        <SectionTitle icon={BookOpen} title="Secciones del OS" tone="text-emerald-300" hint="Dónde viven la Biblioteca general, las habilidades y los proyectos/creaciones que trae este puente." />
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Link href="/biblioteca" className={BTN} aria-label="Abrir la Biblioteca del OS">
            <Library className="h-3 w-3" aria-hidden="true" /> Biblioteca del OS <ExternalLink className="h-2.5 w-2.5 opacity-60" aria-hidden="true" />
          </Link>
          <Link href="/agent?tab=astraura-158&sub=habilidades" className={BTN} aria-label="Abrir Habilidades y Bóveda del Studio 1.58">
            <Wand2 className="h-3 w-3" aria-hidden="true" /> Habilidades y Bóveda
          </Link>
          <Link href="/agent?tab=astraura-158&sub=proyectos" className={BTN} aria-label="Abrir Proyectos y Creaciones del Studio 1.58">
            <FolderKanban className="h-3 w-3" aria-hidden="true" /> Proyectos y Creaciones
          </Link>
        </div>
      </div>
    </div>
  );
}

export default BibliotecaTab;
