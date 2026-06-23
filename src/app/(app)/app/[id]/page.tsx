"use client";

// Página /app/[id] — EJECUTA una app generada DENTRO de StarSeed.
//
// Es el destino real del "deploy en la red": carga la fila de `generated_apps`
// por id (vía supabase; funciona si eres el dueño o si la app está compartida,
// según RLS), construye el HTML autocontenido con `buildPreview(files)` y lo
// monta en un <iframe srcDoc> a pantalla completa. La app corre en su propio
// sandbox dentro de la red.
//
// Client component + useParams para evitar el constraint de tipos de `params`
// (Promise) del App Router de Next 15 y mantener el build verde. SSR-safe.

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Loader2, Sparkles, AppWindow, Lock } from "lucide-react";

import { createClient } from "@/utils/supabase/client";
import { buildPreview, type AppFile, languageForPath } from "@/lib/appgen/appgen";

type LoadState = "loading" | "ready" | "notfound" | "error";

interface LoadedApp {
  id: string;
  name: string;
  files: AppFile[];
  shared: boolean;
}

/** Normaliza la fila de generated_apps a {id,name,files,shared} de forma defensiva. */
function normalize(row: Record<string, unknown> | null): LoadedApp | null {
  if (!row) return null;
  const rawFiles = Array.isArray(row.files) ? (row.files as Record<string, unknown>[]) : [];
  const files: AppFile[] = rawFiles
    .filter((f) => f && typeof f.path === "string")
    .map((f) => ({
      path: String(f.path),
      content: typeof f.content === "string" ? (f.content as string) : "",
      language:
        typeof f.language === "string" && f.language
          ? (f.language as string)
          : languageForPath(String(f.path)),
    }));
  return {
    id: String(row.id ?? ""),
    name: typeof row.name === "string" && row.name ? (row.name as string) : "App",
    files,
    shared: !!row.shared,
  };
}

export default function RunAppPage() {
  const params = useParams<{ id: string }>();
  const raw = params?.id;
  const id = Array.isArray(raw) ? raw[0] : (raw ?? "");

  const [state, setState] = useState<LoadState>("loading");
  const [app, setApp] = useState<LoadedApp | null>(null);

  useEffect(() => {
    let alive = true;
    if (!id) {
      setState("notfound");
      return;
    }
    setState("loading");
    (async () => {
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from("generated_apps")
          .select("*")
          .eq("id", id)
          .maybeSingle();
        if (!alive) return;
        if (error) {
          // PGRST116 = sin filas; el resto, error genérico.
          if ((error as { code?: string }).code === "PGRST116") {
            setState("notfound");
          } else {
            setState("error");
          }
          return;
        }
        const norm = normalize(data as Record<string, unknown> | null);
        if (!norm) {
          setState("notfound");
          return;
        }
        setApp(norm);
        setState("ready");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const srcDoc = useMemo(() => (app ? buildPreview(app.files) : ""), [app]);

  const openInTab = () => {
    if (typeof window === "undefined" || !srcDoc) return;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.open();
    w.document.write(srcDoc);
    w.document.close();
  };

  return (
    <div className="flex h-[calc(100vh-2rem)] min-h-0 w-full flex-col gap-2">
      {/* Cabecera: nombre de la app + acciones */}
      <header className="flex flex-wrap items-center gap-2">
        <Link
          href="/apps-ia"
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 transition hover:bg-white/10"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver
        </Link>
        <h1 className="flex items-center gap-2 text-lg font-bold text-white/90">
          <AppWindow className="h-5 w-5 text-emerald-300" />
          {state === "ready" && app ? app.name : "App"}
        </h1>
        {id && (
          <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/40">
            /app/{id}
          </span>
        )}
        {state === "ready" && (
          <button
            onClick={openInTab}
            className="ml-auto flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-100 transition hover:bg-emerald-500/20"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Abrir en pestaña nueva
          </button>
        )}
      </header>

      {/* Cuerpo: la app EJECUTÁNDOSE en un iframe a pantalla completa */}
      {state === "loading" && (
        <div className="grid flex-1 place-items-center rounded-2xl border border-white/10 bg-black/30">
          <p className="flex items-center gap-2 text-sm text-white/50">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando la app…
          </p>
        </div>
      )}

      {state === "notfound" && (
        <div className="grid flex-1 place-items-center rounded-2xl border border-white/10 bg-black/30 p-6 text-center">
          <div className="max-w-md">
            <Lock className="mx-auto mb-3 h-8 w-8 text-white/40" />
            <h2 className="mb-1 text-base font-semibold text-white/80">
              No encontramos esta app
            </h2>
            <p className="text-sm text-white/50">
              La app no existe, fue eliminada, o es privada y no tienes acceso. Si es tuya, ábrela
              desde el generador y pulsa <b>Desplegar</b> para publicarla en la red.
            </p>
            <Link
              href="/apps-ia"
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/80 transition hover:bg-white/10"
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" /> Ir al generador de apps
            </Link>
          </div>
        </div>
      )}

      {state === "error" && (
        <div className="grid flex-1 place-items-center rounded-2xl border border-rose-400/20 bg-rose-500/5 p-6 text-center">
          <div className="max-w-md">
            <h2 className="mb-1 text-base font-semibold text-rose-100">
              No se pudo cargar la app
            </h2>
            <p className="text-sm text-white/50">
              Hubo un problema al leer la app. Vuelve a intentarlo en un momento.
            </p>
          </div>
        </div>
      )}

      {state === "ready" && app && (
        app.files.length === 0 ? (
          <div className="grid flex-1 place-items-center rounded-2xl border border-white/10 bg-black/30 p-6 text-center text-sm text-white/50">
            Esta app no tiene archivos para ejecutar.
          </div>
        ) : (
          <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-white">
            <iframe
              title={app.name}
              srcDoc={srcDoc}
              sandbox="allow-scripts allow-modals allow-popups allow-forms"
              className="h-[calc(100vh-2rem)] w-full border-0"
            />
          </div>
        )
      )}
    </div>
  );
}
