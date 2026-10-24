/**
 * voz-por-malla (Ola 1015V · R) — protocolo puro `oido.*`/`voz.*`, troceo y
 * rearme con sha256, privacidad del audio (§3) y despachador con transporte
 * inyectado. Sin red, sin micrófono y sin procesos.
 */
import { describe, expect, it } from "vitest";
import {
  TROZO_AUDIO_BYTES,
  b64ABytes,
  bytesAB64,
  despacharVozMalla,
  esMensajeVozMalla,
  puedeEnviarAudio,
  rearmarAudio,
  sha256Hex,
  trocearAudio,
  validarTrozos,
  type DestinoVoz,
  type MsgOidoPedir,
  type TrozoAudio,
  type VozMallaMsg,
} from "@/lib/network/voz-por-malla";

function transporte() {
  const enviados: { peerId: string; json: string }[] = [];
  return {
    enviados,
    enviar(peerId: string, json: string) { enviados.push({ peerId, json }); return true; },
  };
}

const propia: DestinoVoz = { dispositivo: "n1", confianza: "propia" };
const grupo: DestinoVoz = { dispositivo: "n2", confianza: "grupo", enSesion: true };
const ajena: DestinoVoz = { dispositivo: "n3", confianza: "ajena" };
const audio = (n: number) => Uint8Array.from({ length: n }, (_, i) => i % 251);

describe("protocolo oido.* y voz.*", () => {
  const trozo: TrozoAudio = { i: 0, total: 1, datosB64: "AA==", sha256: "a".repeat(64) };
  it("acepta los seis tipos bien formados", () => {
    expect(esMensajeVozMalla({ t: "oido.pedir", id: "1", audio: trozo, idioma: "es", hotwords: ["Astraura"] })).toBe(true);
    expect(esMensajeVozMalla({ t: "oido.texto", id: "1", texto: "hola", tipo: "parcial" })).toBe(true);
    expect(esMensajeVozMalla({ t: "voz.pedir", id: "1", texto: "hola", timbre: { id: "ef_dora" } })).toBe(true);
    expect(esMensajeVozMalla({ t: "voz.trozo", id: "1", audio: trozo })).toBe(true);
    expect(esMensajeVozMalla({ t: "oido.cancelar", id: "1" })).toBe(true);
    expect(esMensajeVozMalla({ t: "voz.error", id: "1", estado: 503, mensaje: "sin voz" })).toBe(true);
  });
  it("rechaza otros namespaces, ids vacíos y carga incompleta", () => {
    expect(esMensajeVozMalla({ t: "ia.pedir", id: "1" })).toBe(false);
    expect(esMensajeVozMalla({ t: "oido.pedir", id: "", audio: trozo })).toBe(false);
    expect(esMensajeVozMalla({ t: "oido.texto", id: "1", texto: "x", tipo: "otro" })).toBe(false);
    expect(esMensajeVozMalla({ t: "voz.trozo", id: "1" })).toBe(false);
  });
});

describe("troceo, rearme y sha256", () => {
  it("trocea a 16 KB, rearma idéntico y valida", async () => {
    const datos = audio(TROZO_AUDIO_BYTES * 2 + 17);
    const trozos = await trocearAudio(datos);
    expect(trozos).toHaveLength(3);
    expect(trozos.map((t) => t.i)).toEqual([0, 1, 2]);
    expect(trozos.every((t) => t.total === 3 && t.sha256.length === 64)).toBe(true);
    expect(rearmarAudio(trozos)).toEqual(datos);
    await expect(validarTrozos(trozos)).resolves.toBe(true);
  });
  it("rechaza desorden, total que no cuadra y sha manipulado", async () => {
    const trozos = await trocearAudio(audio(TROZO_AUDIO_BYTES + 1));
    expect(rearmarAudio([trozos[1], trozos[0]])).toBeNull();
    expect(rearmarAudio([trozos[0]])).toBeNull();
    const malo: TrozoAudio[] = [{ ...trozos[0], datosB64: bytesAB64(new Uint8Array([9, 9, 9])) }, trozos[1]];
    await expect(validarTrozos(malo)).resolves.toBe(false);
  });
  it("base64 y sha256 son estables", async () => {
    const d = audio(32);
    expect(b64ABytes(bytesAB64(d))).toEqual(d);
    expect(await sha256Hex(d)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("privacidad §3", () => {
  it("solo propia y grupo con sesión", () => {
    expect(puedeEnviarAudio(propia)).toBe(true);
    expect(puedeEnviarAudio(grupo)).toBe(true);
    expect(puedeEnviarAudio({ ...grupo, enSesion: false })).toBe(false);
    expect(puedeEnviarAudio(ajena)).toBe(false);
  });
});

describe("despachador con transporte inyectado", () => {
  const pedir: MsgOidoPedir = {
    t: "oido.pedir", id: "p1",
    audio: { i: 0, total: 1, datosB64: "AA==", sha256: "a".repeat(64) },
  };
  it("bloquea audio a una neurona ajena, pero deja pasar el texto", () => {
    const t = transporte();
    const deps = { transporte: t, enVuelo: new Map<string, string>() };
    expect(despacharVozMalla(pedir, ajena, deps)).toBe(false);
    expect(t.enviados).toHaveLength(0);
    const texto: VozMallaMsg = { t: "oido.texto", id: "p1", texto: "hola", tipo: "final" };
    expect(despacharVozMalla(texto, ajena, deps)).toBe(true);
    expect(t.enviados).toHaveLength(1);
  });
  it("envía audio a propia y respeta una petición por par", () => {
    const t = transporte();
    const deps = { transporte: t, enVuelo: new Map<string, string>() };
    expect(despacharVozMalla(pedir, propia, deps)).toBe(true);
    expect(despacharVozMalla({ ...pedir, id: "p2" }, propia, deps)).toBe(false);
    expect(despacharVozMalla({ t: "oido.cancelar", id: "p1" }, propia, deps)).toBe(true);
    expect(despacharVozMalla({ ...pedir, id: "p2" }, propia, deps)).toBe(true);
    expect(t.enviados).toHaveLength(3);
  });
  it("no lanza si el transporte falla", () => {
    const roto = { enviar: () => { throw new Error("cerrado"); } };
    expect(despacharVozMalla(pedir, propia, { transporte: roto, enVuelo: new Map() })).toBe(false);
  });
});
