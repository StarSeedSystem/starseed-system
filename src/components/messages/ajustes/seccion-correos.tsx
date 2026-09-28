"use client";

/**
 * Ajustes › Correos (2026-09-28): firma, vista, imágenes remotas, confirmar antes de enviar y la
 * dirección externa vinculada (antes solo se veía en el compositor y se cambiaba en /cuenta;
 * sigue guardándose en `user_settings.prefs.externalEmail`).
 */

import { useEffect, useRef, useState } from "react";
import { Loader2, Link2 } from "lucide-react";
import { toast } from "sonner";
import { getLinkedExternalEmail, setLinkedExternalEmail } from "@/lib/mail/os-mail";
import type { AjustesMensajeriaApi } from "@/lib/mensajeria/ajustes-tipos";
import { ACENTO } from "@/components/messages/marco/estilos";
import { Bloque, Fila, FilaInterruptor, FilaOpciones, Nota } from "./controles";

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function DireccionExterna() {
    const [actual, setActual] = useState("");
    const [borrador, setBorrador] = useState("");
    const [cargando, setCargando] = useState(true);
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let vivo = true;
        void getLinkedExternalEmail()
            .then((v) => {
                if (!vivo) return;
                setActual(v);
                setBorrador(v);
            })
            .finally(() => vivo && setCargando(false));
        return () => {
            vivo = false;
        };
    }, []);

    const guardar = async (valor: string) => {
        const v = valor.trim();
        if (v && !RE_CORREO.test(v)) {
            setError("Escribe una dirección válida, como nombre@ejemplo.com");
            return;
        }
        setError(null);
        setGuardando(true);
        try {
            const ok = await setLinkedExternalEmail(v);
            if (!ok) {
                setError("No se pudo guardar. Comprueba que has iniciado sesión y vuelve a intentarlo.");
                return;
            }
            setActual(v);
            setBorrador(v);
            toast.success(v ? "Dirección externa vinculada." : "Dirección externa desvinculada.");
        } finally {
            setGuardando(false);
        }
    };

    return (
        <Fila
            etiqueta={<span className="inline-flex items-center gap-2"><Link2 className="h-4 w-4 text-[#007FFF]" /> Dirección externa vinculada</span>}
            detalle="Tu correo de fuera (Gmail, etc.). Se muestra al escribir un correo externo."
            apilada
        >
            <form
                className="flex flex-col gap-2 sm:flex-row"
                onSubmit={(e) => {
                    e.preventDefault();
                    void guardar(borrador);
                }}
            >
                <input
                    type="email"
                    value={borrador}
                    onChange={(e) => setBorrador(e.target.value)}
                    disabled={cargando}
                    placeholder={cargando ? "Cargando…" : "nombre@ejemplo.com"}
                    aria-label="Dirección externa vinculada"
                    className="h-9 min-w-0 flex-1 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[13px] text-white placeholder:text-white/40 focus:border-[#007FFF]/60 focus:outline-none"
                />
                <div className="flex gap-2">
                    <button
                        type="submit"
                        disabled={cargando || guardando || borrador.trim() === actual}
                        className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-xl bg-[#007FFF] px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {guardando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {actual ? "Guardar" : "Vincular"}
                    </button>
                    {actual && (
                        <button
                            type="button"
                            disabled={guardando}
                            onClick={() => void guardar("")}
                            className="h-9 cursor-pointer rounded-xl bg-white/[0.06] px-4 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.12] disabled:opacity-40"
                        >
                            Desvincular
                        </button>
                    )}
                </div>
            </form>
            {error && <p role="alert" className="text-[12px] text-rose-300">{error}</p>}
        </Fila>
    );
}

export function SeccionCorreos({ api }: { api: AjustesMensajeriaApi }) {
    const c = api.ajustes.correos;
    const [firma, setFirma] = useState(c.firma);
    const ultimaGuardada = useRef(c.firma);

    // Si la firma cambia desde otro dispositivo, se refleja (salvo que estés escribiéndola).
    useEffect(() => {
        if (c.firma !== ultimaGuardada.current) {
            ultimaGuardada.current = c.firma;
            setFirma(c.firma);
        }
    }, [c.firma]);

    // Guardado sin prisa: medio segundo después de dejar de escribir (y al salir del campo).
    useEffect(() => {
        if (firma === ultimaGuardada.current) return;
        const t = setTimeout(() => {
            ultimaGuardada.current = firma;
            api.cambiar("correos", { firma });
        }, 500);
        return () => clearTimeout(t);
    }, [firma, api]);

    const guardarFirma = () => {
        if (firma === ultimaGuardada.current) return;
        ultimaGuardada.current = firma;
        api.cambiar("correos", { firma });
    };

    return (
        <div className="space-y-6">
            <Bloque titulo="Escribir">
                <Fila etiqueta="Firma" detalle="Se añade al final de cada correo nuevo; puedes editarla antes de enviar." apilada>
                    <textarea
                        value={firma}
                        onChange={(e) => setFirma(e.target.value)}
                        onBlur={guardarFirma}
                        rows={4}
                        maxLength={1000}
                        placeholder={"Con cariño,\nTu nombre · StarSeed"}
                        aria-label="Firma de tus correos"
                        className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[14px] leading-relaxed text-white placeholder:text-white/35 focus:border-[#007FFF]/60 focus:outline-none"
                    />
                </Fila>
                <FilaInterruptor
                    etiqueta="Confirmar antes de enviar"
                    detalle="Te pregunta una última vez antes de que salga cada correo."
                    checked={c.confirmarEnvio}
                    onChange={(confirmarEnvio) => api.cambiar("correos", { confirmarEnvio })}
                />
            </Bloque>

            <Bloque titulo="Leer">
                <FilaOpciones
                    etiqueta="Vista de los correos"
                    detalle={c.vista === "conversacion" ? "Todo el hilo abierto, de principio a fin." : "Cada mensaje plegado; se abre el último."}
                    valor={c.vista}
                    opciones={[
                        { id: "conversacion", etiqueta: "Conversación" },
                        { id: "lista", etiqueta: "Lista" },
                    ]}
                    onChange={(vista) => api.cambiar("correos", { vista })}
                    color={ACENTO.aurora}
                />
                <FilaInterruptor
                    etiqueta="Cargar imágenes remotas"
                    detalle="Las imágenes alojadas fuera de StarSeed pueden avisar al remitente de que abriste el correo."
                    checked={c.cargarImagenesRemotas}
                    onChange={(cargarImagenesRemotas) => api.cambiar("correos", { cargarImagenesRemotas })}
                />
            </Bloque>

            <Bloque titulo="Cuenta">
                <DireccionExterna />
                <div className="px-4 pb-4">
                    <Nota>Tu dirección interna @star.seed no cambia: esta es solo la de fuera que quieres tener a mano.</Nota>
                </div>
            </Bloque>
        </div>
    );
}

export default SeccionCorreos;
