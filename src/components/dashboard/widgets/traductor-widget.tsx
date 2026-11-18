"use client";

import { useMemo, useState, useCallback } from "react";
import { Languages } from "lucide-react";
import { MarcoWidget } from "../kit/marco-widget";
import { WidgetTraductor, type WidgetTraductorAjustes } from "@/components/traductor/widget-traductor";
import { crearServicioTraductor } from "@/lib/traductor/servicio";
import { almacenLocal } from "@/app/(app)/traductor/pantalla-traductor";
import { crearMotores, type PaginaActual } from "@/components/traduccion/traducir-texto";
import { hablar } from "@/lib/traductor/voz-habla";
import type { DashboardWidget } from "../dashboard-types";
import type { ResultadoServicioTraductor } from "@/lib/traductor/servicio";
import type { IdMotor } from "@/lib/traductor/privacidad";

const AJUSTES_POR_DEFECTO: WidgetTraductorAjustes = {
    idiomasFijados: ["es", "en"],
    motorPreferido: "automatico",
    tamanoLetra: "M",
    historialCorto: true,
};

function paginaActual(): PaginaActual {
    if (typeof window === "undefined") return {};
    return {
        protocolo: window.location.protocol,
        maquina: window.location.hostname,
        translator: (window as { Translator?: unknown }).Translator,
    };
}

export function TraductorWidget({
    widget,
    onUpdateSettings,
}: {
    widget?: DashboardWidget;
    onUpdateSettings?: (patch: Record<string, any>) => void;
}) {
    const ajustes: WidgetTraductorAjustes = useMemo(() => {
        const s = widget?.settings ?? {};
        return {
            idiomasFijados: (s.idiomasFijados as [string, string] | undefined) ?? AJUSTES_POR_DEFECTO.idiomasFijados,
            motorPreferido: (s.motorPreferido as "automatico" | "local" | undefined) ?? AJUSTES_POR_DEFECTO.motorPreferido,
            tamanoLetra: (s.tamanoLetra as "S" | "M" | "L" | undefined) ?? AJUSTES_POR_DEFECTO.tamanoLetra,
            historialCorto: (s.historialCorto as boolean | undefined) ?? AJUSTES_POR_DEFECTO.historialCorto,
        };
    }, [widget?.settings]);

    const onAjustes = useCallback((patch: Partial<WidgetTraductorAjustes>) => {
        onUpdateSettings?.(patch);
    }, [onUpdateSettings]);

    const { servicio, voz } = useMemo(() => {
        const almacen = almacenLocal();
        return {
            servicio: crearServicioTraductor({
                motores: crearMotores(paginaActual()),
                almacenHistorial: almacen,
                almacenAvisos: almacen,
                opcionesHistorial: { sinHistorial: !ajustes.historialCorto },
                reloj: () => Date.now(),
            }),
            voz: typeof window !== "undefined" && "speechSynthesis" in window ? { hablar } : null,
        };
    }, [ajustes.historialCorto]);

    const [origen, setOrigen] = useState("");
    const [resultado, setResultado] = useState("");
    const [motorInfo, setMotorInfo] = useState<{ motor: IdMotor; local: boolean } | null>(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState<Error | null>(null);
    const [avisoPendiente, setAvisoPendiente] = useState<IdMotor | null>(null);
    const [motivoVoz, setMotivoVoz] = useState<string | null>(null);
    const [copiado, setCopiado] = useState(false);

    const par = useMemo(
        () => ({
            origen: ajustes.idiomasFijados[0],
            destino: ajustes.idiomasFijados[1],
        }),
        [ajustes.idiomasFijados]
    );

    const traducir = useCallback(async () => {
        if (!origen.trim()) return;
        setCargando(true);
        setError(null);
        setMotivoVoz(null);
        try {
            const r = await servicio.traducir(origen, par);
            if ("necesitaAviso" in r) {
                setAvisoPendiente(r.necesitaAviso);
            } else if ("error" in r) {
                setError(new Error(r.error));
            } else {
                setResultado(r.texto);
                setMotorInfo({ motor: r.motor, local: r.local });
            }
        } catch (e) {
            setError(e instanceof Error ? e : new Error(String(e)));
        } finally {
            setCargando(false);
        }
    }, [servicio, par, origen]);

    const reintentar = useCallback(() => {
        traducir();
    }, [traducir]);

    const alEscribir = useCallback((texto: string) => {
        setOrigen(texto);
    }, []);

    const intercambiar = useCallback(() => {
        onAjustes({ idiomasFijados: [ajustes.idiomasFijados[1], ajustes.idiomasFijados[0]] });
    }, [ajustes.idiomasFijados, onAjustes]);

    const copiar = useCallback(async () => {
        if (!resultado) return;
        try {
            await navigator.clipboard.writeText(resultado);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2000);
        } catch {
            setCopiado(false);
        }
    }, [resultado]);

    const leer = useCallback(() => {
        if (!resultado.trim()) return;
        if (!voz) {
            setMotivoVoz("La voz no está disponible en este aparato.");
            return;
        }
        const r = voz.hablar(resultado, par.destino);
        setMotivoVoz(r.ok ? null : r.motivo ?? "La voz no está disponible en este aparato.");
    }, [resultado, voz, par.destino]);

    const aceptarAviso = useCallback((motor: IdMotor) => {
        setAvisoPendiente(null);
        if (origen.trim()) void traducir();
    }, [origen, traducir]);

    const cambiarMotor = useCallback(() => {
        setAvisoPendiente(null);
    }, []);

    const vacio = !cargando && !error && !avisoPendiente && !resultado && !origen;

    return (
        <MarcoWidget
            titulo="Traductor"
            categoria="utilidades"
            icono={<Languages className="h-4 w-4" aria-hidden />}
            cargando={cargando}
            error={error}
            vacio={vacio}
            onReintentar={reintentar}
        >
            <WidgetTraductor
                ajustes={ajustes}
                onAjustes={onAjustes}
                origen={origen}
                onEscribir={alEscribir}
                resultado={resultado}
                motorInfo={motorInfo}
                avisoPendiente={avisoPendiente}
                onTraducir={traducir}
                onReintentar={reintentar}
                onIntercambiar={intercambiar}
                onCopiar={copiar}
                onLeer={leer}
                onAceptarAviso={aceptarAviso}
                onCambiarMotor={cambiarMotor}
                cargando={cargando}
                error={error}
                vozDisponible={!!voz}
                motivoVoz={motivoVoz}
                copiado={copiado}
            />
        </MarcoWidget>
    );
}

export default TraductorWidget;