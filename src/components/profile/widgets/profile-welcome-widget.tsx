import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Star } from "lucide-react";

const welcomeData = {
    personal: {
        title: "Bienvenid@ a mi Espacio",
        description: "Co-creando un futuro ciberdélico. Explorador de la conciencia, constructor de sistemas y creyente en el poder de la inteligencia colectiva.",
        showNatalChart: true,
    },
    comunidad: {
        title: "Bienvenid@ a nuestra Comunidad",
        description: "Un espacio para aprender, compartir y practicar los principios de la permacultura. ¡Únete a nosotros para construir un futuro más sostenible!",
        showNatalChart: false,
    },
    ef: {
        title: "Entidad Federativa del Valle Central",
        description: "La Entidad Federativa del Valle Central, gobernada por sus ciudadanos para el bienestar colectivo y el desarrollo sostenible.",
        showNatalChart: false,
    },
    partido: {
        title: "Partido Transhumanista",
        description: "Abogando por el uso ético de la tecnología para mejorar las capacidades humanas y expandir la conciencia.",
        showNatalChart: false,
    },
    grupo: {
        title: "Grupo de Estudio de IA",
        description: "Un grupo dedicado a explorar las fronteras de la Inteligencia Artificial, desde la teoría hasta la aplicación práctica.",
        showNatalChart: false,
    }
}

export function ProfileWelcomeWidget({ pageType = 'personal' }: { pageType: string }) {
    const data = welcomeData[pageType as keyof typeof welcomeData] || welcomeData.personal;
    
    return (
        <Card>
            <CardHeader>
                <CardTitle className="font-headline">{data.title}</CardTitle>
                <CardDescription>
                   {data.description}
                </CardDescription>
            </CardHeader>
            <CardContent>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    {data.showNatalChart && (
                        <>
                            <div className="flex items-center gap-1">
                                <Star className="w-4 h-4 text-primary" />
                                <span>Carta Natal: Sol en Acuario</span>
                            </div>
                            <span>•</span>
                        </>
                    )}
                    <a href="#" className="hover:text-primary">sitio-web-oficial.com</a>
                </div>
            </CardContent>
        </Card>
    )
}
