/**
 * Capas mesh y colectiva con efecto real (Ola 365 · CC6): con la capa mesh apagada la LAN
 * deja de compartir la conciencia colectiva, y con la colectiva apagada el backend 1.58
 * recibe `aprendizaje_colectivo: false`. El interruptor actúa al momento.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { preferencesFor } from "@/ai/providers/astraura-158";
import { INTELLIGENCE_KEY } from "@/ai/astraura/router";
import { CLAVE_INTELIGENCIA, preferenciaCapasGuardada } from "@/lib/astraura/capas-conciencia";
import { capaMeshCompartiendo, setupConcienciaSync } from "@/lib/network/lan-sync";
import type { MeshHandle } from "@/lib/network/webrtc-mesh";

let guardado: Record<string, string> = {};
const almacen = {
    getItem: (k: string) => (k in guardado ? guardado[k] : null),
    setItem: (k: string, v: string) => {
        guardado[k] = v;
    },
};
const guardar = (campos: Record<string, unknown>) => almacen.setItem(CLAVE_INTELIGENCIA, JSON.stringify(campos));

function mallaFalsa() {
    const enviados: string[] = [];
    let alRecibir: ((deviceId: string, data: string) => void) | null = null;
    const mesh: MeshHandle = {
        myDeviceId: "nodo-1",
        userId: "u1",
        supported: true,
        signalingTransport: "realtime",
        connectToDevice: async () => ({ deviceId: "nodo-2", state: "connected", channelOpen: true, lastUpdate: Date.now() }),
        onPeer: (ev) => {
            alRecibir = ev.onMessage ?? null;
            return () => {
                alRecibir = null;
            };
        },
        sendToPeer: () => true,
        broadcast: (data: string) => {
            enviados.push(data);
            return 1;
        },
        getPeers: () => [],
        closeMesh: () => {},
    };
    return { mesh, enviados, recibir: (msg: unknown) => alRecibir?.("nodo-2", JSON.stringify(msg)) };
}

const CAPACIDADES = { nodoId: "nodo-1", medio: "mac", needle: null, bitnet: null, jev: true, ramLibreMb: 512, cpu: 5, t: 1 };

beforeEach(() => {
    guardado = {};
    vi.stubGlobal("window", { localStorage: almacen });
});
afterEach(() => vi.unstubAllGlobals());

describe("preferenciaCapasGuardada", () => {
    it("usa la misma clave que el enrutador", () => {
        expect(CLAVE_INTELIGENCIA).toBe(INTELLIGENCE_KEY);
    });
    it("sin nada guardado o con datos rotos, todo encendido", () => {
        expect(preferenciaCapasGuardada().capas).toEqual({ local: true, mesh: true, nube: true, colectiva: true });
        almacen.setItem(CLAVE_INTELIGENCIA, "{roto");
        expect(preferenciaCapasGuardada().activo).toBe(true);
        expect(preferenciaCapasGuardada(null).activo).toBe(true);
    });
});

describe("setupConcienciaSync respeta la capa mesh", () => {
    it("con la capa mesh encendida (por defecto) publica", () => {
        const { mesh, enviados } = mallaFalsa();
        setupConcienciaSync(mesh).publicarCapacidades(CAPACIDADES as never);
        expect(enviados).toHaveLength(1);
    });

    it("con la capa mesh apagada no publica nada", () => {
        guardar({ capa158Mesh: false });
        const { mesh, enviados } = mallaFalsa();
        const sync = setupConcienciaSync(mesh);
        sync.publicarCapacidades(CAPACIDADES as never);
        sync.publicarManifiesto({ sha: "x" } as never);
        sync.publicarExperiencias([]);
        expect(enviados).toHaveLength(0);
        expect(capaMeshCompartiendo()).toBe(false);
    });

    it("con el maestro 1.58 apagado tampoco aplica lo que llega, y el cambio actúa al momento", () => {
        const onCapacidades = vi.fn();
        const { mesh, recibir, enviados } = mallaFalsa();
        const sync = setupConcienciaSync(mesh, { onCapacidades });

        recibir({ tema: "astraura/capacidades", origen: "nodo-2", payload: { ...CAPACIDADES, nodoId: "nodo-2" }, t: 2 });
        expect(onCapacidades).toHaveBeenCalledTimes(1);

        guardar({ astraura158Activo: false });
        recibir({ tema: "astraura/capacidades", origen: "nodo-2", payload: { ...CAPACIDADES, nodoId: "nodo-2" }, t: 3 });
        sync.publicarCapacidades(CAPACIDADES as never);
        expect(onCapacidades).toHaveBeenCalledTimes(1);
        expect(enviados).toHaveLength(0);
    });
});

describe("preferencesFor lleva las capas al backend 1.58", () => {
    it("por defecto aprende en colectivo y lleva las cuatro capas encendidas", () => {
        const p = preferencesFor("aurora", { model: "astraura-158-auto" });
        expect(p.aprendizaje_colectivo).toBe(true);
        expect(p.capas_conciencia).toEqual({ local: true, mesh: true, nube: true, colectiva: true });
    });

    it("con la capa colectiva apagada, aprendizaje_colectivo:false", () => {
        guardar({ capa158Colectiva: false });
        const p = preferencesFor("aurora", { model: "astraura-158-auto" });
        expect(p.aprendizaje_colectivo).toBe(false);
        expect(p.capas_conciencia?.colectiva).toBe(false);
        expect(p.capas_conciencia?.local).toBe(true);
    });

    it("con el maestro apagado, ninguna capa efectiva", () => {
        guardar({ astraura158Activo: false });
        const p = preferencesFor("aurora", { model: "astraura-158-auto" });
        expect(p.aprendizaje_colectivo).toBe(false);
        expect(p.capas_conciencia).toEqual({ local: false, mesh: false, nube: false, colectiva: false });
    });
});
