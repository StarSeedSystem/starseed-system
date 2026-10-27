import { describe, it, expect } from "vitest";
import { decidirInterrupcion, crearDetectorInterrupcion } from "@/lib/aurora/interrumpir-por-voz";

describe("interrumpir-por-voz", () => {
  describe("decidirInterrupcion", () => {
    it("no interrumpe con silencio", () => {
      const estado = { enSilencio: true, tiempoActivoMs: 0 };
      const muestras = [
        { db: -60, ms: 0 },
        { db: -55, ms: 100 },
      ];
      const resultado = decidirInterrupcion(muestras, estado, { umbralDb: -40 });
      expect(resultado.interrumpir).toBe(false);
      expect(resultado.estado.enSilencio).toBe(true);
    });

    it("interrumpe cuando supera umbral por más de mínimoMs", () => {
      let estado = { enSilencio: true, tiempoActivoMs: 0 };
      const minimoMs = 250;
      const umbral = -40;

      for (let i = 0; i < 5; i++) {
        const muestras = [
          { db: -30, ms: i * 100 },
        ];
        const resultado = decidirInterrupcion(muestras, estado, { umbralDb: umbral, minimoMs });
        estado = resultado.estado;
      }

      expect(estado.enSilencio).toBe(false);
    });

    it("respeta histéresis: no interrumpe con picos cortos", () => {
      let estado = { enSilencio: true, tiempoActivoMs: 0 };
      const muestras = [
        { db: -30, ms: 0 },
        { db: -35, ms: 100 },
      ];
      const resultado = decidirInterrupcion(muestras, estado, { umbralDb: -40, minimoMs: 250 });
      expect(resultado.interrumpir).toBe(false);
    });

    it("interrumpe a los 250ms de superar umbral", () => {
      let estado = { enSilencio: true, tiempoActivoMs: 0 };
      const muestras: { db: number; ms: number }[] = [
        { db: -35, ms: 0 },
        { db: -35, ms: 100 },
        { db: -35, ms: 200 },
        { db: -35, ms: 300 },
      ];

      let interrumpio = false;
      for (const m of muestras) {
        const resultado = decidirInterrupcion(muestras.slice(0, muestras.indexOf(m) + 1), estado, { umbralDb: -40, minimoMs: 250 });
        estado = resultado.estado;
        if (resultado.interrumpir) {
          interrumpio = true;
          break;
        }
      }

      expect(interrumpio).toBe(true);
    });

    it("no interrumpe con muestras vacías", () => {
      const estado = { enSilencio: true, tiempoActivoMs: 0 };
      const resultado = decidirInterrupcion([], estado, { umbralDb: -40 });
      expect(resultado.interrumpir).toBe(false);
    });

    it("vuelve a silencio tras pérdida de energía", () => {
      let estado = { enSilencio: true, tiempoActivoMs: 0 };
      let resultado = decidirInterrupcion([{ db: -30, ms: 0 }], estado, { umbralDb: -40, minimoMs: 250 });
      estado = resultado.estado;
      expect(estado.enSilencio).toBe(false);

      resultado = decidirInterrupcion([{ db: -60, ms: 100 }], estado, { umbralDb: -40, minimoMs: 250 });
      estado = resultado.estado;
      expect(estado.enSilencio).toBe(true);
      expect(estado.tiempoActivoMs).toBe(0);
    });
  });

  describe("crearDetectorInterrupcion", () => {
    it("detecta interrupción por energía sostenida", () => {
      const detector = crearDetectorInterrupcion({ umbralDb: -40, minimoMs: 250 });

      expect(detector.actualizar(-60, 0)).toBe(false);
      expect(detector.actualizar(-35, 100)).toBe(false);
      expect(detector.actualizar(-35, 200)).toBe(false);
      expect(detector.actualizar(-35, 300)).toBe(true);
    });

    it("reset limpia el estado interno", () => {
      const detector = crearDetectorInterrupcion({ umbralDb: -40, minimoMs: 250 });
      detector.actualizar(-30, 0);
      detector.actualizar(-30, 100);
      detector.reset();
      const estado = detector.estado();
      expect(estado.enSilencio).toBe(true);
      expect(estado.tiempoActivoMs).toBe(0);
    });

    it("ignora muestras por encima de umbral si son cortas", () => {
      const detector = crearDetectorInterrupcion({ umbralDb: -40, minimoMs: 250 });
      expect(detector.actualizar(-30, 0)).toBe(false);
      expect(detector.actualizar(-60, 100)).toBe(false);
      expect(detector.estado().enSilencio).toBe(true);
    });
  });
});
