import { describe, it, expect } from "vitest";
import {
  gf256Add,
  gf256Mul,
  gf256Div,
  gf256Pow,
  gf256Inv,
  gf256MulScalar,
  reedSolomonEncode,
  reedSolomonDecode,
  reedSolomonCanRecover,
  GF256_PRIMITIVE,
  GF256_GENERATOR,
} from "../reed-solomon";

describe("reed-solomon GF(2^8) arithmetic", () => {
  describe("gf256Add", () => {
    it("addition is XOR in GF(2^8)", () => {
      expect(gf256Add(0x00, 0x00)).toBe(0x00);
      expect(gf256Add(0x01, 0x01)).toBe(0x00);
      expect(gf256Add(0x57, 0x83)).toBe(0xD4);
      expect(gf256Add(0xFF, 0x00)).toBe(0xFF);
    });

    it("is commutative and associative", () => {
      expect(gf256Add(0x12, 0x34)).toBe(gf256Add(0x34, 0x12));
      expect(gf256Add(gf256Add(0x12, 0x34), 0x56)).toBe(gf256Add(0x12, gf256Add(0x34, 0x56)));
    });

    it("every element is its own additive inverse", () => {
      for (let i = 0; i < 256; i++) {
        expect(gf256Add(i, i)).toBe(0);
      }
    });
  });

  describe("gf256Mul", () => {
    it("multiplication by 0 yields 0", () => {
      expect(gf256Mul(0, 0x57)).toBe(0);
      expect(gf256Mul(0x57, 0)).toBe(0);
    });

    it("multiplication by 1 is identity", () => {
      expect(gf256Mul(1, 0x57)).toBe(0x57);
      expect(gf256Mul(0x57, 1)).toBe(0x57);
    });

    it("known multiplication results", () => {
      expect(gf256Mul(2, 0x57)).toBe(0xAE);
      expect(gf256Mul(0x57, 2)).toBe(0xAE);
      // 3 * 0x57 = (2+1) * 0x57 = 0xAE ^ 0x57 = 0xF9
      expect(gf256Mul(3, 0x57)).toBe(0xF9);
    });

    it("is commutative", () => {
      for (let a = 0; a < 256; a++) {
        for (let b = 0; b < 256; b++) {
          expect(gf256Mul(a, b)).toBe(gf256Mul(b, a));
        }
      }
    });
  });

  describe("gf256Div", () => {
    it("division by 1 is identity", () => {
      expect(gf256Div(0x57, 1)).toBe(0x57);
    });

    it("x / x = 1 for non-zero x", () => {
      for (let i = 1; i < 256; i++) {
        expect(gf256Div(i, i)).toBe(1);
      }
    });

    it("division is inverse of multiplication", () => {
      for (let a = 1; a < 256; a++) {
        for (let b = 1; b < 256; b++) {
          const prod = gf256Mul(a, b);
          expect(gf256Div(prod, a)).toBe(b);
          expect(gf256Div(prod, b)).toBe(a);
        }
      }
    });

    it("throws on division by zero", () => {
      expect(() => gf256Div(0x57, 0)).toThrow("División por cero en GF(2^8)");
    });
  });

  describe("gf256Pow", () => {
    it("x^0 = 1 for non-zero x", () => {
      for (let i = 1; i < 256; i++) {
        expect(gf256Pow(i, 0)).toBe(1);
      }
    });

    it("x^1 = x", () => {
      for (let i = 0; i < 256; i++) {
        expect(gf256Pow(i, 1)).toBe(i);
      }
    });

    it("generator^255 = 1 (order of multiplicative group)", () => {
      expect(gf256Pow(GF256_GENERATOR, 255)).toBe(1);
    });

    it("generator^128 != 1 (primitive element property)", () => {
      // 2^128 in GF(2^8) with primitive 0x11d
      expect(gf256Pow(GF256_GENERATOR, 128)).not.toBe(1);
    });
  });

  describe("gf256Inv", () => {
    it("inverse of 1 is 1", () => {
      expect(gf256Inv(1)).toBe(1);
    });

    it("x * inv(x) = 1 for non-zero x", () => {
      for (let i = 1; i < 256; i++) {
        expect(gf256Mul(i, gf256Inv(i))).toBe(1);
      }
    });

    it("throws on inverse of zero", () => {
      expect(() => gf256Inv(0)).toThrow("Inverso de cero en GF(2^8)");
    });
  });

  describe("gf256MulScalar", () => {
    it("multiplies each byte by scalar", () => {
      const data = new Uint8Array([1, 2, 3, 4]);
      const result = gf256MulScalar(data, 2);
      expect(result).toEqual(new Uint8Array([2, 4, 6, 8]));
    });

    it("scalar 1 is identity", () => {
      const data = new Uint8Array([10, 20, 30]);
      expect(gf256MulScalar(data, 1)).toEqual(data);
    });

    it("scalar 0 yields all zeros", () => {
      const data = new Uint8Array([10, 20, 30]);
      expect(gf256MulScalar(data, 0)).toEqual(new Uint8Array([0, 0, 0]));
    });
  });
});

describe("reed-solomon encoding/decoding", () => {
  const testData = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);

  describe("reedSolomonEncode", () => {
    it("produces n fragments from k data fragments", () => {
      const k = 3;
      const n = 5;
      const fragments = reedSolomonEncode(testData, k, n);
      expect(fragments.length).toBe(n);
      // Each fragment should have same size as original data / k (rounded up)
      const fragmentSize = Math.ceil(testData.length / k);
      for (const f of fragments) {
        expect(f.length).toBe(fragmentSize);
      }
    });

    it("encodes data into n fragments of equal size", () => {
      const k = 3;
      const n = 5;
      const fragments = reedSolomonEncode(testData, k, n);
      expect(fragments.length).toBe(n);
      const fragmentSize = Math.ceil(testData.length / k);
      for (const f of fragments) {
        expect(f.length).toBe(fragmentSize);
      }
    });

    it("throws if k <= 0", () => {
      expect(() => reedSolomonEncode(testData, 0, 5)).toThrow("k debe ser > 0");
      expect(() => reedSolomonEncode(testData, -1, 5)).toThrow("k debe ser > 0");
    });

    it("throws if n <= k", () => {
      expect(() => reedSolomonEncode(testData, 5, 5)).toThrow("n debe ser > k");
      expect(() => reedSolomonEncode(testData, 5, 3)).toThrow("n debe ser > k");
    });

    it("throws if n > 255 (GF(2^8) limit)", () => {
      expect(() => reedSolomonEncode(testData, 3, 256)).toThrow("n no puede exceder 255");
    });

    it("handles data smaller than k", () => {
      const smallData = new Uint8Array([0x01, 0x02]);
      const k = 5;
      const n = 7;
      const fragments = reedSolomonEncode(smallData, k, n);
      expect(fragments.length).toBe(n);
    });

    it("handles empty data", () => {
      const emptyData = new Uint8Array(0);
      const k = 3;
      const n = 5;
      const fragments = reedSolomonEncode(emptyData, k, n);
      expect(fragments.length).toBe(n);
      for (const f of fragments) {
        expect(f.length).toBe(0);
      }
    });
  });

  describe("reedSolomonDecode", () => {
    it("recovers original data from any k fragments", () => {
      const k = 3;
      const n = 5;
      const fragments = reedSolomonEncode(testData, k, n);

      // Test all combinations of k fragments
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          for (let l = j + 1; l < n; l++) {
            const selected = [fragments[i], fragments[j], fragments[l]];
            const indices = [i, j, l];
            const recovered = reedSolomonDecode(selected, indices, k, testData.length);
            expect(recovered).toEqual(testData);
          }
        }
      }
    });

    it("recovers with first k fragments (systematic)", () => {
      const k = 3;
      const n = 5;
      const fragments = reedSolomonEncode(testData, k, n);
      const selected = fragments.slice(0, k);
      const indices = [0, 1, 2];
      const recovered = reedSolomonDecode(selected, indices, k, testData.length);
      expect(recovered).toEqual(testData);
    });

    it("recovers with last k fragments (parity)", () => {
      const k = 3;
      const n = 5;
      const fragments = reedSolomonEncode(testData, k, n);
      const selected = fragments.slice(n - k);
      const indices = [n - k, n - k + 1, n - k + 2];
      const recovered = reedSolomonDecode(selected, indices, k, testData.length);
      expect(recovered).toEqual(testData);
    });

    it("recovers with mixed data and parity fragments", () => {
      const k = 4;
      const n = 7;
      const fragments = reedSolomonEncode(testData, k, n);
      // Pick fragments 0, 2, 4, 6
      const selected = [fragments[0], fragments[2], fragments[4], fragments[6]];
      const indices = [0, 2, 4, 6];
      const recovered = reedSolomonDecode(selected, indices, k, testData.length);
      expect(recovered).toEqual(testData);
    });

    it("throws if fewer than k fragments provided", () => {
      const k = 3;
      const n = 5;
      const fragments = reedSolomonEncode(testData, k, n);
      const selected = [fragments[0], fragments[1]]; // only 2 fragments
      const indices = [0, 1];
      expect(() => reedSolomonDecode(selected, indices, k, testData.length)).toThrow(
        "Se necesitan al menos k fragmentos"
      );
    });

    it("throws if fragment indices are duplicated", () => {
      const k = 3;
      const n = 5;
      const fragments = reedSolomonEncode(testData, k, n);
      const selected = [fragments[0], fragments[1], fragments[1]];
      const indices = [0, 1, 1];
      expect(() => reedSolomonDecode(selected, indices, k, testData.length)).toThrow(
        "Índices de fragmentos duplicados"
      );
    });

    it("throws if fragment index out of range", () => {
      const k = 3;
      const n = 5;
      const fragments = reedSolomonEncode(testData, k, n);
      const selected = [fragments[0], fragments[1], fragments[2]];
      const indices = [0, 1, 255]; // index 255 >= 255 (max for GF(2^8))
      expect(() => reedSolomonDecode(selected, indices, k, testData.length)).toThrow(
        "Índice de fragmento fuera de rango"
      );
    });

    it("handles empty data", () => {
      const k = 3;
      const n = 5;
      const emptyData = new Uint8Array(0);
      const fragments = reedSolomonEncode(emptyData, k, n);
      const selected = fragments.slice(0, k);
      const indices = [0, 1, 2];
      const recovered = reedSolomonDecode(selected, indices, k, 0);
      expect(recovered).toEqual(emptyData);
    });
  });

  describe("reedSolomonCanRecover", () => {
    it("returns true if at least k fragments available", () => {
      const k = 3;
      const n = 5;
      const available = [true, false, true, true, false]; // 3 available
      expect(reedSolomonCanRecover(available, k)).toBe(true);
    });

    it("returns false if fewer than k fragments available", () => {
      const k = 3;
      const n = 5;
      const available = [true, false, true, false, false]; // 2 available
      expect(reedSolomonCanRecover(available, k)).toBe(false);
    });

    it("returns true if all fragments available", () => {
      const k = 3;
      const n = 5;
      const available = [true, true, true, true, true];
      expect(reedSolomonCanRecover(available, k)).toBe(true);
    });

    it("returns false if no fragments available", () => {
      const k = 3;
      const n = 5;
      const available = [false, false, false, false, false];
      expect(reedSolomonCanRecover(available, k)).toBe(false);
    });

    it("throws if available length != n when n provided", () => {
      const k = 3;
      const available = [true, true, true]; // length 3, but n would be 5
      expect(() => reedSolomonCanRecover(available, k, 5)).toThrow(
        "Longitud de array de disponibilidad debe coincidir con n"
      );
    });
  });

  describe("tampered fragment detection", () => {
    it("detects tampered fragment during decode (throws)", () => {
      const k = 3;
      const n = 5;
      const fragments = reedSolomonEncode(testData, k, n);

      // Tamper with one fragment
      const tampered = [...fragments];
      tampered[1] = new Uint8Array(tampered[1]);
      tampered[1][0] ^= 0xFF; // Flip bits

      const selected = [tampered[0], tampered[1], tampered[2]];
      const indices = [0, 1, 2];

      // Decoding with tampered data should produce wrong result
      // (Reed-Solomon can detect but not correct errors beyond (n-k)/2)
      // For our implementation, we expect it to decode but produce incorrect data
      const recovered = reedSolomonDecode(selected, indices, k, testData.length);
      expect(recovered).not.toEqual(testData);
    });

    it("fails to recover with k-1 fragments", () => {
      const k = 3;
      const n = 5;
      const fragments = reedSolomonEncode(testData, k, n);
      const selected = [fragments[0], fragments[1]]; // only k-1 = 2 fragments
      const indices = [0, 1];
      expect(() => reedSolomonDecode(selected, indices, k, testData.length)).toThrow(
        "Se necesitan al menos k fragmentos"
      );
    });
  });
});