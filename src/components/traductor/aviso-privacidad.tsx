"use client";

import { useEffect, useRef, useState } from "react";
import { AVISOS, type AlmacenAvisos, type IdMotor, crearAlmacenMemoria } from "@/lib/traductor/privacidad";

export interface AvisoPrivacidadProps {
    motor: IdMotor;
    onAceptar: () => void;
    onCambiarMotor: () => void;
}

export function AvisoPrivacidad({ motor, onAceptar, onCambiarMotor }: AvisoPrivacidadProps) {
    const [abierto, setAbierto] = useState(true);
    const dialogRef = useRef<HTMLDivElement>(null);
    const primerBotonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (!abierto) return;
        const timer = setTimeout(() => primerBotonRef.current?.focus(), 0);
        return () => clearTimeout(timer);
    }, [abierto]);

    useEffect(() => {
        if (!abierto) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setAbierto(false);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [abierto]);

    useEffect(() => {
        if (!abierto) return;
        const alClickFuera = (e: MouseEvent) => {
            if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
                setAbierto(false);
            }
        };
        document.addEventListener("mousedown", alClickFuera);
        return () => document.removeEventListener("mousedown", alClickFuera);
    }, [abierto]);

    if (!abierto) return null;

    const aviso = AVISOS[motor];

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm ss-capa-modal"
            role="presentation"
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) setAbierto(false);
            }}
        >
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="titulo-aviso-privacidad"
                className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
            >
                <div className="w-full max-w-md rounded-2xl border border-white/10 bg-zinc-950 p-6 shadow-2xl">
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <h2 id="titulo-aviso-privacidad" className="text-lg font-semibold text-white">
                            {aviso.titulo}
                        </h2>
                        <button
                            type="button"
                            onClick={() => setAbierto(false)}
                            className="cursor-pointer rounded-md p-1 text-white/50 hover:bg-white/10 hover:text-white"
                            aria-label="Cerrar"
                        >
                            ×
                        </button>
                    </div>
                    <div className="mb-6 rounded-lg border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                        <p>{aviso.sale}</p>
                        <p className="mt-2 text-xs text-white/60">
                            Este motor {aviso.sale_del_aparato ? "envía datos fuera de tu aparato" : "no envía datos a terceros"}.
                        </p>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button
                            type="button"
                            ref={primerBotonRef}
                            onClick={() => setAbierto(false)}
                            className="cursor-pointer rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/70 hover:bg-white/10"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={onCambiarMotor}
                            className="cursor-pointer rounded-md border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200 hover:bg-amber-500/20"
                        >
                            Usar solo en mi aparato
                        </button>
                        <button
                            type="button"
                            onClick={onAceptar}
                            className="cursor-pointer rounded-md bg-trinity-azure px-4 py-2 text-sm font-semibold text-white shadow"
                        >
                            Continuar con este motor
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function AvisoPrivacidadGestor({
    motor,
    onAceptar,
    onCambiarMotor,
}: AvisoPrivacidadProps & { almacen?: AlmacenAvisos }) {
    const [mostrar, setMostrar] = useState(false);
    const [motorActual, setMotorActual] = useState<IdMotor>(motor);
    const almacen = useRef<AlmacenAvisos>(crearAlmacenMemoria());

    useEffect(() => {
        const pendiente = AVISOS[motor];
        if (pendiente.sale_del_aparato) {
            almacen.current = almacen.current;
        }
    }, [motor]);

    useEffect(() => {
        if (!mostrar) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setMostrar(false);
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => document.removeEventListener("keydown", onKeyDown);
    }, [mostrar]);

    if (!mostrar) return null;

    return (
        <AvisoPrivacidad
            motor={motorActual}
            onAceptar={() => {
                onAceptar();
                setMostrar(false);
            }}
            onCambiarMotor={() => {
                onCambiarMotor();
                setMostrar(false);
            }}
        />
    );
}