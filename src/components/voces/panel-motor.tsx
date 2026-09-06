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
    olvidarCapacidades,
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
    /** «vivo» | «despertando» | «apagado» (Ola 251: cargar 900 MB tarda > 30 s). */
    estado: "vivo" | "despertando" | "apagado";
    despertandoDesdeMs: number | null;
    memoriaLibreMb: number | null;
}

/** Cuántos segundos lleva el demonio despertando, según su propia marca de tiempo. */
function segundosDespertando(desde: number | null): number | null {
    if (desde == null) return null;
    const s = Math.max(0, Math.round((Date.now() - desde) / 1000));
    return Number.isFinite(s) ? s : null;
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
    const [esperandoDespertar, setEsperandoDespertar] = useState(false);
    const [aviso, setAviso] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

    /** Estado apagado de factoría (sin red ni ambigüedad de tipos). */
    const saludApagada = (): EstadoSalud => ({
        vivo: false,
        latenciaMs: null,
        modelo: null,
        estado: "apagado",
        despertandoDesdeMs: null,
        memoriaLibreMb: null,
    });

    /** Sondea `/api/voz/salud` una vez y devuelve el estado (o `null` si falló la red). */
    const sondearSalud = useCallback(async (): Promise<EstadoSalud | null> => {
        // «Volver a medir» también olvida la medición cacheada del motor: si se midió con el
        // demonio dormido, el nivel automático se quedaba en «ligera» aunque ya estuviera vivo.
        olvidarCapacidades();
        try {
            const resp = await fetch("/api/voz/salud", { cache: "no-store" });
            if (!resp.ok) return saludApagada();
            const datos = (await resp.json()) as {
                vivo?: unknown;
                latenciaMs?: unknown;
                modelo?: unknown;
                estado?: unknown;
                despertandoDesdeMs?: unknown;
                memoriaLibreMb?: unknown;
            };
            const estado: EstadoSalud["estado"] =
                datos.estado === "vivo" || datos.estado === "despertando" || datos.estado === "apagado"
                    ? datos.estado
                    : datos.vivo === true
                      ? "vivo"
                      : "apagado";
            return {
                vivo: estado !== "apagado",
                latenciaMs: typeof datos.latenciaMs === "number" ? datos.latenciaMs : null,
                modelo: typeof datos.modelo === "string" ? datos.modelo : null,
                estado,
                despertandoDesdeMs:
                    typeof datos.despertandoDesdeMs === "number" ? datos.despertandoDesdeMs : null,
                memoriaLibreMb:
                    typeof datos.memoriaLibreMb === "number" ? datos.memoriaLibreMb : null,
            };
        } catch {
            return null;
        }
    }, []);

    /** Sondea `/api/voz/salud`. Nunca lanza. */
    const medirSalud = useCallback(async () => {
        setMidiendo(true);
        try {
            const lectura = await sondearSalud();
            const saludNueva = lectura ?? saludApagada();
            setSalud(saludNueva);
            if (saludNueva.vivo) {
                void detectarCapacidades().then(setCapacidades).catch(() => null);
            }
            return saludNueva;
        } finally {
            setMidiendo(false);
        }
    }, [sondearSalud]);

    useEffect(() => {
        setPreferencia(nivelPreferido());
        void medirSalud();
        void detectarCapacidades().then(setCapacidades).catch(() => null);
        // Solo al montar: medir hardware y demonio una vez.
    }, [medirSalud]);

    // El nivel detectado sigue a la última medición del demonio: si al montar estaba compilando
    // la ruta (o dormido) y luego «Volver a medir» lo encuentra vivo, sube a Alta/Estudio.
    const nivelDetectado: NivelVoz | null = capacidades
        ? nivelPara(salud ? { ...capacidades, daemonLocal: salud.estado === "vivo" } : capacidades)
        : null;

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

    /**
     * «Esperar y probar»: mientras el demonio carga el modelo (~900 MB, más de 30 s
     * con la memoria justa, 2026-09-06), sondea cada 3 s hasta 120 s y, al pasar a
     * «vivo», lanza la prueba de sonido. Si no despierta a tiempo, lo dice y para.
     */
    const esperarYProbar = async () => {
        setEsperandoDespertar(true);
        setAviso(null);
        const limite = Date.now() + 120_000;
        try {
            // eslint-disable-next-line no-constant-condition
            while (true) {
                const lectura = await sondearSalud();
                if (lectura) setSalud(lectura);
                if (lectura?.estado === "vivo") {
                    setEsperandoDespertar(false);
                    await probar();
                    return;
                }
                if (lectura?.estado === "apagado") {
                    setAviso({
                        tipo: "error",
                        texto: "El demonio se apagó mientras despertaba. Vuelve a lanzarlo.",
                    });
                    return;
                }
                if (Date.now() >= limite) {
                    setAviso({
                        tipo: "error",
                        texto: "El demonio sigue despertando tras 120 s. Revisa la memoria libre y reintenta.",
                    });
                    return;
                }
                await new Promise((r) => setTimeout(r, 3000));
            }
        } finally {
            setEsperandoDespertar(false);
        }
    };

    const segundos = segundosDespertando(salud?.despertandoDesdeMs ?? null);

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
                                    salud
                                        ? salud.estado === "vivo"
                                            ? "bg-emerald-500"
                                            : salud.estado === "despertando"
                                              ? "animate-pulse bg-amber-500"
                                              : "bg-destructive"
                                        : "bg-muted-foreground/40"
                                }`}
                            />
                            Demonio:{" "}
                            {salud
                                ? salud.estado === "vivo"
                                    ? "vivo"
                                    : salud.estado === "despertando"
                                      ? `despertando${segundos != null ? ` (${segundos} s)` : "…"}`
                                      : "apagado"
                                : "midiendo…"}
                        </span>
                        {salud?.memoriaLibreMb != null && (
                            // (2026-09-06) Con menos de ~700 MB libres el modelo de 900 MB
                            // compite con el swap y el despertar se alarga: se avisa en ámbar.
                            <Badge
                                variant={salud.memoriaLibreMb < 700 ? "outline" : "secondary"}
                                className={
                                    salud.memoriaLibreMb < 700
                                        ? "border-amber-500/60 text-amber-600 dark:text-amber-400"
                                        : undefined
                                }
                                title={
                                    salud.memoriaLibreMb < 700
                                        ? "poca memoria: la voz tarda más en despertar; cierra apps o reinicia el servidor de desarrollo"
                                        : undefined
                                }
                            >
                                Memoria libre: {salud.memoriaLibreMb} MB
                            </Badge>
                        )}
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

                    {salud?.memoriaLibreMb != null && salud.memoriaLibreMb < 700 && (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                            Poca memoria: la voz tarda más en despertar; cierra apps o reinicia el
                            servidor de desarrollo.
                        </p>
                    )}

                    {/* Prueba de sonido */}
                    <div className="flex flex-wrap items-center gap-3">
                        <Button
                            type="button"
                            onClick={() => void probar()}
                            disabled={probando || esperandoDespertar || salud?.estado !== "vivo"}
                            className="cursor-pointer"
                        >
                            <Play className="mr-1.5 h-4 w-4" />
                            {probando ? "Sintetizando…" : "Probar esta neurona"}
                        </Button>
                        {salud?.estado === "despertando" && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => void esperarYProbar()}
                                disabled={esperandoDespertar || probando}
                                className="cursor-pointer"
                            >
                                <RefreshCw
                                    className={`mr-1.5 h-4 w-4 ${esperandoDespertar ? "animate-spin" : ""}`}
                                />
                                {esperandoDespertar ? "Esperando al demonio…" : "Esperar y probar"}
                            </Button>
                        )}
                        {aviso && (
                            <p
                                role="status"
                                className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-500" : "text-destructive"}`}
                            >
                                {aviso.texto}
                            </p>
                        )}
                    </div>

                    {/* El demonio está cargando el modelo: no es que falte, es que tarda. */}
                    {salud?.estado === "despertando" && (
                        <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3">
                            <p className="text-sm">
                                El demonio está despertando: está cargando el modelo de voz
                                (~900 MB) en memoria. Con el equipo al límite puede tardar más de
                                30 segundos. Usa «Esperar y probar» y sonará en cuanto despierte.
                            </p>
                        </div>
                    )}

                    {/* Comando para levantar el demonio cuando está apagado */}
                    {salud?.estado === "apagado" && (
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
