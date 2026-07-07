// src/app/(app)/network/culture/page.tsx
'use client';
import { Map, Calendar as CalendarIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

export default function CulturePage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Crear: accesos directos al Composer universal (/publicar) y al Lienzo (/pizarra) */}
      <CrearAffordances />

      {/* Indicador en vivo (realtime sobre la tabla `posts`), visible en cualquier sub-pestaña */}
      <CulturalFeedLive />

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
      </Tabs>

      <SystemShowcase system="cultural" />
    </div>
  );
}
