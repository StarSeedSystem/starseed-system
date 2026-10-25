/* Pruebas del protocolo LocalSend v2 — solo funciones puras (sin red, sin node:*). */
import { describe, expect, it } from "vitest";
import {
  GRUPO_MULTIDIFUSION,
  PUERTO_LOCALSEND,
  VERSION_PROTOCOLO,
  anuncioDesdeJson,
  archivoParaLocalSend,
  crearAnuncioLocalSend,
  crearPeticionPreparar,
  interpretarEstadoPreparar,
  interpretarEstadoSubida,
  ofertaDesdeLocalSend,
  peticionPrepararDesdeJson,
  respuestaPrepararDesdeJson,
  urlCancelar,
  urlPrepararSubida,
  urlRegistro,
  urlSubida,
} from "../protocolo";

const BASE = "https://192.168.1.5:53317";

const anuncio = crearAnuncioLocalSend({
  alias: "Neurona de Alex",
  deviceType: "desktop",
  fingerprint: "fp-1",
  deviceModel: "StarSeed A1",
});

const archivo = { id: "f1", fileName: "notas.txt", size: 100, fileType: "text/plain", sha256: "aa", preview: "notas" };

describe("protocolo LocalSend v2", () => {
  it("constantes del contrato verificado: puerto 53317, multidifusión 224.0.0.167, versión 2.0", () => {
    expect(PUERTO_LOCALSEND).toBe(53317);
    expect(GRUPO_MULTIDIFUSION).toBe("224.0.0.167");
    expect(VERSION_PROTOCOLO).toBe("2.0");
  });

  it("crearAnuncioLocalSend aplica los defectos: version 2.0, puerto 53317, https y announce", () => {
    expect(anuncio).toEqual({
      alias: "Neurona de Alex",
      version: "2.0",
      deviceModel: "StarSeed A1",
      deviceType: "desktop",
      fingerprint: "fp-1",
      port: 53317,
      protocol: "https",
      announce: true,
    });
    expect(crearPeticionPreparar(anuncio, { f1: archivo }).files.f1.size).toBe(100);
  });

  it("ida y vuelta: anuncio → JSON → lectura validada (igual)", () => {
    const leido = anuncioDesdeJson(JSON.stringify(anuncio));
    expect(leido).toEqual(anuncio);
    expect(anuncioDesdeJson(`\n${JSON.stringify(anuncio)}\n`)?.alias).toBe("Neurona de Alex");
  });

  it("anuncio mal formado → null (JSON roto, no objeto, versión, puerto, protocolo, campos)", () => {
    expect(anuncioDesdeJson("{roto")).toBeNull();
    expect(anuncioDesdeJson("42")).toBeNull();
    expect(anuncioDesdeJson(JSON.stringify({ ...anuncio, version: "1.0" }))).toBeNull();
    expect(anuncioDesdeJson(JSON.stringify({ ...anuncio, port: 70000 }))).toBeNull();
    expect(anuncioDesdeJson(JSON.stringify({ ...anuncio, protocol: "ftp" }))).toBeNull();
    expect(anuncioDesdeJson(JSON.stringify({ ...anuncio, alias: 3 }))).toBeNull();
    expect(anuncioDesdeJson(JSON.stringify({ ...anuncio, deviceType: true }))).toBeNull();
    expect(anuncioDesdeJson(JSON.stringify({ ...anuncio, fingerprint: null }))).toBeNull();
  });

  it("anuncio: lo opcional se lee cuando va y queda fuera cuando no va", () => {
    const minimo = { alias: "Neurona", version: "2.0", deviceType: "mobile", fingerprint: "fp-2", port: 53317, protocol: "http" };
    const leido = anuncioDesdeJson(JSON.stringify(minimo));
    expect(leido).toEqual(minimo); // sin deviceModel/download/announce: no inventa nada
  });

  it("prepare-upload: petición validada con info y archivos (sha256 y preview opcionales)", () => {
    const peticion = crearPeticionPreparar(anuncio, {
      f1: archivo,
      f2: { id: "f2", fileName: "foto.jpg", size: 0, fileType: "image/jpeg" },
    });
    const leido = peticionPrepararDesdeJson(JSON.stringify(peticion));
    expect(leido?.info).toEqual(anuncio);
    expect(leido?.files.f1).toEqual(archivo);
    expect(leido?.files.f2.sha256).toBeUndefined();
    expect(leido?.files.f2.preview).toBeUndefined();
  });

  it("prepare-upload: petición mal formada → null (JSON roto, sin files, sin info, campos de archivo malos)", () => {
    expect(peticionPrepararDesdeJson("{roto")).toBeNull();
    expect(peticionPrepararDesdeJson(JSON.stringify({ info: anuncio }))).toBeNull(); // sin files
    expect(peticionPrepararDesdeJson(JSON.stringify({ files: { f1: archivo } }))).toBeNull(); // sin info
    expect(
      peticionPrepararDesdeJson(JSON.stringify({ info: anuncio, files: { f1: { id: 3, fileName: "a", size: 1, fileType: "t" } } })),
    ).toBeNull();
    expect(
      peticionPrepararDesdeJson(JSON.stringify({ info: anuncio, files: { f1: { id: "f1", fileName: 7, size: 1, fileType: "t" } } })),
    ).toBeNull();
    expect(
      peticionPrepararDesdeJson(JSON.stringify({ info: anuncio, files: { f1: { id: "f1", fileName: "a", size: -1, fileType: "t" } } })),
    ).toBeNull();
    expect(
      peticionPrepararDesdeJson(JSON.stringify({ info: anuncio, files: { f1: { id: "f1", fileName: "a", size: "2", fileType: "t" } } })),
    ).toBeNull();
    expect(
      peticionPrepararDesdeJson(JSON.stringify({ info: anuncio, files: { f1: { id: "f1", fileName: "a", size: 1, fileType: 9 } } })),
    ).toBeNull();
  });

  it("respuesta de prepare-upload: sessionId y token por archivo, ida y vuelta; mal formada → null", () => {
    const respuesta = { sessionId: "s1", files: { f1: "tk-1", f2: "tk-2" } };
    expect(respuestaPrepararDesdeJson(JSON.stringify(respuesta))).toEqual(respuesta);
    expect(respuestaPrepararDesdeJson("{roto")).toBeNull();
    expect(respuestaPrepararDesdeJson(JSON.stringify({ sessionId: "s1" }))).toBeNull(); // sin files
    expect(respuestaPrepararDesdeJson(JSON.stringify({ sessionId: 7, files: {} }))).toBeNull(); // sessionId no texto
    expect(respuestaPrepararDesdeJson(JSON.stringify({ sessionId: "s1", files: { f1: 1 } }))).toBeNull(); // token no texto
  });

  it("un array JSON donde toca objeto → null (files: [] en petición y respuesta)", () => {
    expect(peticionPrepararDesdeJson(JSON.stringify({ info: anuncio, files: [] }))).toBeNull();
    expect(respuestaPrepararDesdeJson(JSON.stringify({ sessionId: "s1", files: [] }))).toBeNull();
    expect(anuncioDesdeJson("[]")).toBeNull();
  });

  it("URL de subida: sessionId, fileId y token (y PIN) por URLSearchParams", () => {
    expect(urlSubida(BASE, "s1", "f1", "tk")).toBe(
      "https://192.168.1.5:53317/api/localsend/v2/upload?sessionId=s1&fileId=f1&token=tk",
    );
    expect(urlSubida(BASE, "s 1", "f1", "tk", "123456")).toBe(
      "https://192.168.1.5:53317/api/localsend/v2/upload?sessionId=s+1&fileId=f1&token=tk&pin=123456",
    );
  });

  it("URL de register, prepare-upload y cancel; el PIN va como ?pin=", () => {
    expect(urlRegistro(BASE)).toBe(`${BASE}/api/localsend/v2/register`);
    expect(urlRegistro(BASE, "123456")).toBe(`${BASE}/api/localsend/v2/register?pin=123456`);
    expect(urlPrepararSubida(BASE)).toBe(`${BASE}/api/localsend/v2/prepare-upload`);
    expect(urlPrepararSubida(BASE, "123456")).toBe(`${BASE}/api/localsend/v2/prepare-upload?pin=123456`);
    expect(urlCancelar(BASE, "s1")).toBe(`${BASE}/api/localsend/v2/cancel?sessionId=s1`);
    expect(urlCancelar(BASE, "s1", "123456")).toBe(`${BASE}/api/localsend/v2/cancel?sessionId=s1&pin=123456`);
  });

  it("estados de prepare-upload según el contrato: 204 nada que enviar, 401 PIN, 403 rechazado, 2xx ok", () => {
    expect(interpretarEstadoPreparar(204)).toBe("nada-que-enviar");
    expect(interpretarEstadoPreparar(401)).toBe("pin-invalido");
    expect(interpretarEstadoPreparar(403)).toBe("rechazado");
    expect(interpretarEstadoPreparar(200)).toBe("ok");
    expect(interpretarEstadoPreparar(201)).toBe("ok");
    expect(interpretarEstadoPreparar(422)).toBe("desconocido");
    expect(interpretarEstadoPreparar(500)).toBe("desconocido");
  });

  it("estados de la subida según el contrato: 422 el sha256 no casa, 2xx ok, resto desconocido", () => {
    expect(interpretarEstadoSubida(200)).toBe("ok");
    expect(interpretarEstadoSubida(204)).toBe("ok");
    expect(interpretarEstadoSubida(422)).toBe("hash-no-coincide");
    expect(interpretarEstadoSubida(401)).toBe("desconocido");
    expect(interpretarEstadoSubida(500)).toBe("desconocido");
  });

  it("ofertaDesdeLocalSend: archivo LocalSend → MsgOferta del motor de la malla", () => {
    const oferta = ofertaDesdeLocalSend(anuncio, archivo, { destino: { tipo: "biblioteca", id: "b1" }, tamanoTrozo: 64 });
    expect(oferta.t).toBe("archivo.oferta");
    expect(oferta.id).toBe("f1");
    expect(oferta.nombre).toBe("notas.txt");
    expect(oferta.tipo).toBe("text/plain");
    expect(oferta.tamano).toBe(100);
    expect(oferta.sha256).toBe("aa");
    expect(oferta.trozos).toBe(2); // 100 bytes / 64
    expect(oferta.tamanoTrozo).toBe(64);
    expect(oferta.destino).toEqual({ tipo: "biblioteca", id: "b1" });
    expect(oferta.origen).toBe("Neurona de Alex");
  });

  it("oferta por defecto: 16 KiB por trozo, destino dispositivo y sha256 vacío si LocalSend no lo declara", () => {
    const sinHash = { id: "f1", fileName: "notas.txt", size: 100, fileType: "text/plain" };
    const oferta = ofertaDesdeLocalSend(anuncio, sinHash);
    expect(oferta.sha256).toBe("");
    expect(oferta.tamanoTrozo).toBe(16 * 1024);
    expect(oferta.trozos).toBe(1);
    expect(oferta.destino).toEqual({ tipo: "dispositivo" });
  });

  it("archivoParaLocalSend: MsgOferta → archivo LocalSend; NO mapea la raíz de la malla como sha256", () => {
    const oferta = ofertaDesdeLocalSend(anuncio, archivo);
    const para = archivoParaLocalSend(oferta);
    expect(para).toEqual({ id: "f1", fileName: "notas.txt", size: 100, fileType: "text/plain" });
    expect("sha256" in para).toBe(false); // honesto: la raíz por trozos de la malla no es el sha256 del archivo
    const conHash = archivoParaLocalSend(oferta, { sha256Real: "hash-real" });
    expect(conHash.sha256).toBe("hash-real");
  });
});




