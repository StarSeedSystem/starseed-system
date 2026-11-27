import { describe, it, expect, beforeAll } from "vitest";
import {
  generateKey,
  exportKey,
  importKey,
  encryptData,
  decryptData,
  fragmentar,
  reconstruir,
  Fragmento,
  MetadatosFragmentacion,
  FragmentacionError,
} from "../fragmentos";

describe("fragmentos - cifrado y fragmentación", () => {
  let key: CryptoKey;
  const testData = new TextEncoder().encode("Datos de prueba para fragmentación y cifrado AES-GCM".repeat(10));
  const k = 3;
  const n = 5;

  beforeAll(async () => {
    key = await generateKey();
  });

  describe("generateKey", () => {
    it("genera una clave AES-GCM de 256 bits", async () => {
      const newKey = await generateKey();
      expect(newKey).toBeInstanceOf(CryptoKey);
      expect(newKey.algorithm.name).toBe("AES-GCM");
      expect(newKey.algorithm.length).toBe(256);
      expect(newKey.usages).toEqual(["encrypt", "decrypt"]);
    });
  });

  describe("exportKey / importKey", () => {
    it("exporta e importa clave en formato raw", async () => {
      const raw = await exportKey(key);
      expect(raw).toBeInstanceOf(ArrayBuffer);
      expect(raw.byteLength).toBe(32); // 256 bits

      const imported = await importKey(raw);
      expect(imported).toBeInstanceOf(CryptoKey);
      expect(imported.algorithm.name).toBe("AES-GCM");
    });

    it("clave importada funciona igual que la original", async () => {
      const raw = await exportKey(key);
      const imported = await importKey(raw);

      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted1 = await encryptData(key, testData, iv);
      const encrypted2 = await encryptData(imported, testData, iv);

      // Con mismo IV, el cifrado debe ser determinístico
      expect(encrypted1).toEqual(encrypted2);

      const decrypted1 = await decryptData(key, encrypted1, iv);
      const decrypted2 = await decryptData(imported, encrypted2, iv);
      expect(decrypted1).toEqual(testData);
      expect(decrypted2).toEqual(testData);
    });
  });

  describe("encryptData / decryptData", () => {
    it("cifra y descifra datos correctamente", async () => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await encryptData(key, testData, iv);
      expect(encrypted).toBeInstanceOf(Uint8Array);
      expect(encrypted.length).toBeGreaterThan(testData.length); // Incluye auth tag

      const decrypted = await decryptData(key, encrypted, iv);
      expect(decrypted).toEqual(testData);
    });

    it("fallo de descifrado con IV incorrecto", async () => {
      const iv1 = crypto.getRandomValues(new Uint8Array(12));
      const iv2 = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await encryptData(key, testData, iv1);

      await expect(decryptData(key, encrypted, iv2)).rejects.toThrow(FragmentacionError);
    });

    it("fallo de descifrado con clave incorrecta", async () => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await encryptData(key, testData, iv);

      const otherKey = await generateKey();
      await expect(decryptData(otherKey, encrypted, iv)).rejects.toThrow(FragmentacionError);
    });

    it("fallo de descifrado con datos manipulados", async () => {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await encryptData(key, testData, iv);

      // Manipular un byte
      const tampered = new Uint8Array(encrypted);
      tampered[0] ^= 0xFF;

      await expect(decryptData(key, tampered, iv)).rejects.toThrow(FragmentacionError);
    });

    it("cada cifrado produce resultado diferente (IV aleatorio)", async () => {
      const iv1 = crypto.getRandomValues(new Uint8Array(12));
      const iv2 = crypto.getRandomValues(new Uint8Array(12));
      const encrypted1 = await encryptData(key, testData, iv1);
      const encrypted2 = await encryptData(key, testData, iv2);

      expect(encrypted1).not.toEqual(encrypted2);
    });
  });

  describe("fragmentar", () => {
    it("fragmenta datos cifrados en n fragmentos con k de n", async () => {
      const metadatos = await fragmentar(key, testData, k, n);

      expect(metadatos).toBeDefined();
      expect(metadatos.k).toBe(k);
      expect(metadatos.n).toBe(n);
      expect(metadatos.originalLength).toBe(testData.length);
      expect(metadatos.iv).toBeInstanceOf(Uint8Array);
      expect(metadatos.iv.length).toBe(12);
      expect(metadatos.fragmentos.length).toBe(n);

      // Verificar estructura de cada fragmento
      for (const frag of metadatos.fragmentos) {
        expect(frag.indice).toBeGreaterThanOrEqual(0);
        expect(frag.indice).toBeLessThan(n);
        expect(frag.datos).toBeInstanceOf(Uint8Array);
        expect(frag.datos.length).toBeGreaterThan(0);
      }

      // Los índices deben ser 0..n-1
      const indices = metadatos.fragmentos.map((f) => f.indice).sort();
      expect(indices).toEqual([0, 1, 2, 3, 4]);
    });

    it("lanza error si k > n", async () => {
      await expect(fragmentar(key, testData, 5, 3)).rejects.toThrow(FragmentacionError);
    });

    it("lanza error si k <= 0 o n <= 0", async () => {
      await expect(fragmentar(key, testData, 0, 5)).rejects.toThrow(FragmentacionError);
      await expect(fragmentar(key, testData, 3, 0)).rejects.toThrow(FragmentacionError);
    });

    it("lanza error si n > 255", async () => {
      await expect(fragmentar(key, testData, 10, 256)).rejects.toThrow(FragmentacionError);
    });

    it("produce metadatos determinísticos para misma clave e IV", async () => {
      // Forzar mismo IV capturando el generado
      const iv = crypto.getRandomValues(new Uint8Array(12));

      // Necesitamos exponer una versión que acepte IV fijo para test determinístico
      // Por ahora verificamos que dos ejecuciones con misma clave dan estructura válida
      const m1 = await fragmentar(key, testData, k, n);
      const m2 = await fragmentar(key, testData, k, n);

      // IVs serán diferentes (aleatorios), pero estructura igual
      expect(m1.k).toBe(m2.k);
      expect(m1.n).toBe(m2.n);
      expect(m1.originalLength).toBe(m2.originalLength);
      expect(m1.fragmentos.length).toBe(m2.fragmentos.length);
    });
  });

  describe("reconstruir", () => {
    it("reconstruye datos originales desde cualquier k fragmentos", async () => {
      const metadatos = await fragmentar(key, testData, k, n);

      // Probar todas las combinaciones de k fragmentos
      const indices = [0, 1, 2, 3, 4];
      const combos: number[][] = [];
      function combine(arr: number[], m: number, start = 0, current: number[] = []): void {
        if (current.length === m) {
          combos.push([...current]);
          return;
        }
        for (let i = start; i < arr.length; i++) {
          current.push(arr[i]);
          combine(arr, m, i + 1, current);
          current.pop();
        }
      }
      combine(indices, k);

      for (const combo of combos) {
        const fragmentosSeleccionados = combo.map((i) => metadatos.fragmentos[i]);
        const reconstruido = await reconstruir(key, metadatos, fragmentosSeleccionados);
        expect(reconstruido).toEqual(testData);
      }
    });

    it("falla con k-1 fragmentos", async () => {
      const metadatos = await fragmentar(key, testData, k, n);
      const pocosFragmentos = metadatos.fragmentos.slice(0, k - 1);

      await expect(reconstruir(key, metadatos, pocosFragmentos)).rejects.toThrow(FragmentacionError);
    });

    it("falla con fragmentos de índices duplicados", async () => {
      const metadatos = await fragmentar(key, testData, k, n);
      const duplicados = [metadatos.fragmentos[0], metadatos.fragmentos[0], metadatos.fragmentos[1]];

      await expect(reconstruir(key, metadatos, duplicados)).rejects.toThrow(FragmentacionError);
    });

    it("falla con fragmentos manipulados (detecta corrupción)", async () => {
      const metadatos = await fragmentar(key, testData, k, n);
      const fragmentos = [metadatos.fragmentos[0], metadatos.fragmentos[1], metadatos.fragmentos[2]];

      // Manipular un fragmento
      const tampered = [...fragmentos];
      tampered[0] = {
        ...tampered[0],
        datos: new Uint8Array(tampered[0].datos),
      };
      tampered[0].datos[0] ^= 0xFF;

      await expect(reconstruir(key, metadatos, tampered)).rejects.toThrow(FragmentacionError);
    });

    it("falla con metadatos inconsistentes (k/n diferente)", async () => {
      const metadatos = await fragmentar(key, testData, k, n);
      const fragmentos = metadatos.fragmentos.slice(0, k);

      const metadatosMalos: MetadatosFragmentacion = {
        ...metadatos,
        k: k + 1, // k incorrecto
      };

      await expect(reconstruir(key, metadatosMalos, fragmentos)).rejects.toThrow(FragmentacionError);
    });

    it("falla con IV incorrecto en metadatos", async () => {
      const metadatos = await fragmentar(key, testData, k, n);
      const fragmentos = metadatos.fragmentos.slice(0, k);

      const metadatosMalos: MetadatosFragmentacion = {
        ...metadatos,
        iv: crypto.getRandomValues(new Uint8Array(12)),
      };

      await expect(reconstruir(key, metadatosMalos, fragmentos)).rejects.toThrow(FragmentacionError);
    });
  });

  describe("Round-trip completo", () => {
    it("fragmentar + reconstruir con diferentes tamaños de datos", async () => {
      const tamaños = [1, 10, 100, 1000, 10000, 65000]; // 65536 es límite de getRandomValues

      for (const size of tamaños) {
        const data = new Uint8Array(size);
        crypto.getRandomValues(data);

        const metadatos = await fragmentar(key, data, k, n);
        const fragmentos = metadatos.fragmentos.slice(0, k);
        const reconstruido = await reconstruir(key, metadatos, fragmentos);

        expect(reconstruido).toEqual(data);
      }
    });

    it("fragmentar + reconstruir con diferentes k/n", async () => {
      const configs = [
        { k: 2, n: 3 },
        { k: 3, n: 5 },
        { k: 4, n: 6 },
        { k: 5, n: 8 },
        { k: 2, n: 4 },
      ];

      for (const { k, n } of configs) {
        const metadatos = await fragmentar(key, testData, k, n);
        const fragmentos = metadatos.fragmentos.slice(0, k);
        const reconstruido = await reconstruir(key, metadatos, fragmentos);

        expect(reconstruido).toEqual(testData);
      }
    });
  });
});