"use client";

/**
 * Panel «Pruebas» del pulso de Genesis (PRB1111V)
 * ─────────────────────────────────────────────────────────────────────────────
 * Las versiones de prueba `0.5.1-prueba.N` vivas y controlables desde un solo sitio: dónde va la compilación de cada
 * plataforma, la cadena de entrega del commit, el control (pide al director de pruebas), los aparatos con su evidencia,
 * las comprobaciones con «Aprobar» (la sección de siempre, `versiones-prueba.tsx`) y los accesos para instalar.
 *
 * Se relee solo: cada 15 s mientras algo está en marcha, cada minuto si no, y nunca con la pestaña oculta. Una
 * lectura que falla deja lo último que se vio y lo dice. Todo es de lectura salvo las peticiones al director, que
 * solo caben desde la Genesis local.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { estaEnMarcha } from "@/lib/mando/lanzamientos-pruebas";
import { tonoDePruebas, versionEnFoco, vistaDirector } from "@/lib/mando/pruebas-vivas";
import type { RespuestaVivo } from "@/lib/mando/pruebas-vivas-tipos";

import { AccesosDePrueba } from "./pruebas-accesos";
import { AparatosYEvidencia, ExtraDeComprobacion } from "./pruebas-aparatos";
import { BuildsDePrueba } from "./pruebas-builds";
import { CadenaDeEntrega } from "./pruebas-cadena";
import { Chip, haceTexto, ProveedorPruebas, usePruebas, type ResultadoPedir, type Seguimiento, type ValorPruebas } from "./pruebas-contexto";
import { ControlPruebas } from "./pruebas-control";
import { VersionesPrueba } from "./versiones-prueba";

export const INTERVALO_EN_MARCHA_MS = 15_000;
export const INTERVALO_QUIETO_MS = 60_000;

const TONO_CHIP = { normal: "quieto", aviso: "aviso", peligro: "mal", ok: "ok" } as const;

export function PanelPruebas() {
    const [datos, setDatos] = useState<RespuestaVivo | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [cargando, setCargando] = useState(false);
    const [ahora, setAhora] = useState(() => Date.now());
    const [seguimiento, setSeguimiento] = useState<Seguimiento[]>([]);
    const vivo = useRef(true);
    const ultimo = useRef<RespuestaVivo | null>(null);
    const enVuelo = useRef(false);

    useEffect(() => {
        vivo.current = true;
        return () => void (vivo.current = false);
    }, []);

    const cargar = useCallback(async (): Promise<void> => {
        if (enVuelo.current) return;
        enVuelo.current = true;
        setCargando(true);
        try {
            const r = await fetch("/api/mando/lanzamientos/pruebas/vivo", { cache: "no-store" });
            const cuerpo = (await r.json().catch(() => null)) as RespuestaVivo | { error?: string } | null;
            if (!vivo.current) return;
            if (!r.ok || !cuerpo || !Array.isArray((cuerpo as RespuestaVivo).versiones)) {
                setError((cuerpo as { error?: string } | null)?.error ?? `No pude leer las pruebas (HTTP ${r.status}).`);
                return;
            }
            ultimo.current = cuerpo as RespuestaVivo;
            setError(null);
            setDatos(cuerpo as RespuestaVivo);
            setAhora(Date.now());
        } catch {
            if (vivo.current) setError("No pude leer las pruebas.");
        } finally {
            enVuelo.current = false;
            if (vivo.current) setCargando(false);
        }
    }, []);

    // Sondeo: 15 s con algo en marcha, 1 min si no; con la pestaña oculta no se pide nada y al volver se lee al momento.
    useEffect(() => {
        let temporizador: number | undefined;
        let parado = false;
        const visible = () => typeof document === "undefined" || document.visibilityState !== "hidden";
        const turno = async () => {
            if (visible()) await cargar();
            if (parado) return;
            const rapido = ultimo.current?.versiones.some(estaEnMarcha) ?? false;
            temporizador = window.setTimeout(() => void turno(), rapido ? INTERVALO_EN_MARCHA_MS : INTERVALO_QUIETO_MS);
        };
        void turno();
        const alVolver = () => {
            if (visible()) void cargar();
        };
        document.addEventListener("visibilitychange", alVolver);
        const reloj = window.setInterval(() => visible() && setAhora(Date.now()), 20_000);
        return () => {
            parado = true;
            if (temporizador) window.clearTimeout(temporizador);
            window.clearInterval(reloj);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [cargar]);

    const pedir = useCallback(
        async (cuerpo: Record<string, unknown>, etiqueta: string): Promise<ResultadoPedir> => {
            try {
                const r = await fetch("/api/mando/lanzamientos/pruebas/control", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(cuerpo),
                });
                const salida = (await r.json().catch(() => ({}))) as { error?: string; id?: string };
                if (!r.ok || !salida.id) return { ok: false, error: salida.error ?? `No se pudo (HTTP ${r.status}).` };
                setSeguimiento((s) => [
                    ...s,
                    {
                        id: salida.id as string,
                        accion: String(cuerpo.accion),
                        etiqueta,
                        tPedida: Date.now(),
                        prueba: typeof cuerpo.prueba === "number" ? cuerpo.prueba : null,
                        comprobacion: typeof cuerpo.comprobacion === "string" ? cuerpo.comprobacion : null,
                        plataforma: typeof cuerpo.plataforma === "string" ? cuerpo.plataforma : null,
                    },
                ]);
                void cargar();
                return { ok: true, id: salida.id };
            } catch {
                return { ok: false, error: "No se pudo completar la petición." };
            }
        },
        [cargar],
    );

    const valor: ValorPruebas | null = useMemo(() => {
        if (!datos) return null;
        const director = vistaDirector(datos.director, ahora);
        const puedePedir = datos.controlAqui && director.leePeticiones;
        return {
            datos,
            ahora,
            director,
            puedePedir,
            motivo: !datos.controlAqui ? "Se pide desde Genesis en la Mac; desde aquí solo se ve." : director.leePeticiones ? "" : director.texto,
            pedir,
            recargar: cargar,
            seguimiento,
        };
    }, [datos, ahora, pedir, cargar, seguimiento]);

    return (
        <section aria-label="Pruebas" data-testid="panel-pruebas" className="min-w-0 space-y-3">
            {error ? (
                <p className="break-words rounded-md border border-rose-400/30 bg-rose-500/10 p-2 text-xs text-rose-100" role="alert">
                    {error}
                    {datos ? " Lo que ves es la última lectura buena." : ""}
                </p>
            ) : null}
            {!valor ? (
                <p className="flex items-center gap-2 text-xs text-white/55">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Leyendo las pruebas…
                </p>
            ) : (
                <ProveedorPruebas valor={valor}>
                    <Cabecera cargando={cargando} alRecargar={() => void cargar()} />
                    <BuildsDePrueba />
                    <CadenaDeEntrega />
                    <ControlPruebas />
                    <AparatosYEvidencia />
                    <VersionesPrueba datos={valor.datos} alRecargar={cargar} ocultarBuild ahoraExterno={ahora} extraComprobacion={(c, v) => <ExtraDeComprobacion c={c} v={v} />} />
                    <AccesosDePrueba />
                </ProveedorPruebas>
            )}
        </section>
    );
}

function Cabecera({ cargando, alRecargar }: { cargando: boolean; alRecargar: () => void }) {
    const c = usePruebas();
    if (!c) return null;
    const v = versionEnFoco(c.datos.versiones);
    const tono = tonoDePruebas(v, c.director);
    const dir = c.director;
    return (
        <div className="space-y-1.5" data-testid="cabecera-pruebas">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                <Chip tono={TONO_CHIP[tono]} data-testid="tono-pruebas">{tono === "peligro" ? "falla algo" : tono === "aviso" ? "atento" : tono === "ok" ? "bien" : "sin novedad"}</Chip>
                <span className="min-w-0 break-words text-sm text-white/90" data-testid="resumen-panel-pruebas">{c.datos.resumen}</span>
                <Button size="sm" variant="outline" onClick={alRecargar} disabled={cargando} className="ml-auto h-8 text-xs" aria-label="Releer ahora">
                    <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} aria-hidden />
                    Releer
                </Button>
            </div>
            <p className="break-words text-[11px] text-white/45">
                Leído {haceTexto(new Date(c.datos.ahoraServidor).toISOString(), c.ahora)} · se relee solo cada {c.datos.versiones.some(estaEnMarcha) ? "15 s" : "minuto"} · director de pruebas:{" "}
                <span className={dir.estado === "corriendo" ? "text-emerald-300" : "text-amber-200"} data-testid="estado-director">
                    {{ corriendo: "corre", parado: "parado", pausado: "en pausa", "sin-archivo": "sin estado", ilegible: "ilegible" }[dir.estado]}
                </span>
            </p>
            {c.datos.director && c.datos.director !== "ilegible" && c.datos.director.avisos.length ? (
                <ul className="space-y-0.5 text-xs text-amber-200/80">
                    {c.datos.director.avisos.map((a) => <li key={a} className="break-words">Director: {a}</li>)}
                </ul>
            ) : null}
        </div>
    );
}
