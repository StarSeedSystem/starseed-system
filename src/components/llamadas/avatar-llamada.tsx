"use client";

/**
 * Avatar grande de una persona en llamada: foto o iniciales sobre su color, un anillo que
 * respira y un halo que sigue su voz. Se usa en llamadas de voz, cuando alguien apaga la
 * cámara y en el timbre.
 */
import { useState } from "react";
import { colorDePersona, iniciales } from "@/lib/llamadas/formato";
import estilos from "./llamadas.module.css";

export function AvatarLlamada({
    id,
    nombre,
    avatar,
    tam = 96,
    nivel = 0,
    hablando = false,
    animado = true,
    ondas = false,
}: {
    id: string;
    nombre: string;
    avatar: string | null;
    tam?: number;
    /** Nivel de voz 0..1 (anima el halo). */
    nivel?: number;
    hablando?: boolean;
    /** Anillo que respira (llamadas de voz). */
    animado?: boolean;
    /** Ondas expansivas (timbre / esperando respuesta). */
    ondas?: boolean;
}) {
    const [fotoRota, setFotoRota] = useState(false);
    const color = colorDePersona(id);
    const brillo = hablando ? 0.35 + Math.min(1, nivel) * 0.65 : 0;
    const foto = avatar && !fotoRota ? avatar : null;
    return (
        <div className="relative grid shrink-0 place-items-center" style={{ width: tam, height: tam }} aria-hidden="true">
            {ondas && (
                <>
                    <span className={`absolute inset-0 rounded-full ${estilos.onda}`} style={{ boxShadow: `0 0 0 2px ${color}88` }} />
                    <span className={`absolute inset-0 rounded-full ${estilos.ondaRetardada}`} style={{ boxShadow: `0 0 0 2px ${color}66` }} />
                </>
            )}
            {animado && (
                <span
                    className={`absolute -inset-2 rounded-full ${estilos.anillo}`}
                    style={{ background: `radial-gradient(circle, ${color}33 55%, transparent 72%)` }}
                />
            )}
            <span
                className={`relative grid h-full w-full place-items-center overflow-hidden rounded-full ${estilos.halo}`}
                style={{
                    background: foto ? "#0b0d1a" : `linear-gradient(145deg, ${color}, ${color}88)`,
                    boxShadow: hablando
                        ? `0 0 0 3px #10B981, 0 0 ${Math.round(18 + brillo * 30)}px ${Math.round(4 + brillo * 10)}px rgba(16,185,129,${(0.25 + brillo * 0.45).toFixed(2)})`
                        : "0 0 0 1px rgba(255,255,255,.12), inset 0 1px 0 rgba(255,255,255,.08)",
                    transform: hablando ? `scale(${(1 + brillo * 0.04).toFixed(3)})` : undefined,
                }}
            >
                {foto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={foto} alt="" className="h-full w-full object-cover" onError={() => setFotoRota(true)} referrerPolicy="no-referrer" />
                ) : (
                    <span className="select-none font-semibold text-white" style={{ fontSize: Math.max(12, Math.round(tam * 0.34)) }}>
                        {iniciales(nombre)}
                    </span>
                )}
            </span>
        </div>
    );
}
