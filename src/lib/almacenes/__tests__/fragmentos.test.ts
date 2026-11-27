import { describe, it, expect } from "vitest";
import {
  ALGORITMO_CIFRADO,
  fragmentarCifrado,
  generarClaveAesGcm,
  reconstruirYDescifrar,
  verificarFragmento,
  type FragmentoCifrado,
} from "../fragmentos";

function copiar(fragmento: FragmentoCifrado): FragmentoCifrado {
  return { ...fragmento, datos: new Uint8Array(fragmento.datos) };
}

describe("fragmentación cifrada antes de salir", () => {
  it("cifra, fragmenta y reconstruye con un subconjunto cualquiera de k fragmentos", async () => {
    const clave = await generarClaveAesGcm();
    const original = new TextEncoder().encode("memoria privada del cerebro · capa de conciencia");
    const paquete = await fragmentarCifrado(original, clave, { k: 3, n: 5 });

    expect(paquete.algoritmo).toBe(ALGORITMO_CIFRADO);
    expect(paquete.fragmentos).toHaveLength(5);
    expect(paquete.longitudCifrada).toBe(original.length + 16);

    const claro = await reconstruirYDescifrar(paquete, paquete.fragmentos.slice(1, 4), clave);
    expect(Array.from(claro)).toEqual(Array.from(original));
  });

  it("no guarda la llave dentro del paquete ni de los fragmentos", async () => {
    const clave = await generarClaveAesGcm();
    const paquete = await fragmentarCifrado(new Uint8Array([1, 2, 3, 4]), clave, { k: 2, n: 4 });
    const claves = Object.keys(paquete);
    expect(claves).not.toContain("clave");
    expect(claves).not.toContain("key");
    for (const fragmento of paquete.fragmentos) {
      expect(Object.keys(fragmento)).not.toContain("clave");
      expect(Object.keys(fragmento)).not.toContain("key");
    }
  });

  it("falla con k-1 fragmentos", async () => {
    const clave = await generarClaveAesGcm();
    const paquete = await fragmentarCifrado(new Uint8Array([9, 8, 7, 6, 5]), clave, { k: 3, n: 5 });
    await expect(reconstruirYDescifrar(paquete, paquete.fragmentos.slice(0, 2), clave)).rejects.toThrow(
      /al menos 3/,
    );
  });

  it("detecta un fragmento manipulado antes de descifrar", async () => {
    const clave = await generarClaveAesGcm();
    const paquete = await fragmentarCifrado(new Uint8Array([4, 8, 15, 16, 23, 42]), clave, {
      k: 2,
      n: 4,
    });
    const manipulado = copiar(paquete.fragmentos[1]);
    manipulado.datos[0] ^= 0xff;

    expect(await verificarFragmento(paquete.fragmentos[1])).toBe(true);
    expect(await verificarFragmento(manipulado)).toBe(false);
    await expect(
      reconstruirYDescifrar(paquete, [paquete.fragmentos[0], manipulado], clave),
    ).rejects.toThrow(/manipulado/);
  });

  it("rechaza descifrar con otra llave", async () => {
    const clave = await generarClaveAesGcm();
    const otra = await generarClaveAesGcm();
    const paquete = await fragmentarCifrado(new Uint8Array([1, 1, 2, 3, 5, 8]), clave, {
      k: 2,
      n: 3,
    });
    await expect(reconstruirYDescifrar(paquete, paquete.fragmentos.slice(0, 2), otra)).rejects.toThrow();
  });
});
