"use client";

// ════════════════════════════════════════════════════════════════════════════
// /integraciones — "Integraciones y Conectores"
// ----------------------------------------------------------------------------
// Página que reúne los conectores funcionales a servicios open-source que
// StarSeed OS trae preintegrados:
//   • Automatizaciones (n8n)         → disparo de workflows por webhook.
//   • Documentos y Diseño (AppFlowy + Penpot) → empotrar/abrir + guardar en la
//     Biblioteca como Entidades Únicas.
//   • Calendarios (Cal.com y otros)  → viven en el sistema de calendario; aquí
//     enlazamos a ellos.
//
// Todo es aditivo, SSR-safe y defensivo. Los paneles aparecen SIEMPRE
// (preintegrados) aunque el usuario no haya configurado aún un endpoint; cada
// panel explica qué necesita para funcionar y enlaza a Servicios.
// ════════════════════════════════════════════════════════════════════════════

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { N8nPanel } from "@/components/integrations/n8n-panel";
import { DesignDocsPanel } from "@/components/integrations/design-docs-panel";
import {
  Plug,
  CalendarClock,
  Boxes,
  ArrowUpRight,
  Workflow,
  Palette,
} from "lucide-react";

export default function IntegracionesPage() {
  return (
    <main className="min-h-screen px-4 py-8 md:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Cabecera */}
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold">
            <Plug className="h-7 w-7 text-primary" />
            Integraciones y Conectores
          </h1>
          <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
            Conecta StarSeed OS con servicios <strong>open source</strong> por endpoint —
            sin instalar nada en la red. Automatiza con n8n, escribe y diseña con AppFlowy y
            Penpot, y agenda con Cal.com. Todo soberano: tus claves y tus datos son tuyos.
          </p>
        </div>

        {/* Accesos rápidos */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/servicios"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
          >
            <Boxes className="h-3.5 w-3.5" />
            Catálogo de servicios OSS
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link
            href="/network/culture"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            Calendario y Cal.com
            <ArrowUpRight className="h-3 w-3" />
          </Link>
          <Link
            href="/pizarras"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
          >
            <Palette className="h-3.5 w-3.5" />
            Pizarras (Penpot / AppFlowy)
            <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        {/* Automatizaciones (n8n) */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
            <Workflow className="h-4 w-4 text-amber-300" />
            Automatización
            <Badge variant="outline" className="border-white/10 text-[9px]">
              n8n
            </Badge>
          </h2>
          <N8nPanel scope="user" />
        </section>

        {/* Documentos y Diseño */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
            <Palette className="h-4 w-4 text-fuchsia-300" />
            Documentos y Diseño
            <Badge variant="outline" className="border-white/10 text-[9px]">
              AppFlowy · Penpot
            </Badge>
          </h2>
          <DesignDocsPanel />
        </section>

        {/* Calendarios: puntero al sistema de calendario */}
        <section className="space-y-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground/80">
            <CalendarClock className="h-4 w-4 text-sky-300" />
            Calendarios
            <Badge variant="outline" className="border-white/10 text-[9px]">
              Cal.com
            </Badge>
          </h2>
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-sm text-muted-foreground">
            <p>
              Los conectores de calendario —incluido{" "}
              <strong className="text-foreground/90">Cal.com</strong> (API v2), Google, Apple,
              Outlook, Proton, Nextcloud y CalDAV/.ics— viven dentro del sistema de calendario
              de la red, donde sus reservas y eventos se leen y sincronizan.
            </p>
            <Link
              href="/network/culture"
              className="mt-3 inline-flex items-center gap-2 rounded-lg border border-sky-500/30 bg-sky-500/[0.06] px-3 py-1.5 text-xs text-sky-200 transition hover:bg-sky-500/[0.12]"
            >
              <CalendarClock className="h-3.5 w-3.5" />
              Ir al calendario y conectar Cal.com
              <ArrowUpRight className="h-3 w-3" />
            </Link>
          </div>
        </section>

        {/* Nota honesta */}
        <div className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-[11px] leading-relaxed text-muted-foreground">
          <Boxes className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <span>
            Realista y soberano: StarSeed OS no aloja estos servicios, los{" "}
            <strong>conecta</strong> con tu instancia (self-host o nube) por endpoint, clave o
            webhook. Configura las conexiones en{" "}
            <Link href="/servicios" className="text-primary underline">
              Servicios
            </Link>{" "}
            y aquí las usas.
          </span>
        </div>
      </div>
    </main>
  );
}
