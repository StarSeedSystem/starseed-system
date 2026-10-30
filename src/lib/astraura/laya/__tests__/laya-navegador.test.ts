// Tests de Laya en navegador y apps (tarea H, parte 1 · Ola 1018L). Solo funciones puras:
// el `PerfilMedio` se construye con `perfilDelMedio` sobre entornos falsos por medio,
// sin red, sin disco y sin cargar modelos nunca.
import { describe, expect, it } from "vitest";
import {
  LAYA_NAVEGADOR_LISTO,
  planLayaLocal,
  planLayaLocalEnMedio,
  PWA_PERSISTENTE_MIN_MB,
  PWA_RAM_MIN_GB,
  TAMAÑO_MODELO_MB,
  type PlanLayaLocal,
} from "../laya-navegador";
import { perfilDelMedio, type EntornoMedio } from "@/lib/astraura/capas/perfil-medio";

const MB = 1024 * 1024;

/** Base: escritorio potente, PWA instalada, WebGPU, batería alta y pestaña visible. */
const base: EntornoMedio = {
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit",
  esTauri: false,
  esPWA: true,
  hardwareConcurrency: 8,
  deviceMemory: 8,
  webgpuMaxBufferBytes: 256 * MB,
  wasmDisponible: true,
  wasmSimd: true,
  crossOriginIsolated: true,
  cuotaBytes: 8 * 1024 * MB,
  usoBytes: 100 * MB,
  persistente: true,
  discoLibreBytes: null,
  visible: true,
  bateriaNivel: 0.9,
  cargando: false,
  effectiveType: "4g",
};

const medio = (cambios: Partial<EntornoMedio>): EntornoMedio => ({ ...base, ...cambios });

const plan = (c: Partial<EntornoMedio>, listo = true): PlanLayaLocal => {
  const p = planLayaLocalEnMedio(perfilDelMedio(medio(c)));
  return listo ? p : planLayaLocal(perfilDelMedio(medio(c)));
};

describe("el gate de la cadena (tarea O sin cerrar)", () => {
  it("mientras `vendor/laya-ts` y el checkpoint exportado no existan, nunca carga aunque el medio sea doble", () => {
    expect(LAYA_NAVEGADOR_LISTO).toBe(false);
    const salida = plan({}, false);
    expect(salida.cargar).toBe(false);
    expect(salida.modelo).toBeNull();
    expect(salida.motivo).toMatch(/laya-ts|tarea O/i);
  });
});

describe("visita web y servidor: Laya siempre pregunta fuera", () => {
  it("una visita web nunca carga: va por la malla al A1", () => {
    const s = plan({ esPWA: false, persistente: false });
    expect(s.cargar).toBe(false);
    expect(s.modelo).toBeNull();
    expect(s.motivo).toMatch(/malla/);
  });

  it("el servidor no carga aquí: Laya ya vive en el A1 siempre encendida", () => {
    const s = plan({ plataformaForzada: "servidor", ramLibreMb: 4000 });
    expect(s.cargar).toBe(false);
    expect(s.motivo).toMatch(/A1/);
  });
});

describe("2.º plano: pestaña oculta y batería baja", () => {
  it("con la pestaña oculta no carga aunque reúna todo lo demás", () => {
    const s = plan({ visible: false });
    expect(s.cargar).toBe(false);
    expect(s.modelo).toBeNull();
    expect(s.motivo).toMatch(/pestaña oculta/);
  });

  it("con batería < 20 % sin cargarse no carga", () => {
    const s = plan({ bateriaNivel: 0.15, cargando: false });
    expect(s.cargar).toBe(false);
    expect(s.motivo).toMatch(/batería/);
  });

  it("con batería baja PERO enchufada sí carga: no es 2.º plano", () => {
    const s = plan({ bateriaNivel: 0.15, cargando: true });
    expect(s.cargar).toBe(true);
  });
});

describe("PWA: WebGPU, 2 GB persistentes y 4 GB de memoria", () => {
  it("PWA completa carga `multilingual-int8` (el completo no cabe en el tope de 1 GB de la PWA)", () => {
    const s = plan({});
    expect(s.cargar).toBe(true);
    expect(s.modelo).toBe("multilingual-int8");
    expect(s.motivo).toMatch(/multilingual-int8/);
  });

  it("umbrales exportables coherentes con el contrato de Laya", () => {
    expect(PWA_PERSISTENTE_MIN_MB).toBe(2048);
    expect(PWA_RAM_MIN_GB).toBe(4);
    expect(TAMAÑO_MODELO_MB["multilingual-int8"]).toBeLessThan(TAMAÑO_MODELO_MB.multilingual);
  });

  it("sin WebGPU no carga en el navegador", () => {
    const s = plan({ webgpuMaxBufferBytes: null });
    expect(s.cargar).toBe(false);
    expect(s.motivo).toMatch(/WebGPU/);
  });

  it("sin persist() concedido no carga (la capa se perdería al cerrar)", () => {
    const s = plan({ persistente: false });
    expect(s.cargar).toBe(false);
    expect(s.motivo).toMatch(/persistente/);
  });

  it("con menos de 2 GB de almacenamiento persistente no carga", () => {
    const s = plan({ cuotaBytes: 1.5 * 1024 * MB });
    expect(s.cargar).toBe(false);
    expect(s.motivo).toMatch(/2 GB/);
  });

  it("con menos de 4 GB de memoria no carga", () => {
    const s = plan({ deviceMemory: 3 });
    expect(s.cargar).toBe(false);
    expect(s.motivo).toMatch(/4 GB/);
  });
});

describe("app nativa: carga si el checkpoint cabe en su presupuesto", () => {
  it("Tauri con disco de sobra y RAM grande toma el checkpoint completo", () => {
    const s = plan({ esPWA: false, esTauri: true, discoLibreBytes: 10 * 1024 * MB });
    expect(s.cargar).toBe(true);
    expect(s.modelo).toBe("multilingual");
  });

  it("Tauri con disco limitado toma el int8", () => {
    const s = plan({ esPWA: false, esTauri: true, discoLibreBytes: 4 * 1024 * MB });
    expect(s.cargar).toBe(true);
    expect(s.modelo).toBe("multilingual-int8");
  });

  it("Tauri con disco justo (15 % < 400 MB) no carga: la capa no cabe", () => {
    const s = plan({ esPWA: false, esTauri: true, discoLibreBytes: 1 * 1024 * MB });
    expect(s.cargar).toBe(false);
    expect(s.motivo).toMatch(/no cabe/);
  });

  it("nativa sin RAM medible (deviceMemory ausente) queda con el int8, que cabe en la RAM estimada", () => {
    const s = plan({ esPWA: false, esTauri: true, deviceMemory: undefined });
    expect(s.cargar).toBe(true);
    expect(s.modelo).toBe("multilingual-int8");
  });

  it("Android con disco libre y 6 GB compite igual que Tauri: checkpoint completo", () => {
    const android: EntornoMedio = {
      ...base,
      esPWA: false,
      deviceMemory: 6,
      discoLibreBytes: 10 * 1024 * MB,
      userAgent: "Mozilla/5.0 (Linux; Android 14)",
    };
    const s = planLayaLocalEnMedio(perfilDelMedio(android));
    expect(s.cargar).toBe(true);
    expect(s.modelo).toBe("multilingual");
  });
});
