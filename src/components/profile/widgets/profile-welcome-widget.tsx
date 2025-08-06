import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";

export function ProfileWelcomeWidget() {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">Bienvenid@ a mi Espacio</CardTitle>
                <CardDescription>
                    Co-creando un futuro ciberdélico. Explorador de la conciencia, constructor de sistemas y creyente en el poder de la inteligencia colectiva.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <div className="flex items-center gap-1">
                        <Star className="w-4 h-4 text-primary" />
                        <span>Carta Natal: Sol en Acuario</span>
                    </div>
                    <span>•</span>
                    <a href="#" className="hover:text-primary">sitio-web-personal.com</a>
                </div>
            </CardContent>
        </Card>
    )
}