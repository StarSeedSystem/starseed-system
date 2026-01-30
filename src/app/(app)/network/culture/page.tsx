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
import { EventCalendarView, MapPlaceholder } from './components';

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
        <div className="flex justify-between items-center text-muted-foreground border-t pt-2">
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="flex items-center gap-2">
              <ThumbsUp className="w-4 h-4" /> {post.likes}
            </Button>
            <Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={() => setShowComments(!showComments)}>
              <MessageCircle className="w-4 h-4" /> {post.comments.length}
            </Button>
          </div>
          <div className="flex gap-1">
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
      <Tabs defaultValue="feed" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6">
          <TabsTrigger value="feed"><Radio className="mr-2 h-4 w-4" />Feed Cultural</TabsTrigger>
          <TabsTrigger value="map"><Map className="mr-2 h-4 w-4" />Mapa Global</TabsTrigger>
          <TabsTrigger value="calendar"><Calendar className="mr-2 h-4 w-4" />Agenda</TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="animate-in fade-in-50 duration-500">
          <div className="space-y-6">
            {culturalPosts.map(post => (
              <CulturalPostCard key={post.id} post={post} />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="map" className="animate-in fade-in-50 duration-500">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold font-headline">Mapa Global Interactivo</h2>
              <p className="text-muted-foreground">Explora la geografía de la red StarSeed.</p>
            </div>
            <MapPlaceholder />
          </div>
        </TabsContent>

        <TabsContent value="calendar" className="animate-in fade-in-50 duration-500">
          <div className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-bold font-headline">Agenda Unificada</h2>
              <p className="text-muted-foreground">Todos los eventos culturales y políticos en un solo lugar.</p>
            </div>
            <EventCalendarView />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

