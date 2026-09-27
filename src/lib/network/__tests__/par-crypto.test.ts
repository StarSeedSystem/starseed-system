/**
 * par-crypto — Ola 370 («vínculo entre cuentas con consentimiento»).
 * Corre en el entorno `node` por defecto de vitest: WebCrypto (`globalThis.
 * crypto.subtle`) está disponible en Node ≥ 20 sin jsdom (confirmado por el
 * propio encargo de la ola). Cada test usa un `AlmacenParClaves` EN MEMORIA
 * propio (inyectado) para simular "dos dispositivos" sin IndexedDB real.
 */
import { beforeEach, describe, expect, test } from "vitest";
import {
  derivarClaveParHex,
  exportPubJwk,
  hmacFirmar,
  hmacVerificar,
  topicDePar,
  _resetParKeyCache,
  type AlmacenParClaves,
} from "@/lib/network/par-crypto";

function almacenEnMemoria(): AlmacenParClaves {
  let par: CryptoKeyPair | null = null;
  return {
    async cargar() {
      return par;
    },
    async guardar(p) {
      par = p;
    },
  };
}

beforeEach(() => {
  _resetParKeyCache();
});

describe("derivarClaveParHex", () => {
  test("ambos lados derivan EL MISMO secreto con sus respectivas privadas + la pública del otro + la misma sal", async () => {
    const storeA = almacenEnMemoria();
    const storeB = almacenEnMemoria();
    // Cada lado tiene su PROPIA caché de módulo (`_resetParKeyCache` la limpia
    // entre tests, así que hay que generar A ANTES de tocar B y viceversa —
    // aquí forzamos la generación de cada par con su propio store explícito).
    const pubA = await exportPubJwk(storeA);
    _resetParKeyCache(); // fuerza que el siguiente getOrCreate no reutilice la caché de A
    const pubB = await exportPubJwk(storeB);
    expect(pubA).toBeTruthy();
    expect(pubB).toBeTruthy();

    const sal = "a1b2c3d4e5f60718293a4b5c6d7e8f90";

    _resetParKeyCache();
    const claveDesdeA = await derivarClaveParHex(pubB!, sal, storeA);
    _resetParKeyCache();
    const claveDesdeB = await derivarClaveParHex(pubA!, sal, storeB);

    expect(claveDesdeA).toBeTruthy();
    expect(claveDesdeA).toBe(claveDesdeB);
    expect(claveDesdeA).toMatch(/^[0-9a-f]{64}$/); // 256 bits en hex
  });

  test("una sal distinta deriva un secreto distinto (misma pareja de claves)", async () => {
    const storeA = almacenEnMemoria();
    const storeB = almacenEnMemoria();
    const pubA = await exportPubJwk(storeA);
    _resetParKeyCache();
    const pubB = await exportPubJwk(storeB);

    _resetParKeyCache();
    const clave1 = await derivarClaveParHex(pubB!, "sal-uno-000000000000000000000000", storeA);
    _resetParKeyCache();
    const clave2 = await derivarClaveParHex(pubB!, "sal-dos-000000000000000000000000", storeA);

    expect(clave1).toBeTruthy();
    expect(clave2).toBeTruthy();
    expect(clave1).not.toBe(clave2);
    void pubA;
  });

  test("una pública JWK corrupta/ajena devuelve null (nunca lanza)", async () => {
    const storeA = almacenEnMemoria();
    const claveInvalida = await derivarClaveParHex({ kty: "nope" } as unknown as JsonWebKey, "sal", storeA);
    expect(claveInvalida).toBeNull();
  });
});

describe("topicDePar", () => {
  test("determinista: la misma clave siempre da el mismo topic", async () => {
    const clave = "00".repeat(32);
    const t1 = await topicDePar(clave);
    const t2 = await topicDePar(clave);
    expect(t1).toBeTruthy();
    expect(t1).toBe(t2);
    expect(t1).toHaveLength(24);
    expect(t1).toMatch(/^[0-9a-f]{24}$/);
  });

  test("distinto por vínculo: dos claves de par distintas dan topics distintos", async () => {
    const t1 = await topicDePar("11".repeat(32));
    const t2 = await topicDePar("22".repeat(32));
    expect(t1).not.toBe(t2);
  });
});

describe("hmacFirmar / hmacVerificar", () => {
  const clave = "aa".repeat(32);
  const otraClave = "bb".repeat(32);

  test("una firma válida verifica con la MISMA clave y el MISMO mensaje", async () => {
    const firma = await hmacFirmar(clave, "hola");
    expect(firma).toBeTruthy();
    await expect(hmacVerificar(clave, "hola", firma!)).resolves.toBe(true);
  });

  test("un mensaje manipulado NO verifica (mismo firma, texto distinto)", async () => {
    const firma = await hmacFirmar(clave, "oferta-sdp-original");
    await expect(hmacVerificar(clave, "oferta-sdp-manipulada", firma!)).resolves.toBe(false);
  });

  test("una firma con la clave EQUIVOCADA no verifica", async () => {
    const firma = await hmacFirmar(clave, "hola");
    await expect(hmacVerificar(otraClave, "hola", firma!)).resolves.toBe(false);
  });

  test("una señal sin firmar (vacía/corrupta) nunca verifica", async () => {
    await expect(hmacVerificar(clave, "hola", "")).resolves.toBe(false);
    await expect(hmacVerificar(clave, "hola", "no-es-hex-válido")).resolves.toBe(false);
  });
});
