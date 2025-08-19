// src/app/(app)/profile/[username]/page.tsx
'use client';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { feedItems, politicalProposals, comments as defaultComments } from "@/lib/data";
import { Edit, Rss, Scale, Users, BarChart, FileText, ThumbsUp, MessageCircle, Share2, Bookmark, Folder, PlusCircle, Link2, Search, X } from "lucide-react";
import Image from "next/image";
import { CommentSystem } from "@/components/comment-system";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProfileWelcomeWidget } from "@/components/profile/widgets/profile-welcome-widget";
import { FeaturedBadgesWidget } from "@/components/profile/widgets/featured-badges-widget";
import { RecentPostsWidget } from "@/components/profile/widgets/recent-posts-widget";
import { ConnectionsWidget } from "@/components/profile/widgets/connections-widget";
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PoliticalProposalCard } from "@/components/political-proposal-card";
import { Badge } from "@/components/ui/badge";


function FeedPostCard({ item }: { item: typeof feedItems[0] }) {
    const [showComments, setShowComments] = useState(false);

    return (
        <Card>
            <CardHeader>
                <Link href={item.href} className="flex items-center gap-3">
                    <Avatar>
                        <AvatarImage src={item.avatar} data-ai-hint={item.dataAiHint} />
                        <AvatarFallback>{item.author.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div>
                        <p className="font-semibold">{item.author}</p>
                        <p className="text-sm text-muted-foreground">{item.handle} · {item.timestamp}</p>
                    </div>
                </Link>
            </CardHeader>
            <CardContent>
                <p className="text-muted-foreground whitespace-pre-wrap">{item.content}</p>
                 {item.imageUrl && (
                    <div className="relative aspect-video rounded-lg overflow-hidden mt-4 border">
                        <Image src={item.imageUrl} alt="Post image" layout="fill" objectFit="cover" data-ai-hint={item.imageHint} />
                    </div>
                )}
            </CardContent>
            <CardFooter className="flex-col items-stretch">
                <div className="flex justify-between items-center text-muted-foreground border-t pt-2">
                    <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="flex items-center gap-2">
                            <ThumbsUp className="w-4 w-4" /> {item.likes}
                        </Button>
                        <Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={() => setShowComments(!showComments)}>
                            <MessageCircle className="w-4 w-4" /> {item.comments.length}
                        </Button>
                    </div>
                    <div className="flex gap-1">
                        <Button variant="ghost" size="sm" className="flex items-center gap-2">
                            <Share2 className="w-4 w-4" /> Compartir
                        </Button>
                        <Button variant="ghost" size="sm" className="flex items-center gap-2">
                            <Bookmark className="w-4 h-4" /> Guardar
                        </Button>
                    </div>
                </div>
                {showComments && (
                  <div className='mt-4 w-full'>
                    <CommentSystem comments={item.comments} />
                  </div>
                )}
            </CardFooter>
        </Card>
    )
}

function PostsFeed() {
    return (
        <div className="space-y-6">
            {feedItems.map(item => (
                <FeedPostCard key={item.id} item={item} />
            ))}
        </div>
    );
}

function EFGovernanceTabs() {
    return (
        <Tabs defaultValue="legislativo" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="legislativo"><Scale className="mr-2 h-4 w-4"/>Legislativo</TabsTrigger>
                <TabsTrigger value="ejecutivo"><Users className="mr-2 h-4 w-4"/>Ejecutivo</TabsTrigger>
                <TabsTrigger value="judicial"><BarChart className="mr-2 h-4 w-4"/>Judicial</TabsTrigger>
            </TabsList>
            <TabsContent value="legislativo" className="mt-6">
                <div className="space-y-6">
                    {politicalProposals.map(p => (
                    <PoliticalProposalCard key={p.id} proposal={p} />
                    ))}
                </div>
            </TabsContent>
            <TabsContent value="ejecutivo" className="mt-6 text-center text-muted-foreground py-12">
                <p>La sección del Ejecutivo está en desarrollo.</p>
            </TabsContent>
            <TabsContent value="judicial" className="mt-6 text-center text-muted-foreground py-12">
                <p>La sección Judicial está en desarrollo.</p>
            </TabsContent>
        </Tabs>
    )
}

const collections = [
    { 
        id: 'collection-1', 
        name: "Investigación para Artículo de IA", 
        description: "Recursos y borradores para el próximo artículo sobre la conciencia en LLMs.",
        items: [
            { id: 'item-1-1', type: 'profile', name: 'Dra. Evelyn Reed', avatar: 'https://placehold.co/40x40.png' },
            { id: 'item-1-2', type: 'page', name: 'Grupo de Estudio de IA', avatar: 'https://placehold.co/40x40.png' },
            { id: 'item-1-3', type: 'file', name: 'Borrador del Artículo.docx', icon: <FileText className="w-6 h-6 text-muted-foreground" /> }
        ]
    },
    { 
        id: 'collection-2', 
        name: "Inspiración para Diseño Ciberdélico", 
        description: "Arte generativo, paletas de colores y referencias visuales.",
        items: [
            { id: 'item-2-1', type: 'file', name: 'Paleta de Colores Primarios.png', icon: <FileText className="w-6 h-6 text-muted-foreground" /> },
            { id: 'item-2-2', type: 'file', name: 'Animación de Transición.mp4', icon: <FileText className="w-6 h-6 text-muted-foreground" /> },
            { id: 'item-2-3', type: 'page', name: 'Artistas por la Singularidad', avatar: 'https://placehold.co/40x40.png' },
        ]
    },
    { 
        id: 'collection-3', 
        name: "Propuestas Políticas a Seguir", 
        description: "Leyes y propuestas importantes en varias E.F.",
        items: [
            { id: 'item-3-1', type: 'page', name: 'E.F. del Valle Central', avatar: 'https://placehold.co/40x40.png' },
            { id: 'item-3-2', type: 'publication', name: 'Ley de Soberanía de Datos Personales', icon: <FileText className="w-6 h-6 text-muted-foreground" /> }
        ]
    }
];

function CollectionsGrid() {
    const [selectedCollection, setSelectedCollection] = useState<(typeof collections)[0] | null>(null);

    const renderItemIcon = (item: any) => {
        switch (item.type) {
            case 'profile':
            case 'page':
                return (
                    <Avatar className="h-6 w-6">
                        <AvatarImage src={item.avatar} data-ai-hint="avatar" />
                        <AvatarFallback>{item.name.charAt(0)}</AvatarFallback>
                    </Avatar>
                );
            case 'publication':
                return <FileText className="w-6 h-6 text-muted-foreground" />;
            case 'file':
            default:
                return item.icon || <FileText className="w-6 h-6 text-muted-foreground" />;
        }
    };
    
    return (
        <Dialog>
            <div className="flex justify-end mb-4">
                <Button>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Crear Nueva Colección
                </Button>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                {collections.map(collection => (
                    <Card key={collection.id} className="hover:shadow-lg transition-shadow flex flex-col">
                        <CardHeader>
                            <div className="flex items-start gap-2">
                                <Folder className="text-primary w-6 h-6 mt-1" />
                                <div>
                                    <CardTitle className="font-headline text-lg">{collection.name}</CardTitle>
                                    <CardDescription>{collection.items.length} elementos</CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="flex-1">
                            <p className="text-sm text-muted-foreground mb-4 h-10">{collection.description}</p>
                            <div className="flex -space-x-2">
                                {collection.items.slice(0, 5).map((item) => (
                                    <div key={item.id} className="h-8 w-8 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                                       {renderItemIcon(item)}
                                    </div>
                                ))}
                                {collection.items.length > 5 && (
                                    <div className="h-8 w-8 rounded-full bg-muted border-2 border-background flex items-center justify-center">
                                        <span className="text-xs font-bold">+{collection.items.length - 5}</span>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                         <CardFooter>
                            <DialogTrigger asChild>
                                <Button variant="outline" className="w-full" onClick={() => setSelectedCollection(collection)}>Ver Colección</Button>
                            </DialogTrigger>
                        </CardFooter>
                    </Card>
                ))}
            </div>

            <DialogContent className="sm:max-w-2xl h-[70vh] flex flex-col">
                {selectedCollection && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="font-headline text-2xl flex items-center gap-2"><Folder className="w-6 h-6 text-primary"/> {selectedCollection.name}</DialogTitle>
                            <DialogDescription>{selectedCollection.description}</DialogDescription>
                        </DialogHeader>

                        <div className="flex items-center gap-2">
                             <div className="relative flex-1">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input placeholder="Buscar en la colección..." className="pl-8" />
                            </div>
                             <Button><PlusCircle className="mr-2"/>Añadir a la Colección</Button>
                        </div>
                       
                        <div className="flex-1 overflow-y-auto -mx-6 px-6">
                            <div className="space-y-2">
                                {selectedCollection.items.map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            {renderItemIcon(item)}
                                            <span className="font-medium text-sm">{item.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className="capitalize">{item.type}</Badge>
                                            <Button variant="ghost" size="icon" className="h-8 w-8"><Link2 className="h-4 w-4"/></Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <DialogFooter>
                            <DialogTrigger asChild>
                                <Button variant="outline" onClick={() => setSelectedCollection(null)}>Cerrar</Button>
                            </DialogTrigger>
                        </DialogFooter>
                    </>
                )}
            </DialogContent>
        </Dialog>
    )
}


const pageData: { [key: string]: any } = {
    'starseeduser': {
      name: "StarSeedUser",
      handle: "@starseeduser",
      bio: "Co-creando un futuro ciberdélico. Explorador de la conciencia, constructor de sistemas y creyente en el poder de la inteligencia colectiva.",
      avatar: "https://placehold.co/100x100.png",
      cover: "https://placehold.co/1200x400.png",
      dataAiHint: "user avatar",
      coverHint: "abstract background",
      isUser: true,
      pageType: 'personal',
    },
    'comunidad-permacultura': {
      name: "Comunidad de Permacultura",
      handle: "@permacultura",
      bio: "Un espacio para aprender, compartir y practicar los principios de la permacultura. ¡Únete a nosotros para construir un futuro más sostenible!",
      avatar: "https://placehold.co/100x100.png",
      cover: "https://placehold.co/1200x400.png",
      dataAiHint: "community garden",
      coverHint: "green nature",
      isUser: false,
      pageType: 'comunidad',
    },
    'ef-valle-central': {
        name: "E.F. del Valle Central",
        handle: "@ef-valle-central",
        bio: "La Entidad Federativa del Valle Central, gobernada por sus ciudadanos para el bienestar colectivo y el desarrollo sostenible.",
        avatar: "https://placehold.co/100x100.png",
        cover: "https://placehold.co/1200x400.png",
        dataAiHint: "government building",
        coverHint: "city skyline",
        isUser: false,
        pageType: 'ef',
    },
     'partido-transhumanista': {
        name: "Partido Transhumanista",
        handle: "@transhumanistas",
        bio: "Abogando por el uso ético de la tecnología para mejorar las capacidades humanas y expandir la conciencia.",
        avatar: "https://placehold.co/100x100.png",
        cover: "https://placehold.co/1200x400.png",
        dataAiHint: "futuristic logo",
        coverHint: "circuit board",
        isUser: false,
        pageType: 'partido',
    },
    'grupo-de-estudio-ia': {
        name: "Grupo de Estudio de IA",
        handle: "@ia-study-group",
        bio: "Un grupo dedicado a explorar las fronteras de la Inteligencia Artificial, desde la teoría hasta la aplicación práctica.",
        avatar: "https://placehold.co/100x100.png",
        cover: "https://placehold.co/1200x400.png",
        dataAiHint: "brain circuit",
        coverHint: "code lines",
        isUser: false,
        pageType: 'grupo',
    },
};

function ProfileHeader({ profileData }: { profileData: any }) {
  return (
    <Card className="overflow-hidden">
      <div className="relative h-48 w-full">
        <Image
          src={profileData.cover}
          alt="Foto de portada"
          layout="fill"
          objectFit="cover"
          data-ai-hint={profileData.coverHint}
        />
        <div className="absolute bottom-4 left-6">
          <Avatar className="h-24 w-24 border-4 border-background">
            <AvatarImage src={profileData.avatar} data-ai-hint={profileData.dataAiHint}/>
            <AvatarFallback>{profileData.name.substring(0, 2)}</AvatarFallback>
          </Avatar>
        </div>
      </div>
      <CardContent className="pt-20 p-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div>
            <h1 className="text-3xl font-bold font-headline">{profileData.name}</h1>
            <p className="text-muted-foreground">{profileData.handle}</p>
            <p className="mt-2 max-w-prose text-sm text-muted-foreground">
              {profileData.bio}
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline"><Rss className="mr-2 h-4 w-4"/> Seguir</Button>
            {profileData.isUser && <Button><Edit className="mr-2 h-4 w-4"/> Editar Perfil</Button>}
             <Button variant="outline" size="icon">
                <Bookmark />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const params = useParams();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;

  const profileData = pageData[username] || { 
    name: username.charAt(0).toUpperCase() + username.slice(1).replace(/-/g, ' '),
    handle: `@${username}`,
    bio: `Página de ${username.replace(/-/g, ' ')}.`,
    avatar: "https://placehold.co/100x100.png",
    cover: "https://placehold.co/1200x400.png",
    dataAiHint: "profile avatar",
    coverHint: "abstract pattern",
    isUser: false,
    pageType: 'personal',
  };

  const pageType = profileData.pageType;

  return (
    
        <div className="flex flex-col gap-6">
        <ProfileHeader profileData={profileData} />

        <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2">
                <Tabs defaultValue="dashboard">
                    <TabsList>
                        <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
                        <TabsTrigger value="posts">Publicaciones</TabsTrigger>
                        <TabsTrigger value="connections">Conexiones</TabsTrigger>
                        <TabsTrigger value="library">Biblioteca</TabsTrigger>
                        <TabsTrigger value="collections">Colecciones</TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="dashboard" className="mt-6">
                    <div className="grid gap-6 lg:grid-cols-2">
                        <div className="lg:col-span-2">
                            <ProfileWelcomeWidget pageType={pageType} />
                        </div>
                        <FeaturedBadgesWidget pageType={pageType} />
                        <RecentPostsWidget pageType={pageType} />
                        <div className="lg:col-span-2">
                            <ConnectionsWidget pageType={pageType} />
                        </div>
                    </div>
                    </TabsContent>

                    <TabsContent value="posts" className="mt-6">
                        { pageType === 'ef' ? <EFGovernanceTabs /> : <PostsFeed /> }
                    </TabsContent>
                    <TabsContent value="connections" className="mt-6">
                        <ConnectionsWidget pageType={pageType} />
                    </TabsContent>
                    <TabsContent value="library" className="mt-6">
                        <Card>
                            <CardHeader>
                                <CardTitle>Biblioteca</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <p className="text-muted-foreground">La biblioteca pública de este perfil está en construcción.</p>
                            </CardContent>
                        </Card>
                    </TabsContent>
                    <TabsContent value="collections" className="mt-6">
                        <CollectionsGrid />
                    </TabsContent>
                </Tabs>
            </div>
            <div className="lg:col-span-1">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Discusión Abierta</CardTitle>
                    <CardDescription>Un espacio para conversaciones generales en este perfil.</CardDescription>
                </CardHeader>
                <CardContent>
                    <CommentSystem comments={defaultComments} />
                </CardContent>
            </Card>
            </div>
        </div>
        </div>
    
  );
}
