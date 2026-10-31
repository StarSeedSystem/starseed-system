// src/app/(app)/network/education/ruta-ossu-card.tsx
// -----------------------------------------------------------------------------
// Educación · Tarjeta «Ruta de Ciencias de la Computación (OSSU)»
// (Ola 1025R · INF1025E). Plegable y cerrada por defecto: la página no se
// alarga. Sale de `src/lib/education/ossu.ts` (datos de config/educacion-ossu.json):
// se ENLAZA a cada curso en su anfitrión, nunca se copia su material.
// -----------------------------------------------------------------------------

'use client';

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Route, ChevronDown, ExternalLink, ListChecks, Info } from "lucide-react";
import { createGuide } from "@/lib/education/study";
import {
    AVISO_LICENCIA_OSSU,
    bloquesOssu,
    contadorCursosOssu,
    cursosDeSeccion,
    itinerarioOssu,
    seccionesOssu,
    versionOssu,
} from "@/lib/education/ossu";

export function RutaOssuCard() {
    const [abierto, setAbierto] = useState(false);
    const [creando, setCreando] = useState(false);
    const version = versionOssu();
    const bloques = bloquesOssu();
    const secciones = seccionesOssu();

    async function crearItinerario() {
        setCreando(true);
        try {
            const creada = await createGuide(itinerarioOssu());
            if (creada) {
                toast.success("Itinerario creado: está en tus guías de estudio");
            } else {
                toast.info("Inicia sesión para crear tu itinerario");
            }
        } finally {
            setCreando(false);
        }
    }

    return (
        <Collapsible open={abierto} onOpenChange={setAbierto}>
            <Card className="liquid-glass-panel border-teal-500/20 bg-gradient-to-br from-teal-500/[0.05] to-transparent">
                <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                            <CardTitle className="font-headline text-xl flex items-center gap-2">
                                <Route className="h-6 w-6 text-teal-300" />
                                Ruta de Ciencias de la Computación (OSSU)
                            </CardTitle>
                            <CardDescription className="mt-1 max-w-2xl">
                                Los {contadorCursosOssu()} cursos del currículo abierto de OSSU, agrupados por bloques:
                                enlazan al anfitrión de cada curso, con su duración y esfuerzo semanal.
                            </CardDescription>
                            <p className="mt-1 text-xs text-muted-foreground">
                                Lista del repositorio, revisión de main {version.commit} · {version.fecha}
                            </p>
                        </div>
                        <Button
                            className="gap-1.5 cursor-pointer bg-teal-500/20 text-teal-200 border border-teal-400/40 backdrop-blur hover:bg-teal-500/30"
                            onClick={crearItinerario}
                            disabled={creando}
                        >
                            <ListChecks className="h-4 w-4" />
                            Crear mi itinerario
                        </Button>
                    </div>
                </CardHeader>
                <CardContent className="space-y-3">
                    <p className="flex gap-2 rounded-lg border border-amber-400/25 bg-amber-500/[0.06] p-3 text-xs text-amber-100/90">
                        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {AVISO_LICENCIA_OSSU}
                    </p>
                    <CollapsibleTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1.5 cursor-pointer">
                            <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} />
                            {abierto ? "Ocultar la ruta" : "Ver las 15 secciones"}
                        </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="space-y-4">
                        {bloques.map((bloque) => (
                            <div key={bloque}>
                                <h3 className="font-headline text-sm font-semibold text-teal-200">{bloque}</h3>
                                <div className="mt-2 space-y-3">
                                    {secciones.filter((s) => s.bloque === bloque).map((s) => (
                                        <div key={s.seccion}>
                                            <p className="text-xs font-medium text-muted-foreground">{s.seccion}</p>
                                            <ul className="mt-1 space-y-1.5">
                                                {cursosDeSeccion(s.seccion).map((c) => (
                                                    <li key={c.orden}>
                                                        <a
                                                            href={c.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="group flex cursor-pointer flex-wrap items-baseline gap-x-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-white/[0.05] focus-visible:ring-2 focus-visible:ring-teal-400"
                                                        >
                                                            <span>
                                                                {c.nombre}
                                                                {c.opcional ? " (elegir una)" : ""}
                                                            </span>
                                                            <Badge variant="secondary" className="shrink-0 text-[10px]">
                                                                {c.anfitrion} · {c.duracion} · {c.esfuerzo}
                                                            </Badge>
                                                            <ExternalLink className="h-3 w-3 shrink-0 opacity-40 transition-opacity group-hover:opacity-100" />
                                                        </a>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </CollapsibleContent>
                    <Link
                        href="/conocimiento"
                        className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-teal-300 underline-offset-4 transition-colors hover:text-teal-200 hover:underline"
                    >
                        Ver en la Red de Conocimiento <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                </CardContent>
            </Card>
        </Collapsible>
    );
}
