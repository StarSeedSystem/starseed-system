// src/app/(app)/hub/page.tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Briefcase, Calendar, Hand, Link2, PlusCircle, Search, Settings, UserCheck, Vote } from "lucide-react";
import Link from "next/link";

const participations = [
    { type: "Votación Política", title: "Propuesta de Ley de Agua Comunitaria", status: "Votación Activa", href: "#", icon: <Vote className="w-5 h-5 text-primary" /> },
    { type: "Participación Voluntaria", title: "Logística para el Festival de Arte", status: "3/5 tareas completadas", href: "#", icon: <Hand className="w-5 h-5 text-accent" /> },
    { type: "Evento Próximo", title: "Reunión de Planificación Q3 - E.F. del Valle", status: "Mañana a las 10:00", href: "#", icon: <Calendar className="w-5 h-5 text-secondary" /> },
    { type: "Proyecto Activo", title: "Desarrollo de App de Riego Inteligente", status: "75% completado", href: "#", icon: <Briefcase className="w-5 h-5 text-primary" /> },
];

const myPages = [
  { name: "Comunidad de Permacultura", type: "Comunidad", avatar: "https://placehold.co/40x40.png", members: 128, href: "/profile/comunidad-permacultura" },
  { name: "E.F. del Valle Central", type: "Entidad Federativa", avatar: "https://placehold.co/40x40.png", members: 2500, href: "/profile/ef-valle-central" },
  { name: "Partido Transhumanista", type: "Partido Político", avatar: "https://placehold.co/40x40.png", members: 450, href: "/profile/partido-transhumanista" },
  { name: "Grupo de Estudio de IA", type: "Grupo de Estudio", avatar: "https://placehold.co/40x40.png", members: 34, href: "/profile/grupo-de-estudio-ia" },
];

const copiedVotes = [
    { name: "Brenda", avatar: "https://placehold.co/40x40.png", handle: "@brenda", replication: "Automática", href: "/profile/brenda" },
    { name: "Partido Transhumanista", avatar: "https://placehold.co/40x40.png", handle: "@transhumanistas", replication: "Manual", href: "/profile/partido-transhumanista" }
]

const alliances = [
    { name: "Alianza por la Soberanía Tecnológica", members: ["E.F. del Valle Central", "Grupo de Estudio de IA"], href: "#" },
    { name: "Red de Permacultura del Sur", members: ["Comunidad de Permacultura", "Huerto Comunitario del Este"], href: "#" },
]


export default function HubPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Hub de Conexiones</h1>
        <p className="text-muted-foreground">
          Centraliza toda la actividad grupal, asociativa y tus compromisos en la red.
        </p>
      </div>

      <Tabs defaultValue="participations">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
            <TabsTrigger value="participations">Participaciones</TabsTrigger>
            <TabsTrigger value="my-pages">Mis Páginas</TabsTrigger>
            <TabsTrigger value="vote-management">Gestión de Votos</TabsTrigger>
            <TabsTrigger value="alliances">Alianzas</TabsTrigger>
        </TabsList>

        <TabsContent value="participations" className="mt-6">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Proyectos y Participaciones Activas</CardTitle>
                    <CardDescription>Una vista unificada de todas tus actividades y responsabilidades actuales.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {participations.map(p => (
                        <Link href={p.href} key={p.title} className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/50 transition-colors border">
                           <div className="p-2 bg-muted rounded-full">
                             {p.icon}
                           </div>
                           <div className="flex-1">
                             <p className="text-sm text-muted-foreground">{p.type}</p>
                             <p className="font-semibold">{p.title}</p>
                           </div>
                           <div className="text-right">
                             <Badge variant={p.type === "Votación Política" ? "default" : "secondary"} className="text-xs">{p.status}</Badge>
                             {p.type === "Proyecto Activo" && <Progress value={75} className="w-24 mt-1 h-2" />}
                           </div>
                        </Link>
                    ))}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="my-pages" className="mt-6">
            <Card>
                <CardHeader>
                     <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                        <div>
                            <CardTitle className="font-headline">Mis Páginas</CardTitle>
                            <CardDescription>Gestiona tu pertenencia a todas las entidades grupales.</CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline"><Search className="mr-2 h-4 w-4"/>Buscar Páginas</Button>
                            <Button><PlusCircle className="mr-2 h-4 w-4"/>Crear Página</Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {myPages.map(page => (
                        <Card key={page.name} className="h-full hover:bg-muted/50 transition-colors">
                            <Link href={page.href} className="flex flex-col h-full">
                                <CardContent className="p-4 flex items-center gap-4 flex-1">
                                    <Avatar className="h-12 w-12">
                                        <AvatarImage src={page.avatar} alt={page.name} data-ai-hint="page avatar"/>
                                        <AvatarFallback>{page.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                    <div className="flex-1">
                                        <p className="font-bold truncate">{page.name}</p>
                                        <p className="text-sm text-muted-foreground">{page.type}</p>
                                        <p className="text-xs text-muted-foreground">{page.members} miembros</p>
                                    </div>
                                </CardContent>
                            </Link>
                        </Card>
                    ))}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="vote-management" className="mt-6">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Gestión de Votos</CardTitle>
                    <CardDescription>Administra tus preferencias de seguimiento y replicación de votos.</CardDescription>
                </CardHeader>
                <CardContent className="grid md:grid-cols-2 gap-6">
                    <div>
                        <h3 className="font-semibold mb-3 flex items-center gap-2"><UserCheck className="w-5 h-5"/> Perfiles Copiados (Replicación)</h3>
                        <div className="space-y-3">
                            {copiedVotes.map(v => (
                                <Link href={v.href} key={v.name} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                                    <div className="flex items-center gap-3">
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage src={v.avatar} data-ai-hint="user avatar" />
                                            <AvatarFallback>{v.name.charAt(0)}</AvatarFallback>
                                        </Avatar>
                                        <div>
                                            <p className="font-semibold text-sm">{v.name}</p>
                                            <p className="text-xs text-muted-foreground">{v.handle}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-sm font-medium">{v.replication}</p>
                                        <Button variant="link" size="sm" className="h-auto p-0">Configurar</Button>
                                    </div>
                                </Link>
                            ))}
                        </div>
                    </div>
                    <div>
                        <h3 className="font-semibold mb-3 flex items-center gap-2"><Vote className="w-5 h-5"/> Propuestas Seguidas</h3>
                         <div className="space-y-3">
                            <div className="p-3 rounded-lg border">
                                <p className="font-semibold text-sm">E.F. del Valle Central</p>
                                <p className="text-xs text-muted-foreground">Recibiendo todas las notificaciones</p>
                            </div>
                             <div className="p-3 rounded-lg border">
                                <p className="font-semibold text-sm">Consejo Global de Ética de IA</p>
                                <p className="text-xs text-muted-foreground">Solo notificaciones urgentes</p>
                            </div>
                         </div>
                    </div>
                </CardContent>
            </Card>
        </TabsContent>

         <TabsContent value="alliances" className="mt-6">
            <Card>
                <CardHeader>
                    <CardTitle className="font-headline">Alianzas</CardTitle>
                    <CardDescription>Visualiza y gestiona las colaboraciones formales entre las páginas en las que participas.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    {alliances.map(a => (
                        <Link href={a.href} key={a.name} className="block p-4 rounded-lg hover:bg-muted/50 transition-colors border">
                           <div className="flex items-center gap-2">
                             <Link2 className="w-5 h-5 text-primary" />
                             <p className="font-semibold">{a.name}</p>
                           </div>
                           <p className="text-sm text-muted-foreground mt-2">
                            Miembros: {a.members.join(' • ')}
                           </p>
                        </Link>
                    ))}
                </CardContent>
            </Card>
        </TabsContent>

      </Tabs>
    </div>
  );
}
