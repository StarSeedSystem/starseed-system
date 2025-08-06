import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ChevronDown, Filter, Users, Globe, Vote, GraduationCap } from "lucide-react";
import Link from "next/link";
import { ScrollArea } from "../ui/scroll-area";

const pages = [
  { name: "Comunidad de Permacultura", type: "Comunidad", icon: <Users className="w-4 h-4 text-muted-foreground" />, avatar: "https://placehold.co/40x40.png", href: "/profile/permaculture" },
  { name: "E.F. del Valle Central", type: "Entidad Federativa", icon: <Globe className="w-4 h-4 text-muted-foreground" />, avatar: "https://placehold.co/40x40.png", href: "/profile/ef-valle-central" },
  { name: "Partido Transhumanista", type: "Partido Político", icon: <Vote className="w-4 h-4 text-muted-foreground" />, avatar: "https://placehold.co/40x40.png", href: "/profile/transhumanistas" },
  { name: "Grupo de Estudio de IA", type: "Grupo de Estudio", icon: <GraduationCap className="w-4 h-4 text-muted-foreground" />, avatar: "https://placehold.co/40x40.png", href: "/profile/ia-study-group" },
  { name: "Artistas por la Singularidad", type: "Comunidad", icon: <Users className="w-4 h-4 text-muted-foreground" />, avatar: "https://placehold.co/40x40.png", href: "/profile/artistas-singularidad" },
];

export function MyPagesWidget() {
    return (
        <Card className="h-full flex flex-col">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <CardTitle className="font-headline">Mis Páginas</CardTitle>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                                <Filter className="mr-2 h-4 w-4" />
                                Filtrar
                                <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem>Actividad Reciente</DropdownMenuItem>
                            <DropdownMenuItem>Alfabéticamente</DropdownMenuItem>
                            <DropdownMenuItem>Comunidades</DropdownMenuItem>
                            <DropdownMenuItem>Entidades Federativas</DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
                <CardDescription>Acceso rápido a tus grupos y colaboraciones.</CardDescription>
            </CardHeader>
            <CardContent className="flex-1">
                <ScrollArea className="h-full">
                    <div className="space-y-4 pr-4">
                        {pages.map(page => (
                            <Link href={page.href} key={page.name} className="flex items-center gap-3 hover:bg-muted/50 p-2 rounded-lg transition-colors">
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={page.avatar} data-ai-hint="page avatar" />
                                    <AvatarFallback>{page.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                    <p className="text-sm font-medium truncate">{page.name}</p>
                                    <div className="flex items-center gap-1.5">
                                        {page.icon}
                                        <p className="text-xs text-muted-foreground">{page.type}</p>
                                    </div>
                                </div>
                            </Link>
                        ))}
                    </div>
                </ScrollArea>
            </CardContent>
        </Card>
    );
}
