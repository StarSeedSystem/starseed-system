// src/app/(app)/network/culture/page.tsx
'use client';
import Link from "next/link";
import { useMemo } from "react";
import { Map, Calendar as CalendarIcon, Palette, CalendarDays, Orbit, ArrowUpRight, Megaphone } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import dynamic from 'next/dynamic';
// Leaflet accede a `window`: cargar solo en cliente (sin SSR) para no romper el prerender.
const NetworkMap = dynamic(
  () => import('@/components/maps/network-map').then((m) => m.NetworkMap),
  { ssr: false, loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-muted/40" /> }
);
import { CrearAffordances, CulturalFeedLive } from './crear-realtime';
import { CultureSocialTabs, CULTURE_SOCIAL_TABS } from './social-hub';
import { UnifiedCalendar } from '@/components/calendar/unified-calendar';
import { SystemShowcase } from '@/components/showcase/SystemShowcase';
import { SectionHeader } from '@/components/network/section-header';
import { SectionPostsFeed } from '@/components/network/section-posts-feed';
import { useOsEvents } from '@/hooks/use-os-entities';
import { realEventsOnly } from '@/lib/os-social';

const EVENT_DATE_FMT = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
});

/** Próximos eventos REALES de la red (os_events) + acceso al Multiverso. */
function CultureDiscoveryRow() {
  const { data: events, loading } = useOsEvents();
  const upcoming = useMemo(() => {
    const now = Date.now();
    return realEventsOnly(events)
      .filter((e) => e.startsAt && new Date(e.startsAt).getTime() >= now)
      .sort((a, b) => new Date(a.startsAt!).getTime() - new Date(b.startsAt!).getTime())
      .slice(0, 4);
  }, [events]);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Eventos próximos (os_events reales) */}
      <Card className="liquid-glass-panel lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-headline text-lg">
            <CalendarDays className="h-4 w-4 text-fuchsia-300" /> Eventos próximos
          </CardTitle>
          <CardDescription>Encuentros reales de la red con fecha por venir.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="h-20 w-full animate-pulse rounded-xl bg-muted/30" />
          ) : upcoming.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/12 p-5 text-center text-sm text-muted-foreground">
              <p>Aún no hay eventos próximos en la red.</p>
              <Link
                href="/crear?area=publicar&dest=cultura"
                className="mt-2 inline-flex cursor-pointer items-center gap-1.5 text-fuchsia-300 hover:underline"
              >
                <Megaphone className="h-3.5 w-3.5" /> Convoca el primero
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {upcoming.map((e) => (
                <Link
                  key={e.slug}
                  href={`/evento/${e.slug}`}
                  className="group flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 transition-all hover:border-white/25"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{e.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {e.startsAt ? EVENT_DATE_FMT.format(new Date(e.startsAt)) : 'Sin fecha'}
                      {e.location ? ` · ${e.location}` : ''}
                    </span>
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Multiverso (espacios inmersivos) */}
      <Link href="/immersive" className="group cursor-pointer">
        <Card className="liquid-glass-panel h-full border-purple-400/20 bg-gradient-to-br from-purple-500/[0.08] via-transparent to-cyan-500/[0.06] transition-all group-hover:border-purple-400/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 font-headline text-lg">
              <Orbit className="h-4 w-4 text-purple-300" /> Multiverso
            </CardTitle>
            <CardDescription>Espacios inmersivos de realidad virtual de la red.</CardDescription>
          </CardHeader>
          <CardContent>
            <span className="inline-flex items-center gap-1.5 text-sm text-purple-200 transition-colors group-hover:text-purple-100">
              Entrar al Multiverso
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </span>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}

export default function CulturePage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      {/* ── Cabecera consistente de sección + acciones rápidas (Adenda 63 §8) ── */}
      <SectionHeader
        dest="cultura"
        icon={Palette}
        title="Ecosistema Cultural"
        description="Arte, expresión, eventos y Multiverso: la zona más social de la red."
      />

      {/* Crear: accesos directos al Composer universal (/publicar) y al Lienzo (/pizarra) */}
      <CrearAffordances />

      {/* Indicador en vivo (realtime sobre la tabla `posts`), visible en cualquier sub-pestaña */}
      <CulturalFeedLive />

      {/* Eventos próximos (os_events reales) + Multiverso */}
      <CultureDiscoveryRow />

      <Tabs defaultValue="para-ti" className="w-full">
        <TabsList className="mb-6 flex h-auto w-full items-center gap-1.5 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
          {CULTURE_SOCIAL_TABS.map((t) => {
            const TabIcon = t.icon;
            return (
              <TabsTrigger key={t.value} value={t.value} className="gap-1.5 whitespace-nowrap px-3 py-2 text-xs sm:text-sm">
                <TabIcon className="h-4 w-4 shrink-0" />{t.label}
              </TabsTrigger>
            );
          })}
          <TabsTrigger value="map" className="gap-1.5 whitespace-nowrap px-3 py-2 text-xs sm:text-sm"><Map className="h-4 w-4 shrink-0" />Mapa Global</TabsTrigger>
          <TabsTrigger value="calendar" className="gap-1.5 whitespace-nowrap px-3 py-2 text-xs sm:text-sm"><CalendarIcon className="h-4 w-4 shrink-0" />Agenda</TabsTrigger>
          <TabsTrigger value="seccion" className="gap-1.5 whitespace-nowrap px-3 py-2 text-xs sm:text-sm"><Megaphone className="h-4 w-4 shrink-0" />Sección</TabsTrigger>
        </TabsList>

        {/* Para ti · Siguiendo · Tendencias · Explorar · En vivo (hub social, ver ./social-hub.tsx) */}
        <CultureSocialTabs />

        <TabsContent value="map" className="animate-in fade-in-50 duration-500">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold font-headline">Mapa Global Interactivo</h2>
              <p className="text-muted-foreground">
                Comunidades y eventos reales de la red StarSeed con geografía asignada. Busca, filtra por
                capas, céntrate en tu ubicación y abre la ficha de cada lugar.
              </p>
            </div>
            <NetworkMap />
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="animate-in fade-in-50 duration-500">
          {/*
            Mismo calendario que se renderiza en el Hub (UnifiedCalendar).
            La fuente de datos vive en CalendarProvider, por lo que cualquier
            cambio aquí o desde /hub se refleja instantáneamente en la otra
            superficie. Las capas filtrables (cultura, política, educación,
            bienestar, recordatorios, alarmas, logs del sistema…) y la
            integración con el Exocórtex (Contexto IA) son las mismas.
          */}
          <UnifiedCalendar
            title="Agenda Unificada"
            subtitle="Todos los eventos culturales, políticos, educativos y personales en un solo lugar. Filtra capas y abre cualquier día para gestionar sus entradas."
          />
        </TabsContent>

        <TabsContent value="seccion" className="animate-in fade-in-50 duration-500">
          {/* Feed vivo de la sección (os_posts · cola "cultura" de la Zona de
              Publicación, realtime) — Adenda 63 §8. */}
          <SectionPostsFeed dest="cultura" />
        </TabsContent>
      </Tabs>

      <SystemShowcase system="cultural" />
    </div>
  );
}
