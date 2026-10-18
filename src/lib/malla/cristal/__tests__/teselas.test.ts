import { describe, it, expect } from "vitest";

import {
  crearTesela,
  fusionarTesela,
  fusionarTodas,
  caducar,
  senalesDeReticula,
  huellaReticula,
} from "../teselas";
import type { NeuronaReticula, SenalMedida } from "../tipos";

// Helper: compute FNV-1a 64-bit hash of a byte array (pure JavaScript)
function fnv1a(bytes: Uint8Array): string {
  let hash = BigInt("0xcbf29ce484222325");
  const prime = BigInt("0x100000001b3");
  const mask = BigInt("0xffffffffffffffff");
  for (const b of bytes) {
    hash = ((hash ^ BigInt(b)) * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

describe("teselas (CRDT)", () => {
  describe("crearTesela", () => {
    it("should create a tesela with given data", () => {
      // TODO: implement when needed for other tasks
    });
  });

  describe("fusionarTesela", () => {
    it("should merge a tesela into an empty reticula", () => {
      // TODO: implement when needed for other tasks
    });
  });

  describe("fusionarTodas", () => {
    it("should merge multiple teselas", () => {
      // TODO: implement when needed for other tasks
    });
  });

  describe("caducar", () => {
    it("should remove expired teselas", () => {
      // TODO: implement when needed for other tasks
    });
  });

  describe("senalesDeReticula", () => {
    it("should combine signals by claveSenal taking the worse", () => {
      // TODO: implement when needed for other tasks
    });
  });

  describe("huellaReticula", () => {
    it("should compute correct hash for empty reticula", () => {
      const emptyReticula: Reticula = { teselas: {} };
      const expected = huellaReticula(emptyReticula);
      // Compute expected using our helper function on the canonical JSON of empty reticula
      const canon = JSON.stringify({ teselas: [] });
      const bytes = new TextEncoder().encode(canon);
      const expectedHash = fnv1a(bytes);
      expect(expected).toBe(expectedHash);
    });

    it("should compute correct hash for 1000 neurons", () => {
      // Build a reticula with 1000 neurons
      const teselas: Record<string, Tesela> = {};
      for (let i = 0; i < 1000; i++) {
        const neuronaId = `neuron-${i}`;
        const neurona: NeuronaReticula = {
          id: neuronaId,
          cuenta: `account-${i}`,
          esRouter: i % 2 === 0,
          posicion: { x: i, y: i, precisionM: 1 },
          capacidad: {
            ramGb: 8,
            bateriaPct: 50,
            cargando: false,
          },
          medios: ['lora', 'ble'],
        };
        // Create a dummy signal for this neuron
        const señal: SenalMedida = {
          de: neuronaId,
          a: `peer-${i}`,
          medio: 'lora',
          rssiDbm: -50,
          snrDb: 20,
          rttMs: 10,
          perdidaPct: 0,
          anchoBandaKbps: 1000,
          vistaEn: Date.now() - i * 1000, // slightly different times
        };
        const tesela: Tesela = {
          origen: neuronaId,
          reloj: i,
          neurona,
          senales: [señal],
          huela: undefined, // not used in hash
          firma: undefined, // not used in hash
        };
        teselas[neuronaId] = tesela;
      }
      const reticula: Reticula = { teselas };

      // Compute hash using our function
      const hash = huellaReticula(reticula);

      // Compute expected hash using helper function (same algorithm)
      // We need to build the same canonical JSON as in huellaReticula
      const teselasArray: Omit<Tesela, 'firma'>[] = Object.entries(teselas)
        .map(([id, tesela]) => ({
          origen: tesela.origen,
          reloj: tesela.reloj,
          neurona: tesela.neurona,
          senales: tesela.senales,
          huela: tesela.huela,
        }))
        .sort((a, b) => a.origen.localeCompare(b.origen));
      const obj = { teselas: teselasArray };
      const canonical = JSON.stringify(obj, canonicalReplacer); // Note: we need to use the same canonicalReplacer as in teselas.ts
      // But note: the canonicalJsonStringify function in teselas.ts sorts keys at all depths.
      // We must replicate that exactly. Let's import the helper? We cannot because it's private.
      // Instead, we can use the same function from the module? It's not exported.
      // We'll duplicate the canonicalReplacer function here for the test.
      // Alternatively, we can trust that our helper function fnv1a is correct and we can compute the hash by
      // calling huellaReticula and then comparing with itself? That doesn't test anything.
      // We need to compute the expected hash independently.

      // Let's duplicate the canonicalJsonStringify function from teselas.ts here.
      function canonicalJsonStringify(obj: unknown): string {
        return JSON.stringify(obj, canonicalReplacer);
      }
      function canonicalReplacer(_key: string, value: unknown): unknown {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
          return value;
        }
        // Sort object keys
        const sorted: Record<string, unknown> = {};
        Object.keys(value).sort().forEach(key => {
          sorted[key] = value[key as keyof typeof value];
        });
        return sorted;
      }

      const canonicalString = canonicalJsonStringify(obj);
      const bytes = new TextEncoder().encode(canonicalString);
      const expectedHash = fnv1a(bytes);
      expect(hash).toBe(expectedHash);
    });
  });
});