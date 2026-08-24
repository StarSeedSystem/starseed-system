/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `/agent/astraura/[kind]/[id]` — página completa de una entidad viva (Ola 5 · Adenda 157, SOP §1)
 * ---------------------------------------------------------------------------
 * Server component mínimo: valida `kind` contra la lista de la ventana
 * universal y renderiza `Astraura158Window` (client) en modo `embedded` con
 * el `target` por defecto ("local"). Enlazable y compartible — una de las
 * tres formas de abrir la MISMA ventana que describe el SOP.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import { Astraura158Window } from "@/components/astraura/window/astraura-158-window";
import { isAstraura158EntityKind, type Astraura158EntityKind } from "@/components/astraura/window/astraura-158-window-bus";

interface RouteParams {
  kind: string;
  id: string;
}

const KIND_TITLE: Record<Astraura158EntityKind, string> = {
  proceso: "Proceso",
  agente: "Agente",
  personalidad: "Personalidad",
  cerebro: "Cerebro",
  proyecto: "Proyecto",
  creacion: "Creación",
  rama: "Rama",
};

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { kind } = await params;
  if (!isAstraura158EntityKind(kind)) return { title: "Astraura 1.58-bit — StarSeed OS" };
  return { title: `${KIND_TITLE[kind]} · Astraura 1.58-bit — StarSeed OS` };
}

export default async function AstrauraEntityPage({ params }: { params: Promise<RouteParams> }) {
  const { kind, id } = await params;
  if (!isAstraura158EntityKind(kind)) notFound();
  if (!id) notFound();

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col gap-3 p-3 sm:p-4 md:p-6">
      <header className="flex items-center gap-2">
        <Link
          href="/agent?tab=astraura-158"
          className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white/70 transition hover:bg-white/10"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Volver
        </Link>
        <h1 className="text-sm font-semibold text-white/85">{KIND_TITLE[kind]} · Astraura 1.58-bit</h1>
        <span className="rounded bg-white/5 px-2 py-0.5 font-mono text-[11px] text-white/40">
          /agent/astraura/{kind}/{id}
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/30">
        <Astraura158Window kind={kind} id={id} target="local" embedded />
      </div>
    </div>
  );
}
