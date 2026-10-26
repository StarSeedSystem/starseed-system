/* Pruebas del protocolo LocalSend v2 — solo funciones puras (sin red, sin node:*). */
import { describe, expect, it } from "vitest";
import {
  GRUPO_MULTIDIFUSION, PUERTO_LOCALSEND, VERSION_PROTOCOLO, anuncioDesdeJson, archivoParaLocalSend,
  crearAnuncioLocalSend, crearPeticionPreparar, interpretarEstadoPreparar, interpretarEstadoSubida,
  ofertaDesdeLocalSend, peticionPrepararDesdeJson, respuestaPrepararDesdeJson, urlCancelar,
  urlPrepararSubida, urlRegistro, urlSubida,
} from "../protocolo";

const BASE = "https://192.168.1.5:53317";
const anuncio = crearAnuncioLocalSend({ alias: "Neurona de Alex", deviceType: "desktop", fingerprint: "fp-1", deviceModel: "StarSeed A1" });
const archivo = { id: "f1", fileName: "notas.txt", size: 100, fileType: "text/plain", sha256: "aa", preview: "notas" };

describe("protocolo LocalSend v2", () => {
  it("constantes del contrato, defectos del anuncio y petición", () => {
    expect([PUERTO_LOCALSEND, GRUPO_MULTIDIFUSION, VERSION_PROTOCOLO]).toEqual([53317, "224.0.0.167", "2.0"]);
    expect(anuncio).toEqual({ alias: "Neurona de Alex", version: "2.0", deviceModel: "StarSeed A1",
      deviceType: "desktop", fingerprint: "fp-1", port: 53317, protocol: "https", announce: true });
    expect(crearPeticionPreparar(anuncio, { f1: archivo }).files.f1.size).toBe(100);
  });

  it("ida y vuelta del anuncio; lo opcional solo se lee cuando va", () => {
    expect(anuncioDesdeJson(JSON.stringify(anuncio))).toEqual(anuncio);
    expect(anuncioDesdeJson(`\n${JSON.stringify(anuncio)}\n`)?.alias).toBe("Neurona de Alex");
    const minimo = { alias: "Neurona", version: "2.0", deviceType: "mobile", fingerprint: "fp-2", port: 53317, protocol: "http" };
    expect(anuncioDesdeJson(JSON.stringify(minimo))).toEqual(minimo);
  });

  it("anuncio mal formado → null (JSON roto, no objeto, versión, puerto, protocolo, campos)", () => {
    expect(anuncioDesdeJson("{roto")).toBeNull();
    expect(anuncioDesdeJson("42")).toBeNull();
    expect(anuncioDesdeJson("[]")).toBeNull();
    for (const roto of [{ version: "1.0" }, { port: 70000 }, { port: 0 }, { protocol: "ftp" }, { alias: 3 }, { deviceType: true }, { fingerprint: null }]) {
      expect(anuncioDesdeJson(JSON.stringify({ ...anuncio, ...roto }))).toBeNull();
    }
  });

  it("prepare-upload: ida y vuelta con info y archivos (sha256 y preview opcionales)", () => {
    const peticion = crearPeticionPreparar(anuncio, { f1: archivo, f2: { id: "f2", fileName: "foto.jpg", size: 0, fileType: "image/jpeg" } });
    const leido = peticionPrepararDesdeJson(JSON.stringify(peticion));
    expect(leido?.info).toEqual(anuncio);
    expect(leido?.files.f1).toEqual(archivo);
    expect(leido?.files.f2.sha256).toBeUndefined();
    expect(leido?.files.f2.preview).toBeUndefined();
  });

  it("prepare-upload mal formada → null (JSON roto, sin files, sin info, cada campo de archivo malo)", () => {
    expect(peticionPrepararDesdeJson("{roto")).toBeNull();
    expect(peticionPrepararDesdeJson(JSON.stringify({ info: anuncio }))).toBeNull();
    expect(peticionPrepararDesdeJson(JSON.stringify({ files: { f1: archivo } }))).toBeNull();
    expect(peticionPrepararDesdeJson(JSON.stringify({ info: anuncio, files: [] }))).toBeNull();
    for (const malo of [
      { id: 3, fileName: "a", size: 1, fileType: "t" },
      { id: "f1", fileName: 7, size: 1, fileType: "t" },
      { id: "f1", fileName: "a", size: -1, fileType: "t" },
      { id: "f1", fileName: "a", size: "2", fileType: "t" },
      { id: "f1", fileName: "a", size: 1, fileType: 9 },
    ]) {
      expect(peticionPrepararDesdeJson(JSON.stringify({ info: anuncio, files: { f1: malo } }))).toBeNull();
    }
  });

  it("respuesta de prepare-upload: ida y vuelta; mal formada → null", () => {
    const respuesta = { sessionId: "s1", files: { f1: "tk-1", f2: "tk-2" } };
    expect(respuestaPrepararDesdeJson(JSON.stringify(respuesta))).toEqual(respuesta);
    expect(respuestaPrepararDesdeJson("{roto")).toBeNull();
    expect(respuestaPrepararDesdeJson(JSON.stringify({ sessionId: "s1" }))).toBeNull();
    expect(respuestaPrepararDesdeJson(JSON.stringify({ sessionId: 7, files: {} }))).toBeNull();
    expect(respuestaPrepararDesdeJson(JSON.stringify({ sessionId: "s1", files: { f1: 1 } }))).toBeNull();
    expect(respuestaPrepararDesdeJson(JSON.stringify({ sessionId: "s1", files: [] }))).toBeNull();
  });

  it("URL con URLSearchParams: rutas del contrato y PIN como ?pin=", () => {
    expect(urlRegistro(BASE)).toBe(`${BASE}/api/localsend/v2/register`);
    expect(urlRegistro(BASE, "123456")).toBe(`${BASE}/api/localsend/v2/register?pin=123456`);
    expect(urlPrepararSubida(BASE)).toBe(`${BASE}/api/localsend/v2/prepare-upload`);
    expect(urlPrepararSubida(BASE, "123456")).toBe(`${BASE}/api/localsend/v2/prepare-upload?pin=123456`);
    expect(urlSubida(BASE, "s1", "f1", "tk")).toBe(`${BASE}/api/localsend/v2/upload?sessionId=s1&fileId=f1&token=tk`);
    expect(urlSubida(BASE, "s 1", "f1", "tk", "123456")).toBe(`${BASE}/api/localsend/v2/upload?sessionId=s+1&fileId=f1&token=tk&pin=123456`);
    expect(urlCancelar(BASE, "s1")).toBe(`${BASE}/api/localsend/v2/cancel?sessionId=s1`);
    expect(urlCancelar(BASE, "s1", "123456")).toBe(`${BASE}/api/localsend/v2/cancel?sessionId=s1&pin=123456`);
  });

  it("estados de prepare-upload: 204 nada que enviar, 401 PIN, 403 rechazado, 2xx ok", () => {
    expect(interpretarEstadoPreparar(204)).toBe("nada-que-enviar");
    expect(interpretarEstadoPreparar(401)).toBe("pin-invalido");
    expect(interpretarEstadoPreparar(403)).toBe("rechazado");
    expect(interpretarEstadoPreparar(200)).toBe("ok");
    expect(interpretarEstadoPreparar(201)).toBe("ok");
    expect(interpretarEstadoPreparar(422)).toBe("desconocido");
    expect(interpretarEstadoPreparar(500)).toBe("desconocido");
  });

  it("estados de subida: 422 hash no casa, 2xx ok, resto desconocido", () => {
    expect(interpretarEstadoSubida(200)).toBe("ok");
    expect(interpretarEstadoSubida(204)).toBe("ok");
    expect(interpretarEstadoSubida(422)).toBe("hash-no-coincide");
    expect(interpretarEstadoSubida(401)).toBe("desconocido");
    expect(interpretarEstadoSubida(500)).toBe("desconocido");
  });

  it("ofertaDesdeLocalSend: archivo LocalSend → MsgOferta del motor de la malla", () => {
    const oferta = ofertaDesdeLocalSend(anuncio, archivo, { destino: { tipo: "biblioteca", id: "b1" }, tamanoTrozo: 64 });
    expect(oferta).toMatchObject({ t: "archivo.oferta", id: "f1", nombre: "notas.txt", tipo: "text/plain",
      tamano: 100, sha256: "aa", trozos: 2, tamanoTrozo: 64, destino: { tipo: "biblioteca", id: "b1" }, origen: "Neurona de Alex" });
    const sinHash = ofertaDesdeLocalSend(anuncio, { id: "f2", fileName: "foto.jpg", size: 0, fileType: "image/jpeg" });
    expect(sinHash).toMatchObject({ sha256: "", tamanoTrozo: 16 * 1024, trozos: 1, destino: { tipo: "dispositivo" } });
  });

  it("archivoParaLocalSend: MsgOferta → archivo LocalSend; la raíz por trozos NO se manda como sha256", () => {
    const oferta = ofertaDesdeLocalSend(anuncio, archivo);
    const para = archivoParaLocalSend(oferta);
    expect(para).toEqual({ id: "f1", fileName: "notas.txt", size: 100, fileType: "text/plain" });
    expect("sha256" in para).toBe(false);
    expect(archivoParaLocalSend(oferta, { sha256Real: "hash-real" }).sha256).toBe("hash-real");
  });
});
