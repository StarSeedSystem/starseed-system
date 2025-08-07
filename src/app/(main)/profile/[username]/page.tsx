// src/app/(main)/profile/[username]/page.tsx
'use client';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { feedItems, politicalProposals, comments as defaultComments } from "@/lib/data";
import { Edit, Rss, Scale, Users, BarChart, FileText, ThumbsUp, MessageCircle, Share2, Bookmark } from "lucide-react";
import Image from "next/image";
import { CommentSystem } from "@/components/comment-system";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProfileWelcomeWidget } from "@/components/profile/widgets/profile-welcome-widget";
import { FeaturedBadgesWidget } from "@/components/profile/widgets/featured-badges-widget";
import { RecentPostsWidget } from "@/components/profile/widgets/recent-posts-widget";
import { ConnectionsWidget } from "@/components/profile/widgets/connections-widget";
import { Badge } from "@/components/ui/badge";
import { BarChart as RechartsBarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { useState } from "react";


function VoteChart({ data }: { data: any[] }) {
    return (
        <div className="h-40 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <RechartsBarChart data={data} layout="vertical" margin={{ left: 20, right: 20 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" hide />
                    <Tooltip 
                        cursor={{ fill: 'hsla(var(--muted-hsl), 0.5)' }}
                        content={({ active, payload }) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="rounded-lg border bg-background p-2 shadow-sm">
                                <div className="grid grid-cols-2 gap-2">
                                  <div className="flex flex-col">
                                    <span className="text-[0.70rem] uppercase text-muted-foreground">
                                      {payload[0].payload.name}
                                    </span>
                                    <span className="font-bold text-muted-foreground">
                                      {payload[0].value} Votos
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )
                          }
                          return null
                        }}
                    />
                    <Bar dataKey="votes" shape={(props) => {
                       const { x, y, width, height, payload } = props;
                       return <rect x={x} y={y} width={width} height={height} rx={3} ry={3} fill={payload.color} />
                    }}/>
                </RechartsBarChart>
            </ResponsiveContainer>
        </div>
    )
}

function PoliticalProposalCard({ proposal }: { proposal: typeof politicalProposals[0] }) {
    const totalVotes = proposal.votes.reduce((acc, v) => acc + v.votes, 0);
    const chartData = proposal.votes.map(v => ({...v, percentage: (v.votes / totalVotes) * 100}));

    return (
        <Card>
            <CardHeader>
                <div className="flex justify-between items-start gap-4">
                    <div>
                        <CardTitle className="font-headline text-xl">{proposal.title}</CardTitle>
                        <CardDescription className="mt-1">Propuesta en: <span className="font-semibold text-primary">{proposal.ef}</span></CardDescription>
                    </div>
                     <Badge variant={proposal.urgency === "Urgente" ? "destructive" : "secondary"}>{proposal.urgency}</Badge>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground mb-6">{proposal.summary}</p>
                
                <Tabs defaultValue="votos">
                    <TabsList className="grid w-full grid-cols-4">
                        <TabsTrigger value="votos">Votos</TabsTrigger>
                        <TabsTrigger value="detalles">Detalles</TabsTrigger>
                        <TabsTrigger value="discusión" className="flex items-center gap-2">
                            Discusión <Badge variant="secondary" className="px-1.5">{proposal.comments.length}</Badge>
                        </TabsTrigger>
                        <TabsTrigger value="archivos">Archivos</TabsTrigger>
                    </TabsList>
                    <TabsContent value="votos" className="mt-4">
                        <h4 className="font-semibold mb-2">Resultados Actuales</h4>
                        <VoteChart data={chartData} />
                        <div className="mt-4 space-y-2">
                            {proposal.votes.map(option => (
                                <div key={option.name} className="flex justify-between items-center text-sm">
                                    <span className="font-medium">{option.name}</span>
                                    <span className="text-muted-foreground">{option.votes} votos ({(option.votes / totalVotes * 100).toFixed(1)}%)</span>
                                </div>
                            ))}
                        </div>
                    </TabsContent>
                    <TabsContent value="detalles" className="mt-4">
                        <p className="text-sm text-muted-foreground">{proposal.details}</p>
                    </TabsContent>
                    <TabsContent value="discusión" className="mt-4">
                        <CommentSystem comments={proposal.comments} />
                    </TabsContent>
                    <TabsContent value="archivos" className="mt-4">
                        <div className="flex flex-col gap-2">
                            {proposal.files.map(file => (
                                <Button variant="outline" asChild key={file.name} className="justify-start">
                                    <a href={file.url} target="_blank">
                                        <FileText className="mr-2 h-4 w-4" />
                                        {file.name}
                                    </a>
                                </Button>
                            ))}
                        </div>
                    </TabsContent>
                </Tabs>
            </CardContent>
            <CardFooter className="flex-col items-stretch gap-4">
                 <div className="flex justify-between items-center text-sm text-muted-foreground">
                    <span>Estado: <span className="text-primary font-semibold">{proposal.status}</span></span>
                    <span>Finaliza en: {proposal.deadline}</span>
                </div>
                 <div className="flex gap-2">
                    <Button size="lg" className="flex-1">Ver Propuesta y Votar</Button>
                    <Button size="lg" variant="outline">
                        <Bookmark />
                    </Button>
                </div>
            </CardFooter>
        </Card>
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
                            <ThumbsUp className="w-4 h-4" /> {item.likes}
                        </Button>
                        <Button variant="ghost" size="sm" className="flex items-center gap-2" onClick={() => setShowComments(!showComments)}>
                            <MessageCircle className="w-4 h-4" /> {item.comments.length}
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
                    <Card>
                        <CardHeader>
                            <CardTitle>Colecciones</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-muted-foreground">Las colecciones públicas de este perfil están en construcción.</p>
                        </CardContent>
                    </Card>
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
