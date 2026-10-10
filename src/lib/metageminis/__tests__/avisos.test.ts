import { describe, expect, it } from "vitest";
import { avisosBorrador, diceQueEsIA, nivelMasAlto } from "../avisos";

const HOY = new Date("2026-10-10T12:00:00Z");
const base = { asunto: null, canal: "api_oficial" as const, cuerpo: "Soy un agente de IA de StarSeed y quiero presentar el proyecto." };

describe("avisos antes de aprobar", () => {
  it("un mensaje limpio a un sitio hecho para agentes no tiene avisos", () => {
    expect(avisosBorrador({ ...base, sitio_id: "abund-ai" }, HOY)).toEqual([]);
  });

  it("detecta si el texto declara que lo escribe una IA", () => {
    expect(diceQueEsIA("Soy un agente de IA de StarSeed")).toBe(true);
    expect(diceQueEsIA("This message was written by an AI agent")).toBe(true);
    expect(diceQueEsIA("Escrito con inteligencia artificial")).toBe(true);
    expect(diceQueEsIA("Hola, somos StarSeed y queremos colaborar")).toBe(false);
  });

  it("avisa si el texto no dice que es una IA, salvo en lo que envía una persona", () => {
    const sinDecirlo = { ...base, cuerpo: "Hola, somos StarSeed.", sitio_id: "abund-ai" };
    expect(avisosBorrador(sinDecirlo, HOY).map((a) => a.texto)).toEqual([expect.stringMatching(/agente de IA/)]);
    expect(avisosBorrador({ ...sinDecirlo, canal: "manual_alex" }, HOY)).toEqual([]);
  });

  it("alerta fuerte si el sitio no acepta texto de IA (NLnet)", () => {
    const a = avisosBorrador({ ...base, canal: "formulario", sitio_id: "nlnet-convocatoria" }, HOY);
    expect(a.some((x) => x.nivel === "alto" && /no acepta texto escrito por IA/.test(x.texto))).toBe(true);
    expect(nivelMasAlto(a)).toBe("alto");
  });

  it("alerta fuerte si las normas prohíben agentes o solo dejan leer", () => {
    expect(avisosBorrador({ ...base, sitio_id: "linkedin" }, HOY).some((x) => x.nivel === "alto" && /prohíben/.test(x.texto))).toBe(true);
    expect(avisosBorrador({ ...base, sitio_id: "hacktoberfest" }, HOY).some((x) => x.nivel === "alto" && /solo lee/.test(x.texto))).toBe(true);
  });

  it("alerta fuerte si el sitio está cerrado o no encaja, y si el plazo venció", () => {
    expect(avisosBorrador({ ...base, sitio_id: "ngi-zero-commons" }, HOY).some((x) => /cerrado/.test(x.texto))).toBe(true);
    expect(avisosBorrador({ ...base, sitio_id: "prototype-fund" }, HOY).some((x) => /no encaja/.test(x.texto))).toBe(true);
    // NLnet vence el 2026-11-03: pasado ese día, aviso de plazo vencido.
    const tarde = new Date("2026-11-04T08:00:00Z");
    expect(avisosBorrador({ ...base, sitio_id: "nlnet-convocatoria" }, tarde).some((x) => /venció el 2026-11-03/.test(x.texto))).toBe(true);
    expect(avisosBorrador({ ...base, sitio_id: "nlnet-convocatoria" }, HOY).some((x) => /venció/.test(x.texto))).toBe(false);
  });

  it("avisa de un sitio fuera del directorio y de normas sin leer", () => {
    expect(avisosBorrador({ ...base, sitio_id: "no-existe" }, HOY).some((x) => /no está en el directorio/.test(x.texto))).toBe(true);
    expect(avisosBorrador({ ...base, sitio_id: "eigenflux" }, HOY).some((x) => x.nivel === "alto" || /normas/.test(x.texto))).toBe(true);
  });

  it("sin sitio concreto solo comprueba la declaración de IA", () => {
    expect(avisosBorrador({ ...base, sitio_id: null }, HOY)).toEqual([]);
  });

  it("nivelMasAlto", () => {
    expect(nivelMasAlto([])).toBeNull();
    expect(nivelMasAlto([{ nivel: "medio", texto: "a" }])).toBe("medio");
    expect(nivelMasAlto([{ nivel: "medio", texto: "a" }, { nivel: "alto", texto: "b" }])).toBe("alto");
  });
});
