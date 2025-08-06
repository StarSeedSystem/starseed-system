import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Award, BrainCircuit, HeartHandshake } from "lucide-react";

const badges = [
    { name: "Mediador Certificado", icon: <HeartHandshake className="w-5 h-5" /> },
    { name: "Experto en IA Generativa", icon: <BrainCircuit className="w-5 h-5" /> },
    { name: "Votante Consistente", icon: <Award className="w-5 h-5" /> }
]

export function FeaturedBadgesWidget() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Insignias Destacadas</CardTitle>
                <CardDescription>Logros y roles reconocidos en la red.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
                {badges.map(badge => (
                    <Badge key={badge.name} variant="secondary" className="flex items-center gap-2 p-2 text-sm">
                        {badge.icon}
                        <span>{badge.name}</span>
                    </Badge>
                ))}
            </CardContent>
        </Card>
    );
}