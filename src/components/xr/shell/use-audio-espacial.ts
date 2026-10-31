"use client";
/**
 * StarSeed XR · use-audio-espacial.ts (XR1010AB · §3 h y d). Envuelve `crearMotorAudio` y lo ata a la
 * escena: el `AudioContext` no nace ni se reanuda hasta un gesto real y la cabeza se lee en `useFrame`
 * a 30 Hz (no por fotograma). Privacidad (§3 k): solo se conectan fuentes de LA MISMA sala (`voz-audio`),
 * aquí no se graba nada y el micrófono propio arranca silenciado en salas públicas (lo aplica XR1010P).
 * Lo cablea XR1010AS.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3 } from "three";
import type { NivelCalidad, Vec3 } from "@/lib/xr/tipos";
import { crearMotorAudio, type AudioContextLike, type EntradaAudio, type MotorAudio, type ZonaAudio } from "./audio-espacial";

type ConstructorAudio = new () => AudioContextLike;
export type EstadoAudioXR = "sin-contexto" | "esperando-gesto" | "activo" | "suspendido";
export interface OpcionesAudioXR {
    nivel: NivelCalidad;
    /** Solo se conecta el audio de personas de esta misma sala (privacidad). */
    salaId: string;
    /** Poses de las demás personas; la escena las refresca cuando llegan. */
    poses?: readonly { id: string; pos: Vec3 }[];
    /** Zonas activas ya resueltas: quién está dentro y si la cabeza local está dentro. */
    zonas?: readonly ZonaAudio[];
    /** En sala pública el micrófono propio arranca silenciado. */
    salaPublica?: boolean;
}
export interface AudioEspacial {
    motor: MotorAudio | null;
    estado: EstadoAudioXR;
    /** Llamar SOLO desde un gesto (clic, toque, gatillo): sin gesto no se reanuda. */
    reanudar(): Promise<void>;
    anadirFuente(id: string, entrada: EntradaAudio, salaFuente: string): boolean;
    quitarFuente(id: string): boolean;
    microfonoAbierto: boolean;
    ponerMicrofono(abierto: boolean): void;
}

export function useAudioEspacial(o: OpcionesAudioXR): AudioEspacial {
    const [motor, setMotor] = useState<MotorAudio | null>(null);
    const [estado, setEstado] = useState<EstadoAudioXR>("esperando-gesto");
    const [microfonoAbierto, setMicrofonoAbierto] = useState(!o.salaPublica);
    const ctxRef = useRef<AudioContextLike | null>(null);
    const motorRef = useRef<MotorAudio | null>(null);
    const nivelRef = useRef(o.nivel);
    nivelRef.current = o.nivel;

    useEffect(() => { if (o.salaPublica) setMicrofonoAbierto(false); }, [o.salaPublica]);

    // Recrear el motor cuando cambia el nivel, conservando el contexto ya abierto.
    useEffect(() => {
        if (!ctxRef.current) return;
        const m = crearMotorAudio(ctxRef.current, o.nivel);
        motorRef.current = m;
        setMotor(m);
    }, [o.nivel]);

    const reanudar = useCallback(async () => {
        try {
            if (!ctxRef.current) {
                const w = window as unknown as { AudioContext?: ConstructorAudio; webkitAudioContext?: ConstructorAudio };
                const Ctor = w.AudioContext ?? w.webkitAudioContext;
                if (!Ctor) { setEstado("sin-contexto"); return; }
                ctxRef.current = new Ctor();
                const m = crearMotorAudio(ctxRef.current, nivelRef.current);
                motorRef.current = m;
                setMotor(m);
            }
            const ctx = ctxRef.current as AudioContextLike & { resume?: () => Promise<void>; state?: string };
            await ctx.resume?.();
            setEstado(ctx.state === "suspended" ? "suspendido" : "activo");
        } catch {
            setEstado("suspendido");
        }
    }, []);

    // Sin gesto de la persona el navegador no deja sonar: un solo intento por gesto.
    useEffect(() => {
        const alGesto = () => { void reanudar(); };
        window.addEventListener("pointerdown", alGesto, { once: true, passive: true });
        window.addEventListener("keydown", alGesto, { once: true });
        return () => {
            window.removeEventListener("pointerdown", alGesto);
            window.removeEventListener("keydown", alGesto);
        };
    }, [reanudar]);

    useEffect(() => { for (const p of o.poses ?? []) motor?.moverFuente(p.id, p.pos); }, [o.poses, motor]);
    useEffect(() => { motor?.aplicarZona(o.zonas ?? []); }, [o.zonas, motor]);

    // Cabeza a 30 Hz: suficiente para el oído y sin coste por fotograma.
    const acumulado = useRef(0);
    const adelante = useMemo(() => new Vector3(), []);
    const arriba = useMemo(() => new Vector3(), []);
    useFrame((fotograma, dt) => {
        acumulado.current += dt;
        if (acumulado.current < 1 / 30) return;
        acumulado.current = 0;
        const m = motorRef.current;
        if (!m) return;
        const cam = fotograma.camera;
        adelante.set(0, 0, -1).applyQuaternion(cam.quaternion);
        arriba.set(0, 1, 0).applyQuaternion(cam.quaternion);
        m.actualizarOyente(
            [cam.position.x, cam.position.y, cam.position.z],
            [adelante.x, adelante.y, adelante.z],
            [arriba.x, arriba.y, arriba.z],
        );
    });

    const anadirFuente = useCallback((id: string, entrada: EntradaAudio, salaFuente: string) => {
        if (salaFuente !== o.salaId) return false;
        return motorRef.current?.anadirFuente(id, entrada) ?? false;
    }, [o.salaId]);
    const quitarFuente = useCallback((id: string) => motorRef.current?.quitarFuente(id) ?? false, []);
    const ponerMicrofono = useCallback((abierto: boolean) => setMicrofonoAbierto(abierto), []);

    return { motor, estado, reanudar, anadirFuente, quitarFuente, microfonoAbierto, ponerMicrofono };
}
