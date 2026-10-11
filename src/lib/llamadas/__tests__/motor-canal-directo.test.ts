"use client";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { vi } from "vitest";
import { MotorLlamada, OpcionesMotor } from "@/lib/llamadas/motor";
import { type ConexionCanal } from "@/lib/llamadas/senalizacion";
import { type Identidad } from "@/lib/llamadas/identidad";
import type { MetaPresencia, SenalLlamada, EstadoCanal } from "@/lib/llamadas/tipos";

// Mock the senalizacion module to return null from abrirCanalLlamada
vi.mock("@/lib/llamadas/senalizacion", async (importOriginal) => {
    const original = await importOriginal();
    return {
        ...original as any,
        abrirCanalLlamada: vi.fn(() => null),
    };
});

const IDENTIDAD: Identidad = {
    uid: "test-uid",
    base: "test-browser",
    nombre: "Test User",
    avatar: null,
    invitado: false,
};

const OPCIONES_BASE: OpcionesMotor = {
    sesionId: "test-sesion",
    yo: IDENTIDAD,
};

function crearConexionFalsa(tema = "llamada:test-sesion", suscrito = true, estado = "dentro"): ConexionCanal {
    const eventosPresencia: ((p: MetaPresencia[]) => void)[] = [];
    const eventosSenal: ((s: SenalLlamada) => void)[] = [];
    const eventosSuscrito: ((ok: boolean) => void)[] = [];
    const eventosEstado: ((e: EstadoCanal) => void)[] = [];
    let meta: unknown = null;

    const conn: ConexionCanal = {
        sesionId: "test-sesion",
        tema,
        clave: () => "test-clave",
        suscrito: () => suscrito,
        estado: () => estado as "conectando" | "dentro" | "reconectando" | "denegado",
        presencia: () => [],
        onPresencia: (cb: (p: MetaPresencia[]) => void) => {
            eventosPresencia.push(cb);
            return () => {
                const idx = eventosPresencia.indexOf(cb);
                if (idx !== -1) eventosPresencia.splice(idx, 1);
            };
        },
        onSenal: (cb: (s: SenalLlamada) => void) => {
            eventosSenal.push(cb);
            return () => {
                const idx = eventosSenal.indexOf(cb);
                if (idx !== -1) eventosSenal.splice(idx, 1);
            };
        },
        onSuscrito: (cb: (ok: boolean) => void) => {
            eventosSuscrito.push(cb);
            return () => {
                const idx = eventosSuscrito.indexOf(cb);
                if (idx !== -1) eventosSuscrito.splice(idx, 1);
            };
        },
        onEstado: (cb: (e: EstadoCanal) => void) => {
            eventosEstado.push(cb);
            return () => {
                const idx = eventosEstado.indexOf(cb);
                if (idx !== -1) eventosEstado.splice(idx, 1);
            };
        },
        enviar: (s) => {
            for (const cb of eventosSenal) cb(s);
        },
        publicar: (m) => {
            meta = m;
        },
        retirar: () => {
            meta = null;
        },
        soltar: () => {
        },
    };

    return conn;
}

afterEach(() => {
    vi.clearAllMocks();
});

globalThis.RTCPeerConnection = vi.fn(() => {
    const pc = {
        localDescription: null,
        remoteDescription: null,
        iceConnectionState: "new",
        connectionState: "new",
        signalingState: "stable",
        onicecandidate: null as any,
        onnegotiationneeded: null as any,
        oniceconnectionstatechange: null as any,
        onconnectionstatechange: null as any,
        onsignalingstatechange: null as any,
        ontrack: null as any,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        createDataChannel: vi.fn(),
        createOffer: vi.fn(),
        setLocalDescription: vi.fn(),
        setRemoteDescription: vi.fn(),
        addIceCandidate: vi.fn(),
        close: vi.fn(),
        restartIce: vi.fn(),
    };
    return pc;
}) as any;

describe("MotorLlamada - canales directos", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("devuelve true cuando entrar() usa canales directos", async () => {
        const canalDirecto = crearConexionFalsa();

        const opciones: OpcionesMotor = {
            ...OPCIONES_BASE,
            canalesDirectos: () => [canalDirecto],
        };
        const motor = new MotorLlamada(opciones);

        const resultado = motor.entrar();

        expect(resultado).toBe(true);
        expect(motor.estado().fase).toBe("esperando");
        expect(motor.canales.length).toBe(1);
        expect(motor.canales[0].directo).toBe(true);
    });

    it("cuando un canal directo publica presencia, el motor crea su par", () => {
        const canalDirecto = crearConexionFalsa();

        const opciones: OpcionesMotor = {
            ...OPCIONES_BASE,
            canalesDirectos: () => [canalDirecto],
        };
        const motor = new MotorLlamada(opciones);
        motor.entrar();

        canalDirecto.publicar({
            id: "person-2",
            uid: "person-2-uid",
            nombre: "Person 2",
            avatar: null,
            invitado: false,
            micro: true,
            camara: false,
            pantalla: false,
            unido: 123,
        });

        const participantes = motor.estado().participantes;
        expect(participantes.some((p) => p.id === "person-2")).toBe(true);
        expect(motor.pares.has("person-2")).toBe(true);
        expect(globalThis.RTCPeerConnection).toHaveBeenCalledWith(
            expect.objectContaining({ iceServers: expect.any(Array) })
        );
    });

    it("revisarCanal nunca suelta el canal directo", () => {
        const canalDirecto = crearConexionFalsa();

        const opciones: OpcionesMotor = {
            ...OPCIONES_BASE,
            canalesDirectos: () => [canalDirecto],
        };
        const motor = new MotorLlamada(opciones);
        motor.entrar();

        const antes = motor.canales.length;
        expect(motor.canales.some((c) => c.directo)).toBe(true);
        expect(motor.canales.some((c) => !c.directo)).toBe(true);

        motor.revisarCanal(false);

        const despues = motor.canales.length;
        expect(despues).toBe(antes);
        expect(motor.canales.some((c) => c.directo)).toBe(true);
    });
});