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
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleDashed, RefreshCw, ShieldAlert } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EstadoMando, ProveedorUso } from "@/lib/mando/tipos";
import { flotaConocida } from "@/lib/mando/flota";
import { PanelProcesos } from "@/components/mando/panel-procesos";
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
import { DirectorAgentes } from "@/components/mando/director-agentes";
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

const CLAVE_PESTANA = "starseed.mando.pestana";

/** Pestañas del Centro de Mando, en orden. */
const PESTANAS = [
    { id: "procesos", etiqueta: "Procesos" },
    { id: "director", etiqueta: "Director" },
    { id: "oficina", etiqueta: "Oficina 3D" },
    { id: "olas", etiqueta: "Olas e informes" },
    { id: "commits", etiqueta: "Commits pendientes" },
    { id: "publicar", etiqueta: "Publicar" },
    { id: "canales", etiqueta: "Canales StarSeed" },
    { id: "taller", etiqueta: "Taller del agente" },
    { id: "flota", etiqueta: "Flota" },
    { id: "neurona", etiqueta: "Neurona" },
    { id: "voces", etiqueta: "Voces" },
    { id: "aprendizaje", etiqueta: "Aprendizaje" },
    { id: "chat", etiqueta: "Chat" },
    { id: "areas", etiqueta: "Áreas" },
    { id: "contextos", etiqueta: "Contextos" },
    { id: "entornos", etiqueta: "Entornos" },
    { id: "ajustes_director", etiqueta: "Ajustes Director" },
    { id: "ajustes", etiqueta: "Ajustes" },
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
    const [soloLocal, setSoloLocal] = useState(false);
    const [cargando, setCargando] = useState(true);
    // «Sin publicar» de la cabecera (Ola 274; un solo dato desde Ola 276 · M10): el
    // desglose por repos leído del endpoint de publicaciones una vez por minuto. Un
    // fallo lo deja en null y la pastilla usa `pulso.sinPush` (solo OS) como respaldo.
    const [sinPublicar, setSinPublicar] = useState<{ total: number; os: number; astraura: number } | null>(null);

    useEffect(() => {
        setPestana(pestanaInicial());
    }, []);

    // «Ver tarea» desde el asistente (orbe o pestaña Chat): la ficha vive en Procesos.
    useEffect(() => {
        return escucharAsistente((aviso) => {
            if (aviso.tipo === "tarea") setPestana("procesos");
        });
    }, []);

    const alCambiarPestana = useCallback((id: string) => {
        const segura = (PESTANAS.some((p) => p.id === id) ? id : "procesos") as IdPestana;
        setPestana(segura);
        try {
            window.localStorage.setItem(CLAVE_PESTANA, segura);
        } catch {
            // Sin almacenamiento: la consola sigue funcionando.
        }
    }, []);

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
            listas: trabajo.listas,
            bloqueadas: trabajo.bloqueadas,
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
                    {/* Acceso al director; la navegación no constituye una verificación. */}
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold text-white/70">Pulso del trabajo</h2>
                        <button
                            type="button"
                            onClick={() => alCambiarPestana("director")}
                            className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20"
                        >
                            <RefreshCw className="h-3 w-3" />
                            Abrir director
                        </button>
                    </div>
                    <ul className="flex flex-wrap gap-2" aria-label="Pulso del trabajo">
                    <DatoPulso titulo="Ola activa" valor={pulso.olaActiva} />
                    {/* (2026-09-09) Alex: «separa los de pendientes de las tareas en curso».
                        Estaban en un solo chip («3 · 128 pendientes») y se leía como un dato
                        raro; son dos cosas distintas y ahora se ven como tales:
                          · EN CURSO   = agentes latiendo AHORA (latidos del vigilante).
                          · PENDIENTES = IDs únicos que aún requieren trabajo; las copias de
                            colas históricas se omiten y el detalle separa listos/bloqueados. */}
                    <DatoPulso
                        titulo="Tareas en curso"
                        valor={String(pulso.tareasEnCurso)}
                        tono={pulso.tareasEnCurso > 0 ? "aviso" : "normal"}
                        detalle={pulso.tareasEnCurso > 0 ? "agentes escribiendo ahora" : "ningún agente activo"}
                    />
                    <DatoPulso
                        titulo="Pendientes"
                        valor={String(pulso.pendientes)}
                        tono={pulso.pendientes > 0 && pulso.tareasEnCurso === 0 ? "peligro" : "normal"}
                        detalle={`${pulso.listas} listas · ${pulso.bloqueadas} bloqueadas${pulso.copiasOmitidas > 0 ? ` · ${pulso.copiasOmitidas} copias omitidas` : ""}`}
                        alClic={() => alCambiarPestana("procesos")}
                    />
                    <DatoPulso
                        titulo="Sin publicar"
                        valor={
                            sinPublicar
                                ? String(sinPublicar.total)
                                : pulso.sinPush === null
                                  ? "—"
                                  : String(pulso.sinPush)
                        }
                        tono={
                            (sinPublicar ? sinPublicar.total : pulso.sinPush ?? 0) > 0
                                ? "aviso"
                                : "normal"
                        }
                        detalle={
                            sinPublicar
                                ? `OS ${sinPublicar.os} · Astraura ${sinPublicar.astraura}`
                                : "solo OS"
                        }
                        alClic={() => alCambiarPestana("commits")}
                    />
                    <DatoPulso
                        titulo="Proveedores agotados"
                        valor={String(pulso.agotados)}
                        tono={pulso.agotados > 0 ? "peligro" : "normal"}
                        detalle={`${pulso.disponibles} disponibles`}
                        alClic={() => alCambiarPestana("flota")}
                    />
                    {pulsoNeurona ? (
                        <>
                            <DatoPulso
                                titulo="Memoria"
                                valor={pulsoNeurona.memoriaValor}
                                tono={pulsoNeurona.memoriaTono}
                                detalle={pulsoNeurona.memoriaDetalle}
                            />
                            <DatoPulso
                                titulo="BitNet 1.58"
                                valor={pulsoNeurona.bitnetValor}
                                tono={pulsoNeurona.bitnetTono}
                                detalle={pulsoNeurona.bitnetDetalle}
                            />
                        </>
                    ) : null}
                    {almacenamiento?.disco ? (
                        <DatoPulso
                            titulo="Disco libre"
                            valor={discoLibreTexto(almacenamiento.disco.libreMb)}
                            tono={tonoDiscoLibre(almacenamiento.disco.libreMb)}
                            detalle={`${almacenamiento.disco.usadoPct} % usado`}
                            alClic={() => alCambiarPestana("neurona")}
                        />
                    ) : null}
                    {/* (2026-09-09, a petición de Alex) Drive como almacén grande, en la cabecera.
                        Al pulsar abre la carpeta del proyecto en Google Drive, para llegar a los
                        archivos sin buscarlos. La cuota real la da la API de Google, no `df`: en
                        macOS DriveFS es un File Provider y `df` de esa carpeta devuelve el disco
                        LOCAL — por eso, sin cuota, se enseña el motivo en vez de un número falso. */}
                    {almacenamiento?.drive?.montado ? (
                        <DatoPulso
                            titulo="Google Drive"
                            valor={
                                cuotaGoogle?.libreGb != null
                                    ? cuotaGoogle.libreGb >= 1024
                                        ? `${(cuotaGoogle.libreGb / 1024).toFixed(2)} TB libres`
                                        : `${cuotaGoogle.libreGb.toFixed(0)} GB libres`
                                    : almacenamiento.driveCuota && almacenamiento.driveCuota.libreGb != null
                                      ? `${almacenamiento.driveCuota.libreGb.toFixed(0)} GB libres`
                                      : "montado"
                            }
                            tono="ok"
                            detalle={
                                cuotaGoogle?.totalGb != null
                                    ? `de ${(cuotaGoogle.totalGb / 1024).toFixed(2)} TB (API de Google)${almacenamiento.drive.espejo?.ultimoEspejo ? ` · espejo: ${almacenamiento.drive.espejo.ultimoEspejo}` : ""}`
                                    : (cuotaGoogle?.motivo ||
                                       almacenamiento.driveCuotaMotivo ||
                                       "abre la carpeta de StarSeed en Drive")
                            }
                            alClic={() =>
                                window.open(
                                    "https://drive.google.com/drive/search?q=StarSeed_Memory_Root",
                                    "_blank",
                                    "noopener,noreferrer",
                                )
                            }
                        />
                    ) : null}
                    {estado?.cuentas ? (
                        <>
                            <DatoPulso titulo="Integradas" valor={String(estado.cuentas.integradas)} tono="ok" detalle={`${estado.cuentas.ola} · últimas ${estado.cuentas.ultimas.olas} olas: ${estado.cuentas.ultimas.integradas}`} />
                            {/* (2026-09-09, a petición de Alex) Fuera «En curso» y «Sin cambios».
                                «En curso» contaba las tareas con estado `en_curso` en progreso.json, y ese
                                estado NO se cierra cuando el contenedor mata al orquestador: llegó a mostrar
                                19 tareas «en curso» de olas de hace días, ninguna viva. El dato honesto es
                                «Tareas en curso» del pulso de arriba, que cuenta agentes latiendo AHORA.
                                «Sin cambios» no aportaba: lo que importa de una tarea que no escribió nada
                                ya sale en «Fallidas» y en el detalle de la ola. */}
                            <DatoPulso titulo="Fallidas" valor={String(estado.cuentas.fallidas)} tono={estado.cuentas.fallidas > 0 ? "peligro" : "normal"} detalle={`últimas olas: ${estado.cuentas.ultimas.fallidas}`} />
                            <DatoPulso titulo="Pendientes" valor={String(estado.cuentas.pendientes)} tono="normal" detalle={`últimas olas: ${estado.cuentas.ultimas.pendientes}`} />
                            {(estado.cuentas.ultimas.esperandoAprobacion ?? 0) > 0 ? (
                                <DatoPulso titulo="Tu visto bueno" valor={String(estado.cuentas.ultimas.esperandoAprobacion)} tono="aviso" detalle="ramas listas que esperan tu decisión (Procesos)" />
                            ) : null}
                            {(estado.ordenesSinAtender?.length ?? 0) > 0 ? (
                                <DatoPulso
                                    titulo="Nube sin lanzador"
                                    valor={String(estado.ordenesSinAtender?.length ?? 0)}
                                    tono="peligro"
                                    detalle={`orden «${estado.ordenesSinAtender?.[0]?.tipo ?? ""}» sin recoger desde hace ${Math.round((Date.now() - Date.parse(estado.ordenesSinAtender?.[0]?.t ?? "")) / 60000)} min: relanza ~/starseed-vigia/lanzador.py en el contenedor`}
                                />
                            ) : null}
                        </>
                    ) : null}
                    </ul>
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
                <TabsList aria-label="Pestañas del Centro de Mando" className="flex-wrap">
                    {PESTANAS.map((p) => (
                        <TabsTrigger key={p.id} value={p.id} className="cursor-pointer">
                            {p.etiqueta}
                        </TabsTrigger>
                    ))}
                </TabsList>

                <TabsContent value="procesos">
                    <PanelProcesos />
                </TabsContent>
                <TabsContent value="director">
                    <DirectorAgentes />
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
