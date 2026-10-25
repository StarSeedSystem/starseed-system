/* Pruebas del empalme LocalSend: emisión con fetch de MENTIRA (sin red) y recepción al motor. */
import { describe, expect, it } from "vitest";
import type { MsgOferta } from "@/lib/network/archivos-malla";
import {
  baseDeAparato,
  enviarPorLocalSend,
  ofertasDePrepareUpload,
  registrarPorLocalSend,
  type FetchEnvio,
} from "../envio";
import { crearPaquetePresencia, anuncioDePaquete } from "../anuncio-udp";
import { PUERTO_LOCALSEND, crearAnuncioLocalSend, crearPeticionPreparar, type PeticionPrepararSubida } from "../protocolo";

const YO = { alias: "Neurona de Alex", deviceType: "desktop", fingerprint: "fp-1", deviceModel: "StarSeed A1" };
const OFERTA: MsgOferta = {
  t: "archivo.oferta",
  id: "f1",
  nombre: "notas.txt",
  tipo: "text/plain",
  tamano: 100,
  sha256: "raiz",
  trozos: 1,
  tamanoTrozo: 16 * 1024,
  destino: { tipo: "dispositivo" },
};
const DATOS = new Uint8Array([1, 2, 3]).buffer;
const APARATO = { base: baseDeAparato("192.168.1.5") };
const TOKENS = JSON.stringify({ sessionId: "s1", files: { f1: "tk-1" } });

/** Fetch faccioso: la respuesta por ruta terminada en la clave; anota todos los pedidos. */
function fetchDeMentira(respuestas: Record<string, { status: number; cuerpo?: string }>): {
  impl: FetchEnvio;
  llamadas: Array<{ url: string; init?: RequestInit }>;
} {
  const llamadas: Array<{ url: string; init?: RequestInit }> = [];
  const impl: FetchEnvio = async (url, init) => {
    llamadas.push({ url, init: init ?? {} });
    const ruta = url.split("?")[0];
    const acierto = Object.entries(respuestas).find(([clave]) => ruta.endsWith(clave));
    if (!acierto) return new Response(null, { status: 200 });
    return new Response(acierto[1].cuerpo ?? null, { status: acierto[1].status });
  };
  return { impl, llamadas };
}

describe("envío por LocalSend (protocolo aplicado)", () => {
  it("flujo completo: prepare-upload con el anuncio y el archivo, upload con los bytes y el token", async () => {
    const { impl, llamadas } = fetchDeMentira({ "/prepare-upload": { status: 200, cuerpo: TOKENS }, "/upload": { status: 200 } });
    const resultado = await enviarPorLocalSend(OFERTA, DATOS, APARATO, { yo: YO, fetchImpl: impl });
    expect(resultado).toEqual({ estado: "enviado" });
    const preparar = llamadas[0];
    expect(preparar.url).toBe("https://192.168.1.5:53317/api/localsend/v2/prepare-upload");
    const cuerpo: PeticionPrepararSubida = JSON.parse(String(preparar.init?.body));
    expect(cuerpo.info.alias).toBe("Neurona de Alex");
    expect(cuerpo.files.f1).toEqual({ id: "f1", fileName: "notas.txt", size: 100, fileType: "text/plain" });
    const subida = llamadas[1];
    expect(subida.url).toContain("/upload?sessionId=s1&fileId=f1&token=tk-1");
  });

  it("el receptor pide PIN: va como ?pin= en los tres POST", async () => {
    const { impl, llamadas } = fetchDeMentira({ "/prepare-upload": { status: 200, cuerpo: TOKENS }, "/upload": { status: 200 } });
    const conPin = { base: APARATO.base, pin: "123456" };
    await enviarPorLocalSend(OFERTA, DATOS, conPin, { yo: YO, fetchImpl: impl });
    expect(llamadas[0]?.url).toContain("prepare-upload?pin=123456");
    expect(llamadas[1]?.url).toContain("token=tk-1&pin=123456");
    expect(llamadas[1]?.init?.body).toEqual(DATOS);
  });

  it("204 nada que enviar, 401 PIN y 403 rechazado: se corta antes de la subida (una sola llamada)", async () => {
    for (const [status, estado] of [
      [204, "nada-que-enviar"],
      [401, "pin-invalido"],
      [403, "rechazado"],
    ] as const) {
      const { impl, llamadas } = fetchDeMentira({ "/prepare-upload": { status } });
      const resultado = await enviarPorLocalSend(OFERTA, DATOS, APARATO, { yo: YO, fetchImpl: impl });
      expect(resultado).toEqual({ estado });
      expect(llamadas).toHaveLength(1);
    }
  });

  it("respuesta de prepare-upload que no se entiende → sin-respuesta, sin subida ni cancel", async () => {
    const { impl, llamadas } = fetchDeMentira({ "/prepare-upload": { status: 200, cuerpo: "{roto" } });
    const resultado = await enviarPorLocalSend(OFERTA, DATOS, APARATO, { yo: YO, fetchImpl: impl });
    expect(resultado).toEqual({ estado: "sin-respuesta", motivo: "la respuesta de prepare-upload no se entendió" });
    expect(llamadas).toHaveLength(1);
  });

  it("subida 422 (sha256 no casa) → hash-no-coincide y Cancela la sesión", async () => {
    const { impl, llamadas } = fetchDeMentira({ "/prepare-upload": { status: 200, cuerpo: TOKENS }, "/upload": { status: 422 } });
    const resultado = await enviarPorLocalSend(OFERTA, DATOS, APARATO, { yo: YO, fetchImpl: impl });
    expect(resultado).toEqual({ estado: "hash-no-coincide" });
    expect(llamadas[2]?.url).toContain("/cancel?sessionId=s1");
  });

  it("subida 500 → cancelado, cancela y lo dice con el código", async () => {
    const { impl, llamadas } = fetchDeMentira({ "/prepare-upload": { status: 200, cuerpo: TOKENS }, "/upload": { status: 500 } });
    const resultado = await enviarPorLocalSend(OFERTA, DATOS, APARATO, { yo: YO, fetchImpl: impl });
    expect(resultado).toEqual({ estado: "cancelado", motivo: "la subida respondió 500" });
    expect(llamadas[2]?.url).toContain("/cancel?sessionId=s1");
  });

  it("register: el anuncio va como cuerpo; 2xx true, otro false", async () => {
    const arriba = fetchDeMentira({ "/register": { status: 200 } });
    expect(await registrarPorLocalSend(APARATO, crearAnuncioLocalSend(YO), { fetchImpl: arriba.impl })).toBe(true);
    const cuerpo: PeticionPrepararSubida["info"] = JSON.parse(String(arriba.llamadas[0]?.init?.body));
    expect(cuerpo).toEqual({ ...YO, version: "2.0", port: PUERTO_LOCALSEND, protocol: "https", announce: true });
    const abajo = fetchDeMentira({ "/register": { status: 403 } });
    expect(await registrarPorLocalSend(APARATO, crearAnuncioLocalSend(YO), { fetchImpl: abajo.impl })).toBe(false);
  });
});

describe("recepción al motor de la malla", () => {
  it("un prepare-upload entrante se vuelve MsgOferta[] con origen, trozos y destino", () => {
    const anuncio = crearAnuncioLocalSend(YO);
    const oferta = crearPeticionPreparar(anuncio, {
      f1: { id: "f1", fileName: "notas.txt", size: 20480, fileType: "text/plain", sha256: "ab12" },
      f2: { id: "f2", fileName: "foto.jpg", size: 0, fileType: "image/jpeg" },
    });
    const msj = ofertasDePrepareUpload(JSON.stringify(oferta));
    expect(msj).toHaveLength(2);
    expect(msj?.[0]).toMatchObject({ t: "archivo.oferta", id: "f1", nombre: "notas.txt", tamano: 20480, sha256: "ab12", trozos: 2, origen: "Neurona de Alex" });
    expect(msj?.[1]?.tamanoTrozo).toBe(16 * 1024);
  });

  it("un prepare-upload mal formado → null (nada entra al motor)", () => {
    expect(ofertasDePrepareUpload("{roto")).toBeNull();
    expect(ofertasDePrepareUpload(JSON.stringify({ files: {} }))).toBeNull();
  });

  it("el paquete de presencia: mismo JSON del anuncio, grupo y puerto del protocolo; lo que llega se valida igual", () => {
    const anuncio = crearAnuncioLocalSend(YO);
    const paquete = crearPaquetePresencia(anuncio);
    expect(paquete.grupo).toBe("224.0.0.167");
    expect(paquete.puerto).toBe(53317);
    expect(JSON.parse(paquete.json)).toEqual(anuncio);
    expect(anuncioDePaquete(paquete.json)?.alias).toBe("Neurona de Alex");
    expect(anuncioDePaquete(paquete.json)).toEqual(anuncio);
    expect(anuncioDePaquete("{roto")).toBeNull();
    expect(anuncioDePaquete(JSON.stringify({ ...anuncio, version: "1.1" }))).toBeNull();
  });
});
