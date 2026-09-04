"use client";

/**
 * PANEL «MOTOR DE VOZ DE ESTA NEURONA» (Ola 228)
 * ─────────────────────────────────────────────────────────────────────────────
 * Primera pestaña del Estudio de Voces: muestra la salud del demonio local
 * (127.0.0.1:4500 a través de `/api/voz/salud`), el nivel de voz detectado y
 * la preferencia del usuario, y permite probar la neurona con una frase.
 *
 * Si el demonio está apagado, enseña el comando exacto para levantarlo
 * (el usuario lo ejecuta en su terminal; el OS nunca lo arranca solo).
 */

import { useCallback, useEffect, useState } from "react";
import { Activity, Play, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";

import {
    detectarCapacidades,
    type Capacidades,
} from "@/lib/aurora/voz-starseed/capacidades";
import { NIVELES, nivelPara, type NivelVoz } from "@/lib/aurora/voz-starseed/niveles";
import {
    fijarNivel,
    nivelPreferido,
    type PreferenciaNivel,
} from "@/lib/aurora/voz-starseed/motor";

/** Estado de salud del demonio según `/api/voz/salud`. */
interface EstadoSalud {
    vivo: boolean;
    latenciaMs: number | null;
    modelo: string | null;
}

const FRASE_PRUEBA =
    "Hola, soy la voz de esta neurona. El motor local está vivo y suena en estudio.";

const ORDEN_NIVELES: NivelVoz[] = ["estudio", "alta", "ligera", "minima"];

const OPCIONES_PREFERENCIA: { valor: PreferenciaNivel; etiqueta: string }[] = [
    { valor: "auto", etiqueta: "Automático" },
    { valor: "estudio", etiqueta: "Estudio" },
    { valor: "alta", etiqueta: "Alta" },
    { valor: "ligera", etiqueta: "Ligera" },
    { valor: "minima", etiqueta: "Mínima" },
];

const COMANDO_DAEMON =
    "~/.starseed/astraura-voice/omnivoice.cpp/build/tts-server " +
    "--model omnivoice-base-Q8_0.gguf " +
    "--codec omnivoice-tokenizer-Q8_0.gguf " +
    "--host 127.0.0.1 --port 4500 --lang Spanish";

export function PanelMotorVoz() {
    const [capacidades, setCapacidades] = useState<Capacidades | null>(null);
    const [preferencia, setPreferencia] = useState<PreferenciaNivel>("auto");
    const [salud, setSalud] = useState<EstadoSalud | null>(null);
    const [midiendo, setMidiendo] = useState(false);
    const [probando, setProbando] = useState(false);
    const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

    /** Sondea `/api/voz/salud`. Nunca lanza. */
    const medirSalud = useCallback(async () => {
        setMidiendo(true);
        try {
            const resp = await fetch("/api/voz/salud", { cache: "no-store" });
            if (!resp.ok) {
                setSalud({ vivo: false, latenciaMs: null, modelo: null });
                return;
            }
            const datos = (await resp.json()) as {
                vivo?: unknown;
                latenciaMs?: unknown;
                modelo?: unknown;
            };
            setSalud({
                vivo: datos.vivo === true,
                latenciaMs: typeof datos.latenciaMs === "number" ? datos.latenciaMs : null,
                modelo: typeof datos.modelo === "string" ? datos.modelo : null,
            });
        } catch {
            setSalud({ vivo: false, latenciaMs: null, modelo: null });
        } finally {
            setMidiendo(false);
        }
    }, []);

    useEffect(() => {
        setPreferencia(nivelPreferido());
        void medirSalud();
        void detectarCapacidades().then(setCapacidades).catch(() => null);
        // Solo al montar: medir hardware y demonio una vez.
    }, [medirSalud]);

    const nivelDetectado: NivelVoz | null = capacidades ? nivelPara(capacidades) : null;

    const cambiarPreferencia = (v: PreferenciaNivel) => {
        fijarNivel(v);
        setPreferencia(v);
    };

    const probar = async () => {
        setProbando(true);
        setAviso(null);
        try {
            const resp = await fetch("/api/voz/hablar", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ texto: FRASE_PRUEBA, voz: "default", speed: 1 }),
            });
            if (!resp.ok) {
                const datos = (await resp.json().catch(() => ({}))) as { error?: string };
                setAviso({
                    tipo: "error",
                    texto: datos.error ?? "No se pudo hablar por el demonio local.",
                });
                return;
            }
            const audio = await resp.blob();
            const url = URL.createObjectURL(audio);
            const reproductor = new Audio(url);
            reproductor.onended = () => URL.revokeObjectURL(url);
            reproductor.onerror = () => URL.revokeObjectURL(url);
            await reproductor.play();
            setAviso({ tipo: "ok", texto: "Sonando por el demonio local de esta neurona." });
        } catch {
            setAviso({ tipo: "error", texto: "No se pudo reproducir el audio." });
        } finally {
            setProbando(false);
        }
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                        <Activity className="h-4 w-4" aria-hidden />
                        Motor de voz de esta neurona
                    </CardTitle>
                    <CardDescription>
                        El demonio local (127.0.0.1:4500) da los niveles Estudio y Alta; si está
                        apagado, la voz baja a los niveles del navegador con el mismo timbre.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {/* Estado del demonio + nivel detectado */}
                    <div className="flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-2 text-sm">
                            <span
                                aria-hidden
                                className={`h-2.5 w-2.5 rounded-full ${
                                    salud ? (salud.vivo ? "bg-emerald-500" : "bg-destructive") : "bg-muted-foreground/40"
                                }`}
                            />
                            Demonio: {salud ? (salud.vivo ? "vivo" : "apagado") : "midiendo…"}
                        </span>
                        {salud?.modelo && <Badge variant="secondary">{salud.modelo}</Badge>}
                        {salud?.latenciaMs != null && (
                            <Badge variant="outline">{salud.latenciaMs} ms</Badge>
                        )}
                        {nivelDetectado && (
                            <Badge variant="outline">
                                Nivel detectado: {NIVELES[nivelDetectado].etiqueta}
                            </Badge>
                        )}
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => void medirSalud()}
                            disabled={midiendo}
                            className="cursor-pointer"
                        >
                            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                            Volver a medir
                        </Button>
                    </div>

                    {/* Selector de nivel preferido */}
                    <div className="max-w-xs space-y-1.5">
                        <Label htmlFor="nivel-voz">Nivel de voz</Label>
                        <Select
                            value={preferencia}
                            onValueChange={(v) => cambiarPreferencia(v as PreferenciaNivel)}
                        >
                            <SelectTrigger id="nivel-voz" className="cursor-pointer">
                                <SelectValue placeholder="Automático" />
                            </SelectTrigger>
                            <SelectContent>
                                {OPCIONES_PREFERENCIA.map((o) => (
                                    <SelectItem key={o.valor} value={o.valor} className="cursor-pointer">
                                        {o.etiqueta}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                            «Automático» elige el nivel más alto que este equipo puede sostener.
                        </p>
                    </div>

                    {/* Prueba de sonido */}
                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            type="button"
                            onClick={() => void probar()}
                            disabled={probando || salud?.vivo === false}
                            className="cursor-pointer"
                        >
                            <Play className="mr-1.5 h-4 w-4" />
                            {probando ? "Sintetizando…" : "Probar esta neurona"}
                        </Button>
                        {aviso && (
                            <p
                                role="status"
                                className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-500" : "text-destructive"}`}
                            >
                                {aviso.texto}
                            </p>
                        )}
                    </div>

                    {/* Comando para levantar el demonio cuando está apagado */}
                    {salud && !salud.vivo && (
                        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                            <p className="text-sm">
                                El demonio está apagado. Para tener los niveles Estudio y Alta,
                                ejecútalo en la terminal de esta neurona:
                            </p>
                            <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                                <code>{COMANDO_DAEMON}</code>
                            </pre>
                            <p className="text-xs text-muted-foreground">
                                Variante más ligera (nivel Alta): sustituye los modelos por
                                omnivoice-base-Q4_K_M.gguf y omnivoice-tokenizer-Q4_K_M.gguf.
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Los cuatro niveles del motor único */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Los cuatro niveles</CardTitle>
                    <CardDescription>
                        Mismo timbre en todos; solo cambia la precisión del motor que sintetiza.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Nivel</TableHead>
                                <TableHead>Motor</TableHead>
                                <TableHead>Memoria</TableHead>
                                <TableHead>Requisitos</TableHead>
                                <TableHead>Latencia</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {ORDEN_NIVELES.map((n) => (
                                <TableRow
                                    key={n}
                                    className={nivelDetectado === n ? "bg-primary/5" : undefined}
                                >
                                    <TableCell className="font-medium">
                                        {NIVELES[n].etiqueta}
                                        {nivelDetectado === n && (
                                            <Badge variant="outline" className="ml-2">
                                                detectado
                                            </Badge>
                                        )}
                                    </TableCell>
                                    <TableCell>{NIVELES[n].motorInterno}</TableCell>
                                    <TableCell className="tabular-nums">
                                        {NIVELES[n].ramMB === 0 ? "—" : `${NIVELES[n].ramMB} MB`}
                                    </TableCell>
                                    <TableCell>{NIVELES[n].requisitos}</TableCell>
                                    <TableCell>{NIVELES[n].latencia}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
