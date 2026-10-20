import { describe, it, expect } from "vitest";

import {
  crearTesela,
  fusionarTesela,
  fusionarTodas,
  caducar,
  senalesDeReticula,
  huellaReticula,
} from "../teselas";
import type { NeuronaReticula, SenalMedida, Tesela, Reticula } from "../tipos";

describe("teselas (CRDT)", () => {
  describe("crearTesela", () => {
    it("should create a tesela with given data", () => {
      // TODO
    });
  });

  describe("fusionarTesela", () => {
    it("should merge a tesela into an empty reticula", () => {
      // TODO
    });
  });

  describe("fusionarTodas", () => {
    it("should merge multiple teselas", () => {
      // TODO
    });
  });

  describe("caducar", () => {
    it("should remove expired teselas", () => {
      // TODO
    });
  });

  describe("senalesDeReticula", () => {
    it("should combine signals by claveSenal taking the worse", () => {
      // TODO
    });
  });

    describe("huellaReticula", () => {
      it("should compute FNV-1a 64-bit hash", () => {
        // Fixed known hash for empty reticula
        const rEmpty: Reticula = { teselas: {} };
        expect(huellaReticula(rEmpty)).toBe("b24a33538cdab6d4");
      });

      it("computes hash for 1000 neurons in less than 500ms", () => {
        // Create a reticula with 1000 neurons
        const teselas: Tesela[] = [];
        for (let i = 0; i < 1000; i++) {
          const neurona: NeuronaReticula = {
            id: `neurona${i}`,
            cuenta: `cuenta${i}`,
            esRouter: false,
            capacidad: {
              ramGb: 8,
              bateriaPct: null,
              cargando: false,
            },
            medios: ['lora'],
          };
          const tesela: Tesela = {
            origen: neurona.id,
            reloj: 0,
            neurona,
            senales: [],
          };
          teselas.push(tesela);
        }
        const r: Reticula = { teselas: {} };
        for (const t of teselas) {
          r.teselas[t.origen] = t;
        }
        // Measure time
        const start = Date.now();
        const hash = huellaReticula(r);
        const end = Date.now();
        // We don't care about the hash value for performance, but we can check it's a string of 16 hex chars.
        expect(hash).toMatch(/^[0-9a-f]{16}$/);
        expect(end - start).toBeLessThan(500);
      });

      it("should compute hash within 100ms for 256 neuronas (performance fix)", () => {
        const start = Date.now();
        const neuronas: NeuronaReticula[] = [];
        for (let i = 0; i < 256; i++) {
          neuronas.push({
            id: `neurona${i}`,
            cuenta: `cuenta${i}`,
            esRouter: false,
            capacidad: {
              ramGb: 8,
              bateriaPct: null,
              cargando: false,
            },
            medios: ['lora'],
          });
        }
        const teselas = neuronas.map(neurona => crearTesela(neurona, [], 1));
        const ret = fusionarTodas(teselas);
        huellaReticula(ret);
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(100);
      });
    });
});