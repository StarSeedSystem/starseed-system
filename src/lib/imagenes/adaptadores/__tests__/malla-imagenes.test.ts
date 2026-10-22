// src/lib/imagenes/adaptadores/__tests__/malla-imagenes.test.ts
// Tests unitarios para las funciones puras del adaptador de malla de imágenes
// Como estã¡n prohibidos vi.mock y similares, testeamos funciones puras directamente

import { describe, it, expect } from "vitest";
import {
  inferirTipoGPU,
  inferirVRAMGB,
  inferirRAMLibreGB,
  convertirRamClaseAGB,
  inferirMotores,
  inferirInstalados,
  inferirOcupada,
  inferirTipoGPUDesdeCercana,
  inferirVRAMGBDesdeCercana,
  inferirRAMLibreGBDesdeCercana,
  inferirMotoresDesdeCercana,
  inferirInstaladosDesdeCercana,
  inferirOcupadaDesdeCercana,
  pedirGeneracionMalla,
} from "@/lib/imagenes/adaptadores/malla-imagenes";
import type { MeshHandle } from "@/lib/network/webrtc-mesh";
import type { TipoCapacidad } from "@/lib/network/capacidad-por-malla";

describe("malla-imagenes adaptador - funciones puras", () => {
  describe("inferirTipoGPU", () => {
    it("debe devolver 'apple' para plataforma darwin", () => {
      const disp = { plataforma: "darwin" };
      expect(inferirTipoGPU(disp)).toBe("apple");
    });

    it("debe devolver 'apple' para plataforma macOS", () => {
      const disp = { plataforma: "macOS" };
      expect(inferirTipoGPU(disp)).toBe("apple");
    });

    it("debe devolver 'nvidia' para plataforma windows", () => {
      const disp = { plataforma: "windows" };
      expect(inferirTipoGPU(disp)).toBe("nvidia");
    });

    it("debe devolver 'nvidia' para plataforma linux", () => {
      const disp = { plataforma: "linux" };
      expect(inferirTipoGPU(disp)).toBe("nvidia");
    });

    it("debe devolver 'ninguna' para plataforma desconocida", () => {
      const disp = { plataforma: "desconocida" };
      expect(inferirTipoGPU(disp)).toBe("ninguna");
    });

    it("debe devolver 'ninguna' para plataforma undefined", () => {
      const disp = { plataforma: undefined };
      expect(inferirTipoGPU(disp)).toBe("ninguna");
    });
  });

  describe("convertirRamClaseAGB", () => {
    it("debe convertir '≤4 GB' a 2", () => {
      expect(convertirRamClaseAGB("≤4 GB")).toBe(2);
    });

    it("debe convertir '8 GB' a 4", () => {
      expect(convertirRamClaseAGB("8 GB")).toBe(4);
    });

    it("debe convertir '16 GB' a 8", () => {
      expect(convertirRamClaseAGB("16 GB")).toBe(8);
    });

    it("debe convertir '>16 GB' a 16", () => {
      expect(convertirRamClaseAGB(">16 GB")).toBe(16);
    });

    it("debe devolver 2 para 'desconocida'", () => {
      expect(convertirRamClaseAGB("desconocida")).toBe(2);
    });

    it("debe devolver 2 para undefined", () => {
      expect(convertirRamClaseAGB(undefined as unknown as string)).toBe(2);
    });
  });

  describe("inferirMotores", () => {
    it("debe devolver al menos sdcpp y onnx-web", () => {
      const disp = {};
      const motores = inferirMotores(disp);
      expect(motores).toContain("sdcpp");
      expect(motores).toContain("onnx-web");
    });

    it("debe añadir comfyui y diffusers cuando la GPU no es ninguna", () => {
      const disp = { plataforma: "windows" }; // Esto hará que inferirTipoGPU devuelva nvidia
      const motores = inferirMotores(disp);
      expect(motores).toContain("comfyui");
      expect(motores).toContain("diffusers");
    });

    it("debe devolver exactamente sdcpp y onnx-web cuando no hay GPU", () => {
      const disp = { plataforma: "android" }; // Esto hará que inferirTipoGPU devuelva ninguna
      const motores = inferirMotores(disp);
      expect(motores).toEqual(["sdcpp", "onnx-web"]);
    });
  });

  describe("neuronas cercanas (otras cuentas)", () => {
    it("usa mínimos conservadores: sin VRAM, 2 GB libres, sin instalados, no ocupada", () => {
      const c = { plataforma: "macOS" };
      expect(inferirTipoGPUDesdeCercana(c)).toBe("apple");
      expect(inferirVRAMGBDesdeCercana(c)).toBeNull();
      expect(inferirRAMLibreGBDesdeCercana(c)).toBe(2);
      expect(inferirInstaladosDesdeCercana(c)).toEqual([]);
      expect(inferirOcupadaDesdeCercana(c)).toBe(false);
    });

    it("sin GPU solo ofrece sdcpp y onnx-web; con GPU añade comfyui y diffusers", () => {
      expect(inferirMotoresDesdeCercana({ plataforma: "android" })).toEqual(["sdcpp", "onnx-web"]);
      const m = inferirMotoresDesdeCercana({ plataforma: "linux" });
      expect(m).toContain("comfyui");
      expect(m).toContain("diffusers");
    });
  });

  describe("inferirTipoGPUDesdeCercana", () => {
    it("debe devolver 'apple' para plataforma darwin", () => {
      const cerca = { plataforma: "darwin" };
      expect(inferirTipoGPUDesdeCercana(cerca)).toBe("apple");
    });
  });

  // Podemos añadir más tests según sea necesario
});

/* ── pedirGeneracionMalla: el cliente del relé `capacidad.*` con un canal falso (sin red) ── */

/** Canal de malla de mentira: registra lo enviado y reentrega lo que el servidor contesta. */
function canalFalso(recibo: (enviados: string[]) => void): {
  mesh: MeshHandle;
  enviados: string[];
  recibir: (texto: string) => void;
} {
  const enviados: string[] = [];
  let manejar: ((peerId: string, data: string) => void) | null = null;
  const mesh = {
    myDeviceId: "yo",
    userId: "cuenta",
    supported: true,
    signalingTransport: "none",
    connectToDevice: async () => {
      throw new Error("sin red en pruebas");
    },
    onPeer: (eventos: { onMessage?: (deviceId: string, data: string) => void }) => {
      manejar = eventos.onMessage ?? null;
      return () => {
        manejar = null;
      };
    },
    sendToPeer: (peerId: string, data: string) => {
      enviados.push(data);
      return true;
    },
    broadcast: () => 0,
    getPeers: () => [],
    closeMesh: () => undefined,
  } as unknown as MeshHandle;
  return {
    mesh,
    enviados,
    recibir: (texto) => manejar?.("peer", texto),
  };
}

const PETICION = { prompt: "un gato astronauta", modelo: "sd-turbo", semilla: 7 };

function idDelUltimoPedido(enviados: string[]): string {
  const ultimo = enviados[enviados.length - 1] ?? "";
  const o = JSON.parse(ultimo) as { t?: string; id?: string };
  if (o.t !== "capacidad.pedir" || !o.id) throw new Error("sin capacidad.pedir enviado");
  return o.id;
}

describe("pedirGeneracionMalla (cliente del relé)", () => {
  it("éxito: manda el pedir, reensambla los trozos en desorden y abre la url", async () => {
    const canal = canalFalso(() => undefined);
    const promesa = pedirGeneracionMalla("peer", PETICION, { mesh: canal.mesh });
    const primero = canal.enviados[0] ?? "";
    expect(JSON.parse(primero)).toMatchObject({
      t: "capacidad.pedir",
      tipo: "imagen",
      cuerpo: { prompt: "un gato astronauta", modelo: "sd-turbo", semilla: 7 },
    });
    const id = JSON.parse(primero).id as string;
    // Desorden a propósito: el índice manda, no el orden de llegada.
    canal.recibir(JSON.stringify({ t: "capacidad.trozo", id, indice: 1, texto: 'image-1"}' }));
    canal.recibir(JSON.stringify({ t: "capacidad.trozo", id, indice: 0, texto: '{"url":"' }));
    canal.recibir(JSON.stringify({ t: "capacidad.fin", id }));
    expect(await promesa).toEqual({ ok: true, url: "image-1" });
  });

  it("error del relé: motivo y ocupado, y el cancel no viaja al resolver", async () => {
    const canal = canalFalso(() => undefined);
    const promesa = pedirGeneracionMalla("peer", PETICION, { mesh: canal.mesh });
    const id = idDelUltimoPedido(canal.enviados);
    canal.recibir(JSON.stringify({ t: "capacidad.error", id, estado: 429, mensaje: "cola llena", ocupado: true }));
    const r = await promesa;
    expect(r).toEqual({ ok: false, motivo: "cola llena", ocupado: true });
    expect(canal.enviados.some((t) => t.includes("capacidad.cancelar"))).toBe(false);
  });

  it("fin sin imagen legible: motivo honesto", async () => {
    const canal = canalFalso(() => undefined);
    const promesa = pedirGeneracionMalla("peer", PETICION, { mesh: canal.mesh });
    const id = idDelUltimoPedido(canal.enviados);
    canal.recibir(JSON.stringify({ t: "capacidad.trozo", id, indice: 0, texto: "otra cosa" }));
    canal.recibir(JSON.stringify({ t: "capacidad.fin", id }));
    const r = await promesa;
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.motivo.length).toBeGreaterThan(0);
  });

  it("cancelar: abortar la signal manda capacidad.cancelar y resuelve ok:false", async () => {
    const canal = canalFalso(() => undefined);
    const control = new AbortController();
    const promesa = pedirGeneracionMalla("peer", PETICION, { mesh: canal.mesh, timeoutMs: 5_000, signal: control.signal });
    canal.recibir(JSON.stringify({ t: "capacidad.trozo", id: idDelUltimoPedido(canal.enviados), indice: 0, texto: "{" }));
    control.abort();
    const r = await promesa;
    expect(r.ok).toBe(false);
    const ultimo = JSON.parse(canal.enviados[canal.enviados.length - 1] ?? "{}") as { t?: string; id?: string };
    expect(ultimo.t).toBe("capacidad.cancelar");
  });

  it("tiempo agotado: manda cancelar y resuelve ok:false con su motivo", async () => {
    const canal = canalFalso(() => undefined);
    const promesa = pedirGeneracionMalla("peer", PETICION, { mesh: canal.mesh, timeoutMs: 30 });
    const r = await promesa;
    expect(r.ok).toBe(false);
    const ultimo = JSON.parse(canal.enviados[canal.enviados.length - 1] ?? "{}") as { t?: string };
    expect(ultimo.t).toBe("capacidad.cancelar");
  });

  it("sin malla inyectada: no envía nada y falla con su motivo", async () => {
    const r = await pedirGeneracionMalla("peer", PETICION, { mesh: null });
    expect(r.ok).toBe(false);
  });

  it("sin peer ni tipo reconocido: falla antes de enviar nada", async () => {
    const canal = canalFalso(() => undefined);
    const r = await pedirGeneracionMalla("", PETICION, { mesh: canal.mesh });
    expect(r).toEqual({ ok: false, motivo: "Sin neurona de la malla a la que relevar." });
    const canal2 = canalFalso(() => undefined);
    const r2 = await pedirGeneracionMalla("peer", PETICION, { mesh: canal2.mesh, tipo: "vuelo" as TipoCapacidad });
    expect(r2.ok).toBe(false);
    expect(canal2.enviados).toEqual([]);
    expect((r2 as { motivo?: string }).motivo ?? "").toContain("imagen");
  });

  it("cuerpo por encima del tope del relé: se niega sin enviar", async () => {
    const canal = canalFalso(() => undefined);
    const r = await pedirGeneracionMalla("peer", { prompt: "g".repeat(17 * 1024), modelo: null, semilla: 1 }, { mesh: canal.mesh });
    expect(r.ok).toBe(false);
    expect(canal.enviados).toEqual([]);
  });
});
