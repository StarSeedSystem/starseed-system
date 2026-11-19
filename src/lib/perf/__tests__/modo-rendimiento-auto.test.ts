import { describe, it, expect } from "vitest";
import {
  type EstadoEnergia,
  type PerfTierAuto,
  decidirModoAuto,
  MODOS,
} from "../modo-rendimiento";

function energia(parcial: Partial<EstadoEnergia> = {}): EstadoEnergia {
  return {
    sistema: "desconocido",
    bateriaPct: null,
    cargando: null,
    ahorroSistema: false,
    modoBajoConsumo: false,
    perfilEnergia: null,
    temperaturaC: null,
    tareasPesadas: [],
    ...parcial,
  };
}

function decidir(tier: PerfTierAuto, estado: EstadoEnergia | null) {
  return decidirModoAuto({ tier, energia: estado });
}

describe("decidirModoAuto — fase y modo en «auto»", () => {
  describe("sin señales de energía", () => {
    it("gama alta se queda en alto", () => {
      expect(decidir("high", null).modo).toBe("alto");
      expect(decidir("high", energia()).modo).toBe("alto");
    });

    it("gama media y baja se quedan en eco", () => {
      expect(decidir("mid", null).modo).toBe("eco");
      expect(decidir("low", null).modo).toBe("eco");
    });

    it("la decisión trae la configuración completa del modo", () => {
      const d = decidir("high", null);
      expect(d.fases).toEqual(MODOS.alto.fases);
      expect(d.fpsObjetivo).toBe(MODOS.alto.fpsObjetivo);
      expect(d.escalaFondo).toBe(MODOS.alto.escalaFondo);
      expect(d.temporal).toBe(false);
      expect(d.motivo.length).toBeGreaterThan(0);
    });
  });

  describe("macOS — modo de bajo consumo y batería", () => {
    it("el modo de bajo consumo del sistema baja a eco", () => {
      const d = decidir("high", energia({ sistema: "macos", modoBajoConsumo: true, bateriaPct: 80, cargando: true }));
      expect(d.modo).toBe("eco");
      expect(d.motivo).toContain("bajo consumo");
    });

    it("batería baja sin cargar baja a eco", () => {
      const d = decidir("high", energia({ sistema: "macos", bateriaPct: 15, cargando: false }));
      expect(d.modo).toBe("eco");
      expect(d.motivo).toContain("batería baja");
    });

    it("batería crítica sin cargar pasa a eficiente", () => {
      const d = decidir("high", energia({ sistema: "macos", bateriaPct: 8, cargando: false }));
      expect(d.modo).toBe("eficiente");
      expect(d.motivo).toContain("batería crítica");
    });

    it("con batería suficiente y cargando se mantiene alto", () => {
      expect(decidir("high", energia({ sistema: "macos", bateriaPct: 60, cargando: true })).modo).toBe("alto");
    });
  });

  describe("Android — ahorro de batería y nivel", () => {
    it("el ahorro de batería del sistema baja a eco", () => {
      const d = decidir("high", energia({ sistema: "android", ahorroSistema: true, bateriaPct: 40 }));
      expect(d.modo).toBe("eco");
      expect(d.motivo).toContain("ahorro de energía del sistema");
    });

    it("ahorro del sistema en gama baja pasa a eficiente", () => {
      expect(decidir("low", energia({ sistema: "android", ahorroSistema: true, bateriaPct: 25 })).modo).toBe("eficiente");
    });

    it("nivel crítico sin cargar gana al ahorro del sistema", () => {
      const d = decidir("high", energia({ sistema: "android", ahorroSistema: true, bateriaPct: 6, cargando: false }));
      expect(d.modo).toBe("eficiente");
      expect(d.motivo).toContain("batería crítica");
    });
  });

  describe("Linux — power-profiles-daemon", () => {
    it("el perfil de ahorro baja a eco", () => {
      const d = decidir("high", energia({ sistema: "linux", perfilEnergia: "ahorro", bateriaPct: 90, cargando: true }));
      expect(d.modo).toBe("eco");
      expect(d.motivo).toContain("perfil de energía");
    });

    it("el perfil de rendimiento con batería sana se queda en alto", () => {
      expect(decidir("high", energia({ sistema: "linux", perfilEnergia: "rendimiento", bateriaPct: 90, cargando: true })).modo).toBe("alto");
    });

    it("el perfil equilibrado en gama media se queda en eco", () => {
      expect(decidir("mid", energia({ sistema: "linux", perfilEnergia: "equilibrado" })).modo).toBe("eco");
    });
  });

  describe("Windows — ahorro de energía", () => {
    it("el ahorro de energía baja a eco en gama alta", () => {
      const d = decidir("high", energia({ sistema: "windows", ahorroSistema: true, bateriaPct: 55 }));
      expect(d.modo).toBe("eco");
    });

    it("sin ahorro en gama media se queda en eco", () => {
      expect(decidir("mid", energia({ sistema: "windows" })).modo).toBe("eco");
    });

    it("ahorro de energía en gama baja pasa a eficiente", () => {
      expect(decidir("low", energia({ sistema: "windows", ahorroSistema: true })).modo).toBe("eficiente");
    });
  });

  describe("web — Battery API", () => {
    it("batería baja sin cargar baja a eco", () => {
      const d = decidir("high", energia({ sistema: "web", bateriaPct: 18, cargando: false }));
      expect(d.modo).toBe("eco");
      expect(d.motivo).toContain("batería baja");
    });

    it("batería crítica sin cargar pasa a eficiente", () => {
      expect(decidir("high", energia({ sistema: "web", bateriaPct: 6, cargando: false })).modo).toBe("eficiente");
    });

    it("con el cargador puesto no penaliza", () => {
      expect(decidir("high", energia({ sistema: "web", bateriaPct: 100, cargando: true })).modo).toBe("alto");
    });
  });

  describe("tareas pesadas — solo mientras duran", () => {
    it("transmitir pantalla en un equipo lento pasa a eficiente y es temporal", () => {
      const d = decidir("low", energia({ bateriaPct: 90, cargando: true, tareasPesadas: ["transmision"] }));
      expect(d.modo).toBe("eficiente");
      expect(d.temporal).toBe(true);
      expect(d.motivo).toContain("transmisión de pantalla");
    });

    it("transmitir en gama media también pasa a eficiente", () => {
      const d = decidir("mid", energia({ tareasPesadas: ["transmision"] }));
      expect(d.modo).toBe("eficiente");
      expect(d.temporal).toBe(true);
    });

    it("transmitir en gama alta baja a eco mientras dura", () => {
      const d = decidir("high", energia({ tareasPesadas: ["transmision"] }));
      expect(d.modo).toBe("eco");
      expect(d.temporal).toBe(true);
    });

    it("una llamada en gama baja pasa a eficiente", () => {
      expect(decidir("low", energia({ tareasPesadas: ["llamada"] })).modo).toBe("eficiente");
    });

    it("una llamada en gama media se queda en eco", () => {
      expect(decidir("mid", energia({ tareasPesadas: ["llamada"] })).modo).toBe("eco");
    });

    it("el control remoto en gama alta no baja la calidad", () => {
      expect(decidir("high", energia({ tareasPesadas: ["control-remoto"] })).modo).toBe("alto");
    });

    it("al terminar la tarea vuelve sola a la decisión de reposo", () => {
      expect(decidir("high", energia({ tareasPesadas: [] })).modo).toBe("alto");
      expect(decidir("mid", energia({ tareasPesadas: [] })).modo).toBe("eco");
    });

    it("la batería crítica manda sobre la tarea y no es temporal", () => {
      const d = decidir("high", energia({ bateriaPct: 9, cargando: false, tareasPesadas: ["transmision"] }));
      expect(d.modo).toBe("eficiente");
      expect(d.temporal).toBe(false);
      expect(d.motivo).toContain("batería crítica");
    });
  });

  describe("temperatura conocida", () => {
    it("calor alto pasa a eficiente", () => {
      const d = decidir("high", energia({ temperaturaC: 86 }));
      expect(d.modo).toBe("eficiente");
      expect(d.motivo).toContain("temperatura");
    });

    it("calor tibio baja a eco", () => {
      expect(decidir("high", energia({ temperaturaC: 72 })).modo).toBe("eco");
    });

    it("temperatura normal no cambia la decisión", () => {
      expect(decidir("high", energia({ temperaturaC: 40 })).modo).toBe("alto");
    });
  });

  describe("regla pétrea — no toca ajustes guardados", () => {
    it("es pura: no muta el estado que recibe", () => {
      const estado = Object.freeze(energia({ bateriaPct: 12, tareasPesadas: Object.freeze(["llamada"]) as never }));
      expect(() => decidirModoAuto({ tier: "low", energia: estado })).not.toThrow();
      expect(estado.bateriaPct).toBe(12);
      expect(estado.tareasPesadas).toEqual(["llamada"]);
    });

    it("no devuelve nunca el modo «auto»: siempre resuelve uno concreto", () => {
      const decisiones = [
        decidir("high", null),
        decidir("mid", null),
        decidir("low", null),
        decidir("high", energia({ ahorroSistema: true })),
      ];
      for (const d of decisiones) expect(d.modo).not.toBe("auto");
    });
  });
});
