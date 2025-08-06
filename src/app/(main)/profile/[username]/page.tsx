// src/app/(main)/profile/[username]/page.tsx
'use client';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { feedItems } from "@/lib/data";
import { Edit, Rss } from "lucide-react";
import Image from "next/image";
import { CommentSystem } from "@/components/comment-system";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProfileWelcomeWidget } from "@/components/profile/widgets/profile-welcome-widget";
import { FeaturedBadgesWidget } from "@/components/profile/widgets/featured-badges-widget";
import { RecentPostsWidget } from "@/components/profile/widgets/recent-posts-widget";
import { ConnectionsWidget } from "@/components/profile/widgets/connections-widget";

function ProfileHeader({ username, type }: { username: string, type: string }) {
  const isUser = username === 'starseeduser';
  const profileData = {
    name: isUser ? "StarSeedUser" : username.charAt(0).toUpperCase() + username.slice(1).replace(/-/g, ' '),
    handle: isUser ? "@starseeduser" : `@${username}`,
    bio: isUser 
      ? "Co-creando un futuro ciberdélico. Explorador de la conciencia, constructor de sistemas y creyente en el poder de la inteligencia colectiva."
      : `Página de ${username.replace(/-/g, ' ')}.`,
    avatar: "https://placehold.co/100x100.png",
    cover: "https://placehold.co/1200x400.png",
    type: type
  };

  return (
    <Card className="overflow-hidden">
      <div className="relative h-48 w-full">
        <Image
          src={profileData.cover}
          alt="Foto de portada"
          layout="fill"
          objectFit="cover"
          data-ai-hint="abstract background"
        />
        <div className="absolute bottom-4 left-6">
          <Avatar className="h-24 w-24 border-4 border-background">
            <AvatarImage src={profileData.avatar} data-ai-hint="user avatar"/>
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
            {isUser && <Button><Edit className="mr-2 h-4 w-4"/> Editar Perfil</Button>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}


export default function ProfilePage() {
  const params = useParams();
  const username = Array.isArray(params.username) ? params.username[0] : params.username;

  // This is a placeholder logic to determine the type of page.
  // In a real app, this would come from a database.
  let pageType = 'personal';
  if (username.startsWith('comunidad')) pageType = 'comunidad';
  if (username.startsWith('ef-')) pageType = 'ef';
  if (username.startsWith('partido')) pageType = 'partido';
  if (username.startsWith('grupo')) pageType = 'grupo';


  return (
    <div className="flex flex-col gap-6">
      <ProfileHeader username={username} type={pageType} />

      <div className="grid md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
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
                          <ProfileWelcomeWidget />
                      </div>
                      <FeaturedBadgesWidget />
                      <RecentPostsWidget />
                      <div className="lg:col-span-2">
                          <ConnectionsWidget />
                      </div>
                  </div>
                </TabsContent>

                <TabsContent value="posts" className="mt-6">
                   <div className="space-y-6">
                        {feedItems.map(item => (
                             <Card key={item.id}>
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
                                    <p className="text-muted-foreground">{item.content}</p>
                                </CardContent>
                             </Card>
                        ))}
                   </div>
                </TabsContent>
                 <TabsContent value="connections" className="mt-6">
                    <ConnectionsWidget />
                </TabsContent>
            </Tabs>
        </div>
        <div className="md:col-span-1">
          <CommentSystem />
        </div>
      </div>
    </div>
  );
}