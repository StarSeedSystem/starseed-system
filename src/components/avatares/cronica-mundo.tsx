"use client";

/**
 * CRONICAMUNDO — CRÓNICA DEL MUNDO DE LOS AVATARES (Ola 234)
 * ─────────────────────────────────────────────────────────────────────────────
 * Relato en texto de lo que pasa en el mundo de los avatares: quién hace qué
 * ahora, los encuentros recientes con su tema y las últimas creaciones.
 *
 * Es la superficie que se ve cuando no hay WebGL o el usuario pide movimiento
 * reducido: por eso NO importa three.js ni @react-three/fiber. Solo texto,
 * ordenado por tick descendente y con vacíos honestos.
 */

import { ScrollText, Sparkles, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { EstadoMundo, HabitanteMundo } from "@/lib/avatares/mundo/simulacion";

export interface CronicaMundoProps {
    estado: EstadoMundo;
    onCentrar?: (id: string) => void;
}

/* Etiquetas en español para cada ocupación y humor del mundo. */
const ETIQUETAS_OCUPACION: Record<HabitanteMundo["ocupacion"], string> = {
    explorar: "Explorando",
    conversar: "Conversando",
    crear: "Creando",
    descansar: "Descansando",
};

const ETIQUETAS_HUMOR: Record<string, string> = {
    feliz: "Feliz",
    neutral: "Neutral",
    curioso: "Curioso",
};

function etiquetaHumor(humor: string): string {
    return ETIQUETAS_HUMOR[humor] ?? humor;
}

export function CronicaMundo({ estado, onCentrar }: CronicaMundoProps) {
    const nombrePorId = new Map<string, string>(
        estado.habitantes.map((h) => [h.id, h.nombre]),
    );

    const encuentrosRecientes = [...estado.encuentros]
        .sort((a, b) => b.tick - a.tick)
        .slice(0, 10);

    const creacionesRecientes = [...estado.creaciones]
        .sort((a, b) => b.tick - a.tick)
        .slice(0, 10);

    const renderNombre = (id: string) => {
        const nombre = nombrePorId.get(id) ?? "Alguien desconocido";
        if (!onCentrar) {
            return <span className="font-medium">{nombre}</span>;
        }
        return (
            <button
                type="button"
                onClick={() => onCentrar(id)}
                className="cursor-pointer font-medium underline-offset-4 hover:underline"
            >
                {nombre}
            </button>
        );
    };

    return (
        <div className="flex flex-col gap-4">
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Users className="h-4 w-4" />
                        Ahora mismo
                    </CardTitle>
                    <CardDescription>
                        Quién está haciendo qué en el mundo · tick {estado.tick}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {estado.habitantes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Todavía no hay habitantes en el mundo.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {estado.habitantes.map((h) => (
                                <li
                                    key={h.id}
                                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2"
                                >
                                    <span className="text-sm">{renderNombre(h.id)}</span>
                                    <Badge variant="secondary">
                                        {ETIQUETAS_OCUPACION[h.ocupacion]}
                                    </Badge>
                                    <Badge variant="outline">
                                        {etiquetaHumor(h.humor)}
                                    </Badge>
                                    <span className="ml-auto text-xs text-muted-foreground">
                                        energía {Math.round(h.energia * 100)}% · {h.obras} {h.obras === 1 ? "obra" : "obras"}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <ScrollText className="h-4 w-4" />
                        Encuentros recientes
                    </CardTitle>
                    <CardDescription>Quién se ha encontrado con quién y de qué hablaron</CardDescription>
                </CardHeader>
                <CardContent>
                    {encuentrosRecientes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Todavía no se han encontrado. Sigue explorando el mundo.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {encuentrosRecientes.map((e, i) => (
                                <li
                                    key={`${e.a}-${e.b}-${e.tick}-${i}`}
                                    className="flex flex-wrap items-center gap-1.5 rounded-md border border-border/60 px-3 py-2 text-sm"
                                >
                                    <span>{renderNombre(e.a)}</span>
                                    <span className="text-muted-foreground">y</span>
                                    <span>{renderNombre(e.b)}</span>
                                    <span className="text-muted-foreground">hablaron de</span>
                                    <Badge variant="secondary">{e.tema}</Badge>
                                    <span className={cn("ml-auto text-xs text-muted-foreground")}>
                                        tick {e.tick}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Sparkles className="h-4 w-4" />
                        Últimas creaciones
                    </CardTitle>
                    <CardDescription>Obras recién nacidas en el mundo</CardDescription>
                </CardHeader>
                <CardContent>
                    {creacionesRecientes.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            Todavía no se ha creado ninguna obra.
                        </p>
                    ) : (
                        <ul className="flex flex-col gap-2">
                            {creacionesRecientes.map((c) => (
                                <li
                                    key={c.id}
                                    className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm"
                                >
                                    <span className="font-medium">{c.titulo}</span>
                                    <span className="text-muted-foreground">por</span>
                                    {renderNombre(c.autor)}
                                    <Badge variant="outline">{c.tipo}</Badge>
                                    <span className="ml-auto text-xs text-muted-foreground">
                                        tick {c.tick}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
