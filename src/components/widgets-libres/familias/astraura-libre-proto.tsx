"use client";
import * as React from "react";
import { Mic, MicOff } from "lucide-react";
import type { DashboardWidget } from "@/components/dashboard/dashboard-types";
import { WidgetLibre } from "@/components/widgets-libres/widget-libre";
import { AURORA_CHATLOG_CHANGE_EVENT, AURORA_CHATLOG_KEY, readAuroraChatEntries, type AuroraChatLogEntry } from "@/lib/aurora/aurora-chat-log";
import { AURORA_EXOCORTEX_OPEN_EVENT } from "@/lib/aurora/aurora-orb-bus";
import { openAurora } from "@/lib/aurora/open-aurora";
import { resolverDiseno, tamanoDe, type Diseno, type PropsDiseno } from "@/lib/widgets/astraura/disenos";
import { useEstadoAstraura } from "./use-estado-astraura";
import { useDisenoAstraura } from "./use-diseno-astraura";
import { SelectorDisenoAstraura } from "./selector-diseno-astraura";
import DisenoMinimo from "./diseno-minimo";
import DisenoConversacion from "./diseno-conversacion";
import DisenoVoz from "./diseno-voz";
import { DisenoAcciones } from "./diseno-acciones";
import { Accion, esTactil, useClaseForzada, useDispositivo, useEnPantalla } from "./inicio-piezas";
import { Preguntar, SUGERENCIAS } from "./astraura-libre";
import { PALETAS } from "@/lib/protomolecula/orbe4d/coreografia";

function abrirChat() {
    try { window.dispatchEvent(new CustomEvent(AURORA_EXOCORTEX_OPEN_EVENT)); } catch { return; }
}

const FRACCIONES: Record<Diseno, number> = { minimo: 0.34, conversacion: 0.28, acciones: 0.22, voz: 0.52 };

export function AstrauraLibreProto({
    widget,
    onUpdateSettings,
}: {
    widget?: DashboardWidget;
    onUpdateSettings?: (patch: Record<string, unknown>) => void;
}) {
    const [entradas, setEntradas] = React.useState<AuroraChatLogEntry[]>([]);
    React.useEffect(() => {
        const leer = () => {
            try {
                setEntradas(readAuroraChatEntries());
            } catch {
                setEntradas([]);
            }
        };
        const alGuardar = (evento: StorageEvent) => {
            if (evento.key === AURORA_CHATLOG_KEY) leer();
        };
        leer();
        window.addEventListener(AURORA_CHATLOG_CHANGE_EVENT, leer);
        window.addEventListener("storage", alGuardar);
        return () => {
            window.removeEventListener(AURORA_CHATLOG_CHANGE_EVENT, leer);
            window.removeEventListener("storage", alGuardar);
        };
    }, []);

    const ultima = React.useMemo(
        () => [...entradas].reverse().find((entrada) => entrada.role === "aurora"),
        [entradas],
    );
    const hilo = React.useMemo(
        () => entradas.slice(-6).map(({ role, text, ts }) => ({ role, text, ts })),
        [entradas],
    );
    const [ref, visible] = useEnPantalla<HTMLDivElement>();
    const { estado, voz, escuchar, callar } = useEstadoAstraura(visible, ultima?.ts ?? null);
    const dispositivo = useDispositivo();
    const tactil = esTactil(dispositivo);
    const forzada = useClaseForzada();
    const [diseno, elegir] = useDisenoAstraura(widget, onUpdateSettings);
    const [ahora, setAhora] = React.useState(0);
    React.useEffect(() => setAhora(Date.now()), [entradas]);

    return (
        <div ref={ref} className="h-full w-full">
            <WidgetLibre forma="ninguna" acento={PALETAS.astraura.colores[0]} acento2={PALETAS.astraura.colores[1]}
                etiqueta={ultima ? `Astraura dijo: ${ultima.text.slice(0, 80)}` : "Astraura"}>
                {({ clase: medida, ancho, alto }) => {
                    const clase = forzada ?? medida;
                    const resuelto = resolverDiseno(diseno, {
                        tamano: tamanoDe(clase), tactil, hayVoz: voz, hayConversacion: hilo.length > 0,
                    });
                    const tam = Math.min(170, Math.min(ancho, alto) * FRACCIONES[resuelto.diseno]);
                    const props: PropsDiseno = {
                        estado: estado as PropsDiseno["estado"], tam,
                        ultima: ultima ? { texto: ultima.text, ts: ultima.ts } : null, hilo, ahora: ahora || Date.now(), tactil, voz,
                        preguntar: <Preguntar tactil={tactil} />,
                        botonVoz: voz ? <Accion icono={estado === "escuchando" ? MicOff : Mic} color={PALETAS.astraura.colores[2]} grande={tactil} onClick={estado === "escuchando" ? callar : escuchar} aria-label={estado === "escuchando" ? "Dejar de escuchar" : "Hablar con Astraura por voz"}>{estado === "escuchando" ? "Parar" : "Hablar"}</Accion> : null,
                        sugerencias: SUGERENCIAS,
                        onAbrirChat: abrirChat,
                        onSugerencia: (texto) => { void openAurora({ prompt: texto, reveal: true }); },
                    };
                    const contenido = resuelto.diseno === "minimo" ? <DisenoMinimo {...props} />
                        : resuelto.diseno === "conversacion" ? <DisenoConversacion {...props} />
                            : resuelto.diseno === "voz" ? <DisenoVoz {...props} /> : <DisenoAcciones {...props} />;
                    return (
                        <div className="relative h-full w-full">
                            <div className="absolute right-0 top-0 z-20 [&_button]:cursor-pointer">
                                <SelectorDisenoAstraura valor={diseno} onCambiar={elegir} degradado={resuelto.degradado} />
                            </div>
                            {contenido}
                        </div>
                    );
                }}
            </WidgetLibre>
        </div>
    );
}

export default AstrauraLibreProto;
