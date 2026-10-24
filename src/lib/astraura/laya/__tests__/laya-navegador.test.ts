// Tests de Laya en navegador y apps (tarea H de la Ola 1018L). Solo lo puro:
// el perfil del medio se fabrica con `perfilDelMedio` y un entorno inyectado;
// sin red, sin disco ni modelos de verdad.
import { describe, it, expect } from "vitest";
import { perfilDelMedio, type EntornoMedio } from "@/lib/astraura/capas/perfil-medio";
import {
  planLayaLocal,
  LAYA_TS_LISTO,
  PESO_INT8_MB,
  PESO_FP32_MB,
  PERSISTENTE_MIN_MB,
  RAM_MIN_MB,
  type PlanLayaLocal,
} from "@/lib/astraura/laya/laya-navegador";

const GB = 1024 * 1024 * 1024;

/** Entorno de una PWA que cumpliría todo si el paquete existiese. */
const entorno = (cambios: Partial<EntornoMedio> = {}): EntornoMedio => ({
  userAgent: "Prueba Laya",
  esTauri: false,
  esPWA: true,
  hardwareConcurrency: 8,
  deviceMemory: 8,
  plataformaForzada: "pwa",
  webgpuMaxBufferBytes: GB,
  wasmDisponible: true,
  wasmSimd: true,
  crossOriginIsolated: true,
  cuotaBytes: 4 * GB,
  usoBytes: 1 * GB,
  persistente: true,
  discoLibreBytes: null,
  visible: true,
  bateriaNivel: 1,
  cargando: false,
  saveData: false,
  ...cambios,
});

const plan = (cambios: Partial<EntornoMedio> = {}): PlanLayaLocal => planLayaLocal(perfilDelMedio(entorno(cambios)));

describe("valores del contrato", () => {
  it("hasta que la tarea O publique laya-ts y exporte el checkpoint, nada carga", () => {
    expect(LAYA_TS_LISTO).toBe(false);
  });

  it("los tamaños y límites del cuaderno concuerdan: int8 más pequeño, PWA 2 GB y 4 GB de memoria", () => {
    expect(PESO_INT8_MB).toBeLessThan(PESO_FP32_MB);
    expect(PERSISTENTE_MIN_MB).toBe(2048);
    expect(RAM_MIN_MB).toBe(4096);
  });
});

describe("por medio · visita web y servidor", () => {
  it("una visita web nunca carga Laya: pregunta por la malla al A1", () => {
    const r = plan({ plataformaForzada: "web", esPWA: false });
    expect(r.cargar).toBe(false);
    expect(r.modelo).toBeNull();
    expect(r.motivo).toContain("malla");
  });

  it("el servidor no usa laya-ts: ahí corre el laya local del equipo", () => {
    const r = plan({ plataformaForzada: "servidor" });
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("servidor");
  });
});

describe("por medio · segundo plano", () => {
  it("pestaña oculta: no carga y lo dice", () => {
    const r = plan({ visible: false });
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("pestaña oculta");
  });

  it("batería < 20 % y sin cable: no carga", () => {
    const r = plan({ bateriaNivel: 0.15, cargando: false });
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("batería baja");
  });

  it("batería baja pero cargando no es segundo plano: siguen las condiciones del medio", () => {
    const r = plan({ bateriaNivel: 0.15, cargando: true });
    expect(r.motivo).toContain("tarea O");
  });
});

describe("por medio · PWA", () => {
  it("sin WebGPU no carga, aunque el resto cumpla", () => {
    const r = plan({ webgpuMaxBufferBytes: null });
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("WebGPU");
  });

  it("sin persist() concedido no carga", () => {
    const r = plan({ persistente: false });
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("persist()");
  });

  it("con menos de 2 GB persistentes libres no carga", () => {
    const r = plan({ cuotaBytes: 2 * GB, usoBytes: 1 * GB });
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("2 GB");
  });

  it("con justamente 2048 MB persistente libre, las condiciones se dan", () => {
    const r = plan({ cuotaBytes: 3 * GB, usoBytes: 1 * GB });
    expect(r.motivo).toContain("tarea O");
  });

  it("PWA que cumple todo: cargaría con el int8, pero hoy solo se pregunta fuera", () => {
    const r = plan();
    expect(r.cargar).toBe(false);
    expect(r.modelo).toBeNull();
    expect(r.motivo).toContain("multilingual-int8");
    expect(r.motivo).toContain("tarea O");
  });

  it("sin memoria fiable no se decide a cargar", () => {
    const r = plan({ deviceMemory: undefined, ramLibreMb: null });
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("memoria");
  });

  it("con menos de 4 GB de memoria tampoco: la regla es la regla", () => {
    const r = plan({ deviceMemory: 3 });
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("4.096 MB");
  });
});

describe("por medio · app nativa", () => {
  it("con disco de sobra cabe en su presupuesto: cargaría si el paquete existiera", () => {
    const r = plan({ plataformaForzada: "tauri", esTauri: true, discoLibreBytes: 10 * GB });
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("tarea O");
    expect(r.motivo).toContain("multilingual-int8");
  });

  it("con poco disco libre el 15 % del presupuesto no llega para los pesos", () => {
    const r = plan({ plataformaForzada: "tauri", esTauri: true, discoLibreBytes: 1.5 * GB });
    expect(r.cargar).toBe(false);
    expect(r.motivo).toContain("presupuesto");
  });

  it("Android igual que Tauri: si cabe, cumplidas las condiciones", () => {
    const r = plan({ plataformaForzada: "android", discoLibreBytes: 10 * GB });
    expect(r.motivo).toContain("tarea O");
  });

  it("iOS igual: mismo presupuesto, mismo veredicto", () => {
    const r = plan({ plataformaForzada: "ios" });
    expect(r.motivo).toContain("tarea O");
  });
});

describe("determinismo y privada", () => {
  it("misma entrada, misma salida: no manda el orden ni el reloj", () => {
    const a = plan(), b = plan();
    expect(a).toEqual(b);
  });

  it("inventario: no se está cargando aún ningún modelo en ningún medio", () => {
    for (const plataforma of ["web", "pwa", "tauri", "android", "ios", "servidor"] as const) {
      expect(plan({ plataformaForzada: plataforma }).cargar).toBe(false);
    }
  });
});
