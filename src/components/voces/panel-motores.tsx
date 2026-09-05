"use client";

/**
 * PANEL DE MOTORES (Ola 240 · Tarea VZ6 · Estudio de Voces)
 * ─────────────────────────────────────────────────────────────────────────────
 * Pestaña «Motores» del Estudio: lee `GET /api/voz/motores` y muestra el
 * demonio local OmniVoice (vivo, latencia y modelo cargado), una tarjeta por
 * cada tamaño de modelo GGUF en disco con sus bytes y un botón «Cargar este
 * modelo» que llama a `POST /api/voz/motores` y muestra los segundos que tardó
 * el reinicio. Debajo, los cuatro niveles de «Voz StarSeed» disponibles.
 *
 * En producción la ruta responde 404 (candado por diseño): el panel lo
 * muestra como «no disponible» en lugar de un error técnico.
 */

import { useEffect, useState } from "react";
import { Cpu, RefreshCw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Estado tal como lo devuelve `GET /api/voz/motores` (ver src/lib/voces/motores.ts). */
interface EstadoMotoresPanel {
    demonio: {
        vivo: boolean;
        latenciaMs: number | null;
        modeloCargado: string | null;
        puerto: number;
    };
    modelos: {
        archivo: string;
        tamano: "Q4_K_M" | "Q8_0" | "otro";
        bytes: number;
        tokenizer: boolean;
    }[];
    niveles: {
        etiqueta: string;
        motorInterno: string;
        requisitos: string;
        ramMB: number;
        latencia: string;
        calidad: string;
    }[];
}

interface Aviso {
    tipo: "ok" | "error";
    texto: string;
}

/** Formatea bytes como MB con un decimal. */
function aMB(bytes: number): string {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PanelMotores() {
    const [estado, setEstado] = useState<EstadoMotoresPanel | null>(null);
    const [noDisponible, setNoDisponible] = useState(false);
    const [cargando, setCargando] = useState<string | null>(null);
    const [aviso, setAviso] = useState<Aviso | null>(null);

    const recargar = async () => {
        try {
            const r = await fetch("/api/voz/motores", { cache: "no-store" });
            if (r.status === 404) {
                setNoDisponible(true);
                setEstado(null);
                return;
            }
            if (!r.ok) {
                setAviso({ tipo: "error", texto: "El lector de motores respondió con un error." });
                return;
            }
            setNoDisponible(false);
            setEstado((await r.json()) as EstadoMotoresPanel);
        } catch {
            setAviso({ tipo: "error", texto: "No se pudo contactar con el servidor local." });
        }
    };

    useEffect(() => {
        void recargar();
        // Solo al montar: primera lectura del estado de motores.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const cambiarModelo = async (tamano: "Q4_K_M" | "Q8_0") => {
        setCargando(tamano);
        setAviso(null);
        try {
            const r = await fetch("/api/voz/motores", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tamano }),
            });
            const datos = (await r.json().catch(() => null)) as
                | { ok: boolean; modelo: string; segundos: number }
                | null;
            if (r.ok && datos?.ok) {
                setAviso({
                    tipo: "ok",
                    texto: `«${datos.modelo}» cargado en ${datos.segundos} s.`,
                });
            } else {
                setAviso({
                    tipo: "error",
                    texto: datos
                        ? `No se pudo cargar «${datos.modelo}» (faltan archivos o el demonio no arrancó).`
                        : "El reinicio del demonio falló.",
                });
            }
        } catch {
            setAviso({ tipo: "error", texto: "No se pudo reiniciar el demonio de voz." });
        } finally {
            setCargando(null);
            await recargar();
        }
    };

    if (noDisponible) {
        return (
            <p className="py-10 text-center text-sm text-muted-foreground">
                El panel de motores solo está disponible en esta neurona (modo local).
            </p>
        );
    }

    if (!estado) {
        return (
            <p className="py-10 text-center text-sm text-muted-foreground">
                Leyendo el estado de los motores…
            </p>
        );
    }

    const { demonio, modelos, niveles } = estado;

    return (
        <div className="space-y-4">
            {/* ── Demonio local ─────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Cpu className="h-4 w-4" aria-hidden /> Demonio local OmniVoice
                        </CardTitle>
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void recargar()}
                            className="cursor-pointer"
                        >
                            <RefreshCw className="mr-1.5 h-4 w-4" /> Actualizar
                        </Button>
                    </div>
                    <CardDescription>Puerto {demonio.puerto} · 127.0.0.1</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center gap-2">
                    <Badge variant={demonio.vivo ? "default" : "secondary"}>
                        {demonio.vivo ? "Vivo" : "Apagado"}
                    </Badge>
                    {demonio.latenciaMs !== null && (
                        <Badge variant="outline">{demonio.latenciaMs} ms</Badge>
                    )}
                    <Badge variant="outline">
                        Modelo: {demonio.modeloCargado ?? "desconocido"}
                    </Badge>
                </CardContent>
            </Card>

            {aviso && (
                <p role="status" className={`text-sm ${aviso.tipo === "ok" ? "text-emerald-500" : "text-destructive"}`}>
                    {aviso.texto}
                </p>
            )}

            {/* ── Modelos en disco ──────────────────────────────────────── */}
            {modelos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    No se encontraron modelos OmniVoice en esta neurona.
                </p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                    {modelos.map((m) => {
                        const esCargado = demonio.modeloCargado === m.archivo;
                        const accionable = m.tamano === "Q4_K_M" || m.tamano === "Q8_0";
                        return (
                            <Card key={m.archivo}>
                                <CardHeader className="pb-2">
                                    <div className="flex items-center justify-between gap-2">
                                        <CardTitle className="text-sm">{m.tamano === "otro" ? m.archivo : m.tamano}</CardTitle>
                                        {esCargado && <Badge>Cargado</Badge>}
                                    </div>
                                    <CardDescription>{m.archivo}</CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                        {aMB(m.bytes)} · {m.tokenizer ? "con tokenizer" : "sin tokenizer"}
                                    </p>
                                    {accionable && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={esCargado ? "outline" : "secondary"}
                                            disabled={cargando !== null || esCargado}
                                            onClick={() => void cambiarModelo(m.tamano as "Q4_K_M" | "Q8_0")}
                                            className="cursor-pointer"
                                        >
                                            {cargando === m.tamano
                                                ? "Cargando…"
                                                : esCargado
                                                  ? "Ya está cargado"
                                                  : "Cargar este modelo"}
                                        </Button>
                                    )}
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* ── Niveles disponibles ───────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Niveles de «Voz StarSeed»</CardTitle>
                    <CardDescription>Cadena de degradación: si un nivel falla, se baja al siguiente con el mismo timbre.</CardDescription>
                </CardHeader>
                <CardContent>
                    <ul className="space-y-2">
                        {niveles.map((n) => (
                            <li key={n.etiqueta} className="rounded-lg border px-3 py-2 text-sm">
                                <span className="font-medium">{n.etiqueta}</span>
                                <span className="block text-xs text-muted-foreground">
                                    {n.motorInterno} · {n.ramMB} MB · {n.calidad} · {n.requisitos}
                                </span>
                            </li>
                        ))}
                    </ul>
                </CardContent>
            </Card>
        </div>
    );
}
