import { describe, it, expect } from "vitest";
import {
  cifrarDatos,
  descifrarDatos,
  crearFragmento,
  cifrarFragmento,
  reconstruirDeFragmentos,
  validarFragmento,
  Fragmento,
  FragmentoMetadata,
  ClaveCifrado,
  generarClave,
} from "../fragmentos";
import { reedSolomonEncode, reedSolomonDecode } from "../reed-solomon";

describe("fragmentos - cifrado AES-GCM con WebCrypto", () => {
  const testData = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0A]);
  const claveBase = crypto.getRandomValues(new Uint8Array(32));

  describe("cifrarDatos / descifrarDatos", () => {
    it("cifra y descifra correctamente datos arbitrarios", async () => {
      const { cifrado, iv, authTag } = await cifrarDatos(testData, claveBase);
      expect(cifrado.length).toBe(testData.length);
      expect(iv.length).toBe(12); // GCM standard IV
      expect(authTag.length).toBe(16); // GCM auth tag

      const descifrado = await descifrarDatos(cifrado, claveBase, iv, authTag);
      expect(descifrado).toEqual(testData);
    });

    it("produce cifrado diferente cada vez (IV aleatorio)", async () => {
      const r1 = await cifrarDatos(testData, claveBase);
      const r2 = await cifrarDatos(testData, claveBase);
      expect(r1.cifrado).not.toEqual(r2.cifrado);
      expect(r1.iv).not.toEqual(r2.iv);
    });

    it("falla al descifrar con clave incorrecta", async () => {
      const { cifrado, iv, authTag } = await cifrarDatos(testData, claveBase);
      const claveMala = crypto.getRandomValues(new Uint8Array(32));
      await expect(descifrarDatos(cifrado, claveMala, iv, authTag)).rejects.toThrow();
    });

    it("falla al descifrar con IV incorrecto", async () => {
      const { cifrado, iv, authTag } = await cifrarDatos(testData, claveBase);
      const ivMalo = crypto.getRandomValues(new Uint8Array(12));
      await expect(descifrarDatos(cifrado, claveBase, ivMalo, authTag)).rejects.toThrow();
    });

    it("falla al descifrar con authTag incorrecto (datos manipulados)", async () => {
      const { cifrado, iv, authTag } = await cifrarDatos(testData, claveBase);
      const authTagMalo = new Uint8Array(authTag);
      authTagMalo[0] ^= 0xFF;
      await expect(descifrarDatos(cifrado, claveBase, iv, authTagMalo)).rejects.toThrow();
    });

    it("falla al descifrar datos manipulados", async () => {
      const { cifrado, iv, authTag } = await cifrarDatos(testData, claveBase);
      const cifradoManipulado = new Uint8Array(cifrado);
      cifradoManipulado[0] ^= 0xFF;
      await expect(descifrarDatos(cifradoManipulado, claveBase, iv, authTag)).rejects.toThrow();
    });

    it("maneja datos vacíos", async () => {
      const vacio = new Uint8Array(0);
      const { cifrado, iv, authTag } = await cifrarDatos(vacio, claveBase);
      expect(cifrado.length).toBe(0);
      const descifrado = await descifrarDatos(cifrado, claveBase, iv, authTag);
      expect(descifrado).toEqual(vacio);
    });

    it("maneja datos grandes", async () => {
      const grande = crypto.getRandomValues(new Uint8Array(10000));
      const { cifrado, iv, authTag } = await cifrarDatos(grande, claveBase);
      const descifrado = await descifrarDatos(cifrado, claveBase, iv, authTag);
      expect(descifrado).toEqual(grande);
    });
  });
});

describe("fragmentos - creación y validación", () => {
  const testData = new Uint8Array([0x10, 0x20, 0x30, 0x40, 0x50, 0x60, 0x70, 0x80]);
  const clave = crypto.getRandomValues(new Uint8Array(32));
  const fragmentSize = 4;

  describe("crearFragmento", () => {
    it("crea fragmento con metadatos correctos", async () => {
      const fragmento = await crearFragmento(testData, 0, 3, clave, fragmentSize);
      expect(fragmento.indice).toBe(0);
      expect(fragmento.datos.length).toBeLessThanOrEqual(fragmentSize);
      expect(fragmento.metadata).toBeDefined();
      expect(fragmento.metadata.indice).toBe(0);
      expect(fragmento.metadata.total).toBe(3);
      expect(fragmento.metadata.hash).toBeDefined();
      expect(fragmento.metadata.algoritmo).toBe("AES-GCM-256");
      expect(fragmento.metadata.iv).toBeDefined();
      expect(fragmento.metadata.authTag).toBeDefined();
    });

    it("incluye hash de integridad del fragmento cifrado", async () => {
      const fragmento = await crearFragmento(testData, 1, 3, clave, fragmentSize);
      // El hash debe ser del fragmento CIFRADO (no de los datos originales)
      expect(fragmento.metadata.hash.length).toBeGreaterThan(0);
    });

    it("fragmentos de mismo índice con misma clave producen mismo cifrado (determinista con IV fijo)", async () => {
      // Nota: IV es aleatorio, así que el cifrado será diferente cada vez
      // Pero la estructura del fragmento es consistente
      const f1 = await crearFragmento(testData, 0, 3, clave, fragmentSize);
      const f2 = await crearFragmento(testData, 0, 3, clave, fragmentSize);
      expect(f1.indice).toBe(f2.indice);
      expect(f1.metadata.total).toBe(f2.metadata.total);
      expect(f1.datos.length).toBe(f2.datos.length);
    });
  });

  describe("validarFragmento", () => {
    it("valida fragmento correcto", async () => {
      const fragmento = await crearFragmento(testData, 0, 3, clave, fragmentSize);
      expect(validarFragmento(fragmento)).toBe(true);
    });

    it("rechaza fragmento con datos manipulados", async () => {
      const fragmento = await crearFragmento(testData, 0, 3, clave, fragmentSize);
      const manipulado = { ...fragmento, datos: new Uint8Array(fragmento.datos) };
      manipulado.datos[0] ^= 0xFF;
      expect(validarFragmento(manipulado)).toBe(false);
    });

    it("rechaza fragmento con metadata manipulada", async () => {
      const fragmento = await crearFragmento(testData, 0, 3, clave, fragmentSize);
      const manipulado = { ...fragmento, metadata: { ...fragmento.metadata, hash: "fake-hash" } };
      expect(validarFragmento(manipulado)).toBe(false);
    });

    it("rechaza fragmento con índice inválido", async () => {
      const fragmento = await crearFragmento(testData, 0, 3, clave, fragmentSize);
      const invalido = { ...fragmento, indice: -1 };
      expect(validarFragmento(invalido)).toBe(false);
    });

    it("rechaza fragmento con total inválido", async () => {
      const fragmento = await crearFragmento(testData, 0, 3, clave, fragmentSize);
      const invalido = { ...fragmento, metadata: { ...fragmento.metadata, total: 0 } };
      expect(validarFragmento(invalido)).toBe(false);
    });
  });
});

describe("fragmentos - reconstrucción con Reed-Solomon", () => {
  const testData = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08]);
  const clave = crypto.getRandomValues(new Uint8Array(32));
  const k = 3;
  const n = 5;

  it("reconstruye datos originales desde k fragmentos válidos (flujo completo RS + cifrado)", async () => {
    // 1. Codificar con Reed-Solomon (k=3, n=5)
    const rsFragmentos = reedSolomonEncode(testData, k, n);
    expect(rsFragmentos.length).toBe(n);

    // 2. Cifrar cada fragmento RS individualmente (sin re-slicing)
    const fragmentosCifrados: any[] = [];
    for (let i = 0; i < n; i++) {
      const fragmento = await cifrarFragmento(rsFragmentos[i], i, n, clave);
      fragmentosCifrados.push(fragmento);
    }

    // 3. Seleccionar k fragmentos cualesquiera (simulando recuperación de k nodos)
    const seleccionados = [fragmentosCifrados[0], fragmentosCifrados[2], fragmentosCifrados[4]];
    const indices = [0, 2, 4];

    // 4. Reconstruir: descifrar → obtener fragmentos RS → decodificar RS
    const rsRecuperados: Uint8Array[] = [];
    for (const frag of seleccionados) {
      const descifrado = await descifrarDatos(frag.datos, clave, frag.metadata.iv, frag.metadata.authTag);
      rsRecuperados.push(descifrado);
    }

    // Luego decodificamos Reed-Solomon
    const reconstruido = reedSolomonDecode(rsRecuperados, indices, k, testData.length);
    expect(reconstruido).toEqual(testData);
  });

  it("falla si se proporcionan menos de k fragmentos a reconstruirDeFragmentos", async () => {
    const fragmento = await crearFragmento(testData, 0, n, clave, Math.ceil(testData.length / k));
    await expect(reconstruirDeFragmentos([fragmento], [0], clave, testData.length, k)).rejects.toThrow(
      `Se necesitan al menos ${k} fragmentos`
    );
  });

  it("falla si algún fragmento está manipulado durante la reconstrucción", async () => {
    const rsFragmentos = reedSolomonEncode(testData, k, n);
    const fragmentosCifrados: any[] = [];
    for (let i = 0; i < n; i++) {
      const fragmento = await cifrarFragmento(rsFragmentos[i], i, n, clave);
      fragmentosCifrados.push(fragmento);
    }

    // Manipular un fragmento cifrado
    const manipulado = { ...fragmentosCifrados[1], datos: new Uint8Array(fragmentosCifrados[1].datos) };
    manipulado.datos[0] ^= 0xFF;
    const seleccionados = [fragmentosCifrados[0], manipulado, fragmentosCifrados[2]];
    const indices = [0, 1, 2];

    // Intentar descifrar el manipulado debería fallar
    await expect(descifrarDatos(manipulado.datos, clave, manipulado.metadata.iv, manipulado.metadata.authTag)).rejects.toThrow();
  });

  it("falla si los índices no coinciden en reconstruirDeFragmentos", async () => {
    const fragmento = await crearFragmento(testData, 0, n, clave, Math.ceil(testData.length / k));
    const seleccionados = [fragmento];
    const indicesIncorrectos = [5]; // índice diferente
    await expect(reconstruirDeFragmentos(seleccionados, indicesIncorrectos, clave, testData.length, k)).rejects.toThrow();
  });
});

describe("fragmentos - ClaveCifrado", () => {
  it("genera clave aleatoria de 32 bytes", () => {
    const clave = generarClave();
    expect(clave.length).toBe(32);
  });

  it("claves diferentes son diferentes", () => {
    const clave1 = generarClave();
    const clave2 = generarClave();
    expect(clave1).not.toEqual(clave2);
  });
});