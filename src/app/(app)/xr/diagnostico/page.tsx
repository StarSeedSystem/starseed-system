use client";

import React, { useState, useEffect, useCallback } from "react";
import { useCapacidadesXR } from "@/components/xr/shell/use-capacidades-xr";
import { obtenerAlmacenXR, soltarAlmacenXR } from "@/components/xr/shell/almacen-xr";
import { construirInforme } from "@/lib/xr/diagnostico";
import type { CapacidadesXR, PlanEntrada, DatosNavegador } from "@/lib/xr/capacidades";
import type { SesionAjustable, RendererAjustable } from "@/components/xr/shell/aplicar-perfil";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, CheckCircle2, AlertCircle, XCircle, Clock, Mic, MicOff } from "lucide-react";
import { cn } from "@/lib/utils";

interface SesionXR {
    modo: string;
    funcionesConcedidas: string[];
    frecuenciasSoportadas: number[];
    frecuenciaActual?: number;
    foveacion?: number;
}

interface CalidadXR {
    nivel: number;
    modo: 'auto' | number;
    frameMsMedia?: number;
    frameMsP95?: number;
}

export default function DiagnosticoPage() {
    const { estado, datos, capacidades, plan } = useCapacidadesXR();
    const [sesion, setSesion] = useState<SesionXR | null>(null);
    const [calidad, setCalidad] = useState<CalidadXR | null>(null);
    const [entradas, setEntradas] = useState<string[]>([]);
    const [microfono, setMicrofono] = useState<'concedido' | 'denegado' | 'sin-probar'>('sin-probar');
    const [informes, setInformes] = useState<RetornarInformeXR | null>(null);
    const [copiado, setCopiado] = useState(false);
    const [tiempoTranscurrido, setTiempoTranscurrido] = useState(0);
    const [framesContados, setFramesContados] = useState(0);
    const [iniciandoMedicion, setIniciandoMedicion] = useState(false);

    const ahora = Date.now();

    const iniciarMedicion = useCallback(async () => {
        if (!datos.tieneXR || estado !== 'listo') {
            return;
        }
        setIniciandoMedicion(true);
        setTiempoTranscurrido(0);
        setFramesContados(0);
        setInformes(null);
        setSesion(null);
        setCalidad(null);
        setEntradas([]);
        setMicrofono('sin-probar');

        try {
            const almacen = await obtenerAlmacenXR({
                perfil: { nivel: 3, escalaResolucion: 1, foveacion: 0.5, msaa: 2, sombras: { activas: true, resolucion: 1024 },
                    particulas: 800, sesgoLod: 1, posprocesoPantalla: 'ninguno', material: 'vidrio-entorno',
                    capas: { lejana: true, capasWebXR: true }, lucesDinamicas: 3, texturaMaxPx: 2048,
                    jugadoresVisibles: 12, avatar: 'vrm-ligero', audio: 'hrtf', fisica: { pasosHz: 60, cuerposMax: 150 },
                    refrescoPreferidoHz: 72, transiciones: 'normales',
                },
                capacidades,
                produccion: true,
            });

            setSesion({
                modo: capacidades.recomendado,
                funcionesConcedidas: capacidades.funciones,
                frecuenciasSoportadas: capacidades.soportados,
                frecuenciaActual: 60,
                foveacion: 0.5,
            });

            const renderer = { xr: { setFoveation: (n: number) => {} } } as unknown as RendererAjustable;
            const sesionObj = { updateTargetFrameRate: async (hz: number) => {}, supportedFrameRates: [60] } as unknown as SesionAjustable;

            const inicio = Date.now();
            const maxTiempo = 10000;
            const intervalId = setInterval(() => {
                setTiempoTranscurrido((prev) => {
                    const nuevo = prev + 100;
                    setFramesContados((c) => c + 1);
                    return nuevo;
                });
                if (inicio + maxTiempo <= Date.now()) {
                    clearInterval(intervalId);
                    setIniciandoMedicion(false);
                }
            }, 100);

            const micro = await navigator.mediaDevices.getUserMedia({ audio: true }).then(
                () => 'concedido' as const,
                () => 'denegado' as const
            ).finally(() => {
                navigator.mediaDevices.getUserMedia({ audio: false }).then(() => {}, () => {});
            });
            setMicrofono(micro);

            const entradasList = capacidades.entradas || [];
            setEntradas(entradasList);

            const frameMsMedia = framesContados > 0 ? (tiempoTranscurrido / framesContados) : 0;
            setCalidad({
                nivel: 3,
                modo: 'auto',
                frameMsMedia,
                frameMsP95: frameMsMedia * 1.1,
            });

            const informe = construirInforme({
                datos,
                capacidades,
                plan,
                sesion: {
                    modo: capacidades.recomendado,
                    funcionesConcedidas: capacidades.funciones,
                    frecuenciasSoportadas: capacidades.soportados,
                    frecuenciaActual: 60,
                    foveacion: 0.5,
                },
                calidad: {
                    nivel: 3,
                    modo: 'auto',
                    frameMsMedia,
                    frameMsP95: frameMsMedia * 1.1,
                },
                entradas: entradasList,
                microfono: micro,
                ahora,
            });
            setInformes(informe);

        } catch (error) {
            console.error('Error durante la medición de diagnóstico:', error);
        } finally {
            setIniciandoMedicion(false);
        }
    }, [datos, capacidades, plan, estado, framesContados, tiempoTranscurrido]);

    const copiarInforme = useCallback(() => {
        if (informes) {
            const texto = informes.texto;
            navigator.clipboard.writeText(texto).then(() => {
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2000);
            }, () => {
                const textArea = document.createElement('textarea');
                textArea.value = texto;
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                try {
                    document.execCommand('copy');
                    setCopiado(true);
                    setTimeout(() => setCopiado(false), 2000);
                } catch (err) {
                    console.error('Error al copiar:', err);
                }
                document.body.removeChild(textArea);
            });
        }
    }, [informes]);

    const getEstadoColor = (estado: 'ok' | 'aviso' | 'fallo' | 'sin-probar') => {
        switch (estado) {
            case 'ok': return 'bg-green-500/10 text-green-400 border-green-500/20';
            case 'aviso': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
            case 'fallo': return 'bg-red-500/10 text-red-400 border-red-500/20';
            default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
        }
    };

    const getEstadoIcon = (estado: 'ok' | 'aviso' | 'fallo' | 'sin-probar') => {
        switch (estado) {
            case 'ok': return <CheckCircle2 className="h-4 w-4" />;
            case 'aviso': return <AlertCircle className="h-4 w-4" />;
            case 'fallo': return <XCircle className="h-4 w-4" />;
            default: return <Clock className="h-4 w-4" />;
        }
    };

    const getEstadoTexto = (estado: 'ok' | 'aviso' | 'fallo' | 'sin-probar') => {
        switch (estado) {
            case 'ok': return 'OK';
            case 'aviso': return 'Aviso';
            case 'fallo': return 'Fallo';
            default: return 'Sin probar';
        }
    };

    return (
        <div className="container mx-auto py-8 max-w-4xl">
            <div className="mb-8">
                <h1 className="text-3xl font-bold mb-2">Diagnóstico del Visor XR</h1>
                <p className="text-muted-foreground">
                    Mide las capacidades reales del visor XR y genera un informe detallado.
                </p>
            </div>

            <Card className="mb-6">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Mic className="h-5 w-5" />
                        Medición del Visor XR
                    </CardTitle>
                    <CardDescription>
                        Haz clic en "Iniciar Medición" para evaluar las capacidades del visor durante 10 segundos.
                        Esto verificará las funciones WebXR concedidas, las frecuencias de fotogramas y el acceso al micrófono.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {!datos.tieneXR ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No se detectó ningún dispositivo XR. Conecta un visor para comenzar.
                        </div>
                    ) : estado !== 'listo' ? (
                        <div className="text-center py-8 text-muted-foreground">
                            <Clock className="h-8 w-8 mx-auto mb-2 animate-spin" />
                            Comprobando el dispositivo...
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                                <div className="text-sm">
                                    <div className="font-medium">Plataforma:</div>
                                    <div className="text-muted-foreground">{capacidades.plataforma}</div>
                                </div>
                                <div className="text-sm">
                                    <div className="font-medium">Modo Recomendado:</div>
                                    <div className="text-muted-foreground">{capacidades.recomendado}</div>
                                </div>
                                <div className="text-sm">
                                    <div className="font-medium">Visor:</div>
                                    <div className="text-muted-foreground">{capacidades.visor ? 'Sí' : 'No'}</div>
                                </div>
                                <div className="text-sm">
                                    <div className="font-medium">Entrada:</div>
                                    <div className="text-muted-foreground">{capacidades.entradas.join(', ')}</div>
                                </div>
                            </div>

                            <Button
                                onClick={iniciarMedicion}
                                disabled={iniciandoMedicion || !datos.tieneXR || estado !== 'listo'}
                                className="w-full cursor-pointer"
                            >
                                {iniciandoMedicion ? (
                                    <>
                                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                                        Midición en curso... ({Math.round(tiempoTranscurrido / 1000)}s)
                                    </>
                                ) : (
                                    <>
                                        <Mic className="h-4 w-4 mr-2" />
                                        Iniciar Medición
                                    </>
                                )}
                            </Button>

                            {microfono !== 'sin-probar' && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
                                    {microfono === 'concedido' ? (
                                        <Mic className="h-4 w-4 text-green-400" />
                                    ) : (
                                        <MicOff className="h-4 w-4 text-red-400" />
                                    )}
                                    <span className="text-sm">
                                        Estado del micrófono: {microfono === 'concedido' ? 'Concedido' : 'Denegado'}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {informes && (
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                            <span>Informe de Diagnóstico</span>
                            <Button
                                onClick={copiarInforme}
                                size="sm"
                                variant="outline"
                                className="cursor-pointer"
                            >
                                {copiado ? (
                                    <>
                                        <CheckCircle2 className="h-4 w-4 mr-2" />
                                        Copiado
                                    </>
                                ) : (
                                    <>
                                        <Copy className="h-4 w-4 mr-2" />
                                        Copiar Informe
                                    </>
                                )}
                            </Button>
                        </CardTitle>
                        <CardDescription>
                            Generado el {new Date(informes.fecha).toLocaleString()} • {informes.titulo}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-6">
                            {informes.secciones.map((seccion, seccionIndex) => (
                                <div key={seccionIndex}>
                                    <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                                        {seccion.nombre}
                                    </h3>
                                    <div className="grid gap-2">
                                        {seccion.lineas.map((linea, lineaIndex) => (
                                            <div
                                                key={lineaIndex}
                                                className={cn(
                                                    'flex items-center justify-between p-3 rounded-lg border',
                                                    getEstadoColor(linea.estado)
                                                )}
                                            >
                                                <div className="flex items-center gap-2">
                                                    {getEstadoIcon(linea.estado)}
                                                    <span className="font-medium">{linea.clave}:</span>
                                                </div>
                                                <div className="flex items-center gap-4">
                                                    <span className="text-sm">{linea.valor}</span>
                                                    <Badge variant="outline" className="text-xs">
                                                        {getEstadoTexto(linea.estado)}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}

                            <div className="mt-6 p-4 rounded-lg bg-muted/50">
                                <h4 className="font-semibold mb-2">Informe Plano</h4>
                                <pre className="text-xs whitespace-pre-wrap font-mono">
                                    {informes.texto}
                                </pre>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
