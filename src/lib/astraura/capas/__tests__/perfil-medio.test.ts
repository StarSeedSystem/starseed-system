// Tests del perfil del medio (CPA1007B): un entorno falso por cada fila de la
// tabla de §4 del contrato y por cada regla de 2.º plano. Sin red ni navegador.
import { describe, expect, it } from "vitest";
import {
  enSegundoPlano,
  perfilDelMedio,
  presupuestoMedio,
  type EntornoMedio,
} from "@/lib/astraura/capas/perfil-medio";

const MB = 1024 * 1024;

const webVisita: EntornoMedio = {
  userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; Intel)",
  esTauri: false,
  esPWA: false,
  hardwareConcurrency: 8,
  deviceMemory: 8,
  webgpuMaxBufferBytes: 256 * MB,
  wasmDisponible: true,
  wasmSimd: true,
  crossOriginIsolated: true,
  cuotaBytes: 60 * 1024 * MB,
  usoBytes: 100 * MB,
  persistente: false,
  effectiveType: "4g",
  visible: true,
  bateriaNivel: 0.9,
  cargando: true,
};

const pwaConPersist: EntornoMedio = {
  ...webVisita,
  esPWA: true,
  persistente: true,
  cuotaBytes: 4 * 1024 * MB,
};

const pwaSinPersist: EntornoMedio = { ...pwaConPersist, persistente: false };

const appTauri: EntornoMedio = {
  ...webVisita,
  esTauri: true,
  esPWA: false,
  discoLibreBytes: 10 * 1024 * MB, // 10 GB libres → 15 % = 1,5 GB
};

const appTauriDiscoGrande: EntornoMedio = {
  ...appTauri,
  discoLibreBytes: 200 * 1024 * MB, // 200 GB → tope de 8 GB
};

const android: EntornoMedio = {
  userAgent: "Mozilla/5.0 (Linux; Android 14)",
  esTauri: false,
  esPWA: false,
  hardwareConcurrency: 8,
  deviceMemory: 6,
  discoLibreBytes: 4 * 1024 * MB,
  visible: true,
};

const servidor: EntornoMedio = {
  userAgent: "",
  esTauri: false,
  esPWA: false,
  plataformaForzada: "servidor",
  hardwareConcurrency: 16,
  deviceMemory: 64,
  ramLibreMb: 40 * 1024,
  visible: true,
};

describe("perfilDelMedio", () => {
  it("mide WebGPU, WASM y almacenamiento inyectados", () => {
    const p = perfilDelMedio(webVisita);
    expect(p.webgpu).toEqual({ disponible: true, maxBufferMb: 256 });
    expect(p.wasm).toEqual({ disponible: true, simd: true, hilos: true });
    expect(p.almacenamiento.persistente).toBe(false);
    expect(p.almacenamiento.cuotaMb).toBe(60 * 1024);
    expect(p.tipoConexion).toBe("4g");
    expect(p.visible).toBe(true);
    expect(p.bateria.baja).toBe(false);
  });

  it("sin WebGPU no hay maxBuffer; sin crossOriginIsolated no hay hilos WASM", () => {
    const p = perfilDelMedio({ ...webVisita, webgpuMaxBufferBytes: null, crossOriginIsolated: false });
    expect(p.webgpu.disponible).toBe(false);
    expect(p.webgpu.maxBufferMb).toBeNull();
    expect(p.wasm.hilos).toBe(false);
  });

  it("una batería por debajo del 20 % se marca baja", () => {
    expect(perfilDelMedio({ ...webVisita, bateriaNivel: 0.15, cargando: false }).bateria.baja).toBe(true);
  });
});

describe("presupuestoMedio · tabla de §4", () => {
  it("web de visita: solo reflejo ≤ 12 MB, RAM solo si WebGPU y ≥ 4 GB", () => {
    const r = presupuestoMedio(perfilDelMedio(webVisita));
    expect(r).toMatchObject({ disco_mb: 12, ram_mb: 1536, capas_guardables: ["reflejo"], segundo_plano: false });
    expect(r.motivo).toContain("web");
  });

  it("web sin WebGPU o con poca RAM no reserva RAM", () => {
    expect(presupuestoMedio(perfilDelMedio({ ...webVisita, webgpuMaxBufferBytes: null })).ram_mb).toBe(0);
    expect(presupuestoMedio(perfilDelMedio({ ...webVisita, deviceMemory: 2 })).ram_mb).toBe(0);
  });

  it("PWA con persist(): reflejo + memoria + palabra hasta 1 GB", () => {
    const r = presupuestoMedio(perfilDelMedio(pwaConPersist));
    expect(r.capas_guardables).toEqual(["reflejo", "memoria", "palabra"]);
    expect(r.disco_mb).toBe(1024);
  });

  it("PWA sin persist() concedido: solo reflejo", () => {
    const r = presupuestoMedio(perfilDelMedio(pwaSinPersist));
    expect(r.capas_guardables).toEqual(["reflejo"]);
    expect(r.disco_mb).toBe(0);
  });

  it("app nativa: 15 % del disco libre; palabra y razón entran", () => {
    const r = presupuestoMedio(perfilDelMedio(appTauri));
    expect(r.disco_mb).toBe(Math.floor(10 * 1024 * 0.15));
    expect(r.capas_guardables).toEqual(["reflejo", "memoria", "palabra", "razon"]);
  });

  it("app nativa con disco enorme respeta el tope de 8 GB", () => {
    expect(presupuestoMedio(perfilDelMedio(appTauriDiscoGrande)).disco_mb).toBe(8 * 1024);
  });

  it("android se trata como app nativa", () => {
    const r = presupuestoMedio(perfilDelMedio(android));
    expect(r.capas_guardables).toContain("razon");
    expect(r.disco_mb).toBe(Math.floor(4 * 1024 * 0.15));
  });

  it("servidor: todas las capas y según la RAM libre", () => {
    const r = presupuestoMedio(perfilDelMedio(servidor));
    expect(r.capas_guardables).toContain("profunda");
    expect(r.capas_guardables).toContain("adaptador");
    expect(r.ram_mb).toBe(40 * 1024);
  });

  it("ajustes: el tope de disco editable manda sobre el calculado", () => {
    const r = presupuestoMedio(perfilDelMedio(appTauri), { topeDiscoMb: 256 });
    expect(r.disco_mb).toBe(256);
  });
});

describe("presupuestoMedio · reglas de 2.º plano", () => {
  it("pestaña oculta → solo reflejo, RAM a cero", () => {
    const r = presupuestoMedio(perfilDelMedio({ ...pwaConPersist, visible: false }));
    expect(r.segundo_plano).toBe(true);
    expect(r.capas_guardables).toEqual(["reflejo"]);
    expect(r.ram_mb).toBe(0);
    expect(r.motivo).toContain("pestaña oculta");
  });

  it("batería < 20 % sin cargar → solo reflejo", () => {
    const r = presupuestoMedio(perfilDelMedio({ ...appTauri, bateriaNivel: 0.1, cargando: false }));
    expect(r.segundo_plano).toBe(true);
    expect(r.capas_guardables).toEqual(["reflejo"]);
    expect(r.motivo).toContain("batería");
  });

  it("batería baja pero cargando NO es 2.º plano", () => {
    expect(enSegundoPlano(perfilDelMedio({ ...appTauri, bateriaNivel: 0.1, cargando: true }))).toBe(false);
  });

  it("saveData activo → solo reflejo", () => {
    const r = presupuestoMedio(perfilDelMedio({ ...webVisita, saveData: true }));
    expect(r.segundo_plano).toBe(true);
    expect(r.capas_guardables).toEqual(["reflejo"]);
    expect(r.motivo).toContain("saveData");
  });
});
