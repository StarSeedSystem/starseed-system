// src/app/(app)/network/culture/page.tsx
'use client';
import { useState } from 'react';
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { MessageCircle, ThumbsUp, Share2, Repeat, Bookmark, Map, Calendar, Radio } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { culturalPosts } from "@/lib/data";
import { CommentSystem } from '@/components/comment-system';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import dynamic from 'next/dynamic';
// Leaflet accede a `window`: cargar solo en cliente (sin SSR) para no romper el prerender.
const NetworkMap = dynamic(
  () => import('@/components/maps/network-map').then((m) => m.NetworkMap),
  { ssr: false, loading: () => <div className="h-72 w-full animate-pulse rounded-xl bg-muted/40" /> }
);
import { CrearAffordances, CulturalFeedLive } from './crear-realtime';
import { UnifiedCalendar } from '@/components/calendar/unified-calendar';
import { SystemShowcase } from '@/components/showcase/SystemShowcase';

function CulturalPostCard({ post }: { post: typeof culturalPosts[0] }) {
  const [showComments, setShowComments] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <Link href={post.author.href} className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src={post.author.avatar} data-ai-hint="user avatar" />
              <AvatarFallback>{post.author.name.charAt(0)}</AvatarFallback>
            </Avatar>
            <div>
              <p className="font-semibold">{post.author.name}</p>
              <p className="text-sm text-muted-foreground">{post.timestamp}</p>
            </div>
          </Link>
          <Button variant="ghost" size="sm" className="flex items-center gap-2">
            <Repeat className="w-4 h-4" />
            <span>Republicado por <b>E.F. del Norte</b></span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground whitespace-pre-wrap mb-4">{post.content}</p>
        {post.imageUrl && (
          <div className="relative aspect-video rounded-lg overflow-hidden mb-4 border">
            <Image src={post.imageUrl} alt={post.title} layout="fill" objectFit="cover" data-ai-hint={post.imageHint} />
          </div>
        )}
        <div className="flex flex-wrap justify-between items-center gap-2 text-muted-foreground border-t pt-2">
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <ThumbsUp className="w-4 h-4" /> {post.likes}
            </Button>
            <Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={() => setShowComments(!showComments)}>
              <MessageCircle className="w-4 h-4" /> {post.comments.length}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <Share2 className="w-4 h-4" /> Compartir
            </Button>
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <Bookmark className="w-4 h-4" /> Guardar
            </Button>
          </div>
        </div>
        {showComments && (
          <div className='mt-4'>
            <CommentSystem comments={post.comments} />
          </div>
        )}
      </CardContent>
    </Card>
  )
}


export default function CulturePage() {
  return (
    <div className="flex flex-col gap-6">
      {/* Crear: accesos directos al Composer universal (/publicar) y al Lienzo (/pizarra) */}
      <CrearAffordances />

      <Tabs defaultValue="feed" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6 h-auto">
          <TabsTrigger value="feed" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2"><Radio className="mr-1.5 sm:mr-2 h-4 w-4 shrink-0" />Feed Cultural</TabsTrigger>
          <TabsTrigger value="map" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2"><Map className="mr-1.5 sm:mr-2 h-4 w-4 shrink-0" />Mapa Global</TabsTrigger>
          <TabsTrigger value="calendar" className="px-2 sm:px-5 text-[clamp(0.7rem,2.2vw,0.875rem)] whitespace-normal sm:whitespace-nowrap leading-tight py-2"><Calendar className="mr-1.5 sm:mr-2 h-4 w-4 shrink-0" />Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="animate-in fade-in-50 duration-500">
          <div className="space-y-6">
            {/* Indicador en vivo (realtime sobre la tabla `posts`) */}
            <CulturalFeedLive />
            {culturalPosts.map(post => (
              <CulturalPostCard key={post.id} post={post} />
            ))}
          </div>
        </TabsContent>

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
