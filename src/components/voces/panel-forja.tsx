"use client";

/**
 * PANEL «FORJA DE VOZ 1.58» (Ola 246 · forja de voz 1.58 · Tarea F2)
 * ─────────────────────────────────────────────────────────────────────────────
 * Pestaña del Estudio de Voces que enseña el plan de la Forja de Voz 1.58:
 * del manifiesto (`src/lib/voces/forja/manifiesto.ts`) salen las 4 fases con
 * sus hitos, los módulos del programa único y los modelos fuente con su
 * licencia; y con `/api/voz/forja` se radiografía lo que hay DE VERDAD en
 * esta neurona (motor OmniVoice, modelos GGUF, BitNet, backend 1.58 y demonio).
 *
 * Sin librerías de gráficos: el progreso global es una barra ligera hecha con
 * un div y su anchura en porcentaje.
 */

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import {
    FASES_FORJA,
    MODELOS_FUENTE,
    MODULOS_PROGRAMA,
    modelosUsablesEnProducto,
    progresoFase,
    progresoForja,
    type ModeloFuente,
} from "@/lib/voces/forja/manifiesto";

/** Radiografía que devuelve `/api/voz/forja` (solo presencia, nunca secretos). */
interface InformeNeurona {
    motor: { presente: boolean };
    modelos: Array<{ nombre: string; bytes: number }>;
    bitnet: { presente: boolean };
    backend158: { vivo: boolean; latenciaMs: number };
    demonio: { vivo: boolean; listo: boolean; modelo: string | null };
}

/** Color del Badge según el estado de un hito de la forja. */
function BadgeHito({ estado }: { estado: "hecho" | "en-curso" | "pendiente" | "bloqueado-por-hardware" }) {
    if (estado === "hecho") {
        return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">hecho</Badge>;
    }
    if (estado === "en-curso") {
        return <Badge className="bg-amber-500 text-black hover:bg-amber-500">en curso</Badge>;
    }
    if (estado === "bloqueado-por-hardware") {
        return (
            <Badge variant="destructive" title="necesita GPU en la nube">
                bloqueado
            </Badge>
        );
    }
    return <Badge variant="secondary">pendiente</Badge>;
}

/** Badge de estado de un módulo del programa. */
function BadgeModulo({ estado }: { estado: "en-uso" | "en-desarrollo" | "planeado" }) {
    if (estado === "en-uso") {
        return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">en uso</Badge>;
    }
    if (estado === "en-desarrollo") {
        return <Badge className="bg-amber-500 text-black hover:bg-amber-500">en desarrollo</Badge>;
    }
    return <Badge variant="secondary">planeado</Badge>;
}

/** Badge de estado de un modelo fuente. */
function BadgeModelo({ estado }: { estado: ModeloFuente["estado"] }) {
    if (estado === "en-uso") {
        return <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">en uso</Badge>;
    }
    if (estado === "candidato-principal") {
        return <Badge className="bg-sky-600 text-white hover:bg-sky-600">candidato principal</Badge>;
    }
    if (estado === "candidato") {
        return <Badge variant="outline">candidato</Badge>;
    }
    return <Badge variant="secondary">descartado para producto</Badge>;
}

/** Sí/No legible para la radiografía de la neurona. */
function BadgeSiNo({ si }: { si: boolean }) {
    return si ? (
        <Badge className="bg-emerald-600 text-white hover:bg-emerald-600">sí</Badge>
    ) : (
        <Badge variant="secondary">no</Badge>
    );
}

export function PanelForja() {
    const [neurona, setNeurona] = useState<InformeNeurona | null>(null);
    const [mirando, setMirando] = useState(false);
    const [errorNeurona, setErrorNeurona] = useState(false);

    const progreso = progresoForja();
    const usables = new Set(modelosUsablesEnProducto().map((m) => m.id));

    /** Pregunta a `/api/voz/forja` qué hay de verdad en esta neurona. */
    const mirarNeurona = useCallback(async () => {
        setMirando(true);
        setErrorNeurona(false);
        try {
            const resp = await fetch("/api/voz/forja", { cache: "no-store" });
            if (!resp.ok) throw new Error("respuesta no ok");
            const datos = (await resp.json()) as InformeNeurona;
            setNeurona(datos);
        } catch {
            setNeurona(null);
            setErrorNeurona(true);
        } finally {
            setMirando(false);
        }
    }, []);

    useEffect(() => {
        void mirarNeurona();
        // Solo al montar: una medición inicial de la neurona.
    }, [mirarNeurona]);

    return (
        <div className="space-y-6">
            {/* ── 1. Cabecera + progreso global ─────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">
                        Forja de Voz 1.58 — desarrollamos nuestro propio programa de voz
                    </CardTitle>
                    <CardDescription>
                        Fusionamos con criterio el código de varios modelos abiertos en un
                        programa único con variaciones por personalidad; después los ajustes de
                        cada voz y, sobre el modelo base 1.58 de Astraura, el editor de voces.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progreso global de la forja</span>
                        <span className="font-medium tabular-nums">{progreso}%</span>
                    </div>
                    {/* Barra ligera: un div con la anchura en %, sin librerías de gráficos. */}
                    <div
                        role="progressbar"
                        aria-valuenow={progreso}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-label="Progreso global de la forja"
                        className="h-2 w-full overflow-hidden rounded-full bg-muted"
                    >
                        <div
                            className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                            style={{ width: `${progreso}%` }}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* ── 2. Las cuatro fases ───────────────────────────────────────── */}
            <div className="grid gap-4 md:grid-cols-2">
                {FASES_FORJA.map((fase) => {
                    const porcentaje = progresoFase(fase);
                    return (
                        <Card key={fase.id}>
                            <CardHeader>
                                <CardTitle className="flex items-center justify-between gap-2 text-sm">
                                    <span>
                                        Fase {fase.id} · {fase.nombre}
                                    </span>
                                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                                        {porcentaje}%
                                    </span>
                                </CardTitle>
                                <CardDescription>{fase.descripcion}</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <ul className="space-y-2">
                                    {fase.hitos.map((hito) => (
                                        <li
                                            key={hito.id}
                                            className="flex items-start justify-between gap-3 text-sm"
                                        >
                                            <span className="min-w-0">{hito.titulo}</span>
                                            <span className="shrink-0">
                                                <BadgeHito estado={hito.estado} />
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </CardContent>
                        </Card>
                    );
                })}
            </div>

            {/* ── 3. Módulos del programa único ─────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Módulos del programa único</CardTitle>
                    <CardDescription>
                        De qué modelo abierto tomamos cada pieza del programa de voz propio.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Módulo</TableHead>
                                <TableHead>Origen</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Descripción</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {MODULOS_PROGRAMA.map((modulo) => (
                                <TableRow key={modulo.id}>
                                    <TableCell className="font-medium">{modulo.nombre}</TableCell>
                                    <TableCell>
                                        <span className="flex flex-wrap gap-1">
                                            {modulo.origen.map((id) => (
                                                <Badge key={id} variant="outline">
                                                    {id}
                                                </Badge>
                                            ))}
                                        </span>
                                    </TableCell>
                                    <TableCell>
                                        <BadgeModulo estado={modulo.estado} />
                                    </TableCell>
                                    <TableCell className="text-sm text-muted-foreground">
                                        {modulo.descripcion}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* ── 4. Modelos fuente y sus licencias ─────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Modelos fuente</CardTitle>
                    <CardDescription>
                        Los pesos con licencia no comercial (NC) nunca entran en el producto:
                        solo tomamos sus patrones de código.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Modelo</TableHead>
                                <TableHead>Licencia</TableHead>
                                <TableHead>Estado</TableHead>
                                <TableHead>Qué tomamos</TableHead>
                                <TableHead>Repo</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {MODELOS_FUENTE.map((modelo) => {
                                const licenciaNC =
                                    modelo.licencia.includes("NC") ||
                                    (modelo.licenciaPesos?.includes("NC") ?? false);
                                const usable = usables.has(modelo.id);
                                return (
                                    <TableRow
                                        key={modelo.id}
                                        className={usable ? undefined : "opacity-50"}
                                    >
                                        <TableCell className="font-medium">{modelo.nombre}</TableCell>
                                        <TableCell>
                                            <span className="flex flex-wrap gap-1">
                                                <Badge variant={licenciaNC ? "destructive" : "outline"}>
                                                    {modelo.licencia}
                                                </Badge>
                                                {modelo.licenciaPesos && (
                                                    <Badge
                                                        variant={
                                                            modelo.licenciaPesos.includes("NC")
                                                                ? "destructive"
                                                                : "outline"
                                                        }
                                                        title="Licencia de los pesos"
                                                    >
                                                        pesos: {modelo.licenciaPesos}
                                                    </Badge>
                                                )}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <BadgeModelo estado={modelo.estado} />
                                        </TableCell>
                                        <TableCell className="text-sm text-muted-foreground">
                                            {modelo.queTomamos}
                                        </TableCell>
                                        <TableCell>
                                            <a
                                                href={modelo.repo}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="cursor-pointer text-sm text-primary underline-offset-4 hover:underline"
                                            >
                                                repo
                                            </a>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* ── 5. En esta neurona ────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                        <span>En esta neurona</span>
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void mirarNeurona()}
                            disabled={mirando}
                            className="cursor-pointer"
                        >
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            Volver a mirar
                        </Button>
                    </CardTitle>
                    <CardDescription>
                        Qué piezas de la forja están ya presentes y vivas en este equipo.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    {mirando && !neurona && (
                        <p className="text-sm text-muted-foreground">Mirando la neurona…</p>
                    )}
                    {!mirando && errorNeurona && (
                        <p className="text-sm text-destructive">No se pudo leer la neurona.</p>
                    )}
                    {neurona && (
                        <ul className="space-y-3 text-sm">
                            <li className="flex items-center justify-between gap-3">
                                <span>Motor tts-server (omnivoice.cpp) presente</span>
                                <BadgeSiNo si={neurona.motor.presente} />
                            </li>
                            <li>
                                <div className="flex items-center justify-between gap-3">
                                    <span>Modelos GGUF</span>
                                    <Badge variant="outline">
                                        {neurona.modelos.length === 0
                                            ? "ninguno"
                                            : `${neurona.modelos.length}`}
                                    </Badge>
                                </div>
                                {neurona.modelos.length > 0 && (
                                    <ul className="mt-1.5 space-y-1 pl-4 text-xs text-muted-foreground">
                                        {neurona.modelos.map((m) => (
                                            <li
                                                key={m.nombre}
                                                className="flex items-center justify-between gap-3"
                                            >
                                                <span className="truncate">{m.nombre}</span>
                                                <span className="shrink-0 tabular-nums">
                                                    {Math.round(m.bytes / (1024 * 1024))} MB
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </li>
                            <li className="flex items-center justify-between gap-3">
                                <span>BitNet (llama-server 1.58) presente</span>
                                <BadgeSiNo si={neurona.bitnet.presente} />
                            </li>
                            <li className="flex items-center justify-between gap-3">
                                <span>Backend 1.58 vivo</span>
                                <span className="flex items-center gap-2">
                                    {neurona.backend158.vivo && (
                                        <Badge variant="outline" className="tabular-nums">
                                            {neurona.backend158.latenciaMs} ms
                                        </Badge>
                                    )}
                                    <BadgeSiNo si={neurona.backend158.vivo} />
                                </span>
                            </li>
                            <li className="flex items-center justify-between gap-3">
                                <span>Demonio de voz vivo / listo</span>
                                <span className="flex items-center gap-2">
                                    {neurona.demonio.modelo && (
                                        <Badge variant="outline">{neurona.demonio.modelo}</Badge>
                                    )}
                                    <BadgeSiNo si={neurona.demonio.vivo} />
                                    <span className="text-muted-foreground">/</span>
                                    <BadgeSiNo si={neurona.demonio.listo} />
                                </span>
                            </li>
                        </ul>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
