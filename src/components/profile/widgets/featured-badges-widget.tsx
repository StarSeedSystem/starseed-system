import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, BrainCircuit, HeartHandshake, Leaf, Users } from "lucide-react";

const badgesData = {
    personal: [
        { name: "Mediador Certificado", icon: <HeartHandshake className="w-5 h-5" /> },
        { name: "Experto en IA Generativa", icon: <BrainCircuit className="w-5 h-5" /> },
        { name: "Votante Consistente", icon: <Award className="w-5 h-5" /> }
    ],
    comunidad: [
        { name: "Comunidad Activa", icon: <Users className="w-5 h-5" /> },
        { name: "Proyecto Sostenible", icon: <Leaf className="w-5 h-5" /> },
    ]
    // Add other page types if needed
}

export function FeaturedBadgesWidget({ pageType = 'personal' }: { pageType: string }) {
    const badges = badgesData[pageType as keyof typeof badgesData] || [];

    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Insignias Destacadas</CardTitle>
                <CardDescription>
                    {pageType === 'personal' ? 'Logros y roles reconocidos en la red.' : 'Reconocimientos de esta página.'}
                </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
                {badges.length > 0 ? badges.map(badge => (
                    <Badge key={badge.name} variant="secondary" className="flex items-center gap-2 p-2 text-sm">
                        {badge.icon}
                        <span>{badge.name}</span>
                    </Badge>
                )) : <p className="text-sm text-muted-foreground">No hay insignias que mostrar.</p>}
            </CardContent>
        </Card>
    );
}
