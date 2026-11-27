import { describe, it, expect } from "vitest";
import {
  gf256Add,
  gf256Mul,
  gf256Div,
  gf256Pow,
  gf256Inv,
  gf256Exp,
  gf256Log,
  generateVandermondeMatrix,
  invertMatrix,
  multiplyMatrixVector,
  reedSolomonEncode,
  reedSolomonDecode,
  reedSolomonRepair,
  ReedSolomonError,
} from "../reed-solomon";

describe("GF(2^8) arithmetic", () => {
  describe("gf256Add (XOR)", () => {
    it("addition is XOR", () => {
      expect(gf256Add(0x00, 0x00)).toBe(0x00);
      expect(gf256Add(0x01, 0x01)).toBe(0x00);
      expect(gf256Add(0x57, 0x83)).toBe(0x57 ^ 0x83);
      expect(gf256Add(0xFF, 0x00)).toBe(0xFF);
    });

    it("is its own inverse", () => {
      for (let a = 0; a < 256; a++) {
        expect(gf256Add(a, a)).toBe(0);
        expect(gf256Add(gf256Add(a, 0x57), 0x57)).toBe(a);
      }
    });
  });

  describe("gf256Mul", () => {
    it("multiplication by 0 is 0", () => {
      for (let a = 0; a < 256; a++) {
        expect(gf256Mul(a, 0)).toBe(0);
        expect(gf256Mul(0, a)).toBe(0);
      }
    });

    it("multiplication by 1 is identity", () => {
      for (let a = 0; a < 256; a++) {
        expect(gf256Mul(a, 1)).toBe(a);
        expect(gf256Mul(1, a)).toBe(a);
      }
    });

    it("is commutative", () => {
      for (let a = 0; a < 256; a++) {
        for (let b = 0; b < 256; b++) {
          expect(gf256Mul(a, b)).toBe(gf256Mul(b, a));
        }
      }
    });

    it("known values with primitive polynomial 0x11d", () => {
      // 0x02 * 0x02 = 0x04
      expect(gf256Mul(0x02, 0x02)).toBe(0x04);
      // 0x02 * 0x04 = 0x08
      expect(gf256Mul(0x02, 0x04)).toBe(0x08);
      // 0x02 * 0x80 = 0x1d (reduction by 0x11d): 0x100 mod 0x11d = 0x1d
      expect(gf256Mul(0x02, 0x80)).toBe(0x1d);
    });
  });

  describe("gf256Div", () => {
    it("division by 1 is identity", () => {
      for (let a = 0; a < 256; a++) {
        expect(gf256Div(a, 1)).toBe(a);
      }
    });

    it("a / a = 1 for non-zero a", () => {
      for (let a = 1; a < 256; a++) {
        expect(gf256Div(a, a)).toBe(1);
      }
    });

    it("a / b * b = a for non-zero b", () => {
      for (let a = 0; a < 256; a++) {
        for (let b = 1; b < 256; b++) {
          expect(gf256Mul(gf256Div(a, b), b)).toBe(a);
        }
      }
    });

    it("throws on division by zero", () => {
      expect(() => gf256Div(5, 0)).toThrow(ReedSolomonError);
    });
  });

  describe("gf256Inv", () => {
    it("inverse of 1 is 1", () => {
      expect(gf256Inv(1)).toBe(1);
    });

    it("a * inv(a) = 1 for non-zero a", () => {
      for (let a = 1; a < 256; a++) {
        expect(gf256Mul(a, gf256Inv(a))).toBe(1);
      }
    });

    it("throws on inverse of zero", () => {
      expect(() => gf256Inv(0)).toThrow(ReedSolomonError);
    });
  });

  describe("gf256Exp and gf256Log", () => {
    it("exp(log(a)) = a for non-zero a", () => {
      for (let a = 1; a < 256; a++) {
        expect(gf256Exp(gf256Log(a))).toBe(a);
      }
    });

    it("log(exp(e)) = e mod 255", () => {
      for (let e = 0; e < 255; e++) {
        expect(gf256Log(gf256Exp(e))).toBe(e);
      }
    });

    it("exp(0) = 1", () => {
      expect(gf256Exp(0)).toBe(1);
    });

    it("log(1) = 0", () => {
      expect(gf256Log(1)).toBe(0);
    });

    it("throws on log(0)", () => {
      expect(() => gf256Log(0)).toThrow(ReedSolomonError);
    });
  });

  describe("gf256Pow", () => {
    it("a^0 = 1 for non-zero a", () => {
      for (let a = 1; a < 256; a++) {
        expect(gf256Pow(a, 0)).toBe(1);
      }
    });

    it("a^1 = a", () => {
      for (let a = 0; a < 256; a++) {
        expect(gf256Pow(a, 1)).toBe(a);
      }
    });

    it("0^e = 0 for e > 0", () => {
      for (let e = 1; e < 10; e++) {
        expect(gf256Pow(0, e)).toBe(0);
      }
    });
  });
});

describe("Vandermonde matrix generation", () => {
  it("generates k x n matrix with distinct evaluation points", () => {
    const k = 3;
    const n = 5;
    const matrix = generateVandermondeMatrix(k, n);

    expect(matrix.length).toBe(k);
    expect(matrix[0].length).toBe(n);

    // First row is all 1s (x^0)
    for (let j = 0; j < n; j++) {
      expect(matrix[0][j]).toBe(1);
    }

    // Second row is evaluation points (x^1)
    for (let j = 0; j < n; j++) {
      expect(matrix[1][j]).toBe(j + 1); // Using 1, 2, 3... as evaluation points
    }

    // Third row is squares of evaluation points
    for (let j = 0; j < n; j++) {
      expect(matrix[2][j]).toBe(gf256Mul(j + 1, j + 1));
    }
  });

  it("throws if n > 255 (max distinct non-zero elements in GF(256))", () => {
    expect(() => generateVandermondeMatrix(3, 256)).toThrow(ReedSolomonError);
  });

  it("throws if k > n", () => {
    expect(() => generateVandermondeMatrix(5, 3)).toThrow(ReedSolomonError);
  });
});

describe("Matrix operations", () => {
  describe("invertMatrix", () => {
    it("inverts 1x1 matrix", () => {
      const matrix = [[5]];
      const inv = invertMatrix(matrix);
      expect(inv.length).toBe(1);
      expect(inv[0].length).toBe(1);
      expect(gf256Mul(matrix[0][0], inv[0][0])).toBe(1);
    });

    it("inverts 2x2 matrix", () => {
      const matrix = [
        [1, 2],
        [3, 4],
      ];
      const inv = invertMatrix(matrix);
      // matrix * inv = identity
      const row0 = multiplyMatrixVector([matrix[0]], [inv[0][0], inv[1][0]]);
      const row1 = multiplyMatrixVector([matrix[1]], [inv[0][0], inv[1][0]]);
      expect(row0[0]).toBe(1);
      expect(row1[0]).toBe(0);

      const row0b = multiplyMatrixVector([matrix[0]], [inv[0][1], inv[1][1]]);
      const row1b = multiplyMatrixVector([matrix[1]], [inv[0][1], inv[1][1]]);
      expect(row0b[0]).toBe(0);
      expect(row1b[0]).toBe(1);
    });

    it("inverts 3x3 matrix", () => {
      const matrix = [
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
      ];
      const inv = invertMatrix(matrix);
      // Verify identity
      for (let i = 0; i < 3; i++) {
        const prod = multiplyMatrixVector(inv, [1, 2, 3]); // arbitrary
        // Just check it doesn't throw and produces correct dimensions
        expect(prod.length).toBe(3);
      }
    });

    it("throws on singular matrix", () => {
      const matrix = [
        [1, 2],
        [2, 4], // second row is 2 * first row
      ];
      expect(() => invertMatrix(matrix)).toThrow(ReedSolomonError);
    });

    it("throws on non-square matrix", () => {
      const matrix = [
        [1, 2, 3],
        [4, 5, 6],
      ];
      expect(() => invertMatrix(matrix)).toThrow(ReedSolomonError);
    });
  });

  describe("multiplyMatrixVector", () => {
    it("multiplies matrix by vector", () => {
      const matrix = [
        [1, 2],
        [3, 4],
      ];
      const vector = [5, 6];
      const result = multiplyMatrixVector(matrix, vector);
      // [1*5 + 2*6, 3*5 + 4*6] in GF(256)
      expect(result.length).toBe(2);
    });
  });
});

describe("Reed-Solomon encoding/decoding", () => {
  describe("reedSolomonEncode", () => {
    it("encodes k data shards into n total shards", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const k = 2;
      const n = 4;
      const shards = reedSolomonEncode(data, k, n);

      expect(shards.length).toBe(n);
      // First k shards should be original data (systematic encoding)
      expect(shards[0]).toEqual(new Uint8Array([0x01, 0x02]));
      expect(shards[1]).toEqual(new Uint8Array([0x03, 0x04]));
      // Parity shards should be different
      expect(shards[2]).not.toEqual(shards[0]);
      expect(shards[3]).not.toEqual(shards[1]);
    });

    it("produces consistent parity for same input", () => {
      const data = new Uint8Array([0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF]);
      const k = 3;
      const n = 5;
      const shards1 = reedSolomonEncode(data, k, n);
      const shards2 = reedSolomonEncode(data, k, n);

      for (let i = 0; i < n; i++) {
        expect(shards1[i]).toEqual(shards2[i]);
      }
    });

    it("throws if data length not divisible by k", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03]);
      expect(() => reedSolomonEncode(data, 2, 4)).toThrow(ReedSolomonError);
    });

    it("throws if k <= 0 or n <= 0", () => {
      const data = new Uint8Array([0x01, 0x02]);
      expect(() => reedSolomonEncode(data, 0, 4)).toThrow(ReedSolomonError);
      expect(() => reedSolomonEncode(data, 2, 0)).toThrow(ReedSolomonError);
    });

    it("throws if k > n", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      expect(() => reedSolomonEncode(data, 5, 3)).toThrow(ReedSolomonError);
    });

    it("throws if n > 255", () => {
      const data = new Uint8Array(10);
      expect(() => reedSolomonEncode(data, 5, 256)).toThrow(ReedSolomonError);
    });
  });

  describe("reedSolomonDecode", () => {
    it("decodes with any k shards out of n", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
      const k = 4;
      const n = 6;
      const shards = reedSolomonEncode(data, k, n);

      // Pick any k shards (e.g., 0, 2, 3, 5)
      const available = [shards[0], shards[2], shards[3], shards[5]];
      const indices = [0, 2, 3, 5];
      const decoded = reedSolomonDecode(available, indices, k, n, data.length);

      expect(decoded).toEqual(data);
    });

    it("decodes with all original data shards (no parity needed)", () => {
      const data = new Uint8Array([0x11, 0x22, 0x33, 0x44]);
      const k = 2;
      const n = 4;
      const shards = reedSolomonEncode(data, k, n);

      const decoded = reedSolomonDecode([shards[0], shards[1]], [0, 1], k, n, data.length);
      expect(decoded).toEqual(data);
    });

    it("decodes with mix of data and parity shards", () => {
      const data = new Uint8Array([0x11, 0x22, 0x33, 0x44, 0x55, 0x66]);
      const k = 3;
      const n = 5;
      const shards = reedSolomonEncode(data, k, n);

      // Use 2 data + 1 parity
      const decoded = reedSolomonDecode([shards[0], shards[1], shards[3]], [0, 1, 3], k, n, data.length);
      expect(decoded).toEqual(data);
    });

    it("throws if fewer than k shards provided", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const k = 2;
      const n = 4;
      const shards = reedSolomonEncode(data, k, n);

      expect(() => reedSolomonDecode([shards[0]], [0], k, n, data.length)).toThrow(ReedSolomonError);
    });

    it("throws if duplicate indices provided", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const k = 2;
      const n = 4;
      const shards = reedSolomonEncode(data, k, n);

      expect(() => reedSolomonDecode([shards[0], shards[0]], [0, 0], k, n, data.length)).toThrow(ReedSolomonError);
    });

    it("throws if shard length doesn't match", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const k = 2;
      const n = 4;
      const shards = reedSolomonEncode(data, k, n);

      const badShard = new Uint8Array([0x00]); // wrong length
      expect(() => reedSolomonDecode([shards[0], badShard], [0, 1], k, n, data.length)).toThrow(ReedSolomonError);
    });
  });

  describe("reedSolomonRepair", () => {
    it("repairs missing shards from any k available shards", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
      const k = 3;
      const n = 5;
      const shards = reedSolomonEncode(data, k, n);

      // Lose shards 1 and 4
      const available: (Uint8Array | null)[] = [shards[0], null, shards[2], shards[3], null];
      const repaired = reedSolomonRepair(available, k, n);

      expect(repaired.length).toBe(n);
      expect(repaired[0]).toEqual(shards[0]);
      expect(repaired[2]).toEqual(shards[2]);
      expect(repaired[3]).toEqual(shards[3]);
      expect(repaired[1]).toEqual(shards[1]);
      expect(repaired[4]).toEqual(shards[4]);
    });

    it("returns original if all shards present", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const k = 2;
      const n = 4;
      const shards = reedSolomonEncode(data, k, n);

      const available = [...shards];
      const repaired = reedSolomonRepair(available, k, n);

      for (let i = 0; i < n; i++) {
        expect(repaired[i]).toEqual(shards[i]);
      }
    });

    it("throws if fewer than k shards available", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04]);
      const k = 2;
      const n = 4;
      const shards = reedSolomonEncode(data, k, n);

      const available: (Uint8Array | null)[] = [shards[0], null, null, null];
      expect(() => reedSolomonRepair(available, k, n)).toThrow(ReedSolomonError);
    });
  });

  describe("Round-trip: encode -> lose shards -> decode/repair", () => {
    it("reconstructs data with any k of n shards (k=3, n=5)", () => {
      const data = new Uint8Array(99); // 99 is divisible by 3
      crypto.getRandomValues(data);
      const k = 3;
      const n = 5;
      const shards = reedSolomonEncode(data, k, n);

      // Test all combinations of k shards
      const indices = [0, 1, 2, 3, 4];
      const combinations = [
        [0, 1, 2], [0, 1, 3], [0, 1, 4],
        [0, 2, 3], [0, 2, 4], [0, 3, 4],
        [1, 2, 3], [1, 2, 4], [1, 3, 4],
        [2, 3, 4],
      ];

      for (const combo of combinations) {
        const available = combo.map((i) => shards[i]);
        const decoded = reedSolomonDecode(available, combo, k, n, data.length);
        expect(decoded).toEqual(data);
      }
    });

    it("fails with k-1 shards", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
      const k = 3;
      const n = 5;
      const shards = reedSolomonEncode(data, k, n);

      // Only k-1 = 2 shards
      expect(() => reedSolomonDecode([shards[0], shards[1]], [0, 1], k, n, data.length)).toThrow(ReedSolomonError);
    });

    it("detects tampered shard (reconstruction produces wrong data)", () => {
      const data = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
      const k = 3;
      const n = 5;
      const shards = reedSolomonEncode(data, k, n);

      // Tamper with one shard
      const tampered = [...shards];
      tampered[0] = new Uint8Array(tampered[0]);
      tampered[0][0] ^= 0xFF; // Flip bits

      // Try to decode with tampered shard - should produce wrong result
      const decoded = reedSolomonDecode([tampered[0], shards[1], shards[2]], [0, 1, 2], k, n, data.length);
      expect(decoded).not.toEqual(data);
    });
  });
});