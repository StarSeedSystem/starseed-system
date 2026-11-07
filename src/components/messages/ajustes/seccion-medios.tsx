"use client";

/**
 * Ajustes de Mensajería › Medio de transmisión (MSJ1107A · 2026-11-07): los valores GENERALES
 * para todos los chats, grupos, correos y neuronas (cada chat puede tener los suyos en sus
 * ajustes) y si cada burbuja enseña por dónde viajó.
 */

import { Bloque, FilaInterruptor, Nota } from "./controles";
import { PreferenciasMedioForm } from "@/components/messages/medios/bloque-medio";
import { usePreferenciasMedio } from "@/lib/mensajeria/medios/preferencias-store";
import type { AjustesMensajeriaApi } from "@/lib/mensajeria/ajustes-tipos";
import { ACENTO } from "@/components/messages/marco/estilos";

// La sección no usa la API de ajustes de Mensajería: sus valores viven en su propio almacén.
export function SeccionMedios(_props: { api?: AjustesMensajeriaApi }) {
    const medios = usePreferenciasMedio();
    const n = Object.keys(medios.estado.porChat).length;
    return (
        <div className="space-y-6">
            <Bloque
                titulo="Por dónde salen tus mensajes"
                descripcion="Para todos tus chats, grupos, correos y neuronas. Cada chat puede tener los suyos en «Ajustes del chat»."
            >
                <div className="px-4 py-3.5">
                    <PreferenciasMedioForm ambito="global" preferencias={medios.global} onCambiar={medios.cambiarGlobal} />
                </div>
            </Bloque>
            <Bloque titulo="En cada mensaje">
                <FilaInterruptor
                    etiqueta="Mostrar por dónde viajó"
                    detalle="Una pastilla discreta en cada burbuja (malla, Wi-Fi local, LoRa, servidor…). Tócala para ver el detalle: enlace, latencia medida y confirmación."
                    checked={medios.mostrarVia}
                    onChange={medios.cambiarMostrarVia}
                />
            </Bloque>
            <Nota color={ACENTO.esmeralda}>
                Un tipo de chat que no puede usar ninguno de tus medios elegidos sigue en Automático (por ejemplo, los correos solo viajan por el
                buzón @star.seed). Nada se inventa: si un enlace no se midió, verás «Sin medir».
                {n > 0 ? ` Hay ${n} ${n === 1 ? "chat" : "chats"} con su propio medio.` : ""}
            </Nota>
        </div>
    );
}

export default SeccionMedios;
