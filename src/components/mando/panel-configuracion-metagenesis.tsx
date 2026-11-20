"use client";

import { useCallback, useEffect, useState } from "react";
import {
    Activity,
    ArrowDown,
    ArrowUp,
    CheckCircle2,
    Cpu,
    Loader2,
    Palette,
    Radio,
    RefreshCw,
    Save,
    Server,
    ShieldCheck,
    SlidersHorizontal,
    Terminal,
} from "lucide-react";
import { AjustesDirector } from "@/components/mando/ajustes-director";
import { MetaGenesisAccesos } from "@/components/mando/metagenesis-accesos";
import { PanelAjustes } from "@/components/mando/panel-ajustes";
import { TunelMetaGenesisEstado } from "@/components/mando/tunel-metagenesis-estado";
import { SelectorColorSeleccion } from "@/components/seleccion/selector-color-seleccion";
import {
    DEFAULTS_PRESIDENTE,
    FUENTES_REGISTRO_HEADLESS,
    validarConfigPresidente,
    type AccionHeadlessPresidente,
    type ConfigPresidente,
    type EstadoPresidenteRespuesta,
    type FuenteRegistroHeadless,
    type ProveedorPresidenteId,
} from "@/lib/mando/presidente-config";

type SeccionConfigId =
    | "presidente"
    | "canales"
    | "headless"
    | "seleccion"
    | "enjambre"
    | "vigilante"
    | "accesos";

const SECCIONES: { id: SeccionConfigId; titulo: string; icono: React.ReactNode }[] = [
    { id: "presidente", titulo: "Director presidente", icono: <Activity className="h-3.5 w-3.5" aria-hidden /> },
    { id: "canales", titulo: "Canales unificados", icono: <Radio className="h-3.5 w-3.5" aria-hidden /> },
    { id: "headless", titulo: "Headless y registros", icono: <Terminal className="h-3.5 w-3.5" aria-hidden /> },
    { id: "seleccion", titulo: "Selección compartida", icono: <Palette className="h-3.5 w-3.5" aria-hidden /> },
    { id: "enjambre", titulo: "Enjambre y flota", icono: <Cpu className="h-3.5 w-3.5" aria-hidden /> },
    { id: "vigilante", titulo: "Vigilante y escala", icono: <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> },
    { id: "accesos", titulo: "Accesos y túnel", icono: <ShieldCheck className="h-3.5 w-3.5" aria-hidden /> },
];

const ETIQUETA_PROVEEDOR: Record<ProveedorPresidenteId, string> = {
    claude: "Claude (Mac / Cowork)",
    hermes: "Hermes (Gateway + CLI)",
    agy: "Antigravity (agy headless)",
    chatgpt: "ChatGPT / Codex CLI",
};

/**
 * Centro unificado de configuración y operación autónoma headless de MetaGenesis.
 * Organiza en 7 subsecciones claras el control completo sin depender de apps GUI.
 */
export function PanelConfiguracionMetaGenesis() {
    const [seccion, setSeccion] = useState<SeccionConfigId>("presidente");
    const [estado, setEstado] = useState<EstadoPresidenteRespuesta | null>(null);
    const [cfg, setCfg] = useState<ConfigPresidente>(DEFAULTS_PRESIDENTE);
    const [timeoutsTexto, setTimeoutsTexto] = useState("120, 300, 600");
    const [fuenteRegistro, setFuenteRegistro] = useState<FuenteRegistroHeadless>("cartero");
    const [lineasRegistro, setLineasRegistro] = useState<string[]>([]);
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [accionActiva, setAccionActiva] = useState<AccionHeadlessPresidente | null>(null);
    const [aviso, setAviso] = useState<string | null>(null);
    const [salidaHeadless, setSalidaHeadless] = useState<string | null>(null);

    const cargar = useCallback(
        async (fuente = fuenteRegistro) => {
            try {
                const res = await fetch(
                    `/api/mando/director/presidente?registro=${encodeURIComponent(fuente)}&lineas=50`,
                    { cache: "no-store" },
                );
                if (!res.ok) return;
                const d = (await res.json()) as EstadoPresidenteRespuesta;
                setEstado(d);
                setCfg(d.config);
                setTimeoutsTexto(d.config.timeouts_reintento_s.join(", "));
                if (d.registro?.lineas) setLineasRegistro(d.registro.lineas);
            } catch {
                setAviso("No se pudo leer el estado del Director presidente.");
            } finally {
                setCargando(false);
            }
        },
        [fuenteRegistro],
    );

    useEffect(() => {
        void cargar();
    }, [cargar]);

    const cambiarRegistro = (nueva: FuenteRegistroHeadless) => {
        setFuenteRegistro(nueva);
        void cargar(nueva);
    };

    const moverProveedor = (idx: number, delta: -1 | 1) => {
        const destino = idx + delta;
        if (destino < 0 || destino >= cfg.orden_proveedores.length) return;
        const copia = [...cfg.orden_proveedores];
        const [item] = copia.splice(idx, 1);
        copia.splice(destino, 0, item);
        setCfg((prev) => ({ ...prev, orden_proveedores: copia }));
    };

    const guardarPresidente = async () => {
        const timeouts = timeoutsTexto
            .split(",")
            .map((x) => Number.parseInt(x.trim(), 10))
            .filter((n) => Number.isFinite(n));
        const candidato = { ...cfg, timeouts_reintento_s: timeouts };
        const validado = validarConfigPresidente(candidato);
        if (!validado.ok) {
            setAviso(validado.errores.join(" · "));
            return;
        }
        setGuardando(true);
        setAviso(null);
        try {
            const res = await fetch("/api/mando/director/presidente", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(validado.valor),
            });
            const d = (await res.json()) as { ok?: boolean; config?: ConfigPresidente; errores?: string[] };
            if (res.ok && d.ok) {
                if (d.config) setCfg(d.config);
                setAviso("Configuración del Director presidente guardada y activa en vivo.");
                void cargar();
            } else {
                setAviso(d.errores?.join(" · ") ?? "No se pudo guardar la configuración.");
            }
        } catch {
            setAviso("Error de red al guardar la configuración.");
        } finally {
            setGuardando(false);
        }
    };

    const correrAccion = async (accion: AccionHeadlessPresidente, mensaje?: string) => {
        setAccionActiva(accion);
        setSalidaHeadless(null);
        try {
            const res = await fetch("/api/mando/director/presidente", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ accion, ...(mensaje ? { mensaje } : {}) }),
            });
            const d = (await res.json()) as { ok?: boolean; salida?: string; error?: string };
            setSalidaHeadless(d.salida ?? d.error ?? "Operación completada.");
            void cargar();
        } catch {
            setSalidaHeadless("Error al ejecutar la operación headless.");
        } finally {
            setAccionActiva(null);
        }
    };

    return (
        <div className="flex flex-col gap-4 text-xs text-slate-100" data-testid="panel-configuracion-metagenesis">
            <nav
                aria-label="Secciones de configuración de MetaGenesis"
                className="flex flex-wrap gap-1.5 border-b border-white/10 pb-3"
            >
                {SECCIONES.map((s) => (
                    <button
                        key={s.id}
                        type="button"
                        onClick={() => setSeccion(s.id)}
                        aria-pressed={seccion === s.id}
                        data-testid={`config-tab-${s.id}`}
                        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[11px] font-medium transition-colors ${
                            seccion === s.id
                                ? "border-sky-400/60 bg-sky-500/20 text-sky-50"
                                : "border-white/10 bg-white/[0.03] text-slate-300 hover:border-white/25 hover:text-white"
                        }`}
                    >
                        {s.icono}
                        {s.titulo}
                    </button>
                ))}
            </nav>

            {aviso ? (
                <p
                    role="status"
                    className="flex items-center gap-2 rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-2 text-[11px] text-sky-100"
                >
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden />
                    {aviso}
                </p>
            ) : null}

            {seccion === "presidente" ? (
                <div className="grid gap-4 lg:grid-cols-2">
                    <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0A0F1D]/85 p-4">
                        <header className="flex items-center justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-white">
                                    Enrutamiento autónomo y timeouts
                                </h3>
                                <p className="text-[11px] text-slate-400">
                                    Controla el orden real de cascada y el respaldo HTTP gratuito sin depender de ninguna app gráfica.
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={guardando || cargando}
                                onClick={() => void guardarPresidente()}
                                data-testid="guardar-presidente-btn"
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
                            >
                                {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Save className="h-3.5 w-3.5" aria-hidden />}
                                Guardar
                            </button>
                        </header>

                        <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-medium text-slate-300">
                                Orden de prioridad de directores
                            </span>
                            {cfg.orden_proveedores.map((p, idx) => (
                                <div
                                    key={p}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                                >
                                    <label className="flex flex-1 cursor-pointer items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={cfg.proveedores_activos[p]}
                                            onChange={(e) =>
                                                setCfg((prev) => ({
                                                    ...prev,
                                                    proveedores_activos: {
                                                        ...prev.proveedores_activos,
                                                        [p]: e.target.checked,
                                                    },
                                                }))
                                            }
                                            className="h-3.5 w-3.5 cursor-pointer accent-sky-500"
                                        />
                                        <span className="font-medium text-slate-100">
                                            {idx + 1}. {ETIQUETA_PROVEEDOR[p]}
                                        </span>
                                    </label>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            disabled={idx === 0}
                                            onClick={() => moverProveedor(idx, -1)}
                                            aria-label={`Subir ${p}`}
                                            className="cursor-pointer rounded border border-white/10 p-1 text-slate-300 hover:border-white/30 disabled:opacity-30"
                                        >
                                            <ArrowUp className="h-3 w-3" aria-hidden />
                                        </button>
                                        <button
                                            type="button"
                                            disabled={idx === cfg.orden_proveedores.length - 1}
                                            onClick={() => moverProveedor(idx, 1)}
                                            aria-label={`Bajar ${p}`}
                                            className="cursor-pointer rounded border border-white/10 p-1 text-slate-300 hover:border-white/30 disabled:opacity-30"
                                        >
                                            <ArrowDown className="h-3 w-3" aria-hidden />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2">
                            <label className="flex flex-col gap-1">
                                <span className="text-[11px] text-slate-300">Timeouts progresivos (segundos)</span>
                                <input
                                    type="text"
                                    value={timeoutsTexto}
                                    onChange={(e) => setTimeoutsTexto(e.target.value)}
                                    className="rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                                />
                            </label>
                            <label className="flex flex-col gap-1">
                                <span className="text-[11px] text-slate-300">Tope Opus diario (decisiones)</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={200}
                                    value={cfg.max_opus_dia}
                                    onChange={(e) =>
                                        setCfg((prev) => ({
                                            ...prev,
                                            max_opus_dia: Number.parseInt(e.target.value || "0", 10),
                                        }))
                                    }
                                    className="rounded-lg border border-white/15 bg-black/40 px-2.5 py-1.5 text-xs text-white focus:border-sky-400 focus:outline-none"
                                />
                            </label>
                        </div>

                        <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
                            <input
                                type="checkbox"
                                checked={cfg.respaldo_flota_gratis}
                                onChange={(e) =>
                                    setCfg((prev) => ({
                                        ...prev,
                                        respaldo_flota_gratis: e.target.checked,
                                    }))
                                }
                                className="h-4 w-4 cursor-pointer accent-emerald-500"
                            />
                            <span className="text-[11px] text-emerald-100">
                                Activar respaldo automático con flota HTTP gratuita (Google, Groq, NVIDIA, FreeLLMAPI, Neurona local) cuando todas las CLI fallen o agoten cuota
                            </span>
                        </label>
                    </section>

                    <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0A0F1D]/85 p-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold text-white">Salud en vivo de motores y pasarelas</h3>
                            <button
                                type="button"
                                onClick={() => void cargar()}
                                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 hover:border-white/30"
                            >
                                <RefreshCw className="h-3 w-3" aria-hidden />
                                Releer
                            </button>
                        </div>

                        {estado ? (
                            <>
                                <ul className="space-y-1.5">
                                    {estado.proveedores.map((p) => (
                                        <li
                                            key={p.id}
                                            className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/25 px-3 py-2"
                                        >
                                            <div>
                                                <p className="font-medium text-white">{p.nombre}</p>
                                                <p className="text-[10px] text-slate-400">{p.detalle}</p>
                                            </div>
                                            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-slate-200">
                                                {p.estado}
                                            </span>
                                        </li>
                                    ))}
                                </ul>

                                <div className="border-t border-white/10 pt-2">
                                    <p className="mb-1.5 text-[11px] font-medium text-slate-300">
                                        Pasarelas de flota HTTP ({estado.flotaGratis.vivos}/{estado.flotaGratis.total} escriben)
                                    </p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {estado.flotaGratis.pasarelas.map((gw) => (
                                            <span
                                                key={gw.clave}
                                                className={`rounded-md border px-2 py-0.5 text-[10px] ${
                                                    gw.estado === "escribe"
                                                        ? "border-emerald-400/40 bg-emerald-500/10 text-emerald-200"
                                                        : "border-white/10 bg-black/30 text-slate-400"
                                                }`}
                                            >
                                                {gw.clave}: {gw.estado}
                                                {gw.segundos ? ` (${gw.segundos}s)` : ""}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            </>
                        ) : (
                            <p className="text-slate-400">Cargando diagnóstico…</p>
                        )}
                    </section>
                </div>
            ) : null}

            {seccion === "canales" ? (
                <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0A0F1D]/85 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-semibold text-white">
                                Espejo bidireccional de canales de dirección
                            </h3>
                            <p className="text-[11px] text-slate-400">
                                Los mensajes y respuestas de MetaGenesis, Astraura › Chats › Genesis, Telegram y Hermes viajan por el mismo hilo unificado.
                            </p>
                        </div>
                        <button
                            type="button"
                            disabled={guardando}
                            onClick={() => void guardarPresidente()}
                            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                        >
                            <Save className="h-3.5 w-3.5" aria-hidden />
                            Guardar canales
                        </button>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                        {(["hermes", "telegram", "astraura", "nube"] as const).map((k) => (
                            <label
                                key={k}
                                className="flex cursor-pointer items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-2"
                            >
                                <span className="font-medium capitalize text-white">{k}</span>
                                <input
                                    type="checkbox"
                                    checked={cfg.sincronizar_canales[k]}
                                    onChange={(e) =>
                                        setCfg((prev) => ({
                                            ...prev,
                                            sincronizar_canales: {
                                                ...prev.sincronizar_canales,
                                                [k]: e.target.checked,
                                            },
                                        }))
                                    }
                                    className="h-4 w-4 cursor-pointer accent-sky-500"
                                />
                            </label>
                        ))}
                    </div>

                    {estado ? (
                        <ul className="grid gap-2 sm:grid-cols-2">
                            {estado.canales.map((c) => (
                                <li
                                    key={c.id}
                                    className="flex items-center justify-between rounded-lg border border-white/10 bg-black/25 px-3 py-2"
                                >
                                    <div>
                                        <p className="font-medium text-white">{c.nombre}</p>
                                        <p className="text-[10px] text-slate-400">{c.detalle}</p>
                                    </div>
                                    <span className="rounded-full border border-sky-400/35 bg-sky-500/10 px-2 py-0.5 text-[10px] text-sky-100">
                                        {c.estado}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : null}
                </section>
            ) : null}

            {seccion === "headless" ? (
                <section className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#0A0F1D]/85 p-4">
                    <header className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                            <h3 className="text-sm font-semibold text-white">
                                Control headless en localhost y contenedores nube
                            </h3>
                            <p className="text-[11px] text-slate-400">
                                Opera el sistema completo desde MetaGenesis o la terminal (`starseed-puente`) sin tener Antigravity, Claude ni Hermes abiertos.
                            </p>
                        </div>
                        {estado?.pruebasResumen ? (
                            <span className="rounded-full border border-emerald-400/35 bg-emerald-500/10 px-2.5 py-1 text-[10px] text-emerald-200">
                                <Server className="mr-1 inline h-3 w-3" aria-hidden />
                                {estado.pruebasResumen}
                            </span>
                        ) : null}
                    </header>

                    <div className="flex flex-wrap gap-2">
                        {(
                            [
                                ["probar-presidente", "Probar Director presidente"],
                                ["reintentar-cola", "Reintentar cola"],
                                ["enrutar-hermes", "Reenrutar Hermes"],
                                ["buscar-capacidad", "Buscar capacidad en nube/Mac"],
                                ["comprobar-pasarelas", "Probar pasarelas"],
                                ["estado-pruebas", "Estado pruebas (.55/.56)"],
                                ["refrescar-acciones", "Actualizar «Te toca a ti»"],
                                ["sincronizar-ides", "Sincronizar contextos"],
                            ] as [AccionHeadlessPresidente, string][]
                        ).map(([acc, etiqueta]) => (
                            <button
                                key={acc}
                                type="button"
                                disabled={accionActiva !== null}
                                onClick={() => void correrAccion(acc)}
                                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-400/35 bg-sky-500/10 px-3 py-1.5 text-[11px] font-medium text-sky-100 hover:bg-sky-500/20 disabled:opacity-50"
                            >
                                {accionActiva === acc ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                ) : (
                                    <Terminal className="h-3.5 w-3.5" aria-hidden />
                                )}
                                {etiqueta}
                            </button>
                        ))}
                    </div>

                    {salidaHeadless ? (
                        <pre className="max-h-48 overflow-auto rounded-lg border border-emerald-400/30 bg-black/60 p-3 font-mono text-[11px] text-emerald-100 select-text">
                            {salidaHeadless}
                        </pre>
                    ) : null}

                    <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-semibold text-slate-200">
                                Registros en vivo saneados (claves redactadas)
                            </span>
                            <div className="flex items-center gap-2">
                                <select
                                    aria-label="Fuente de registro headless"
                                    value={fuenteRegistro}
                                    onChange={(e) => cambiarRegistro(e.target.value as FuenteRegistroHeadless)}
                                    className="cursor-pointer rounded-lg border border-white/15 bg-black/40 px-2.5 py-1 text-[11px] text-white"
                                >
                                    {FUENTES_REGISTRO_HEADLESS.map((f) => (
                                        <option key={f.id} value={f.id}>
                                            {f.etiqueta}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => void cargar(fuenteRegistro)}
                                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-slate-200 hover:border-white/30"
                                >
                                    <RefreshCw className="h-3 w-3" aria-hidden />
                                    Refrescar
                                </button>
                            </div>
                        </div>

                        <pre
                            data-testid="visor-registros-headless"
                            className="max-h-64 overflow-auto rounded-lg border border-white/10 bg-black/75 p-3 font-mono text-[10px] leading-relaxed text-slate-200 select-text"
                        >
                            {lineasRegistro.join("\n")}
                        </pre>
                    </div>
                </section>
            ) : null}

            {seccion === "seleccion" ? <SelectorColorSeleccion /> : null}
            {seccion === "enjambre" ? <PanelAjustes /> : null}
            {seccion === "vigilante" ? <AjustesDirector /> : null}
            {seccion === "accesos" ? (
                <div className="grid gap-4 lg:grid-cols-2">
                    <MetaGenesisAccesos />
                    <TunelMetaGenesisEstado />
                </div>
            ) : null}
        </div>
    );
}
