/** Ayudas de prueba del cifrado de archivo (MPT1108A): identidades ECDH y firmante ECDSA con WebCrypto. */
import type { FirmarFn, VerificarFn } from "@/lib/malla/cifrado-archivo";

export async function identidadEcdh() {
  const kp = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  return { pub: await crypto.subtle.exportKey("jwk", kp.publicKey), priv: kp.privateKey };
}

export async function firmanteDePrueba(): Promise<{ firmar: FirmarFn; verificar: VerificarFn }> {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const k = await crypto.subtle.exportKey("jwk", kp.publicKey);
  const datos = (c: unknown) => new TextEncoder().encode(JSON.stringify(c));
  return {
    firmar: async (c) => ({ s: Buffer.from(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, datos(c))).toString("base64"), k, f: "huella-prueba" }),
    verificar: async (c, s, pub) => {
      const key = await crypto.subtle.importKey("jwk", pub, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, Buffer.from(s, "base64"), datos(c));
    },
  };
}

