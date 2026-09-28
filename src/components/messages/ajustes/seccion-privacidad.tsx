"use client";

/**
 * Ajustes › Privacidad (2026-09-28). Todo recíproco y sin castigos: quien no enseña su «en línea»
 * tampoco ve el de los demás; lo de desconocidos llega a Solicitudes, sin avisos, y nada se
 * bloquea ni se borra.
 */

import type { AjustesMensajeriaApi } from "@/lib/mensajeria/ajustes-tipos";
import { ACENTO } from "@/components/messages/marco/estilos";
import { Bloque, FilaInterruptor, FilaOpciones, Nota } from "./controles";

export function SeccionPrivacidad({ api }: { api: AjustesMensajeriaApi }) {
    const p = api.ajustes.privacidad;
    return (
        <div className="space-y-6">
            <Bloque titulo="Presencia">
                <FilaOpciones
                    etiqueta="En línea y última vez"
                    detalle={
                        p.mostrarEnLinea === "nadie"
                            ? "Nadie ve si estás en línea ni cuándo entraste. Es recíproco: tú tampoco verás el de los demás."
                            : "Tus chats ven si estás en línea y cuándo entraste por última vez."
                    }
                    valor={p.mostrarEnLinea}
                    opciones={[
                        { id: "todos", etiqueta: "Todos" },
                        { id: "nadie", etiqueta: "Nadie" },
                    ]}
                    onChange={(mostrarEnLinea) => api.cambiar("privacidad", { mostrarEnLinea })}
                    color={ACENTO.esmeralda}
                />
                <FilaInterruptor
                    etiqueta="Mostrar «escribiendo…»"
                    detalle="Deja que vean cuándo estás escribiendo en un chat."
                    checked={p.mostrarEscribiendo}
                    onChange={(mostrarEscribiendo) => api.cambiar("privacidad", { mostrarEscribiendo })}
                />
            </Bloque>

            <Bloque titulo="Lectura">
                <FilaInterruptor
                    etiqueta="Confirmaciones de lectura"
                    detalle="El doble visto que avisa de que ya leíste un mensaje. Puedes cambiarlo también chat a chat."
                    checked={p.confirmacionesLectura}
                    onChange={(confirmacionesLectura) => api.cambiar("privacidad", { confirmacionesLectura })}
                />
            </Bloque>

            <Bloque titulo="Quién puede escribirme">
                <FilaOpciones
                    etiqueta="Pueden abrirme un chat"
                    valor={p.escribirme}
                    opciones={[
                        { id: "todos", etiqueta: "Todos" },
                        { id: "contactos", etiqueta: "Solo contactos" },
                    ]}
                    onChange={(escribirme) => api.cambiar("privacidad", { escribirme })}
                    color={ACENTO.contactos}
                />
                <div className="px-4 pb-4">
                    <Nota color={ACENTO.contactos}>
                        {p.escribirme === "contactos"
                            ? "Lo demás llega a «Solicitudes», sin avisos. Nadie queda bloqueado: si aceptas, pasa a tus chats."
                            : "Cualquier persona de la red puede escribirte y te avisaremos como de costumbre."}
                    </Nota>
                </div>
            </Bloque>
        </div>
    );
}

export default SeccionPrivacidad;
