// src/app/(app)/info/page.tsx
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowRight, BookOpen, ExternalLink, GanttChart, Library } from "lucide-react";
import Link from "next/link";

const infoSections = [
    {
        title: "Constitución StarSeed",
        description: "El texto completo de las leyes fundamentales, derechos, límites y principios que guían a la sociedad.",
        href: "/info/constitution",
        icon: <BookOpen className="w-8 h-8 text-primary"/>,
        external: false,
    },
    {
        title: "Fundamentos y Visión de StarSeed",
        description: "El propósito, las misiones y los pilares del sistema social, incluyendo los fundamentos para la paz y la felicidad.",
        href: "https://starseed-c4b17.web.app/",
        icon: <Library className="w-8 h-8 text-accent"/>,
        external: true,
    },
    {
        title: "Funcionamiento de la Red",
        description: "Un manual de usuario detallado que explica cómo funciona cada sección de la plataforma y sus herramientas.",
        href: "#",
        icon: <GanttChart className="w-8 h-8 text-secondary"/>,
        external: false,
    },
    {
        title: "Diccionario y Guías",
        description: "El diccionario para unificar el lenguaje y las guías para la salud física, emocional, social y espiritual.",
        href: "#",
        icon: <BookOpen className="w-8 h-8 text-muted-foreground"/>,
        external: false,
    }
]

export default function InfoPage() {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      {infoSections.map((section) => (
        <Link href={section.href} key={section.title} target={section.external ? "_blank" : "_self"}>
          <Card className="h-full hover:border-primary/50 transition-colors group">
              <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                      <CardTitle className="font-headline text-xl">{section.title}</CardTitle>
                      <CardDescription className="mt-2">{section.description}</CardDescription>
                  </div>
                  {section.icon}
              </CardHeader>
              <CardContent>
                  <div className="flex items-center text-sm font-semibold text-primary group-hover:underline">
                      {section.external ? "Abrir en nueva pestaña" : "Leer más"}
                      <ArrowRight className="ml-2 h-4 w-4" />
                  </div>
              </CardContent>
          </Card>
        </Link>
      ))}
    </div>
  );
}
