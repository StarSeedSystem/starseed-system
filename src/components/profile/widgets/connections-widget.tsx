import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { Users, Globe, Vote } from "lucide-react";

const connections = [
  { name: "Comunidad de Permacultura", type: "Comunidad", avatar: "https://placehold.co/40x40.png", href: "/profile/comunidad-permacultura" },
  { name: "E.F. del Valle Central", type: "Entidad Federativa", avatar: "https://placehold.co/40x40.png", href: "/profile/ef-valle-central" },
  { name: "Partido Transhumanista", type: "Partido Político", avatar: "https://placehold.co/40x40.png", href: "/profile/partido-transhumanista" },
]

const commonConnections = [
    { name: "Brenda", avatar: "https://placehold.co/40x40.png", href:"/profile/brenda" },
    { name: "Alex Duran", avatar: "https://placehold.co/40x40.png", href:"/profile/alex" }
]

export function ConnectionsWidget() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Conexiones</CardTitle>
                <CardDescription>Páginas, comunidades y personas en mi red.</CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
                <div>
                    <h3 className="font-semibold text-sm mb-3">Participando en</h3>
                    <div className="space-y-3">
                        {connections.map(c => (
                            <Link href={c.href} key={c.name} className="flex items-center gap-3 hover:bg-muted/50 p-2 rounded-lg transition-colors -ml-2">
                                <Avatar className="h-9 w-9">
                                    <AvatarImage src={c.avatar} data-ai-hint="page avatar" />
                                    <AvatarFallback>{c.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <div>
                                    <p className="text-sm font-medium">{c.name}</p>
                                    <p className="text-xs text-muted-foreground">{c.type}</p>
                                </div>
                            </Link>
                        ))}
                    </div>
                </div>
                 <div>
                    <h3 className="font-semibold text-sm mb-3">Conexiones en Común</h3>
                    <div className="flex flex-wrap gap-2">
                        {commonConnections.map(c => (
                             <Link href={c.href} key={c.name}>
                                <Avatar className="h-10 w-10 border-2 border-transparent hover:border-primary">
                                    <AvatarImage src={c.avatar} data-ai-hint="user avatar" />
                                    <AvatarFallback>{c.name.charAt(0)}</AvatarFallback>
                                </Avatar>
                            </Link>
                        ))}
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}