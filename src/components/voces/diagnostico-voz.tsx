"use client";

/**
 * DIAGNÓSTICO DE VOZ VISIBLE (Ola 279 · V7B · 2026-09-08)
 * ─────────────────────────────────────────────────────────────────────────────
 * Es la parte de interfaz del diagnóstico de voz que V7 dejó sin escribir:
 * `diagnosticarVoz` (en `src/lib/voces/diagnostico.ts`) ya ejecuta en serie
 * las cinco vías por las que la voz puede sonar y avisa de cada paso por
 * `onPaso`. Este componente las pinta EN VIVO (spinner → ✓/✗ con ms y
 * detalle), permite copiar el informe en texto plano y muestra el consejo
 * final. Se monta junto al botón «Probar» del Estudio de Voces y en la
 * tarjeta «Demonio de voz» del Centro de Mando.
 *
 * Nunca lanza: si `diagnosticarVoz` fallara, el informe muestra el error y
 * deja de dibujar. Nunca dos diagnósticos a la vez (ref `enCurso`).
 */

import { useRef, useState } from "react";
import { ClipboardCopy, Loader2, Stethoscope, X } from "lucide-react";

import type { Timbre } from "@/lib/aurora/timbres";
import {
    diagnosticarVoz,
    type PasoDiagnostico,
} from "@/lib/voces/diagnostico";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Estado visible de cada paso mientras corre el diagnóstico. */
interface PasoVisible {
    paso: PasoDiagnostico;
    pendiente: boolean;
}

/**
 * Texto plano del informe que se copia: fecha, navegador y cada paso con su
 * resultado, tiempo, detalle y error exacto. Independiente del render para
 * que «Copiar informe» no dependa del DOM.
 */
function informeTexto(pasos: PasoDiagnostico[]): string {
    const linea = pasos
        .map((p) => {
            const estado = p.estado === "ok" ? "OK" : p.estado === "fallo" ? "FALLO" : "OMITIDO";
            const base = `[${estado}] ${p.etiqueta} — ${p.ms} ms — ${p.detalle}`;
            return p.error ? `${base}\n    error: ${p.error}` : base;
        })
        .join("\n");
    return [
        `Diagnóstico de voz StarSeed — ${new Date().toLocaleString()}`,
        `Navegador: ${typeof navigator !== "undefined" ? navigator.userAgent : "desconocido"}`,
        "",
        linea,
        "",
        `Consejo: ${consejoFinal(pasos).motivo}`,
    ].join("\n");
}

/**
 * Consejo final derivado de los pasos ya resueltos. Elige el nivel con el que
 * la voz debería sonar en este navegador, priorizando lo que sí funcionó.
 */
function consejoFinal(pasos: PasoDiagnostico[]): { nivelRecomendado: string; motivo: string } {
    const es = (clave: string) => pasos.find((p) => p.clave === clave)?.estado;
    const ok = (clave: string) => es(clave) === "ok";
    if (ok("salud") && ok("local")) {
        return { nivelRecomendado: "alta", motivo: "El demonio local y la síntesis local responden: usa el nivel «alta»." };
    }
    if (ok("nube")) {
        return { nivelRecomendado: "nube", motivo: "El demonio local no llega a sonar, pero la nube sí: usa el nivel «nube»." };
    }
    if (ok("sistema")) {
        return { nivelRecomendado: "ligera", motivo: "Ninguna síntesis propia sonó; queda el respaldo del sistema: usa «ligera»." };
    }
    return { nivelRecomendado: "mínima", motivo: "Nada sonó: revisa el permiso de audio y el demonio antes de seguir." };
}

/** Icono del estado de un paso: spinner en curso, ✓ en ok, ✗ en fallo. */
function iconoEstado(paso: PasoVisible): React.ReactNode {
    if (paso.pendiente) return <Loader2 className="h-4 w-4 animate-spin text-white/60" aria-hidden />;
    if (paso.paso.estado === "ok") return <span className="text-emerald-400">✓</span>;
    if (paso.paso.estado === "fallo") return <span className="text-red-400">✗</span>;
    return <span className="text-white/40">—</span>;
}

/**
 * Botón + panel de diagnóstico. El botón abre/cierra el panel; al abrirlo se
 * lanza `diagnosticarVoz` una sola vez (nunca dos a la vez: ref `enCurso`) y
 * cada paso se pinta en vivo en cuanto `onPaso` lo entrega. «Copiar informe»
 * genera el texto plano con fecha, navegador y todos los pasos.
 */
export function DiagnosticoVoz({ timbre }: { timbre: Timbre }) {
    const [abierto, setAbierto] = useState(false);
    const [pasos, setPasos] = useState<PasoVisible[]>([]);
    const [enCurso, setEnCurso] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Ref para saltar un segundo lanzamiento aunque el estado aún no se aplique.
    const corriendo = useRef(false);

    /** Abre el panel y arranca el diagnóstico (solo si no hay uno en curso). */
    const abrir = () => {
        setAbierto(true);
        if (corriendo.current) return;
        corriendo.current = true;
        setEnCurso(true);
        setError(null);
        setPasos([]);
        void diagnosticarVoz(timbre, (paso) => {
            setPasos((prev) => [
                ...prev.filter((p) => p.paso.clave !== paso.clave),
                { paso, pendiente: false },
            ]);
        })
            .catch((e) => setError(e instanceof Error ? e.message : String(e)))
            .finally(() => {
                corriendo.current = false;
                setEnCurso(false);
            });
    };

    /** Copia el informe en texto plano al portapapeles. */
    const copiar = () => {
        void navigator.clipboard?.writeText(informeTexto(pasos.map((p) => p.paso)));
    };

    return (
        <div data-testid="diagnostico-voz" className="w-full">
            <Button type="button" variant="outline" onClick={abrir} className="cursor-pointer">
                <Stethoscope className="mr-1.5 h-4 w-4" /> Diagnosticar voz
            </Button>
            {abierto && (
                <Card className="mt-2 w-full">
                    <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
                        <div>
                            <CardTitle className="text-sm">Diagnóstico de voz</CardTitle>
                            <CardDescription>
                                Cinco vías en serie: demonio, permiso, local, nube y sistema.
                            </CardDescription>
                        </div>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setAbierto(false)}
                            aria-label="Cerrar diagnóstico"
                            className="shrink-0 cursor-pointer"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                        {error && <p className="text-red-400">El diagnóstico falló: {error}</p>}
                        {pasos.length === 0 && enCurso && (
                            <p className="flex items-center gap-2 text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Preparando…
                            </p>
                        )}
                        {pasos.length === 0 && !enCurso && !error && (
                            <p className="text-muted-foreground">Sin resultados todavía.</p>
                        )}
                        <ul className="space-y-1.5">
                            {pasos.map((p) => (
                                <li key={p.paso.clave} className="flex items-start gap-2">
                                    <span className="mt-0.5 shrink-0">{iconoEstado(p)}</span>
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-baseline gap-x-2">
                                            <span className="font-medium">{p.paso.etiqueta}</span>
                                            <span className="tabular-nums text-xs text-muted-foreground">
                                                {p.paso.ms} ms
                                            </span>
                                            <Badge variant={p.paso.estado === "ok" ? "secondary" : "outline"}>
                                                {p.paso.estado}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-muted-foreground">{p.paso.detalle}</p>
                                        {p.paso.error && (
                                            <code className="mt-0.5 block rounded bg-muted px-1.5 py-0.5 text-[11px] text-red-400">
                                                {p.paso.error}
                                            </code>
                                        )}
                                    </div>
                                </li>
                            ))}
                        </ul>
                        {!enCurso && pasos.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                                <span className="text-xs text-muted-foreground">
                                    Consejo: {consejoFinal(pasos.map((p) => p.paso)).nivelRecomendado}
                                </span>
                                <Button
                                    type="button"
                                    variant="secondary"
                                    size="sm"
                                    onClick={copiar}
                                    className="cursor-pointer"
                                >
                                    <ClipboardCopy className="mr-1 h-3.5 w-3.5" /> Copiar informe
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}