// Tests de Laya en navegador y apps (tarea H · Ola 1018L, partes 1 y 2). Solo funciones puras:
// la parte 1 usa `perfilDelMedio` sobre entornos falsos por medio; la parte 2 (traída de la
// nube) prueba `planLayaLocal` directamente con `PerfilMedio` construidos a mano. Sin red,
// sin disco real, sin reloj y sin cargar modelos nunca.
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
import { perfilDelMedio, type EntornoMedio, type PerfilMedio } from "@/lib/astraura/capas/perfil-medio";

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

  it("con saveData activo no carga aunque la PWA reúna todo lo demás: el presupuesto de RAM queda en 0", () => {
    const s = plan({ saveData: true });
    expect(s.cargar).toBe(false);
    expect(s.modelo).toBeNull();
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

  it("iOS también se trata como app nativa, por el user-Agent (§4)", () => {
    const iosGeneroso = planLayaLocalEnMedio(
      perfilDelMedio(medio({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", deviceMemory: 8, discoLibreBytes: 20 * 1024 * MB })),
    );
    expect(iosGeneroso.cargar).toBe(true);
    expect(iosGeneroso.modelo).toBe("multilingual");

    const iosAjustado = planLayaLocalEnMedio(
      perfilDelMedio(medio({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", deviceMemory: 3, discoLibreBytes: 2 * 1024 * MB })),
    );
    expect(iosAjustado.cargar).toBe(false);
    expect(iosAjustado.modelo).toBeNull();
    expect(iosAjustado.motivo).toMatch(/no cabe|presupuesto/);
  });
});

// -----------------------------------------------------------------------
// Parte 2 (traída de la nube): `planLayaLocal(perfilMedio)` con el gate de
// la cadena activo, sobre `PerfilMedio` construidos a mano (forma real §4).
// -----------------------------------------------------------------------

const CAPAZ: PerfilMedio = {
  base: { nivel: "justo", nucleos: 4, ramGb: 8, arq: "arm64", plataforma: "web", bateria: false, conexion: "rapida" },
  plataforma: "pwa",
  webgpu: { disponible: true, maxBufferMb: 1024 },
  wasm: { disponible: true, simd: true, hilos: true },
  almacenamiento: { cuotaMb: 4096, usoMb: 256, libreMb: 2048, persistente: true },
  bateria: { nivel: 0.8, cargando: false, baja: false },
  ramLibreMb: 4096,
  saveData: false,
  tipoConexion: "4g",
  visible: true,
};

const medioPuro = (cambios: Partial<PerfilMedio>): PerfilMedio => ({ ...CAPAZ, ...cambios });

describe("planLayaLocal con perfil puro (parte 2): el gate manda mientras falta laya-ts", () => {
  const frenoPendiente = /laya-ts|tarea O|aún no/i;

  it("devuelve siempre un veredicto con motivo y modelo acotados", () => {
    const r = planLayaLocal(medioPuro({}));
    expect(typeof r.motivo).toBe("string");
    expect(r.motivo.length).toBeGreaterThan(0);
    expect(["multilingual-int8", "multilingual", null]).toContain(r.modelo);
  });

  it("PWA capaz por §4 (WebGPU, 2 GB, 4 GB de RAM) aún pregunta fuera: tarea O sin cerrar", () => {
    const r = planLayaLocal(medioPuro({}));
    expect(r.cargar).toBe(false);
    expect(r.modelo).toBeNull();
    expect(r.motivo).toMatch(frenoPendiente);
  });

  it("los límites de §4 son inclusivos: con 2 GB y 4 GB justos el medio es capaz", () => {
    const perfil = medioPuro({
      base: { ...CAPAZ.base, ramGb: 4 },
      almacenamiento: { ...CAPAZ.almacenamiento, libreMb: 2048 },
    });
    const enMedio = planLayaLocalEnMedio(perfil);
    expect(enMedio.cargar).toBe(true);
    expect(enMedio.modelo).toBe("multilingual-int8");
    expect(planLayaLocal(perfil).motivo).toMatch(frenoPendiente);
  });

  it("una app nativa que cabe en su presupuesto sería capaz, con el mismo freno pendiente", () => {
    const perfil = medioPuro({
      plataforma: "tauri",
      base: { ...CAPAZ.base, plataforma: "tauri" },
      almacenamiento: { cuotaMb: null, usoMb: null, libreMb: 32768, persistente: true },
    });
    const enMedio = planLayaLocalEnMedio(perfil);
    expect(enMedio.cargar).toBe(true);
    expect(enMedio.modelo).toBe("multilingual");
    const r = planLayaLocal(perfil);
    expect(r.cargar).toBe(false);
    expect(r.modelo).toBeNull();
    expect(r.motivo).toMatch(frenoPendiente);
  });

  it("una app nativa sin espacio para el int8 (15 % de 1 GB < 400 MB) no cabe", () => {
    const r = planLayaLocalEnMedio(
      medioPuro({
        plataforma: "tauri",
        base: { ...CAPAZ.base, plataforma: "tauri" },
        almacenamiento: { cuotaMb: null, usoMb: null, libreMb: 1024, persistente: true },
      }),
    );
    expect(r.cargar).toBe(false);
    expect(r.modelo).toBeNull();
    expect(r.motivo).toMatch(/no cabe|presupuesto/);
    expect(planLayaLocal(medioPuro({})).motivo).toMatch(/laya-ts|tarea O/i);
  });
});

describe("planLayaLocalEnMedio con perfil puro (parte 2): reglas del medio sobre el perfil directo", () => {
  it("una visita web va por la malla al A1, con el perfil ya medido", () => {
    const r = planLayaLocalEnMedio(medioPuro({ plataforma: "web", base: { ...CAPAZ.base, plataforma: "web" } }));
    expect(r.cargar).toBe(false);
    expect(r.modelo).toBeNull();
    expect(r.motivo).toMatch(/malla/);
  });

  it("una PWA sin WebGPU se pregunta fuera", () => {
    const r = planLayaLocalEnMedio(medioPuro({ webgpu: { disponible: false, maxBufferMb: null } }));
    expect(r.cargar).toBe(false);
    expect(r.motivo).toMatch(/WebGPU/);
  });

  it("una PWA sin almacenamiento persistente, o con menos de 2 GB, no carga", () => {
    expect(
      planLayaLocalEnMedio(medioPuro({ almacenamiento: { ...CAPAZ.almacenamiento, persistente: false } })).cargar,
    ).toBe(false);
    expect(
      planLayaLocalEnMedio(medioPuro({ almacenamiento: { ...CAPAZ.almacenamiento, libreMb: 2047 } })).cargar,
    ).toBe(false);
  });

  it("con menos de 4 GB de memoria no carga", () => {
    const r = planLayaLocalEnMedio(medioPuro({ base: { ...CAPAZ.base, ramGb: 3 } }));
    expect(r.cargar).toBe(false);
    expect(r.motivo).toMatch(/4 GB/);
  });

  it("batería < 20 % sin cargador no se despierta; con cable no aplica el freno", () => {
    const sinCable = planLayaLocalEnMedio(medioPuro({ bateria: { nivel: 0.15, cargando: false, baja: true } }));
    expect(sinCable.cargar).toBe(false);
    expect(sinCable.motivo).toMatch(/batería/);
    const conCable = planLayaLocalEnMedio(medioPuro({ bateria: { nivel: 0.15, cargando: true, baja: false } }));
    expect(conCable.cargar).toBe(true);
  });

  it("con la pestaña oculta no se despierta, aunque el medio sea capaz", () => {
    const r = planLayaLocalEnMedio(medioPuro({ visible: false }));
    expect(r.cargar).toBe(false);
    expect(r.modelo).toBeNull();
    expect(r.motivo).toMatch(/pestaña oculta/);
  });
});
