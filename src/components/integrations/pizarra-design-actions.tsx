"use client";

// ════════════════════════════════════════════════════════════════════════════
// StarSeed OS — Accesos de diseño/documentos para las Pizarras
// ----------------------------------------------------------------------------
// Barra de acciones que vincula las PIZARRAS con Penpot (diseño) y AppFlowy
// (documentos). Si hay una conexión/URL configurada (resolveServiceFor('design')
// / ('docs') o la config local del panel de Integraciones), muestra:
//   • "Abrir en Penpot"          → abre la instancia de Penpot en pestaña.
//   • "Nuevo documento AppFlowy"  → abre la instancia de AppFlowy en pestaña.
// Ambos registran el acceso en Mi Biblioteca (saveResource) como Entidad Única.
//
// Si NO hay nada configurado, se muestra un aviso discreto con enlace a
// Integraciones/Servicios. Todo SSR-safe, defensivo y aditivo.
// ════════════════════════════════════════════════════════════════════════════

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Palette, FileText, ExternalLink, Plug } from "lucide-react";
import { resolveServiceFor } from "@/lib/services/oss-connections";
import { saveResource } from "@/lib/library-store";

const CFG_KEY = "starseed.integrations.designdocs.v1";

function isClient(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normUrl(v: string | undefined | null): string {
  const s = (v || "").trim();
  return /^https?:\/\//i.test(s) ? s : "";
}

/** URL efectiva de un servicio: config local del panel > conexión OSS > default. */
function resolveUrl(
  category: "docs" | "design",
  cfgKeyName: "appflowyUrl" | "penpotUrl",
): string {
  // 1) Config local del panel de Integraciones.
  if (isClient()) {
    try {
      const raw = window.localStorage.getItem(CFG_KEY);
      if (raw) {
        const p = JSON.parse(raw);
        const local = normUrl(p?.[cfgKeyName]);
        if (local) return local;
      }
    } catch {
      /* noop */
    }
  }
  // 2) Conexión OSS de la función.
  try {
    const r = resolveServiceFor(category);
    const fromConn = normUrl(
      r?.connection?.extra?.instanceUrl ||
        r?.connection?.endpoint ||
        r?.endpoint,
    );
    if (fromConn) return fromConn;
  } catch {
    /* noop */
  }
  return "";
}

export function PizarraDesignActions() {
  const [penpotUrl, setPenpotUrl] = useState("");
  const [appflowyUrl, setAppflowyUrl] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setPenpotUrl(resolveUrl("design", "penpotUrl"));
    setAppflowyUrl(resolveUrl("docs", "appflowyUrl"));
    setReady(true);
  }, []);

  const openPenpot = () => {
    if (!penpotUrl) return;
    try {
      window.open(penpotUrl, "_blank", "noopener,noreferrer");
      saveResource({
        kind: "penpot-design",
        title: "Penpot · diseño (desde Pizarras)",
        url: penpotUrl,
        origin: "Penpot",
      });
      toast.success("Abriendo Penpot · acceso guardado en Mi Biblioteca.");
    } catch {
      toast.error("No se pudo abrir Penpot.");
    }
  };

  const openAppflowy = () => {
    if (!appflowyUrl) return;
    try {
      window.open(appflowyUrl, "_blank", "noopener,noreferrer");
      saveResource({
        kind: "appflowy-doc",
        title: "AppFlowy · documento (desde Pizarras)",
        url: appflowyUrl,
        origin: "AppFlowy",
      });
      toast.success("Abriendo AppFlowy · acceso guardado en Mi Biblioteca.");
    } catch {
      toast.error("No se pudo abrir AppFlowy.");
    }
  };

  // Evita parpadeo/hidratación: no renderizamos hasta leer config en cliente.
  if (!ready) return null;

  const hasAny = !!penpotUrl || !!appflowyUrl;

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      {penpotUrl && (
        <button
          onClick={openPenpot}
          className="inline-flex items-center gap-2 rounded-xl border border-[#FF6F61]/30 bg-[#FF6F61]/[0.06] px-3 py-1.5 text-xs text-[#ffb3aa] transition hover:bg-[#FF6F61]/[0.12]"
        >
          <Palette className="h-3.5 w-3.5" />
          Abrir en Penpot
          <ExternalLink className="h-3 w-3 opacity-70" />
        </button>
      )}
      {appflowyUrl && (
        <button
          onClick={openAppflowy}
          className="inline-flex items-center gap-2 rounded-xl border border-[#00BCF0]/30 bg-[#00BCF0]/[0.06] px-3 py-1.5 text-xs text-[#8fe4fb] transition hover:bg-[#00BCF0]/[0.12]"
        >
          <FileText className="h-3.5 w-3.5" />
          Nuevo documento AppFlowy
          <ExternalLink className="h-3 w-3 opacity-70" />
        </button>
      )}
      {!hasAny && (
        <Link
          href="/integraciones"
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
          title="Conecta Penpot y AppFlowy para diseñar y documentar desde las pizarras"
        >
          <Plug className="h-3.5 w-3.5" />
          Conectar Penpot / AppFlowy
        </Link>
      )}
    </div>
  );
}

export default PizarraDesignActions;
