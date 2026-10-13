/**
 * malla-imagenes — funciones puras (IMG1011). Sin DOM ni red: decisión de
 * auto-vínculo, clasificación de modelos, detección de origen local y el guard
 * del mensaje de "ficha de imagen".
 */
import { describe, expect, test } from "vitest";
import {
  decidirAutovinculoImagen,
  tipoNeuronaParaMallaImagen,
  type NeuronaParaMallaImagen,
  type PeerEstadoLite,
} from "@/lib/imagenes/adaptadores/malla-imagenes";

describe("decidirAutovinculoImagen", () => {
  const yo: NeuronaParaMallaImagen = { neuronId: "n-yo", syncDeviceId: "s-yo", online: true, isThisDevice: true };

  test("con SOLO este dispositivo online, no hay nadie con quien vincularse", () => {
    expect(decidirAutovinculoImagen([yo], {})).toEqual([]);
  });

  test("con ≥2 online, propone conectar a las demás (nunca a mí mismo)", () => {
    const otra: NeuronaParaMallaImagen = { neuronId: "n-b", syncDeviceId: "s-b", online: true, isThisDevice: false };
    expect(decidirAutovinculoImagen([yo, otra], {})).toEqual(["s-b"]);
  });

  test("salta una neurona OFFLINE (estale) aunque exista", () => {
    const offline: NeuronaParaMallaImagen = { neuronId: "n-c", syncDeviceId: "s-c", online: false, isThisDevice: false };
    expect(decidirAutovinculoImagen([yo, offline], {})).toEqual([]);
  });

  test("salta una neurona sin syncDeviceId publicado todavía", () => {
    const sinSync: NeuronaParaMallaImagen = { neuronId: "n-d", online: true, isThisDevice: false };
    expect(decidirAutovinculoImagen([yo, sinSync], {})).toEqual([]);
  });

  test("deduplica por syncDeviceId", () => {
    const dup1: NeuronaParaMallaImagen = { neuronId: "n-e1", syncDeviceId: "s-e", online: true, isThisDevice: false };
    const dup2: NeuronaParaMallaImagen = { neuronId: "n-e2", syncDeviceId: "s-e", online: true, isThisDevice: false };
    expect(decidirAutovinculoImagen([yo, dup1, dup2], {})).toEqual(["s-e"]);
  });

  test("se SALTA un peer ya conectado o conectando (no relanza la oferta)", () => {
    const b: NeuronaParaMallaImagen = { neuronId: "n-b", syncDeviceId: "s-b", online: true, isThisDevice: false };
    const c: NeuronaParaMallaImagen = { neuronId: "n-c", syncDeviceId: "s-c", online: true, isThisDevice: false };
    const peers: Record<string, PeerEstadoLite> = {
      "s-b": { state: "connected" },
      "s-c": { state: "connecting" },
    };
    expect(decidirAutovinculoImagen([yo, b, c], peers)).toEqual([]);
  });

  test("SÍ reintenta un peer 'failed' o 'closed'", () => {
    const b: NeuronaParaMallaImagen = { neuronId: "n-b", syncDeviceId: "s-b", online: true, isThisDevice: false };
    expect(decidirAutovinculoImagen([yo, b], { "s-b": { state: "failed" } })).toEqual(["s-b"]);
    expect(decidirAutovinculoImagen([yo, b], { "s-b": { state: "closed" } })).toEqual(["s-b"]);
  });
});

describe("tipoNeuronaParaMallaImagen", () => {
  test("convierte correctamente una neurona a NeuronaParaMallaImagen", () => {
    const neurona: Neuron = {
      id: "n-test",
      name: "Dispositivo de prueba",
      kind: "desktop",
      capabilities: {
        platform: "Windows",
        browser: "Chrome 148",
        webgpu: false,
        webgl2: false,
        gpuRenderer: "NVIDIA GeForce RTX 3080",
        gpuVendor: "NVIDIA",
        cores: 8,
        memoryGb: 16,
        storageQuotaGb: 100,
        storageUsedGb: 50,
        touch: false,
        installedApp: false,
        ollama: false,
        lmstudio: false,
        battery: { level: 80, charging: false },
        syncDeviceId: "sync-device-id",
        meshDeviceId: "mesh-device-id",
        bridge: {
          mode: "external-hermes",
          hermesWs: "ws://localhost:8787",
          servesPersonalities: ["hermione"],
          autoLinked: true,
        },
        hermesInstalled: false,
        astraura158: {
          online: true,
          endpoint: "http://127.0.0.1:8000",
          model: "BitNet b1.58",
          bitnet: true,
        },
        pantalla: "1920x1080@60",
        zona: "America/New_York",
        maquina: "DESKTOP-ABC123",
        medios: {},
      },
      permissions: {
        compute: true,
        storage: true,
        sync: true,
        agent: true,
        senses: true,
        wake: true,
      },
      last_seen_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
      online: true,
      isThisDevice: true,
    };

    const resultado = tipoNeuronaParaMallaImagen(neurona);
    expect(resultado.neuronId).toBe("n-test");
    expect(resultado.syncDeviceId).toBe("sync-device-id");
    expect(resultado.online).toBe(true);
    expect(resultado.isThisDevice).toBe(true);
  });

  test("maneja correctamente una neurona nula", () => {
    const resultado = tipoNeuronaParaMallaImagen(null);
    expect(resultado.neuronId).toBe("");
    expect(resultado.syncDeviceId).toBeUndefined();
    expect(resultado.online).toBe(false);
    expect(resultado.isThisDevice).toBe(false);
  });
});