"use client";
/**
 * «Recursos de la red» de Genesis (apps-en-la-malla §12): ofertas por medio,
 * préstamos vivos y volúmenes con réplicas bajas. Solo local: la ruta
 * `/api/mando/recursos-red` responde 404 en producción.
 */
import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ResumenRecursosRed } from "@/lib/mando/recursos-red";

type RespuestaRecursos = ResumenRecursosRed & { servidoEn?: string };

export function PanelRecursosRed() {
    const [datos, setDatos] = useState<RespuestaRecursos | null>(null);
    const [cargando, setCargando] = useState(true);
    const [soloLocal, setSoloLocal] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const cargar = useCallback(async () => {
        setCargando(true);
        setError(null);
        try {
            const r = await fetch("/api/mando/recursos-red", { cache: "no-store" });
            if (r.status === 404) return setSoloLocal(true);
            if (!r.ok) return setError(`No se pudieron leer los recursos de la red (HTTP ${r.status}).`);
            setDatos((await r.json()) as RespuestaRecursos);
        } catch {
            setSoloLocal(true);
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar();
    }, [cargar]);
    return (
        <div className="space-y-4" aria-label="Recursos de la red">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <h2 className="text-base font-semibold text-white">Recursos de la red</h2>
                    <p className="mt-0.5 text-xs text-white/50">Qué ofrece cada medio, qué se presta y qué réplicas faltan.</p>
                </div>
                <Button type="button" variant="outline" size="sm" className="cursor-pointer" onClick={() => void cargar()} disabled={cargando}>
                    <RefreshCw className={cargando ? "mr-1 h-3 w-3 animate-spin" : "mr-1 h-3 w-3"} aria-hidden />
                    Refrescar
                </Button>
            </header>
            {soloLocal ? (
                <p role="status" className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                    Los recursos de la red solo se ven en tu máquina: <code>/api/mando/*</code> está apagado en el despliegue público.
                </p>
            ) : cargando && !datos ? (
                <p className="text-sm text-white/60">Leyendo los recursos de la red…</p>
            ) : error || !datos ? (
                <p role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-200">
                    {error ?? "No se pudo cargar el resumen."}
                </p>
            ) : (
                <div className="grid gap-4 lg:grid-cols-3">
                    <Card>
                        <CardHeader><CardTitle>Ofertas por medio</CardTitle></CardHeader>
                        <CardContent>
                            {datos.ofertasPorMedio.length === 0 ? <p className="text-sm text-white/50">Sin ofertas anunciadas.</p> : (
                                <ul className="space-y-2">
                                    {datos.ofertasPorMedio.map((o) => (
                                        <li key={o.medio} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-sm">
                                            <span className="font-medium text-white/85">{o.medio}</span>
                                            <span className="ml-2 text-white/60">{o.total} ofertas</span>
                                            <p className="mt-1 text-xs text-white/50">{o.medidos} medidas · {o.sinMedir > 0 ? `${o.sinMedir} sin medir` : "todo medido"}</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>Préstamos vivos</CardTitle></CardHeader>
                        <CardContent>
                            {datos.prestamosVivos.length === 0 ? <p className="text-sm text-white/50">Sin préstamos vivos.</p> : (
                                <ul className="space-y-2">
                                    {datos.prestamosVivos.map((p) => (
                                        <li key={p.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-2 text-sm">
                                            <p className="font-medium text-white/85">{p.recurso}</p>
                                            <p className="mt-1 text-xs text-white/50">{p.anfitrion ?? "anfitrión sin medir"} → {p.invitado ?? "invitado sin medir"}</p>
                                            <p className="mt-1 text-xs text-white/50">Hace {haceCuanto(p.desdeHaceMs)} · consumo {p.consumoBytes === null ? "sin medir" : `${p.consumoBytes} B`}</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                    <Card>
                        <CardHeader><CardTitle>Réplicas por debajo</CardTitle></CardHeader>
                        <CardContent>
                            {datos.volumenesBajos.length === 0 ? <p className="text-sm text-white/50">Todas las réplicas al día.</p> : (
                                <ul className="space-y-2">
                                    {datos.volumenesBajos.map((v) => (
                                        <li key={v.id} className="rounded-lg border border-amber-400/20 bg-amber-500/5 p-2 text-sm">
                                            <span className="font-medium text-white/85">{v.id}</span>
                                            <span className="ml-2 text-xs text-white/50">{v.privado ? "privado" : "público"}</span>
                                            <p className="mt-1 text-xs text-amber-100/80">{v.replicasActuales} de {v.replicasDeseadas} réplicas · faltan {v.faltan}</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}
function haceCuanto(ms: number | null): string {
    if (ms === null) return "sin medir";
    const seg = Math.floor(ms / 1000), min = Math.floor(seg / 60);
    return seg < 60 ? `${seg}s` : min < 60 ? `${min}m` : `${Math.floor(min / 60)}h ${min % 60}m`;
}
