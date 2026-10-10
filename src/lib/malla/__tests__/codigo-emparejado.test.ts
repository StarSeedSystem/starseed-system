/**
 * Código de emparejado sin internet: codificar/decodificar (deflate-raw + base64url, sin dependencias).
 */
import { describe, expect, it } from "vitest";
import {
  aBase64Url,
  codificarCodigo,
  contarCandidatos,
  deBase64Url,
  decodificarCodigo,
  extraerCodigo,
  PREFIJO_CODIGO,
} from "@/lib/malla/codigo-emparejado";

const SDP = [
  "v=0",
  "o=- 4611731400430051336 2 IN IP4 127.0.0.1",
  "s=-",
  "t=0 0",
  "a=group:BUNDLE 0",
  "a=extmap-allow-mixed",
  "a=msid-semantic: WMS",
  "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
  "c=IN IP4 0.0.0.0",
  "a=candidate:1467250027 1 udp 2122260223 4a1b2c3d-1111-2222-3333-444455556666.local 54400 typ host generation 0 network-id 1",
  "a=candidate:1467250028 1 udp 2122194687 9f8e7d6c-1111-2222-3333-444455556666.local 54401 typ host generation 0 network-id 2",
  "a=ice-ufrag:abcd",
  "a=ice-pwd:0123456789abcdef01234567",
  "a=ice-options:trickle",
  "a=fingerprint:sha-256 0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9:0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9",
  "a=setup:actpass",
  "a=mid:0",
  "a=sctp-port:5000",
  "a=max-message-size:262144",
  "",
].join("\r\n");

describe("código de emparejado", () => {
  it("ida y vuelta: lo que sale es lo que entró, comprimido y más corto que el JSON", async () => {
    const codigo = await codificarCodigo({ r: "o", s: "ses123", sdp: SDP, n: "Portátil de Alex" });
    expect(codigo.startsWith(`${PREFIJO_CODIGO}z.`)).toBe(true);
    expect(codigo.length).toBeLessThan(JSON.stringify({ sdp: SDP }).length);
    expect(codigo).toMatch(/^SSL1z\.[A-Za-z0-9_-]+$/);
    const r = await decodificarCodigo(codigo);
    expect(r).toEqual({ ok: true, datos: { r: "o", s: "ses123", sdp: SDP, n: "Portátil de Alex" } });
  });

  it("encuentra el código dentro de un texto compartido", async () => {
    const codigo = await codificarCodigo({ r: "a", s: "x1", sdp: SDP });
    const texto = `Aquí tienes mi respuesta:\n${codigo}\n¡gracias!`;
    expect(extraerCodigo(texto)).toBe(codigo);
    const r = await decodificarCodigo(texto);
    expect(r.ok && r.datos.r).toBe("a");
  });

  it("lee también el formato sin comprimir", async () => {
    const json = JSON.stringify({ v: 1, r: "o", s: "abc", sdp: SDP });
    const codigo = `${PREFIJO_CODIGO}u.${aBase64Url(new TextEncoder().encode(json))}`;
    const r = await decodificarCodigo(codigo);
    expect(r.ok && r.datos.sdp).toBe(SDP);
  });

  it("dice por qué no vale: sin código, cortado, versión rara o SDP inválido", async () => {
    expect(await decodificarCodigo("hola")).toEqual({ ok: false, motivo: expect.stringMatching(/ningún código/) });
    const bueno = await codificarCodigo({ r: "o", s: "s", sdp: SDP });
    const cortado = await decodificarCodigo(bueno.slice(0, Math.floor(bueno.length / 2)));
    expect(cortado.ok).toBe(false);
    const raro = `${PREFIJO_CODIGO}u.${aBase64Url(new TextEncoder().encode(JSON.stringify({ v: 9, r: "o", s: "s", sdp: SDP })))}`;
    expect(await decodificarCodigo(raro)).toEqual({ ok: false, motivo: expect.stringMatching(/versión/) });
    const sinSdp = `${PREFIJO_CODIGO}u.${aBase64Url(new TextEncoder().encode(JSON.stringify({ v: 1, r: "o", s: "s", sdp: "hola" })))}`;
    expect(await decodificarCodigo(sinSdp)).toEqual({ ok: false, motivo: expect.stringMatching(/descripción de red/) });
  });

  it("base64url sin relleno ida y vuelta, también con bytes altos", () => {
    const bytes = new Uint8Array([0, 255, 251, 62, 63, 128, 1]);
    const t = aBase64Url(bytes);
    expect(t).not.toMatch(/[+/=]/);
    expect(Array.from(deBase64Url(t))).toEqual(Array.from(bytes));
  });

  it("cuenta los candidatos de red (0 = el aparato no está en ninguna red local)", () => {
    expect(contarCandidatos(SDP)).toBe(2);
    expect(contarCandidatos("v=0\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n")).toBe(0);
  });
});
