"use client";

/**
 * Panel «Servidor 1.58» de Genesis.
 * ─────────────────────────────────────────────────────────────────────────────
 * Administrador de servidor de Astraura 1.58 (capa nube): un interruptor para
 * que esta Mac no se duerma sola (la pantalla sí se puede apagar, para ahorrar
 * batería, sin cortar la sesión ni los procesos), el estado del
 * backend/BitNet/túnel, los servicios `com.starseed.*` reiniciables desde
 * aquí y el registro de servidores (esta Mac + Oracle, pendiente).
 *
 * Lee `GET /api/mando/servidor` (solo local; 404 en producción) cada 15 s
 * mientras el panel está montado y la pestaña visible, igual que el resto de
 * paneles de Genesis (`panel-neurona.tsx`). Los TIPOS vienen SOLO de
 * `servidor-astraura-tipos.ts` (sin `node:*`): importar el módulo de servidor
 * por valor metería `node:child_process`/`node:fs` en el bundle del cliente.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
    AlertTriangle,
    Check,
    ChevronDown,
    Cloud,
    Copy,
    Cpu,
    ExternalLink,
    MonitorOff,
    Plus,
    Power,
    Radio,
    RefreshCw,
    RotateCw,
    Server,
    Trash2,
    X,
} from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
    NOMBRES_SERVICIOS,
    esServidorPendiente,
    type EntradaServidor,
    type EstadoServidorAstraura,
    type MaquinaEstado,
    type ServidorRegistrado,
    type TipoServidor,
} from "@/lib/mando/servidor-astraura-tipos";
import { resumenOracle } from "@/lib/mando/oracle-tipos";

// ── Formato ───────────────────────────────────────────────────────────────────

function formatoMb(mb: number | null | undefined): string {
    if (mb === null || mb === undefined || !Number.isFinite(mb)) return "—";
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
}

function formatoLatencia(ms: number | null | undefined): string {
    if (ms === null || ms === undefined || !Number.isFinite(ms)) return "no responde";
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)} s`;
    return `${Math.round(ms)} ms`;
}

/** Segundos → «3 h 12 min» / «45 min» / «20 s» / «2 d 3 h». */
function formatoDuracion(segundos: number | null | undefined): string {
    if (segundos === null || segundos === undefined || !Number.isFinite(segundos) || segundos < 0) return "—";
    const s = Math.floor(segundos);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d} d ${h} h`;
    if (h > 0) return `${h} h ${m} min`;
    if (m > 0) return `${m} min`;
    return `${s} s`;
}

async function copiarTexto(texto: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(texto);
    } catch {
        const area = document.createElement("textarea");
        area.value = texto;
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        document.execCommand("copy");
        document.body.removeChild(area);
    }
}

async function postAccion(cuerpo: Record<string, unknown>): Promise<{ ok: boolean; error?: string; [k: string]: unknown }> {
    const r = await fetch("/api/mando/servidor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cuerpo),
    });
    const d = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; [k: string]: unknown };
    if (!r.ok || !d.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
    return d as { ok: boolean; [k: string]: unknown };
}

/** Punto de estado: verde/rojo/gris según `ok` (`null` = sin datos). */
function Punto({ ok }: { ok: boolean | null }) {
    const color = ok === true ? "bg-emerald-400" : ok === false ? "bg-red-400" : "bg-zinc-500";
    return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden />;
}

function AvisosBox({ avisos }: { avisos: string[] }) {
    return (
        <div className="space-y-1.5">
            {avisos.map((a) => (
                <p
                    key={a}
                    className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200"
                >
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span>{a}</span>
                </p>
            ))}
        </div>
    );
}

// ── a) Modo servidor · esta Mac ──────────────────────────────────────────────

function SeccionEnergia({ estado, alCambiar }: { estado: EstadoServidorAstraura; alCambiar: () => void }) {
    const energia = estado.energia;
    const [cambiando, setCambiando] = useState(false);
    const [apagando, setApagando] = useState(false);
    const [mensaje, setMensaje] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copiado, setCopiado] = useState<string | null>(null);

    const alternar = useCallback(
        async (activar: boolean) => {
            setCambiando(true);
            setError(null);
            setMensaje(null);
            try {
                const d = await postAccion({ accion: "despierto", activar });
                setMensaje(typeof d.detalle === "string" ? d.detalle : activar ? "Activado." : "Desactivado.");
                alCambiar();
            } catch (e) {
                setError(e instanceof Error ? e.message : "No se pudo cambiar el modo servidor.");
            } finally {
                setCambiando(false);
            }
        },
        [alCambiar],
    );

    const apagarPantalla = useCallback(async () => {
        setApagando(true);
        setError(null);
        setMensaje(null);
        try {
            const d = await postAccion({ accion: "apagar_pantalla" });
            setMensaje(typeof d.detalle === "string" ? d.detalle : "Pantalla apagada.");
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo apagar la pantalla.");
        } finally {
            setApagando(false);
        }
    }, []);

    const copiar = useCallback(async (texto: string, id: string) => {
        await copiarTexto(texto);
        setCopiado(id);
        window.setTimeout(() => setCopiado((c) => (c === id ? null : c)), 2000);
    }, []);

    const estadoTexto = energia.despierto
        ? energia.desde !== null
            ? `Despierta desde hace ${formatoDuracion((Date.now() - energia.desde) / 1000)}`
            : "Despierta como servidor"
        : energia.reposoSistemaMin !== null
          ? `Se dormirá tras ${energia.reposoSistemaMin} min sin uso`
          : "No se duerme sola (reposo del sistema desactivado en los ajustes de macOS)";

    const bateria = energia.bateria;
    const lineaEnergia =
        bateria.alimentacion === "ac"
            ? `Corriente${bateria.porcentaje !== null ? ` · batería ${bateria.porcentaje} %` : ""}`
            : bateria.alimentacion === "bateria"
              ? `Batería ${bateria.porcentaje ?? "—"} %${bateria.restante ? ` · quedan ${bateria.restante}` : ""}`
              : "Alimentación desconocida";

    // `caffeinate` es nuestro propio interruptor: no tiene sentido decir «te mantiene despierta: caffeinate».
    const impedidoPor = energia.reposoImpedidoPor.filter((p) => p.toLowerCase() !== "caffeinate");

    return (
        <section className="mc-cristal space-y-3 p-4">
            <header className="flex items-center gap-2">
                <Power className="h-4 w-4 text-emerald-300" aria-hidden />
                <h3 className="text-sm font-semibold text-white">Modo servidor · esta Mac</h3>
            </header>

            <div className="flex items-start justify-between gap-3 rounded-lg border border-white/10 bg-black/20 p-3">
                <div className="min-w-0">
                    <p className="text-sm font-medium text-white">Mantener encendida</p>
                    <p className="mt-0.5 text-xs text-white/60">
                        Evita que la Mac se duerma sola (reposo del sistema y del disco), para que la capa nube de
                        Astraura y los agentes de Genesis sigan trabajando horas o días. La pantalla se puede seguir
                        apagando para ahorrar batería.
                    </p>
                </div>
                <Switch
                    checked={energia.despierto}
                    onCheckedChange={(v) => void alternar(v)}
                    disabled={cambiando}
                    aria-label="Mantener esta Mac despierta como servidor"
                    className="mt-0.5 shrink-0"
                />
            </div>

            <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-white/70 sm:grid-cols-2">
                <p>{estadoTexto}</p>
                <p>{lineaEnergia}</p>
            </div>
            {impedidoPor.length > 0 && (
                <p className="text-xs text-white/50">Ahora la mantiene despierta: {impedidoPor.join(", ")}</p>
            )}

            <div className="space-y-1.5">
                <button
                    type="button"
                    onClick={() => void apagarPantalla()}
                    disabled={apagando}
                    className="mc-alzar inline-flex min-h-[36px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <MonitorOff className="h-3.5 w-3.5" aria-hidden />
                    Apagar pantalla
                </button>
                <p className="text-[11px] text-white/40">
                    La pantalla se apaga y la sesión sigue abierta: los procesos y el servidor continúan. Mueve el
                    ratón o toca una tecla para encenderla.
                </p>
            </div>

            <Collapsible>
                <CollapsibleTrigger className="mc-alzar group flex min-h-[36px] w-full cursor-pointer items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-left text-xs text-white/70 transition-colors duration-200 hover:bg-white/10">
                    Con la tapa cerrada
                    <ChevronDown className="ml-auto h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2 pt-2 text-xs text-white/60">
                    <p>
                        Con la tapa cerrada y sin pantalla externa, macOS se duerme igual aunque «Mantener encendida»
                        esté activo: el reposo del sistema es una cosa y la tapa cerrada, otra.
                    </p>
                    <p>
                        Para aguantar días con la tapa cerrada hace falta desactivar el reposo del todo (afecta a
                        toda la Mac, no solo a este servidor):
                    </p>
                    <div className="flex items-center gap-2 rounded-md bg-black/30 px-2 py-1.5">
                        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/80">
                            sudo pmset -a disablesleep 1
                        </code>
                        <button
                            type="button"
                            onClick={() => void copiar("sudo pmset -a disablesleep 1", "activar")}
                            aria-label="Copiar sudo pmset -a disablesleep 1"
                            className="shrink-0 cursor-pointer rounded p-1.5 text-white/50 transition-colors duration-150 hover:bg-white/10 hover:text-white/90"
                        >
                            {copiado === "activar" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                        </button>
                    </div>
                    <p className="text-[11px] text-white/40">
                        Qué hace: impide cualquier reposo, incluso con la tapa cerrada. Por qué: para usarla como
                        servidor días seguidos con la tapa cerrada. Cómo: se pega en la Terminal y pide la
                        contraseña de la Mac una sola vez.
                    </p>
                    <div className="flex items-center gap-2 rounded-md bg-black/30 px-2 py-1.5">
                        <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-white/80">
                            sudo pmset -a disablesleep 0
                        </code>
                        <button
                            type="button"
                            onClick={() => void copiar("sudo pmset -a disablesleep 0", "desactivar")}
                            aria-label="Copiar sudo pmset -a disablesleep 0"
                            className="shrink-0 cursor-pointer rounded p-1.5 text-white/50 transition-colors duration-150 hover:bg-white/10 hover:text-white/90"
                        >
                            {copiado === "desactivar" ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
                        </button>
                    </div>
                    <p className="text-[11px] text-white/40">Así se deshace, y la Mac vuelve a dormirse como siempre.</p>
                    <p className={energia.reposoDesactivado ? "text-emerald-300" : "text-white/40"}>
                        Estado actual: {energia.reposoDesactivado ? "el reposo está desactivado del todo." : "el reposo normal de macOS sigue activo."}
                    </p>
                </CollapsibleContent>
            </Collapsible>

            {mensaje && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-300/90">
                    <Check className="h-3 w-3 shrink-0" aria-hidden />
                    {mensaje}
                </p>
            )}
            {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-300/90">
                    <X className="h-3 w-3 shrink-0" aria-hidden />
                    {error}
                </p>
            )}
        </section>
    );
}

// ── b) Astraura 1.58 · capa nube ─────────────────────────────────────────────

function SeccionNube({ estado, alCambiar }: { estado: EstadoServidorAstraura; alCambiar: () => void }) {
    const a = estado.astraura;
    const n = estado.nube;
    const [reiniciando, setReiniciando] = useState(false);
    const [mensaje, setMensaje] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const reiniciarAstraura = useCallback(async () => {
        const usoS = a.bitnet?.ultimoUsoInteractivoHaceS ?? null;
        const usoReciente = usoS !== null && usoS < 300;
        const aviso = usoReciente ? `Alguien usó el chat hace ${Math.round(usoS)} s: reiniciar corta esa respuesta.\n\n` : "";
        if (!window.confirm(`${aviso}¿Reiniciar Astraura 1.58 (backend)?`)) return;
        setReiniciando(true);
        setError(null);
        setMensaje(null);
        try {
            const d = await postAccion({ accion: "reiniciar", servicio: "astraura" });
            setMensaje(typeof d.detalle === "string" ? d.detalle : "Astraura reiniciada.");
            alCambiar();
        } catch (e) {
            setError(e instanceof Error ? e.message : "No se pudo reiniciar Astraura.");
        } finally {
            setReiniciando(false);
        }
    }, [a.bitnet, alCambiar]);

    const bitnetTexto = a.bitnet
        ? `${a.bitnet.vivo ? "Vivo" : a.bitnet.dormido ? "Dormido" : "Apagado"}${
              a.bitnet.ultimoUsoInteractivoHaceS !== null
                  ? ` · último uso interactivo hace ${formatoDuracion(a.bitnet.ultimoUsoInteractivoHaceS)}`
                  : ""
          }`
        : "no disponible en esta máquina";

    return (
        <section className="mc-cristal space-y-3 p-4">
            <header className="flex items-center gap-2">
                <Cloud className="h-4 w-4 text-sky-300" aria-hidden />
                <h3 className="text-sm font-semibold text-white">Astraura 1.58 · capa nube</h3>
            </header>

            <ul className="space-y-2 text-xs">
                <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-white/70">
                        <Punto ok={a.backend.ok} /> Backend
                    </span>
                    <span className="font-mono text-white/50">{a.backend.ok ? formatoLatencia(a.backend.ms) : "no responde"}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-white/70">
                        <Punto ok={a.bitnet ? Boolean(a.bitnet.vivo) : null} /> BitNet
                    </span>
                    <span className="text-right text-white/50">{bitnetTexto}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-white/70">
                        <Punto ok={a.llama.ok} /> Motor BitNet (llama)
                    </span>
                    <span className="text-white/50">{a.llama.ok ? "vivo" : "no responde"}</span>
                </li>
                <li className="flex items-center justify-between gap-2">
                    <span className="text-white/70">Fondo</span>
                    <span className="text-right text-white/50">
                        {a.fondo
                            ? `ciclo ${typeof a.fondo.ciclo === "number" ? Math.round(a.fondo.ciclo * 100) : "—"} % · descansa ${a.fondo.descansaS ?? "—"} s · aplazadas ${
                                  a.fondo.aplazadasPresupuesto ?? 0
                              } / cedidas ${a.fondo.cedidasAlChat ?? 0}`
                            : "no disponible"}
                    </span>
                </li>
                <li>
                    <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-2 text-white/70">
                            <Punto ok={n.tunelActivo || null} /> Túnel
                        </span>
                        <span className="font-mono text-white/50">{n.huella ? `${n.huella}…` : "—"}</span>
                    </div>
                    <p className="mt-1 text-[11px] text-white/50">
                        {n.tunelActivo ? `Activo${n.proveedor ? ` · ${n.proveedor}` : ""}` : "Sin túnel activo en esta Mac"}
                        {n.coincide !== null && (
                            <span className={`ml-1 inline-flex items-center gap-1 ${n.coincide ? "text-emerald-300" : "text-amber-300"}`}>
                                · Publicado en la capa nube: {n.coincide ? <Check className="h-3 w-3" aria-hidden /> : <X className="h-3 w-3" aria-hidden />}
                                {n.coincide ? "coincide" : "no coincide"}
                            </span>
                        )}
                    </p>
                </li>
                <li className="flex items-center justify-between gap-2">
                    <span className="text-white/70">Destino de la capa nube</span>
                    <span className="text-white/50">
                        {n.destino === "esta-mac-tunel"
                            ? "Esta Mac, por túnel"
                            : n.destino === "servidor-fijo"
                              ? "Servidor fijo del registro"
                              : "Despliegue propio"}
                    </span>
                </li>
            </ul>

            <button
                type="button"
                onClick={() => void reiniciarAstraura()}
                disabled={reiniciando}
                className="mc-alzar inline-flex min-h-[36px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white/80 transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <RotateCw className={`h-3.5 w-3.5 ${reiniciando ? "animate-spin" : ""}`} aria-hidden />
                Reiniciar Astraura
            </button>

            {mensaje && (
                <p className="flex items-center gap-1.5 text-xs text-emerald-300/90">
                    <Check className="h-3 w-3 shrink-0" aria-hidden />
                    {mensaje}
                </p>
            )}
            {error && (
                <p className="flex items-center gap-1.5 text-xs text-red-300/90">
                    <X className="h-3 w-3 shrink-0" aria-hidden />
                    {error}
                </p>
            )}
        </section>
    );
}

// ── c) Procesos de Genesis ──────────────────────────────────────────

function SeccionServicios({ estado, alCambiar }: { estado: EstadoServidorAstraura; alCambiar: () => void }) {
    const [reiniciandoEtiqueta, setReiniciandoEtiqueta] = useState<string | null>(null);
    const [mensajes, setMensajes] = useState<Record<string, string>>({});
    const [errores, setErrores] = useState<Record<string, string>>({});

    const reiniciar = useCallback(
        async (etiqueta: string) => {
            const nombre = NOMBRES_SERVICIOS[etiqueta] ?? etiqueta;
            if (!window.confirm(`¿Reiniciar «${nombre}»?`)) return;
            setReiniciandoEtiqueta(etiqueta);
            try {
                const d = await postAccion({ accion: "reiniciar", servicio: etiqueta });
                setMensajes((p) => ({ ...p, [etiqueta]: typeof d.detalle === "string" ? d.detalle : "Reiniciado." }));
                setErrores((p) => {
                    const n = { ...p };
                    delete n[etiqueta];
                    return n;
                });
                alCambiar();
            } catch (e) {
                setErrores((p) => ({ ...p, [etiqueta]: e instanceof Error ? e.message : "No se pudo reiniciar." }));
            } finally {
                setReiniciandoEtiqueta(null);
            }
        },
        [alCambiar],
    );

    return (
        <section className="mc-cristal space-y-3 p-4">
            <header className="flex items-center gap-2">
                <Cpu className="h-4 w-4 text-violet-300" aria-hidden />
                <h3 className="text-sm font-semibold text-white">Procesos de Genesis</h3>
            </header>

            {estado.servicios.length === 0 ? (
                <p className="text-xs text-white/50">Sin servicios `com.starseed.*` visibles en esta máquina.</p>
            ) : (
                <ul className="space-y-1.5">
                    {estado.servicios.map((s) => (
                        <li key={s.etiqueta} className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className={`h-2 w-2 shrink-0 rounded-full ${s.pid !== null ? "bg-emerald-400" : "bg-zinc-500"}`} aria-hidden />
                                <span className="min-w-0 flex-1 truncate text-white/80">{NOMBRES_SERVICIOS[s.etiqueta] ?? s.etiqueta}</span>
                                <span className="shrink-0 text-white/50">
                                    {s.pid !== null ? `pid ${s.pid}` : s.ultimaSalida !== null ? `detenido · salida ${s.ultimaSalida}` : "detenido"}
                                </span>
                                {s.reiniciable && (
                                    <button
                                        type="button"
                                        onClick={() => void reiniciar(s.etiqueta)}
                                        disabled={reiniciandoEtiqueta === s.etiqueta}
                                        className="mc-alzar inline-flex min-h-[36px] shrink-0 cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-[11px] text-white/70 transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        <RotateCw className={`h-3 w-3 ${reiniciandoEtiqueta === s.etiqueta ? "animate-spin" : ""}`} aria-hidden />
                                        Reiniciar
                                    </button>
                                )}
                            </div>
                            {mensajes[s.etiqueta] && <p className="mt-1 text-[11px] text-emerald-300/90">{mensajes[s.etiqueta]}</p>}
                            {errores[s.etiqueta] && <p className="mt-1 text-[11px] text-red-300/90">{errores[s.etiqueta]}</p>}
                        </li>
                    ))}
                </ul>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/10 pt-2 text-xs text-white/60">
                <span className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${estado.enjambre.orquestadorVivo ? "bg-emerald-400" : "bg-zinc-500"}`} aria-hidden />
                    Enjambre: {estado.enjambre.orquestadorVivo ? "escribiendo" : "parado"}
                </span>
                <span>Tope del gobernador: {estado.enjambre.topeGobernador !== null ? `${estado.enjambre.topeGobernador} agentes` : "sin gobernador"}</span>
            </div>
        </section>
    );
}

// ── d) Servidores de Astraura ────────────────────────────────────────────────

function TarjetaEstaMac({ maquina }: { maquina: MaquinaEstado }) {
    return (
        <article className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
            <header className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                <h4 className="truncate text-sm font-semibold text-white">Esta Mac</h4>
            </header>
            <ul className="space-y-1 text-white/60">
                <li>
                    Host: <span className="font-mono text-white/80">{maquina.hostname || "—"}</span>
                </li>
                <li>En marcha: {formatoDuracion(maquina.uptimeS)}</li>
                <li>Carga: {maquina.loadavg.map((v) => v.toFixed(2)).join(" · ")}</li>
                <li>
                    RAM libre: {formatoMb(maquina.memLibreMb)} de {formatoMb(maquina.memTotalMb)}
                </li>
            </ul>
        </article>
    );
}

function TarjetaOraclePendiente() {
    const [estado, setEstado] = useState<{vinculada?: boolean; region?: string; limites?: {a1_ocpu?: number; a1_gb?: number; micro?: number}; instancias?: Array<{nombre: string; forma: string; ocpus: number; gb: number; estado: string; ip_publica: string}>; servicios?: Array<{nombre: string; url: string; ok: boolean; ms?: number | null; t?: number}>} | null>(null);
    const [cargando, setCargando] = useState(true);
    const [accionError, setAccionError] = useState<string | null>(null);

    const cargar = useCallback(async () => {
        setCargando(true);
        try {
            const r = await fetch("/api/mando/oracle", { cache: "no-store" });
            if (r.ok) setEstado(await r.json());
        } catch {
        } finally {
            setCargando(false);
        }
    }, []);

    useEffect(() => { void cargar(); }, [cargar]);

    const postAccionOracle = useCallback(async (accion: "comprobar" | "vincular") => {
        setAccionError(null);
        try {
            const r = await fetch("/api/mando/oracle", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion }) });
            if (!r.ok) throw new Error("Error");
            await cargar();
        } catch {
            setAccionError("No se pudo ejecutar la acción.");
        }
    }, [cargar]);

    const vinculada = estado?.vinculada === true;

    if (cargando) {
        return (
            <article className="min-w-0 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-3 text-xs">
                <header className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-zinc-500" aria-hidden />
                    <h4 className="truncate text-sm font-semibold text-white">Oracle Always Free</h4>
                </header>
                <p className="text-white/60">Cargando…</p>
            </article>
        );
    }

    if (!vinculada) {
        return (
            <article className="min-w-0 rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-3 text-xs">
                <header className="mb-2 flex items-center gap-2">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-500" aria-hidden />
                    <h4 className="truncate text-sm font-semibold text-white">Oracle Always Free</h4>
                </header>
                <dl className="space-y-1.5 text-white/60">
                    <div>
                        <dt className="inline font-medium text-white/70">Qué: </dt>
                        <dd className="inline">un servidor gratis para siempre en la nube de Oracle, que no depende de que esta Mac esté encendida.</dd>
                    </div>
                    <div>
                        <dt className="inline font-medium text-white/70">Por qué: </dt>
                        <dd className="inline">para que la capa nube de Astraura y los agentes de Genesis sigan funcionando aunque apagues la Mac.</dd>
                    </div>
                    <div>
                        <dt className="inline font-medium text-white/70">Cómo: </dt>
                        <dd className="inline">creas la cuenta gratis y luego lo añades aquí abajo, para enlazarlo como destino de la capa nube y réplica de Genesis.</dd>
                    </div>
                </dl>
                <a
                    href="https://www.oracle.com/cloud/free/"
                    target="_blank"
                    rel="noreferrer"
                    className="mc-alzar mt-2 inline-flex min-h-[36px] items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1.5 text-[11px] text-emerald-200 transition-colors duration-200 hover:bg-white/10"
                >
                    Crear cuenta en Oracle Cloud <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
                <p className="mt-2 text-[11px] text-white/40">
                    La sincronización con Oracle ya está preparada aquí (registro + sonda): se conecta en cuanto exista el servidor.
                </p>
            </article>
        );
    }

    const limites = estado?.limites ?? {};
    const instancias = estado?.instancias ?? [];
    const servicios = estado?.servicios ?? [];

    return (
        <article className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3 text-xs" aria-label={estado ? resumenOracle(estado as any) : undefined}>
            <header className="mb-2 flex items-center gap-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" aria-hidden />
                <h4 className="truncate text-sm font-semibold text-white">Oracle Always Free</h4>
            </header>
            <div className="space-y-2 text-white/70">
                <p>Región: <span className="text-white/90">{estado?.region || "—"}</span></p>
                <p>Límites: A1 {limites.a1_ocpu ?? 0} OCPU / {limites.a1_gb ?? 0} GB · micro {limites.micro ?? 0}</p>
                <div>
                    <p className="font-medium text-white/80">Máquinas</p>
                    <ul className="mt-1 space-y-1">
                        {instancias.map((i) => (
                            <li key={i.nombre} className="flex items-center gap-2">
                                <Punto ok={i.estado === "RUNNING"} />
                                <span className="truncate">{i.nombre} · {i.forma} · {i.ocpus} OCPU · {i.gb} GB · {i.estado}</span>
                            </li>
                        ))}
                        {instancias.length === 0 && <li className="text-white/50">Sin máquinas registradas.</li>}
                    </ul>
                </div>
                <div>
                    <p className="font-medium text-white/80">Servicios</p>
                    <ul className="mt-1 space-y-1">
                        {servicios.map((s) => (
                            <li key={s.nombre} className="flex items-center gap-2">
                                <Punto ok={s.ok} />
                                <span className="truncate">{s.nombre} · {s.ok ? `${s.ms ?? "—"} ms` : "no responde"}</span>
                            </li>
                        ))}
                        {servicios.length === 0 && <li className="text-white/50">Sin servicios.</li>}
                    </ul>
                </div>
            </div>
            <div className="mt-3 flex gap-2">
                <button
                    type="button"
                    onClick={() => void postAccionOracle("comprobar")}
                    className="mc-alzar inline-flex min-h-[36px] flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/80 hover:bg-white/10"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden /> Comprobar
                </button>
                <button
                    type="button"
                    onClick={() => void postAccionOracle("vincular")}
                    className="mc-alzar inline-flex min-h-[36px] flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-white/80 hover:bg-white/10"
                >
                    Vincular de nuevo
                </button>
            </div>
            {accionError && <p className="mt-2 text-[11px] text-red-300/90">{accionError}</p>}
        </article>
    );
}

function TarjetaServidorRegistrado({
    servidor,
    sondeando,
    quitando,
    alSondear,
    alQuitar,
}: {
    servidor: ServidorRegistrado;
    sondeando: boolean;
    quitando: boolean;
    alSondear: () => void;
    alQuitar: () => void;
}) {
    const sonda = servidor.ultimaSonda;
    return (
        <article className="min-w-0 rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
            <header className="mb-2 flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${sonda ? (sonda.ok ? "bg-emerald-400" : "bg-red-400") : "bg-zinc-500"}`} aria-hidden />
                    <h4 className="truncate text-sm font-semibold text-white">{servidor.nombre}</h4>
                </div>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-white/40">{servidor.tipo}</span>
            </header>
            <p className="truncate font-mono text-[11px] text-white/60">{servidor.url}</p>
            {sonda && (
                <p className="mt-1 text-[11px] text-white/50">
                    {sonda.ok ? `Responde · ${formatoLatencia(sonda.ms)}` : sonda.detalle} · {sonda.t ? new Date(sonda.t).toLocaleTimeString() : ""}
                </p>
            )}
            <div className="mt-2 flex gap-2">
                <button
                    type="button"
                    onClick={alSondear}
                    disabled={sondeando}
                    className="mc-alzar inline-flex min-h-[36px] flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-white/10 px-2 py-1.5 text-[11px] text-white/70 transition-colors duration-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Radio className={`h-3 w-3 ${sondeando ? "animate-pulse" : ""}`} aria-hidden />
                    Sondear
                </button>
                <button
                    type="button"
                    onClick={alQuitar}
                    disabled={quitando}
                    className="mc-alzar inline-flex min-h-[36px] flex-1 cursor-pointer items-center justify-center gap-1 rounded-md border border-red-400/20 px-2 py-1.5 text-[11px] text-red-300/80 transition-colors duration-200 hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Trash2 className="h-3 w-3" aria-hidden />
                    Quitar
                </button>
            </div>
        </article>
    );
}

function FormularioAgregar({ agregando, error, alAgregar }: { agregando: boolean; error: string | null; alAgregar: (nombre: string, tipo: TipoServidor, url: string) => void }) {
    const [nombre, setNombre] = useState("");
    const [tipo, setTipo] = useState<TipoServidor>("oracle");
    const [url, setUrl] = useState("");

    const enviar = (e: React.FormEvent) => {
        e.preventDefault();
        alAgregar(nombre, tipo, url);
    };

    return (
        <form onSubmit={enviar} className="min-w-0 space-y-2 rounded-xl border border-white/10 bg-black/20 p-3 text-xs">
            <h4 className="text-sm font-semibold text-white">Añadir servidor</h4>
            <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre"
                required
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
            />
            <select
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoServidor)}
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
            >
                <option value="oracle">Oracle</option>
                <option value="vps">VPS</option>
                <option value="otro">Otro</option>
            </select>
            <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://…"
                required
                className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-2 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-1 focus:ring-emerald-400/50"
            />
            <button
                type="submit"
                disabled={agregando}
                className="mc-alzar inline-flex min-h-[36px] w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-200 transition-colors duration-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Añadir
            </button>
            {error && <p className="text-[11px] text-red-300/90">{error}</p>}
        </form>
    );
}

function SeccionServidores({ estado, alCambiar }: { estado: EstadoServidorAstraura; alCambiar: () => void }) {
    const [sondeandoId, setSondeandoId] = useState<string | null>(null);
    const [quitandoId, setQuitandoId] = useState<string | null>(null);
    const [erroragregar, setErrorAgregar] = useState<string | null>(null);
    const [agregando, setAgregando] = useState(false);

    const agregar = useCallback(
        async (nombre: string, tipo: TipoServidor, url: string) => {
            setAgregando(true);
            setErrorAgregar(null);
            try {
                await postAccion({ accion: "servidor_agregar", nombre, tipo, url });
                alCambiar();
            } catch (e) {
                setErrorAgregar(e instanceof Error ? e.message : "No se pudo añadir el servidor.");
            } finally {
                setAgregando(false);
            }
        },
        [alCambiar],
    );

    const sondear = useCallback(
        async (id: string) => {
            setSondeandoId(id);
            try {
                await postAccion({ accion: "servidor_sondear", id });
                alCambiar();
            } catch {
                // El resultado de la sonda ya queda registrado en la tarjeta al recargar; un fallo de red aquí no bloquea nada.
            } finally {
                setSondeandoId(null);
            }
        },
        [alCambiar],
    );

    const quitar = useCallback(
        async (id: string, nombre: string) => {
            if (!window.confirm(`¿Quitar «${nombre}» del registro?`)) return;
            setQuitandoId(id);
            try {
                await postAccion({ accion: "servidor_quitar", id });
                alCambiar();
            } finally {
                setQuitandoId(null);
            }
        },
        [alCambiar],
    );

    return (
        <section className="mc-cristal space-y-3 p-4">
            <header className="flex items-center gap-2">
                <Server className="h-4 w-4 text-amber-300" aria-hidden />
                <h3 className="text-sm font-semibold text-white">Servidores de Astraura</h3>
            </header>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {estado.servidores.map((s: EntradaServidor) => {
                    if (s.tipo === "esta-mac") return <TarjetaEstaMac key={s.id} maquina={estado.maquina} />;
                    if (esServidorPendiente(s)) return <TarjetaOraclePendiente key={s.id} />;
                    return (
                        <TarjetaServidorRegistrado
                            key={s.id}
                            servidor={s}
                            sondeando={sondeandoId === s.id}
                            quitando={quitandoId === s.id}
                            alSondear={() => void sondear(s.id)}
                            alQuitar={() => void quitar(s.id, s.nombre)}
                        />
                    );
                })}
                <FormularioAgregar agregando={agregando} error={erroragregar} alAgregar={(nombre, tipo, url) => void agregar(nombre, tipo, url)} />
            </div>
        </section>
    );
}

// ── Panel principal ───────────────────────────────────────────────────────────

export function PanelServidor() {
    const [estado, setEstado] = useState<EstadoServidorAstraura | null>(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const vivoRef = useRef(true);

    useEffect(
        () => () => {
            vivoRef.current = false;
        },
        [],
    );

    const cargar = useCallback(async (forzar = false) => {
        if (!forzar && document.visibilityState === "hidden") return;
        if (forzar) setCargando(true);
        setError(null);
        try {
            const r = await fetch("/api/mando/servidor", { cache: "no-store" });
            if (!vivoRef.current) return;
            if (!r.ok) {
                setError(
                    r.status === 404
                        ? "Este panel solo funciona en Genesis local (404 en producción)."
                        : r.status === 401
                          ? "Necesitas iniciar sesión para ver el servidor."
                          : `No se pudo leer el estado del servidor (HTTP ${r.status}).`,
                );
                setEstado(null);
                return;
            }
            setEstado((await r.json()) as EstadoServidorAstraura);
        } catch {
            if (vivoRef.current) setError("No se pudo hablar con Genesis.");
        } finally {
            if (vivoRef.current) setCargando(false);
        }
    }, []);

    useEffect(() => {
        void cargar(true);
        const cada = window.setInterval(() => void cargar(), 15_000);
        const alVolver = () => {
            if (document.visibilityState === "visible") void cargar(true);
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            window.clearInterval(cada);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [cargar]);

    if (cargando && !estado) {
        return (
            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-4 text-sm text-white/60">
                <RefreshCw className="h-4 w-4 animate-spin" aria-hidden />
                Midiendo el servidor…
            </div>
        );
    }

    if (error) {
        return (
            <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100">
                {error}
                <button
                    type="button"
                    onClick={() => void cargar(true)}
                    className="ml-3 inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs hover:bg-white/5"
                >
                    <RefreshCw className="h-3 w-3" aria-hidden />
                    Reintentar
                </button>
            </div>
        );
    }

    if (!estado) return null;

    return (
        <section data-testid="panel-servidor" className="space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-white/60">Se refresca solo cada 15 segundos · medido {new Date(estado.t).toLocaleTimeString()}.</p>
                <button
                    type="button"
                    onClick={() => void cargar(true)}
                    disabled={cargando}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-xs text-white/70 hover:bg-white/5"
                >
                    <RefreshCw className={`h-3 w-3 ${cargando ? "animate-spin" : ""}`} aria-hidden />
                    Medir ahora
                </button>
            </header>

            {estado.avisos.length > 0 && <AvisosBox avisos={estado.avisos} />}

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <SeccionEnergia estado={estado} alCambiar={() => void cargar(true)} />
                <SeccionNube estado={estado} alCambiar={() => void cargar(true)} />
            </div>
            <SeccionServicios estado={estado} alCambiar={() => void cargar(true)} />
            <SeccionServidores estado={estado} alCambiar={() => void cargar(true)} />
        </section>
    );
}
