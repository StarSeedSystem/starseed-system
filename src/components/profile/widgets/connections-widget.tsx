import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { Users, Globe, Vote } from "lucide-react";

type ConnectionItem = { name: string; type?: string; avatar: string; href: string };
type ConnectionGroup = { participating: ConnectionItem[]; common: ConnectionItem[] };

// Sin datos de ejemplo: las conexiones reales se cargarán desde la red del
// usuario/página. Hasta entonces se muestran estados vacíos reales.
const connectionsData: Record<string, ConnectionGroup> = {
    personal: { participating: [], common: [] },
    comunidad: { participating: [], common: [] },
}

export function ConnectionsWidget({ pageType = 'personal' }: { pageType: string }) {
    const data = connectionsData[pageType as keyof typeof connectionsData] || connectionsData.personal;
    
    const participatingTitle = pageType === 'personal' ? 'Participando en' : 'Miembros';

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Conexiones</CardTitle>
                <CardDescription>
                    {pageType === 'personal' ? 'Páginas, comunidades y personas en mi red.' : 'Miembros y alianzas de esta página.'}
                </CardDescription>
            </CardHeader>
            <CardContent className="grid md:grid-cols-2 gap-6">
                <div>
                    <h3 className="font-semibold text-sm mb-3">{participatingTitle}</h3>
                    <div className="space-y-3">
                        {data.participating.length === 0 && (
                            <p className="text-sm text-muted-foreground">Aún no hay nada que mostrar.</p>
                        )}
                        {data.participating.map(c => (
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
                    <h3 className="font-semibold text-sm mb-3">
                        {pageType === 'personal' ? 'Conexiones en Común' : 'Alianzas'}
                    </h3>
                    {data.common.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                            {data.common.map(c => (
                                <Link href={c.href} key={c.name}>
                                    <Avatar className="h-10 w-10 border-2 border-transparent hover:border-primary">
                                        <AvatarImage src={c.avatar} data-ai-hint="user avatar" />
                                        <AvatarFallback>{c.name.charAt(0)}</AvatarFallback>
                                    </Avatar>
                                </Link>
                            ))}
                        </div>
                    ) : (
                         <p className="text-sm text-muted-foreground">No hay alianzas que mostrar.</p>
                    )}
                </div>
            </CardContent>
        </Card>
    )
}
