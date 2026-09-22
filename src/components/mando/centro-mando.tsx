"use client";

/**
 * Centro de Mando (Ola 231)
 * ─────────────────────────────────────────────────────────────────────────────
 * Consola de producción y desarrollo del StarSeed OS en esta máquina: de un
 * vistazo, el pulso del trabajo (ola activa, tareas en curso, commits sin
 * publicar, proveedores agotados) y, en pestañas, los paneles que lo detallan.
 *
 * Solo tiene sentido en local: las rutas `/api/mando/*` responden 404 en el
 * despliegue público. Si eso ocurre, el aviso lo dice claro.
 *
 * La última pestaña se recuerda en `localStorage` (`starseed.mando.pestana`)
 * y la barra de pestañas se puede recorrer con el teclado (flechas, como
 * marca Radix Tabs).
 */

import { marcarRitoActivo } from "@/lib/ui/rito-activo";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
    BrainCircuit,
    CircleDashed,
    CircleDollarSign,
    Clock3,
    Copy,
    ExternalLink,
    RefreshCw,
    ShieldAlert,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EstadoMando, ProveedorUso } from "@/lib/mando/tipos";
import { flotaConocida } from "@/lib/mando/flota";
import "@/components/mando/mando-cristal.css";
import { PanelMedidor, PastillaMedidor, type TonoMedidor } from "@/components/mando/medidor-abrible";
import { PanelIdes, PastillaIdes } from "@/components/mando/medidor-ides";
import { VerificarProcesos } from "@/components/mando/verificar-procesos";
import type { AccionMedidor, ClaveMedidor, DetalleMedidor, FilaMedidor } from "@/lib/mando/medidores";
import { PanelProcesos } from "@/components/mando/panel-procesos";
import { PanelGrafo } from "@/components/mando/panel-grafo";
import { PanelOlas } from "@/components/mando/panel-olas";
import { PanelFlota } from "@/components/mando/panel-flota";
import { ChatOrquestacion } from "@/components/mando/chat-orquestacion";
import { OrbeAsistente } from "@/components/mando/orbe-asistente";
import { escuchar as escucharAsistente } from "@/lib/mando/asistente-cliente";
import { PanelAreas } from "@/components/mando/panel-areas";
import { PanelContextos } from "@/components/mando/panel-contextos";
import { PanelEntornos } from "@/components/mando/panel-entornos";
import { PanelAjustes } from "@/components/mando/panel-ajustes";
import { PanelNeurona } from "@/components/mando/panel-neurona";
import { PanelAprendizaje } from "@/components/mando/panel-aprendizaje";
import { PanelPublicaciones } from "@/components/mando/panel-publicaciones";
import { PanelPublicacion } from "@/components/mando/panel-publicacion";
// Ola p323 · p323D: la pestaña «Reportes» monta la bandeja curada. La insignia
// de la pestaña consulta la misma API y compara contra el último «visto» en
// localStorage para avisar de críticos/altos sin abrirla.
import { PanelReportes } from "@/components/mando/panel-reportes";
import type { Reporte } from "@/lib/mando/reportes";
import { ControlDirectores } from "@/components/mando/control-directores";
import { AjustesDirector } from "@/components/mando/ajustes-director";
// Ola 272 · O3B (2026-09-07): la pestaña «Oficina 3D». El componente carga
// Three.js, así que entra con `next/dynamic` sin SSR y SOLO se monta al abrir
// la pestaña (dos barreras: el chunk no baja y el render no se ejecuta hasta que
// el usuario la pide, y el resto del Mando arranca igual de ligero que antes).
import dynamic from "next/dynamic";
const OficinaMando = dynamic(
    () => import("@/components/mando/oficina-mando").then((m) => m.OficinaMando),
    {
        ssr: false,
        loading: () => <p className="text-sm text-white/50">Cargando la oficina…</p>,
    },
);
// Ola 275 · V4 (2026-09-07): la pestaña «Voces» monta el Estudio de Voces dentro
// del Mando, y la Voz del Mando (provider + control en la cabecera) se cablea aquí
// UNA sola vez para que los anuncios hablados no se dupliquen.
import { PanelVoces } from "@/components/mando/panel-voces";
// Ola 285 · K3 (2026-09-08): la pestaña «Canales StarSeed» entra con carga
// diferida (`next/dynamic`, sin SSR) y SOLO se monta al abrirla, igual que la
// oficina y las voces: el panel pesa (editor, sembrado, listados) pero no
// debe costar nada al resto del Mando hasta que el usuario lo pide.
const PanelTaller = dynamic(
    () => import("@/components/mando/panel-taller").then((m) => m.PanelTaller),
    { ssr: false, loading: () => <p className="text-xs text-white/40">Cargando el taller…</p> },
);
const PanelCanales = dynamic(
    () => import("@/components/mando/panel-canales").then((m) => m.PanelCanales),
    {
        ssr: false,
        loading: () => <p className="text-sm text-white/50">Cargando los canales…</p>,
    },
);
// Ola 294 · AR4 (2026-09-08): la pestaña «Astra» (director de orquestación que
// audita y propone) también carga diferida y SOLO se monta al abrirla.
const PanelAstra = dynamic(
    () => import("@/components/mando/panel-astra").then((m) => m.PanelAstra),
    {
        ssr: false,
        loading: () => <p className="text-sm text-white/50">Cargando a Astra…</p>,
    },
);
import {
    ControlVozDelMando,
    VozMandoProvider,
    useVozDelMando,
    type EstadoVozMando,
} from "@/components/mando/voz-del-mando";
// Solo el tipo viaja al cliente: `neurona.ts` es código de servidor (sonda la
// máquina) y un import de valor metería `node:child_process` en el bundle web.
import type { SaludNeurona } from "@/lib/mando/neurona";
// Ídem para el almacenamiento: solo el tipo y los helpers puros de tono/texto
// (que no dependen de `node:*`) cruzan al cliente; las sondas quedan en servidor.
import type { EstadoAlmacenamiento } from "@/lib/mando/almacenamiento";
import { discoLibreTexto, tonoDiscoLibre } from "@/components/mando/tarjetas-almacenamiento";
import { contarTrabajoReal } from "@/lib/mando/conteo-operativo";
import type { PeriodoJev, RespuestaJev } from "@/lib/mando/jev-medidor";

const CLAVE_PESTANA = "starseed.mando.pestana";
const CLAVE_REPORTES_VISTOS = "starseed.mando.reportes.visto";

/**
 * Insignia de la pestaña Reportes (p323D): cuenta los críticos/altos con fecha
 * posterior al último «visto». Marcar como visto ocurre al ABRIR la pestaña
 * (que es cuando la bandeja de verdad se mira), no al cargar el Mando.
 */
function InsigniaReportes({ activa }: { activa: boolean }) {
    const [sinVer, setSinVer] = useState(0);

    useEffect(() => {
        if (!activa) return;
        localStorage.setItem(CLAVE_REPORTES_VISTOS, new Date().toISOString());
        setSinVer(0);
    }, [activa]);

    useEffect(() => {
        let vivo = true;
        const contar = async () => {
            try {
                const res = await fetch("/api/mando/reportes", { cache: "no-store" });
                if (!res.ok) return;
                const datos: unknown = await res.json();
                const lista: Reporte[] = Array.isArray(datos)
                    ? (datos as Reporte[])
                    : ((datos as { reportes?: Reporte[] }).reportes ?? []);
                const visto = localStorage.getItem(CLAVE_REPORTES_VISTOS) ?? "";
                const n = lista.filter(
                    (r) => (r.importancia === "critica" || r.importancia === "alta") && r.t > visto,
                ).length;
                if (vivo) setSinVer(n);
            } catch {
                // Sin insignia si la API local no responde: no es motivo de ruido.
            }
        };
        void contar();
        const id = setInterval(() => void contar(), 60_000);
        return () => {
            vivo = false;
            clearInterval(id);
        };
    }, []);

    if (sinVer <= 0) return null;
    return (
        <span
            aria-label={`${sinVer} reportes de alta importancia sin ver`}
            className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-rose-400/50 bg-rose-500/20 px-1 text-[10px] font-semibold text-rose-200"
        >
            {sinVer}
        </span>
    );
}

/**
 * Pestañas del Centro de Mando, AGRUPADAS por lo que vas a hacer (2026-09-15).
 *
 * Eran veinte en una fila corrida, ordenadas por cuándo se fueron añadiendo. Para
 * encontrar «Contextos» había que leerlas todas. Ahora van por familias y la barra
 * las separa visualmente: no se ha quitado ninguna, solo se han puesto donde se
 * buscan. `grupo` es únicamente para pintar la separación.
 */
const PESTANAS = [
    // Lo que está pasando ahora con el trabajo.
    { id: "procesos", etiqueta: "Procesos", grupo: "Trabajo" },
    { id: "director", etiqueta: "Director", grupo: "Trabajo" },
    { id: "olas", etiqueta: "Olas e informes", grupo: "Trabajo" },
    // Lo que sale de aquí hacia el repositorio.
    { id: "commits", etiqueta: "Commits pendientes", grupo: "Salida" },
    { id: "publicar", etiqueta: "Publicar", grupo: "Salida" },
    // Con qué se trabaja: modelos, memoria, voz, aprendizaje.
    { id: "flota", etiqueta: "Flota", grupo: "Infraestructura" },
    { id: "neurona", etiqueta: "Neurona", grupo: "Infraestructura" },
    { id: "voces", etiqueta: "Voces", grupo: "Infraestructura" },
    { id: "aprendizaje", etiqueta: "Aprendizaje", grupo: "Infraestructura" },
    // Cómo piensan y qué saben los agentes.
    { id: "astra", etiqueta: "Astra", grupo: "Agentes" },
    { id: "taller", etiqueta: "Taller del agente", grupo: "Agentes" },
    { id: "areas", etiqueta: "Áreas", grupo: "Agentes" },
    { id: "contextos", etiqueta: "Contextos", grupo: "Agentes" },
    { id: "entornos", etiqueta: "Entornos", grupo: "Agentes" },
    { id: "reportes", etiqueta: "Reportes", grupo: "Agentes" },
    { id: "chat", etiqueta: "Chat", grupo: "Agentes" },
    // Hacia fuera.
    { id: "canales", etiqueta: "Canales StarSeed", grupo: "Fuera" },
    { id: "oficina", etiqueta: "Oficina 3D", grupo: "Fuera" },
    // Configuración.
    { id: "ajustes_director", etiqueta: "Ajustes Director", grupo: "Ajustes" },
    { id: "ajustes", etiqueta: "Ajustes", grupo: "Ajustes" },
] as const;

type IdPestana = (typeof PESTANAS)[number]["id"];

/** Lee la pestaña inicial: primero `?pestana=` de la URL (p. ej. desde /voces), luego la última guardada. */
function pestanaInicial(): IdPestana {
    if (typeof window === "undefined") return "procesos";
    // La URL manda sobre el recuerdo: «Abrir en el Puente de Mando» desde /voces
    // debe aterrizar en la pestaña «Voces» aunque la última visita fuera otra.
    const deLaUrl = new URLSearchParams(window.location.search).get("pestana");
    if (deLaUrl && PESTANAS.some((p) => p.id === deLaUrl)) return deLaUrl as IdPestana;
    const guardada = window.localStorage.getItem(CLAVE_PESTANA);


    return (PESTANAS.some((p) => p.id === guardada) ? guardada : "procesos") as IdPestana;
}

/** Convierte el uso diario (`ProveedorUso[]`) en `Record<motor, total>`. */
function usoPorMotor(uso: ProveedorUso[]): Record<string, number> {
    const mapa: Record<string, number> = {};
    for (const entrada of uso) {
        const clave = entrada.proveedor.trim().toLowerCase();
        if (!clave) continue;
        mapa[clave] = (mapa[clave] ?? 0) + entrada.usado;
    }
    return mapa;
}

/** Una pastilla del pulso de la cabecera. */
function DatoPulso({
    titulo,
    valor,
    tono,
    detalle,
    alClic,
}: {
    titulo: string;
    valor: string;
    tono?: "normal" | "aviso" | "peligro" | "ok";
    /** Texto pequeño bajo el valor (y tooltip). */
    detalle?: string;
    /** Si se pasa, la pastilla es un botón accesible que ejecuta esta acción. */
    alClic?: () => void;
}) {
    const clase =
        tono === "peligro"
            ? "border-red-400/30 bg-red-500/10 text-red-200"
            : tono === "aviso"
              ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
              : tono === "ok"
                ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                : "border-white/10 bg-white/5 text-white/80";
    const contenido = (
        <>
            <span className="text-[11px] uppercase tracking-wide opacity-70">{titulo}</span>
            <span className="truncate text-left text-sm font-semibold">{valor}</span>
            {detalle ? <span className="truncate text-left text-[10px] opacity-60">{detalle}</span> : null}
        </>
    );
    if (alClic) {
        return (
            <li className="min-w-28">
                <button
                    type="button"
                    onClick={alClic}
                    title={detalle}
                    className={`flex w-full cursor-pointer flex-col gap-0.5 rounded-lg border px-3 py-2 text-left ${clase}`}
                >
                    {contenido}
                </button>
            </li>
        );
    }
    return (
        <li
            className={`flex min-w-28 flex-col gap-0.5 rounded-lg border px-3 py-2 ${clase}`}
            title={detalle}
        >
            {contenido}
        </li>
    );
}

interface AccionAlex {
    id: string;
    titulo: string;
    por_que: string;
    urgencia: "alta" | "media" | "baja";
    comando?: string;
    enlace?: string;
    por_que_no_lo_hago_yo: string;
    detalle?: string;
}

function PanelAccionesAlex({
    acciones,
    alCerrar,
}: {
    acciones: AccionAlex[];
    alCerrar: () => void;
}) {
    const urgenciaOrden: Record<string, number> = { alta: 0, media: 1, baja: 2 };
    const ordenadas = [...acciones].sort((a, b) => {
        const ua = urgenciaOrden[a.urgencia] ?? 9;
        const ub = urgenciaOrden[b.urgencia] ?? 9;
        if (ua !== ub) return ua - ub;
        return a.id.localeCompare(b.id);
    });

    const copiar = async (texto: string) => {
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
    };

    const tonoUrgencia: Record<string, string> = {
        alta: "text-rose-200",
        media: "text-amber-200",
        baja: "text-white/60",
    };

    return (
        <section
            role="region"
            aria-label="Acciones que esperan a Alex"
            className="mc-cristal mc-desplegar mt-2 w-full p-3"
        >
            <header className="mc-centrado flex flex-wrap items-baseline justify-center gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
                    Te toca a ti
                </h3>
                <span className="text-[11px] text-white/45">
                    {ordenadas.length} acción{ordenadas.length === 1 ? "" : "es"} pendiente{ordenadas.length === 1 ? "" : "s"}
                </span>
                <button
                    type="button"
                    onClick={alCerrar}
                    className="ml-2 cursor-pointer rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-white/50"
                >
                    Cerrar
                </button>
            </header>

            {ordenadas.length === 0 ? (
                <p className="mc-centrado mt-2 text-[11px] leading-relaxed text-white/45">
                    Nada que necesite a Alex ahora mismo. El sistema se arregla solo.
                </p>
            ) : (
                <ul className="mt-2 grid gap-1.5 md:grid-cols-2 xl:grid-cols-3">
                    {ordenadas.map((a) => (
                        <li
                            key={a.id}
                            className="rounded-lg border border-white/10 bg-black/25 p-2 text-left"
                        >
                            <p className="flex flex-wrap items-baseline gap-1.5">
                                <span className="font-mono text-[11px] text-cyan-200/90">{a.id}</span>
                                <span
                                    className={`rounded-full border border-white/10 px-1.5 text-[10px] ${tonoUrgencia[a.urgencia]}`}
                                >
                                    {a.urgencia}
                                </span>
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/80">
                                {a.titulo}
                            </p>
                            <p className="mt-0.5 text-[10px] leading-relaxed text-amber-200/70">
                                {a.por_que}
                            </p>
                            {a.enlace ? (
                                <p className="mt-1 flex items-center gap-1.5">
                                    <ExternalLink className="h-3 w-3 shrink-0 text-cyan-300" aria-hidden />
                                    <a
                                        href={a.enlace}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mc-alzar cursor-pointer text-[11px] text-cyan-200 hover:text-cyan-100 underline underline-offset-1 truncate"
                                    >
                                        {a.enlace}
                                    </a>
                                </p>
                            ) : null}
                            {a.comando ? (
                                <div className="mt-1.5">
                                    <p className="text-[10px] text-white/45">Comando:</p>
                                    <div className="mt-0.5 flex items-center gap-1.5">
                                        <code className="flex-1 min-w-0 rounded-md border border-white/10 bg-black/40 px-2 py-1 text-[10px] text-white/90 truncate font-mono">
                                            {a.comando}
                                        </code>
                                        <button
                                            type="button"
                                            onClick={() => void copiar(a.comando!)}
                                            className="mc-alzar cursor-pointer shrink-0 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] text-white/70 hover:text-white"
                                            aria-label="Copiar comando"
                                        >
                                            <Copy className="h-3 w-3" aria-hidden />
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                            <p className="mt-1.5 text-[10px] text-white/35">
                                (Yo no: {a.por_que_no_lo_hago_yo})
                            </p>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

function dinero(valor: number): string {
    return `$${valor.toFixed(valor < 0.01 ? 5 : 2)}`;
}

function latencia(valor: number): string {
    return valor > 0 ? `${valor.toLocaleString("es-MX")} ms` : "sin muestras";
}

function RepartoJev({ titulo, periodo }: { titulo: string; periodo: PeriodoJev }) {
    return (
        <article className="rounded-lg border border-white/10 bg-black/25 p-3 text-left">
            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-white/45">{titulo}</h4>
            <p className="mt-1 text-xl font-semibold tabular-nums text-cyan-100">
                {periodo.llamadas} decisiones
            </p>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                <div>
                    <dt className="text-white/40">Local gratis</dt>
                    <dd className="font-medium tabular-nums text-emerald-200">{periodo.local}</dd>
                </div>
                <div>
                    <dt className="text-white/40">OpenRouter</dt>
                    <dd className="font-medium tabular-nums text-amber-200">{periodo.openrouter}</dd>
                </div>
                <div>
                    <dt className="text-white/40">p50 local</dt>
                    <dd className="tabular-nums text-white/75">{latencia(periodo.p50_local_ms)}</dd>
                </div>
                <div>
                    <dt className="text-white/40">p50 OpenRouter</dt>
                    <dd className="tabular-nums text-white/75">{latencia(periodo.p50_openrouter_ms)}</dd>
                </div>
            </dl>
        </article>
    );
}

function PanelMedidorJev({ datos, alCerrar }: { datos: RespuestaJev; alCerrar: () => void }) {
    const porcentajeDia = datos.techos.dia > 0
        ? Math.min(100, (datos.hoy.coste_usd / datos.techos.dia) * 100)
        : 0;
    const porcentajeMes = datos.techos.mes > 0
        ? Math.min(100, (datos.mes.coste_usd / datos.techos.mes) * 100)
        : 0;
    return (
        <section
            id="panel-medidor-jev"
            role="region"
            aria-label="Detalle de Jev"
            className="mc-cristal mc-desplegar mt-2 w-full p-3"
        >
            <header className="mc-centrado flex flex-wrap items-center justify-center gap-2">
                <BrainCircuit className="h-4 w-4 text-cyan-200" aria-hidden />
                <h3 className="text-[11px] font-semibold uppercase tracking-wider text-white/70">Jev</h3>
                <span className="text-[11px] text-white/45">consejero de decisiones tipadas</span>
                <button
                    type="button"
                    onClick={alCerrar}
                    className="ml-2 cursor-pointer rounded-md border border-white/10 px-2 py-0.5 text-[10px] text-white/50"
                >
                    Cerrar
                </button>
            </header>
            {!datos.local_vivo ? (
                <p className="mc-centrado mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
                    <BrainCircuit className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    motor local congelado mientras el enjambre escribe; las decisiones van por OpenRouter
                </p>
            ) : null}
            <div className="mt-3 grid gap-2 md:grid-cols-2">
                <RepartoJev titulo="Hoy" periodo={datos.hoy} />
                <RepartoJev titulo="Este mes" periodo={datos.mes} />
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
                {[
                    {
                        titulo: "Gasto de hoy",
                        coste: datos.hoy.coste_usd,
                        techo: datos.techos.dia,
                        porcentaje: porcentajeDia,
                    },
                    {
                        titulo: "Gasto del mes",
                        coste: datos.mes.coste_usd,
                        techo: datos.techos.mes,
                        porcentaje: porcentajeMes,
                    },
                ].map((gasto) => (
                    <div key={gasto.titulo} className="rounded-lg border border-white/10 bg-black/25 p-3">
                        <p className="flex items-center gap-1.5 text-[11px] text-white/55">
                            <CircleDollarSign className="h-3.5 w-3.5 text-emerald-200" aria-hidden />
                            {gasto.titulo}: {dinero(gasto.coste)} de {dinero(gasto.techo)}
                        </p>
                        <span
                            className="mc-barra mt-2 block h-1.5 overflow-hidden rounded-full bg-white/10"
                            role="progressbar"
                            aria-valuenow={Math.round(gasto.porcentaje)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={gasto.titulo}
                        >
                            <i
                                className="block h-full origin-left rounded-full bg-emerald-400/80"
                                style={{ transform: `scaleX(${gasto.porcentaje / 100})` }}
                            />
                        </span>
                    </div>
                ))}
            </div>
            <p className="mc-centrado mt-2 flex items-center justify-center gap-1 text-[10px] text-white/35">
                <Clock3 className="h-3 w-3" aria-hidden />
                p50: la mitad de las respuestas tarda menos y la otra mitad más
            </p>
        </section>
    );
}

export function CentroMando() {
    // La consola ocupa la pantalla entera y no necesita el cromo del OS: al declararse
    // «rito» se apagan dock, cortinas, bordes Trinity y paleta de comandos, que es
    // capacidad de la máquina que vuelve a los agentes.
    useEffect(() => {
        marcarRitoActivo("puente-de-mando", true);
        return () => marcarRitoActivo("puente-de-mando", false);
    }, []);

    const [pestana, setPestana] = useState<IdPestana>("procesos");
    const [estado, setEstado] = useState<EstadoMando | null>(null);
    // Salud de la neurona (memoria, voz, BitNet, Ollama) para los medidores de
    // la cabecera; si la sonda falla, se queda en null y la cabecera sigue igual.
    const [neurona, setNeurona] = useState<SaludNeurona | null>(null);
    const [almacenamiento, setAlmacenamiento] = useState<EstadoAlmacenamiento | null>(null);
    const [jev, setJev] = useState<RespuestaJev | null>(null);
    const [soloLocal, setSoloLocal] = useState(false);
    const [cargando, setCargando] = useState(true);
    // «Sin publicar» de la cabecera (Ola 274; un solo dato desde Ola 276 · M10): el
    // desglose por repos leído del endpoint de publicaciones una vez por minuto. Un
    // fallo lo deja en null y la pastilla usa `pulso.sinPush` (solo OS) como respaldo.
    const [sinPublicar, setSinPublicar] = useState<{ total: number; os: number; astraura: number } | null>(null);

    // Acciones que esperan a Alex (AX1): se leen de /api/mando/acciones una vez por minuto.
    const [accionesAlex, setAccionesAlex] = useState<{ generado: string; acciones: Array<{
        id: string;
        titulo: string;
        por_que: string;
        urgencia: "alta" | "media" | "baja";
        comando?: string;
        enlace?: string;
        por_que_no_lo_hago_yo: string;
        detalle?: string;
    }> } | null>(null);

    useEffect(() => {
        setPestana(pestanaInicial());
    }, []);

    // «Ver tarea» desde el asistente (orbe o pestaña Chat): la ficha vive en Procesos.
    useEffect(() => {
        return escucharAsistente((aviso) => {
            if (aviso.tipo === "tarea") setPestana("procesos");
        });
    }, []);

    // Un solo medidor abierto a la vez: el panel es uno y vive debajo de la rejilla.
    const [medidorAbierto, setMedidorAbierto] = useState<ClaveMedidor | null>(null);
    const [idesAbierto, setIdesAbierto] = useState(false);
    const [jevAbierto, setJevAbierto] = useState(false);
    // Panel "Te toca a ti" (AX1): separado de los medidores estándar.
    const [accionesAlexAbierto, setAccionesAlexAbierto] = useState(false);

    // Un solo origen de verdad para los medidores "listas" y "bloqueadas" (Ola 337 · MND2).
    // POR QUÉ: La cifra de la pastilla y el detalle al abrirla DEBEN salir del mismo sitio
    // (/api/mando/medidores). Calcular la pastilla por una vía distinta (p. ej. contarTrabajoReal)
    // causaba la incoherencia reportada (pastilla «2» y detalle «20»). Si la petición a la API
    // falla, se muestra un guion honesto («—») en lugar de mostrar un número de otra fuente.
    // `agentes` sale de aquí por la misma razón (Ola 337 · MND7, 2026-09-22): la pastilla
    // «Agentes» enseñaba `pulso.tareasEnCurso`, o sea el MISMO número que «Tareas en curso»
    // — lo que Alex vio como «son los mismos datos» — y encima se quedaba en 3 (la Mac)
    // mientras la nube tenía 4 agentes escribiendo. Ahora cuenta agentes, no tareas, y
    // cuenta los de todos los medios porque el detalle sale de la misma llamada.
    const [medidoresResumen, setMedidoresResumen] = useState<{
        listas: number | null;
        bloqueadas: number | null;
        agentes: number | null;
        agentesResumen: string | null;
    } | null>(null);

    const cargarMedidoresResumen = useCallback(async (forzar = false) => {
        if (!forzar && document.visibilityState === "hidden") return;
        try {
            const [resListas, resBloqueadas, resAgentes] = await Promise.allSettled([
                fetch("/api/mando/medidores?clave=listas", { cache: "no-store" }),
                fetch("/api/mando/medidores?clave=bloqueadas", { cache: "no-store" }),
                fetch("/api/mando/medidores?clave=agentes", { cache: "no-store" }),
            ]);

            let listas: number | null = null;
            let bloqueadas: number | null = null;
            let agentes: number | null = null;
            let agentesResumen: string | null = null;

            if (resListas.status === "fulfilled" && resListas.value.ok) {
                const dataListas = (await resListas.value.json()) as { detalle?: DetalleMedidor };
                if (dataListas.detalle?.filas) {
                    listas = dataListas.detalle.filas.length;
                }
            }

            if (resBloqueadas.status === "fulfilled" && resBloqueadas.value.ok) {
                const dataBloqueadas = (await resBloqueadas.value.json()) as { detalle?: DetalleMedidor };
                if (dataBloqueadas.detalle?.filas) {
                    // Contamos solo las tareas operativas (no históricas) para coincidir con el total del detalle
                    bloqueadas = dataBloqueadas.detalle.filas.filter((f) => !f.historica).length;
                }
            }

            if (resAgentes.status === "fulfilled" && resAgentes.value.ok) {
                const dataAgentes = (await resAgentes.value.json()) as { detalle?: DetalleMedidor };
                if (dataAgentes.detalle?.filas) {
                    agentes = dataAgentes.detalle.filas.length;
                    agentesResumen = dataAgentes.detalle.resumen ?? null;
                }
            }

            setMedidoresResumen({ listas, bloqueadas, agentes, agentesResumen });
        } catch {
            setMedidoresResumen({ listas: null, bloqueadas: null, agentes: null, agentesResumen: null });
        }
    }, []);

    useEffect(() => {
        let vivo = true;
        const cargar = async (forzar = false) => {
            if (!vivo) return;
            await cargarMedidoresResumen(forzar);
        };
        void cargar(true);
        const cada = window.setInterval(() => void cargar(), 20_000);
        const alVolver = () => {
            if (document.visibilityState === "visible") void cargar(true);
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(cada);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, [cargarMedidoresResumen]);

    const alCambiarPestana = useCallback((id: string) => {
        const segura = (PESTANAS.some((p) => p.id === id) ? id : "procesos") as IdPestana;
        setPestana(segura);
        try {
            window.localStorage.setItem(CLAVE_PESTANA, segura);
        } catch {
            // Sin almacenamiento: la consola sigue funcionando.
        }
    }, []);

    // Ejecuta una acción de un medidor y devuelve la frase que se enseña bajo el panel.
    // Toda la decisión de QUÉ es legal vive en @/lib/mando/medidores y en la ruta; aquí
    // solo se habla con ella y se traduce el resultado a castellano.
    const accionarMedidor = useCallback(
        async (clave: ClaveMedidor, accion: AccionMedidor, fila: FilaMedidor | undefined, texto: string) => {
            try {
                const r = await fetch("/api/mando/medidores", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ clave, accion: accion.clase, id: fila?.id, texto }),
                });
                const d = (await r.json()) as { ok?: boolean; tareas?: string[]; error?: string };
                if (!r.ok || d.error) return d.error ?? `No se pudo (HTTP ${r.status}).`;
                const n = d.tareas?.length ?? 0;
                void cargarMedidoresResumen(true);
                return accion.clase === "reintentar"
                    ? `${d.tareas?.join(", ")} vuelve a la cola con tu cambio anotado.`
                    : `${n} tarea${n === 1 ? "" : "s"} descartada${n === 1 ? "" : "s"}: ${d.tareas?.join(", ")}`;
            } catch {
                return "No se pudo hablar con la consola.";
            }
        },
        [cargarMedidoresResumen],
    );

    // La cabecera se relee cada 20 s (como la ramificación) y al volver a la pestaña: antes se
    // leía UNA vez al montar y «Tareas en curso» se quedaba en 0 con agentes trabajando.
    useEffect(() => {
        let vivo = true;
        let enCurso = false;
        // `forzar`: la primera lectura y la vuelta a la pestaña siempre se hacen; solo el
        // refresco periódico se salta mientras la pestaña está oculta (una pestaña de fondo
        // se quedaba en «Midiendo el pulso…» para siempre).
        const cargar = async (forzar = false) => {
            if (enCurso || (!forzar && document.visibilityState === "hidden")) return;
            enCurso = true;
            try {
                // Estado del trabajo y salud de la neurona se piden en paralelo y
                // por separado (allSettled): si la sonda falla (por ejemplo, se
                // agotó la memoria midiendo) la cabecera del trabajo no se cae.
                const [resEstado, resNeurona] = await Promise.allSettled([
                    fetch("/api/mando/estado", { cache: "no-store" }),
                    fetch("/api/mando/neurona", { cache: "no-store" }),
                ]);
                if (!vivo) return;
                if (resEstado.status !== "fulfilled" || !resEstado.value.ok) {
                    setSoloLocal(true);
                    return;
                }
                setEstado((await resEstado.value.json()) as EstadoMando);
                setSoloLocal(false);
                if (resNeurona.status === "fulfilled" && resNeurona.value.ok) {
                    setNeurona((await resNeurona.value.json()) as SaludNeurona);
                }
            } catch {
                if (vivo) setSoloLocal(true);
            } finally {
                enCurso = false;
                if (vivo) setCargando(false);
            }
        };
        void cargar(true);
        const cada = window.setInterval(() => void cargar(), 20_000);
        const alVolver = () => {
            if (document.visibilityState === "visible") void cargar(true);
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(cada);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, []);

    // Jev se mide aparte: su sonda local puede tardar hasta dos segundos y no debe
    // retrasar el resto del pulso. Al ocultar la pestaña, deja de preguntar.
    useEffect(() => {
        let vivo = true;
        let enCurso = false;
        const cargar = async (forzar = false) => {
            if (enCurso || (!forzar && document.visibilityState === "hidden")) return;
            enCurso = true;
            try {
                const respuesta = await fetch("/api/mando/jev", { cache: "no-store" });
                if (vivo && respuesta.ok) setJev((await respuesta.json()) as RespuestaJev);
            } catch {
                // Si la sonda local no responde, el resto del Mando conserva su pulso.
            } finally {
                enCurso = false;
            }
        };
        void cargar(true);
        const cada = window.setInterval(() => void cargar(), 60_000);
        const alVolver = () => {
            if (document.visibilityState === "visible") void cargar(true);
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(cada);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, []);

    // «Disco libre» de la cabecera (Ola 273): el almacenamiento se mide una vez
    // por minuto (más caro que la salud) y solo alimenta un `DatoPulso`. Un fallo
    // silencioso deja `almacenamiento` en null y la pastilla no aparece.
    useEffect(() => {
        let vivo = true;
        let enCurso = false;
        const cargar = async (forzar = false) => {
            if (enCurso || (!forzar && document.visibilityState === "hidden")) return;
            enCurso = true;
            try {
                const respuesta = await fetch("/api/mando/almacenamiento", { cache: "no-store" });
                if (vivo && respuesta.ok) setAlmacenamiento((await respuesta.json()) as EstadoAlmacenamiento);
            } catch {
                // Sin disco: la pastilla no aparece.
            } finally {
                enCurso = false;
            }
        };
        void cargar(true);
        const cada = window.setInterval(() => void cargar(), 60_000);
        const alVolver = () => {
            if (document.visibilityState === "visible") void cargar(true);
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(cada);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, []);

    // «Sin publicar» de la cabecera (Ola 274; desglose desde Ola 276 · M10): una vez
    // por minuto se lee el `delante` de cada repositorio publicable (OS y Astraura)
    // desde el endpoint de publicaciones. Es la misma fuente que la pestaña «Commits
    // pendientes», para que cabecera y pestaña casen.
    useEffect(() => {
        let vivo = true;
        let enCurso = false;
        const cargar = async (forzar = false) => {
            if (enCurso || (!forzar && document.visibilityState === "hidden")) return;
            enCurso = true;
            try {
                const respuesta = await fetch("/api/mando/publicaciones", { cache: "no-store" });
                if (!vivo) return;
                if (!respuesta.ok) return;
                const datos = (await respuesta.json()) as {
                    repos: Array<{ repo: "os" | "astraura"; delante: number }>;
                };
                const os = datos.repos.find((r) => r.repo === "os")?.delante ?? 0;
                const astraura = datos.repos.find((r) => r.repo === "astraura")?.delante ?? 0;
                setSinPublicar({ total: os + astraura, os, astraura });
            } catch {
                // Sin la Mac no hay publicaciones: la pastilla usa el respaldo.
            } finally {
                enCurso = false;
            }
        };
        void cargar(true);
        const cada = window.setInterval(() => void cargar(), 60_000);
        const alVolver = () => {
            if (document.visibilityState === "visible") void cargar(true);
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(cada);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, []);

    // Acciones que esperan a Alex (AX1): se leen de /api/mando/acciones una vez por minuto.
    // El director refresca el JSON; aquí solo lo leemos.
    useEffect(() => {
        let vivo = true;
        let enCurso = false;
        const cargar = async (forzar = false) => {
            if (enCurso || (!forzar && document.visibilityState === "hidden")) return;
            enCurso = true;
            try {
                const respuesta = await fetch("/api/mando/acciones", { cache: "no-store" });
                if (!vivo) return;
                if (!respuesta.ok) return;
                const datos = (await respuesta.json()) as {
                    generado: string;
                    acciones: Array<{
                        id: string;
                        titulo: string;
                        por_que: string;
                        urgencia: "alta" | "media" | "baja";
                        comando?: string;
                        enlace?: string;
                        por_que_no_lo_hago_yo: string;
                        detalle?: string;
                    }>;
                };
                setAccionesAlex(datos);
            } catch {
                // Sin la Mac no hay acciones: la pastilla se queda en 0.
            } finally {
                enCurso = false;
            }
        };
        void cargar(true);
        const cada = window.setInterval(() => void cargar(), 60_000);
        const alVolver = () => {
            if (document.visibilityState === "visible") void cargar(true);
        };
        document.addEventListener("visibilitychange", alVolver);
        return () => {
            vivo = false;
            window.clearInterval(cada);
            document.removeEventListener("visibilitychange", alVolver);
        };
    }, []);

    // (2026-09-09) La cuota REAL de Google Drive. `df` de la carpeta de DriveFS en
    // macOS informa del disco LOCAL, no de Drive: por eso el Mando llegó a decir
    // «6 GB libres de 228» con un Drive de 2 TB. El servidor ya devuelve null en ese
    // caso; aquí se pregunta a la API de Google con el token de «carpetas remotas»,
    // que vive SOLO en el navegador y nunca sale de él.
    const [cuotaGoogle, setCuotaGoogle] = useState<{ totalGb: number | null; libreGb: number | null; motivo: string } | null>(null);
    useEffect(() => {
        if (!almacenamiento?.drive?.montado) return;
        if (almacenamiento.driveCuota) return;          // DriveFS sí la sabía (Linux)
        let vivo = true;
        void (async () => {
            try {
                const { tokenVigente } = await import("@/lib/storage/carpetas-remotas");
                const token = await tokenVigente("google-drive");
                if (!token) {
                    if (vivo) setCuotaGoogle({ totalGb: null, libreGb: null, motivo: "conecta tu cuenta de Google en Almacenamiento → carpetas remotas" });
                    return;
                }
                const r = await fetch("https://www.googleapis.com/drive/v3/about?fields=storageQuota", {
                    headers: { Authorization: `Bearer ${token}` },
                    cache: "no-store",
                });
                if (!r.ok) {
                    if (vivo) setCuotaGoogle({ totalGb: null, libreGb: null, motivo: `la API de Google respondió ${r.status}` });
                    return;
                }
                const j = (await r.json()) as { storageQuota?: { limit?: string; usage?: string } };
                const aGb = (v?: string): number | null => (v ? Number(v) / 1024 ** 3 : null);
                const total = aGb(j.storageQuota?.limit);
                const usado = aGb(j.storageQuota?.usage);
                if (vivo) {
                    setCuotaGoogle({
                        totalGb: total,
                        libreGb: total != null && usado != null ? total - usado : null,
                        motivo: total == null ? "almacenamiento sin límite" : "",
                    });
                }
            } catch {
                if (vivo) setCuotaGoogle({ totalGb: null, libreGb: null, motivo: "no se pudo consultar la cuota" });
            }
        })();
        return () => { vivo = false; };
    }, [almacenamiento?.drive?.montado, almacenamiento?.driveCuota]);

    /** Pulso de la cabecera: ola activa, tareas en curso, sin push, flota agotada. */
    const pulso = useMemo(() => {
        if (!estado) return null;
        // La ola activa de verdad es la cola que están latiendo los agentes.
        const latidos = estado.latidos ?? [];
        const colaViva = latidos[0]?.cola ?? "";
        // La cola late como «cola-240-estudio-voces» y la ola se llama «Ola 240 · estudio de
        // voces»: se casan por el número, no por el texto (antes salía la 221 con la 240 viva).
        const numeroDe = (s: string): string => (/(\d{2,4})/.exec(s)?.[1] ?? "");
        const numeroViva = numeroDe(colaViva);
        // La ramificación ya sabe cuál es la ola viva o más reciente (incluidas las que solo
        // existen en la otra máquina); si no, se casa por número con la cola que late.
        const olaActiva =
            (estado.cuentas?.ola ? { id: estado.cuentas.ola } : null) ??
            (numeroViva ? estado.olas.find((o) => numeroDe(o.id) === numeroViva) : null) ??
            [...estado.olas].reverse().find((o) => o.restantes > 0) ??
            estado.olas[estado.olas.length - 1] ??
            null;
        // «En curso» es lo que un agente está escribiendo AHORA (latidos del vigilante).
        // Sumar `restantes` contaba como en curso todo lo que aún no se ha hecho, aunque no
        // hubiera ninguna ola en marcha: por eso este número no se movía.
        // «En curso» = agentes latiendo AHORA. Lo pendiente se muestra aparte (antes salía «60»
        // con cero agentes porque sumaba todo lo no hecho de todas las olas).
        const trabajo = contarTrabajoReal(estado.fila ?? [], latidos);
        const tareasEnCurso = trabajo.enCurso;
        const pendientes = trabajo.pendientes;
        const flota = flotaConocida(usoPorMotor(estado.uso));
        // Agotados según el uso diario + caídos según el supervisor de cada enjambre (bus):
        // xkiro sin cuota diaria es «caído» para el supervisor aunque el contador local no lo sepa.
        const fuera = new Set<string>(flota.filter((p) => p.estado === "agotado").map((p) => p.id));
        for (const e of estado.enjambres ?? []) {
            for (const [prov, salud] of Object.entries(e.proveedores ?? {})) {
                if (salud.estado === "caido") fuera.add(prov);
            }
        }
        const agotados = fuera.size;
        const disponibles = flota.filter((p) => p.estado === "listo").length;
        return {
            olaActiva: olaActiva ? (/^ola\s/i.test(olaActiva.id) ? olaActiva.id : `Ola ${olaActiva.id}`) : "Sin olas activas",
            tareasEnCurso,
            pendientes,
            copiasOmitidas: trabajo.copiasOmitidas,
            sinPush: estado.repo?.sinPush ?? null,
            agotados,
            disponibles,
        };
    }, [estado]);

    // Medidores de la neurona en la cabecera (Ola 258): memoria disponible de
    // verdad (libre + inactiva) y estado del llama-server BitNet. Mismos umbrales
    // que el PanelNeurona para que cabecera y pestaña digan lo mismo.
    const pulsoNeurona = useMemo(() => {
        if (!neurona) return null;
        const m = neurona.memoria;
        const disponibleMb = (m.libreMb ?? 0) + (m.inactivaMb ?? 0);
        const memoriaTono: "peligro" | "aviso" | "normal" =
            disponibleMb < 800 ? "peligro" : disponibleMb < 1500 ? "aviso" : "normal";
        const bitnetTono: "ok" | "aviso" = neurona.bitnet.estado === "vivo" ? "ok" : "aviso";
        return {
            memoriaValor: `${Math.round(disponibleMb)} MB`,
            memoriaTono,
            memoriaDetalle:
                m.swapUsadoMb !== null && m.swapUsadoMb !== undefined
                    ? `swap ${Math.round(m.swapUsadoMb)} MB`
                    : undefined,
            bitnetValor: neurona.bitnet.estado,
            bitnetTono,
            bitnetDetalle:
                neurona.bitnet.crashes24h && neurona.bitnet.crashes24h > 0
                    ? `${neurona.bitnet.crashes24h} crashes en 24 h`
                    : undefined,
        };
    }, [neurona]);

    // Ola 275 · V4: la Voz del Mando se monta UNA vez aquí (no por pestaña), para
    // que los anuncios hablados no se dupliquen al cambiar de vista. Se alimenta
    // de los eventos del relevo y de un resumen mínimo del estado («Léeme el
    // estado»); si no hay estado aún, la voz espera en silencio.
    const estadoVozMando = useMemo<EstadoVozMando | null>(() => {
        if (!estado) return null;
        const proveedoresCaidos = new Set<string>();
        for (const e of estado.enjambres ?? []) {
            for (const [prov, salud] of Object.entries(e.proveedores ?? {})) {
                if (salud.estado === "caido") proveedoresCaidos.add(prov);
            }
        }
        return {
            olaActiva: estado.cuentas?.ola,
            cuentas: estado.cuentas
                ? {
                      integradas: estado.cuentas.integradas,
                      enCurso: estado.cuentas.enCurso,
                      fallidas: estado.cuentas.fallidas,
                      pendientes: estado.cuentas.pendientes,
                  }
                : undefined,
            proveedoresCaidos: [...proveedoresCaidos],
            sinPublicar: sinPublicar?.total,
        };
    }, [estado, sinPublicar]);
    const controlVoz = useVozDelMando(estado?.relevo?.eventos ?? [], estadoVozMando);

    return (
        <VozMandoProvider control={controlVoz}>
        <div className="space-y-5">
            {cargando ? (
                <p className="flex items-center gap-2 text-sm text-white/60">
                    <CircleDashed className="h-4 w-4 animate-spin" aria-hidden />
                    Midiendo el pulso del trabajo…
                </p>
            ) : soloLocal ? (
                <div
                    role="status"
                    className="flex items-start gap-3 rounded-xl border border-amber-400/30 bg-amber-500/10 p-4 text-sm text-amber-100"
                >
                    <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                    <div>
                        <p className="font-semibold">La consola solo funciona en tu máquina.</p>
                        <p className="mt-1 text-amber-100/80">
                            La consola está apagada en esta instancia (funciona en
                            localhost, con <code>STARSEED_MANDO=1</code> o con sesión).
                            Las rutas <code>/api/mando/*</code> responden 404 en el
                            despliegue público para no exponer el estado del desarrollo;
                            en tu máquina (modo ligero incluido) entran sin sesión.
                        </p>
                    </div>
                </div>
            ) : pulso ? (
                <div className="flex flex-col gap-3">
                    {/* (2026-09-15) Aquí había un botón de «Abrir director» y, al lado, este
                        comentario: «la navegación no constituye una verificación». Tenía razón:
                        cambiar de pestaña no comprueba nada. Ahora el botón verifica los
                        procesos de verdad y deja el reporte escrito. */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <h2 className="text-sm font-semibold text-white/70">Pulso del trabajo</h2>
                        <VerificarProcesos />
                    </div>
                    {/* (2026-09-15) La cabecera era una fila que se envuelve, y el panel de detalle
                        colgaba DENTRO de la pastilla: al abrir uno, esa tarjeta pasaba de 8 rem a 30 y
                        reorganizaba toda la cabecera —huecos enormes, medidores saltando de sitio—.
                        Ahora las pastillas viven en una REJILLA de celdas iguales y el panel se pinta
                        una sola vez, debajo de todas y a lo ancho. Abrir ya no mueve nada. */}
                    <ul
                        className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6"
                        aria-label="Pulso del trabajo"
                    >
                        <li>
                            <PastillaIdes
                                abierto={idesAbierto}
                                alPulsar={() => {
                                    setMedidorAbierto(null);
                                    setJevAbierto(false);
                                    setIdesAbierto((a) => !a);
                                }}
                            />
                        </li>
                        {[
                            { clave: "ola-activa" as const, titulo: "Ola activa", valor: pulso.olaActiva },
                            {
                                clave: "en-curso" as const,
                                titulo: "Tareas en curso",
                                valor: String(pulso.tareasEnCurso),
                                tono: (pulso.tareasEnCurso > 0 ? "aviso" : "normal") as TonoMedidor,
                                detalle: pulso.tareasEnCurso > 0 ? "agentes escribiendo ahora" : "ningún agente activo",
                            },
                            {
                                clave: "agentes" as const,
                                titulo: "Agentes",
                                // Agentes, no tareas: la Mac va a 3 por su RAM, pero cada job de
                                // la nube trae los suyos y también escriben. El detalle sale de
                                // la MISMA llamada, así que pastilla y ventana no pueden discrepar.
                                valor:
                                    medidoresResumen?.agentes !== null && medidoresResumen?.agentes !== undefined
                                        ? String(medidoresResumen.agentes)
                                        : "—",
                                tono: (
                                    medidoresResumen?.agentes !== null &&
                                    medidoresResumen?.agentes !== undefined &&
                                    medidoresResumen.agentes > 0
                                        ? "ok"
                                        : "normal"
                                ) as TonoMedidor,
                                detalle: medidoresResumen?.agentesResumen ?? "quién escribe, aquí y en la nube",
                            },
                            {
                                clave: "listas" as const,
                                titulo: "Listas para trabajar",
                                valor:
                                    medidoresResumen?.listas !== null && medidoresResumen?.listas !== undefined
                                        ? String(medidoresResumen.listas)
                                        : "—",
                                // Rojo SOLO cuando hay trabajo y nadie lo coge: si el rojo sale
                                // siempre, deja de significar nada.
                                tono: (
                                    medidoresResumen?.listas !== null &&
                                    medidoresResumen?.listas !== undefined &&
                                    medidoresResumen.listas > 0 &&
                                    pulso.tareasEnCurso === 0
                                        ? "peligro"
                                        : "normal"
                                ) as TonoMedidor,
                                detalle:
                                    medidoresResumen?.listas !== null &&
                                    medidoresResumen?.listas !== undefined &&
                                    medidoresResumen.listas > 0 &&
                                    pulso.tareasEnCurso === 0
                                        ? "hay trabajo y ningún agente: algo está atascado"
                                        : "el enjambre las coge solo",
                            },
                            {
                                clave: "bloqueadas" as const,
                                titulo: "Bloqueadas",
                                valor:
                                    medidoresResumen?.bloqueadas !== null && medidoresResumen?.bloqueadas !== undefined
                                        ? String(medidoresResumen.bloqueadas)
                                        : "—",
                                tono: (
                                    medidoresResumen?.bloqueadas !== null &&
                                    medidoresResumen?.bloqueadas !== undefined &&
                                    medidoresResumen.bloqueadas > 0
                                        ? "aviso"
                                        : "normal"
                                ) as TonoMedidor,
                                detalle:
                                    medidoresResumen?.bloqueadas !== null &&
                                    medidoresResumen?.bloqueadas !== undefined &&
                                    medidoresResumen.bloqueadas > 0
                                        ? "ábrelo para ver por qué"
                                        : "ninguna esperando",
                            },
                            {
                                clave: "sin-publicar" as const,
                                titulo: "Sin publicar",
                                valor: sinPublicar
                                    ? String(sinPublicar.total)
                                    : pulso.sinPush === null
                                      ? "—"
                                      : String(pulso.sinPush),
                                tono: ((sinPublicar ? sinPublicar.total : pulso.sinPush ?? 0) > 0 ? "aviso" : "normal") as TonoMedidor,
                                detalle: sinPublicar ? `OS ${sinPublicar.os} · Astraura ${sinPublicar.astraura}` : "solo OS",
                            },
                            {
                                clave: "proveedores" as const,
                                titulo: "Proveedores agotados",
                                valor: String(pulso.agotados),
                                tono: (pulso.agotados > 0 ? "peligro" : "normal") as TonoMedidor,
                                detalle: `${pulso.disponibles} disponibles`,
                            },
                            {
                                titulo: "Jev",
                                valor: jev ? String(jev.hoy.llamadas) : "—",
                                tono: (jev?.local_vivo ? "ok" : "aviso") as TonoMedidor,
                                detalle: jev
                                    ? `${jev.hoy.local} local · ${jev.hoy.openrouter} de pago`
                                    : "cargando…",
                                abierto: jevAbierto,
                                alClic: () => {
                                    setMedidorAbierto(null);
                                    setIdesAbierto(false);
                                    setAccionesAlexAbierto(false);
                                    setJevAbierto((abierto) => !abierto);
                                },
                            },
                            {
                                titulo: "Te toca a ti",
                                valor: String(accionesAlex?.acciones.length ?? 0),
                                tono: (accionesAlex && accionesAlex.acciones.length > 0 ? "aviso" : "ok") as TonoMedidor,
                                detalle: accionesAlex
                                    ? accionesAlex.acciones.length > 0
                                        ? `${accionesAlex.acciones.filter((a) => a.urgencia === "alta").length} urgentes`
                                        : "nada pendiente"
                                    : "cargando…",
                                alClic: () => {
                                    setMedidorAbierto(null);
                                    setIdesAbierto(false);
                                    setJevAbierto(false);
                                    setAccionesAlexAbierto((a) => !a);
                                },
                            },
                            ...(pulsoNeurona
                                ? [
                                      {
                                          clave: "memoria" as const,
                                          titulo: "Memoria",
                                          valor: pulsoNeurona.memoriaValor,
                                          tono: pulsoNeurona.memoriaTono as TonoMedidor,
                                          detalle: pulsoNeurona.memoriaDetalle,
                                      },
                                      {
                                          titulo: "BitNet 1.58",
                                          valor: pulsoNeurona.bitnetValor,
                                          tono: pulsoNeurona.bitnetTono as TonoMedidor,
                                          detalle: pulsoNeurona.bitnetDetalle,
                                      },
                                  ]
                                : []),
                            ...(almacenamiento?.disco
                                ? [
                                      {
                                          clave: "disco" as const,
                                          titulo: "Disco libre",
                                          valor: discoLibreTexto(almacenamiento.disco.libreMb),
                                          tono: tonoDiscoLibre(almacenamiento.disco.libreMb) as TonoMedidor,
                                          detalle: `${almacenamiento.disco.usadoPct} % usado`,
                                      },
                                  ]
                                : []),
                            ...(almacenamiento?.drive?.montado
                                ? [
                                      {
                                          titulo: "Google Drive",
                                          valor:
                                              cuotaGoogle?.libreGb != null
                                                  ? cuotaGoogle.libreGb >= 1024
                                                      ? `${(cuotaGoogle.libreGb / 1024).toFixed(2)} TB libres`
                                                      : `${cuotaGoogle.libreGb.toFixed(0)} GB libres`
                                                  : "montado",
                                          tono: "ok" as TonoMedidor,
                                          detalle:
                                              cuotaGoogle?.totalGb != null
                                                  ? `de ${(cuotaGoogle.totalGb / 1024).toFixed(2)} TB`
                                                  : cuotaGoogle?.motivo || "abre la carpeta de StarSeed en Drive",
                                          alClic: () =>
                                              window.open(
                                                  "https://drive.google.com/drive/search?q=StarSeed_Memory_Root",
                                                  "_blank",
                                                  "noopener,noreferrer",
                                              ),
                                      },
                                  ]
                                : []),
                            ...(estado?.cuentas
                                ? [
                                      {
                                          titulo: "Integradas",
                                          valor: String(estado.cuentas.integradas),
                                          tono: "ok" as TonoMedidor,
                                          detalle: `últimas ${estado.cuentas.ultimas.olas} olas: ${estado.cuentas.ultimas.integradas}`,
                                      },
                                      {
                                          titulo: "Fallidas",
                                          valor: String(estado.cuentas.fallidas),
                                          tono: (estado.cuentas.fallidas > 0 ? "peligro" : "normal") as TonoMedidor,
                                          detalle: `últimas olas: ${estado.cuentas.ultimas.fallidas}`,
                                      },
                                  ]
                                : []),
                            ...((estado?.cuentas?.ultimas.esperandoAprobacion ?? 0) > 0
                                ? [
                                      {
                                          titulo: "Tu visto bueno",
                                          valor: String(estado?.cuentas?.ultimas.esperandoAprobacion ?? 0),
                                          tono: "aviso" as TonoMedidor,
                                          detalle: "ramas listas que esperan tu decisión",
                                      },
                                  ]
                                : []),
                        ].map((m) => (
                            <li key={m.titulo}>
                                <PastillaMedidor
                                    clave={"clave" in m ? m.clave : undefined}
                                    titulo={m.titulo}
                                    valor={m.valor}
                                    detalle={"detalle" in m ? m.detalle : undefined}
                                    tono={"tono" in m ? m.tono : undefined}
                                    abierto={"abierto" in m ? m.abierto : "clave" in m && medidorAbierto === m.clave}
                                    alPulsar={(c) => {
                                        setIdesAbierto(false);
                                        setJevAbierto(false);
                                        setMedidorAbierto((a) => (a === c ? null : c));
                                    }}
                                    alClic={"alClic" in m ? m.alClic : undefined}
                                />
                            </li>
                        ))}
                    </ul>
                    {idesAbierto ? (
                        <PanelIdes alCerrar={() => setIdesAbierto(false)} />
                    ) : jevAbierto && jev ? (
                        <PanelMedidorJev datos={jev} alCerrar={() => setJevAbierto(false)} />
                    ) : medidorAbierto ? (
                        <PanelMedidor
                            clave={medidorAbierto}
                            alAccionar={accionarMedidor}
                            alIrA={alCambiarPestana}
                            alCerrar={() => setMedidorAbierto(null)}
                        />
                    ) : accionesAlexAbierto ? (
                        <PanelAccionesAlex
                            acciones={accionesAlex?.acciones ?? []}
                            alCerrar={() => setAccionesAlexAbierto(false)}
                        />
                    ) : null}
                </div>
            ) : null}

            {neurona && neurona.avisos.length > 0 ? (
                // Primer aviso de la neurona con la misma estética de peligro que
                // el «Nube sin lanzador» de la cabecera: rojo suave, borde tenue.
                <p
                    role="status"
                    data-testid="aviso-neurona"
                    className="flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
                >
                    <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden />
                    {neurona.avisos[0]}
                </p>
            ) : null}

            <Tabs value={pestana} onValueChange={alCambiarPestana}>
                <TabsList aria-label="Pestañas del Centro de Mando" className="mc-cristal flex-wrap gap-y-1">
                    {PESTANAS.map((p, i) => (
                        <Fragment key={p.id}>
                            {i > 0 && PESTANAS[i - 1].grupo !== p.grupo ? (
                                <span
                                    aria-hidden
                                    className="mx-1.5 self-center text-[9px] uppercase tracking-widest text-white/25"
                                >
                                    {p.grupo}
                                </span>
                            ) : null}
                            <TabsTrigger value={p.id} className="mc-alzar cursor-pointer">
                                {p.etiqueta}
                                {p.id === "reportes" ? <InsigniaReportes activa={pestana === "reportes"} /> : null}
                            </TabsTrigger>
                        </Fragment>
                    ))}
                </TabsList>

                <TabsContent value="procesos">
                    <PanelProcesos />
                </TabsContent>
                <TabsContent value="director">
                    <ControlDirectores />
                </TabsContent>
                <TabsContent value="oficina">
                    {/* Ola 272 · O3B: Three.js solo se carga al abrir la pestaña.
                        El render condicional garantiza que el chunk dinámico ni
                        siquiera se pida antes de tiempo; al volver a la pestaña
                        la oficina se vuelve a montar limpia. Así `/mando?pestana=oficina`
                        funciona igual si el usuario entra directo por URL. */}
                    {pestana === "oficina" ? <OficinaMando alCambiarPestana={alCambiarPestana} /> : null}
                </TabsContent>
                <TabsContent value="olas">
                    <PanelOlas />
                </TabsContent>
                <TabsContent value="commits">
                    <PanelPublicaciones />
                </TabsContent>
                <TabsContent value="publicar">
                    <PanelPublicacion />
                </TabsContent>
                <TabsContent value="canales">
                    {/* Ola 285 · K3: el panel de canales solo se monta al abrir
                        la pestaña (chunk diferido + render condicional); Radix lo
                        desmonta al salir, como con las voces y la oficina. */}
                    {pestana === "canales" ? <PanelCanales /> : null}
                </TabsContent>
                <TabsContent value="astra">
                    {/* Ola 294 · AR4: mismo patrón que Canales — chunk diferido y
                        montaje condicional: el panel no cuesta nada hasta pedirlo. */}
                    {pestana === "astra" ? <PanelAstra /> : null}
                </TabsContent>
                <TabsContent value="taller">
                    {pestana === "taller" ? <PanelTaller /> : null}
                </TabsContent>
                <TabsContent value="flota">
                    <PanelFlota />
                </TabsContent>
                <TabsContent value="neurona">
                    <PanelNeurona />
                </TabsContent>
                <TabsContent value="voces">
                    {/* El Estudio pesa (forja, motores, oído): solo se monta al abrir
                        la pestaña; Radix lo desmonta al salir (forceMount no se usa). */}
                    {pestana === "voces" ? <PanelVoces /> : null}
                </TabsContent>
                <TabsContent value="aprendizaje">
                    <PanelAprendizaje />
                </TabsContent>
                <TabsContent value="reportes">
                    {/* p323D: la bandeja curada se monta al abrirla; el conteo
                        de la insignia es ligero y va aparte, en la pestaña misma. */}
                    {pestana === "reportes" ? <PanelReportes /> : null}
                </TabsContent>
                <TabsContent value="chat">
                    <ChatOrquestacion />
                </TabsContent>
                <TabsContent value="areas">
                    <PanelAreas />
                </TabsContent>
                <TabsContent value="contextos">
                    <PanelContextos />
                </TabsContent>
                <TabsContent value="entornos">
                    <PanelEntornos />
                </TabsContent>
                <TabsContent value="ajustes_director">
                    <AjustesDirector />
                </TabsContent>
                <TabsContent value="ajustes">
                    <PanelAjustes />
                </TabsContent>
            </Tabs>
            {/* Control de la voz junto a la orbe: activar/silenciar sin abrir la pestaña. */}
            <ControlVozDelMando />
            <OrbeAsistente />
        </div>
        </VozMandoProvider>
    );
}
