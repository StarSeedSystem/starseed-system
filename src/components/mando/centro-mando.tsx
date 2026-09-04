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
import { CircleDashed, ShieldAlert } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EstadoMando, ProveedorUso } from "@/lib/mando/tipos";
import { flotaConocida } from "@/lib/mando/flota";
import { PanelProcesos } from "@/components/mando/panel-procesos";
import { PanelOlas } from "@/components/mando/panel-olas";
import { PanelFlota } from "@/components/mando/panel-flota";
import { ChatOrquestacion } from "@/components/mando/chat-orquestacion";
import { PanelAreas } from "@/components/mando/panel-areas";
import { PanelEntornos } from "@/components/mando/panel-entornos";
import { PanelAjustes } from "@/components/mando/panel-ajustes";

const CLAVE_PESTANA = "starseed.mando.pestana";

/** Pestañas del Centro de Mando, en orden. */
const PESTANAS = [
    { id: "procesos", etiqueta: "Procesos" },
    { id: "olas", etiqueta: "Olas e informes" },
    { id: "flota", etiqueta: "Flota" },
    { id: "chat", etiqueta: "Chat" },
    { id: "areas", etiqueta: "Áreas" },
    { id: "entornos", etiqueta: "Entornos" },
    { id: "ajustes", etiqueta: "Ajustes" },
] as const;

type IdPestana = (typeof PESTANAS)[number]["id"];

/** Lee la última pestaña guardada (o la primera). */
function pestanaInicial(): IdPestana {
    if (typeof window === "undefined") return "procesos";
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
}: {
    titulo: string;
    valor: string;
    tono?: "normal" | "aviso" | "peligro";
}) {
    const clase =
        tono === "peligro"
            ? "border-red-400/30 bg-red-500/10 text-red-200"
            : tono === "aviso"
              ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
              : "border-white/10 bg-white/5 text-white/80";
    return (
        <li
            className={`flex min-w-36 flex-col gap-0.5 rounded-lg border px-3 py-2 ${clase}`}
        >
            <span className="text-[11px] uppercase tracking-wide opacity-70">{titulo}</span>
            <span className="truncate text-sm font-semibold">{valor}</span>
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
    const [soloLocal, setSoloLocal] = useState(false);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        setPestana(pestanaInicial());
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

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const respuesta = await fetch("/api/mando/estado", { cache: "no-store" });
                if (!vivo) return;
                if (!respuesta.ok) {
                    setSoloLocal(true);
                    setCargando(false);
                    return;
                }
                setEstado((await respuesta.json()) as EstadoMando);
            } catch {
                if (vivo) setSoloLocal(true);
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => {
            vivo = false;
        };
    }, []);

    /** Pulso de la cabecera: ola activa, tareas en curso, sin push, flota agotada. */
    const pulso = useMemo(() => {
        if (!estado) return null;
        // La ola activa de verdad es la cola que están latiendo los agentes.
        const latidos = estado.latidos ?? [];
        const colaViva = latidos[0]?.cola ?? "";
        const olaActiva =
            (colaViva ? estado.olas.find((o) => o.id.includes(colaViva) || colaViva.includes(o.id)) : null) ??
            estado.olas.find((o) => o.restantes > 0) ??
            estado.olas[0] ??
            null;
        // «En curso» es lo que un agente está escribiendo AHORA (latidos del vigilante).
        // Sumar `restantes` contaba como en curso todo lo que aún no se ha hecho, aunque no
        // hubiera ninguna ola en marcha: por eso este número no se movía.
        const tareasEnCurso =
            latidos.length > 0
                ? latidos.length
                : estado.olas.reduce((acc, o) => acc + o.restantes, 0);
        const flota = flotaConocida(usoPorMotor(estado.uso));
        const agotados = flota.filter((p) => p.estado === "agotado").length;
        return {
            olaActiva: olaActiva ? `Ola ${olaActiva.id} · ${olaActiva.titulo}` : "Sin olas activas",
            tareasEnCurso,
            sinPush: estado.repo?.sinPush ?? null,
            agotados,
        };
    }, [estado]);

    return (
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
                            Las rutas <code>/api/mando/*</code> están apagadas en el
                            despliegue público (responden 404) para no exponer el estado
                            del desarrollo. Ábrela en <code>localhost</code> o en una
                            instancia propia con <code>STARSEED_MANDO=1</code>.
                        </p>
                    </div>
                </div>
            ) : pulso ? (
                <ul className="flex flex-wrap gap-2" aria-label="Pulso del trabajo">
                    <DatoPulso titulo="Ola activa" valor={pulso.olaActiva} />
                    <DatoPulso
                        titulo="Tareas en curso"
                        valor={String(pulso.tareasEnCurso)}
                        tono={pulso.tareasEnCurso > 0 ? "aviso" : "normal"}
                    />
                    <DatoPulso
                        titulo="Commits sin publicar"
                        valor={pulso.sinPush === null ? "—" : String(pulso.sinPush)}
                        tono={pulso.sinPush && pulso.sinPush > 0 ? "aviso" : "normal"}
                    />
                    <DatoPulso
                        titulo="Proveedores agotados"
                        valor={String(pulso.agotados)}
                        tono={pulso.agotados > 0 ? "peligro" : "normal"}
                    />
                </ul>
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
                <TabsContent value="olas">
                    <PanelOlas />
                </TabsContent>
                <TabsContent value="flota">
                    <PanelFlota />
                </TabsContent>
                <TabsContent value="chat">
                    <ChatOrquestacion />
                </TabsContent>
                <TabsContent value="areas">
                    <PanelAreas />
                </TabsContent>
                <TabsContent value="entornos">
                    <PanelEntornos />
                </TabsContent>
                <TabsContent value="ajustes">
                    <PanelAjustes />
                </TabsContent>
            </Tabs>
        </div>
    );
}
