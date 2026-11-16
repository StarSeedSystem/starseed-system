"use client";

import { useMemo } from "react";
import { Clock, Mic, Paperclip, Volume2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { EstadoConversacion, Hablante } from "@/lib/traductor/conversacion";

export interface PanelConversacionProps {
    estado: EstadoConversacion;
    reloj: () => number;
    audioSaleDelAparato: boolean;
}

/**
 * Panel de conversación de dos mitades. Cada mitad muestra el estado, los textos, y controles.
 * No contiene lógica de máquina; la máquina TU15 se debe alimenta externamente.
 */
export function PanelConversacion({ estado, reloj, audioSaleDelAparato }: PanelConversacionProps) {
    const nombreHablante = (h: Hablante) => (h === "A" ? "A" : "B");

    const msReconocer = useMemo(() => {
        const inicioMs = (estado as any).inicioMs ?? 0;
        if (estado.fase === "escuchando") return reloj() - inicioMs;
        if (estado.fase === "traduciendo") return estado.inicioTraduccionMs - inicioMs;
        if (estado.fase === "hablando") return estado.inicioTraduccionMs - inicioMs;
        return 0;
    }, [estado, reloj]);
    const msTraducir = useMemo(() => {
        if (estado.fase === "traduciendo") return reloj() - estado.inicioTraduccionMs;
        if (estado.fase === "hablando") return estado.inicioHablaMs - estado.inicioTraduccionMs;
        return 0;
    }, [estado, reloj]);
    const msHablar = useMemo(() => {
        if (estado.fase === "hablando") return reloj() - estado.inicioHablaMs;
        return 0;
    }, [estado, reloj]);

    const renderState = () => {
        switch (estado.fase) {
            case "inactivo":
                return (
                    <p className="mt-2 text-sm text-muted-foreground" data-testid="estado-inactivo">
                        No hay reconocimiento activo.
                    </p>
                );
            case "escuchando":
                return (
                    <p className="mt-2 text-sm text-muted-foreground" data-testid="estado-escuchando">
                        Escuchando… ({msReconocer} ms)
                    </p>
                );
            case "traduciendo":
                return (
                    <p className="mt-2 text-sm text-muted-foreground" data-testid="estado-traduciendo">
                        Traduciendo… ({msTraducir} ms)
                    </p>
                );
            case "hablando":
                return (
                    <p className="mt-2 text-sm text-muted-foreground" data-testid="estado-hablando">
                        Hablando… ({msHablar} ms)
                    </p>
                );
            case "esperandoTurno":
                return (
                    <p className="mt-2 text-sm text-muted-foreground" data-testid="estado-esperando">
                        Esperando turno de {nombreHablante(estado.quien)}.
                    </p>
                );
            default:
                return null;
        }
    };

    const renderTexto = () => {
        switch (estado.fase) {
            case "escuchando":
                return (
                    <div data-testid="texto-parcial">
                        <p className="text-sm font-mono">{estado.parcial}</p>
                    </div>
                );
            case "traduciendo":
                return (
                    <div data-testid="texto-original-y-trad">
                        <p className="text-sm font-mono">Original: {estado.textoOriginal}</p>
                    </div>
                );
            case "hablando":
                return (
                    <div data-testid="texto-hablado-y-trad">
                        <p className="text-sm font-mono">Texto: {estado.texto}</p>
                        <p className="text-sm font-mono">Traducción: {estado.traduccion}</p>
                    </div>
                );
            default:
                return null;
        }
    };

    return (
        <div className="flex flex-col gap-4" data-testid="panel-conversacion">
            {/* Fixed warning */}
            <AlertCircle className="h-5 w-5 text-orange-400" />
            <p className="text-sm text-orange-300" data-testid="warning-translator">
                La traducción en tiempo real no es simultánea.
            </p>

            <div className="flex gap-4" data-testid="panel-parts">
                {/* Mirrored side */}
                <Card className="flex-1" data-testid="panel-side-a">
                    <CardHeader>
                        <CardTitle className="text-sm">{nombreHablante("A")}</CardTitle>
                        <CardDescription className="mt-1">{nombreHablante("A")}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-2">
                        {renderState()}
                        {renderTexto()}
                        <div className="flex items-center gap-2 mt-2">
                            <Button size="sm" variant="outline" aria-label="Listen" disabled={estado.fase === "inactivo"}>
                                <Mic className="h-4 w-4" aria-hidden />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
                {/* Other side */}
                <Card className="flex-1" data-testid="panel-side-b">
                    <CardHeader>
                        <CardTitle className="text-sm">{nombreHablante("B")}</CardTitle>
                        <CardDescription className="mt-1">{nombreHablante("B")}</CardDescription>
                    </CardHeader>
                    <CardContent className="p-2">
                        {renderState()}
                        {renderTexto()}
                        <div className="flex items-center gap-2 mt-2">
                            <Button size="sm" variant="outline" aria-label="Listen" disabled={estado.fase === "inactivo"}>
                                <Mic className="h-4 w-4" aria-hidden />
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="text-sm text-muted-foreground" data-testid="audio-status">
                Audio sale del aparato: {audioSaleDelAparato ? "Sí" : "No"}
            </div>
        </div>
    );
}
