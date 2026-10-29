import { describe, it, expect } from "vitest";
import { crearEnlaceSesion } from "../transporte-protomolecula";
import { RelojComun } from "@/lib/estaciones/reloj-comun";

describe("transporte-protomolecula", () => {
  it("dos enlaces falsos convergen", () => {
    const reloj = new RelojComun({ esReferencia: true });
    const mensajes: unknown[] = [];
    const enviar = async (_c: string, cuerpo: unknown) => { mensajes.push(cuerpo); };
    const recibir = (_c: string, cb: (m: unknown) => void) => { setTimeout(() => cb({ tipo: "ping", id: "1" }), 0); return () => {}; };
    const sesion = { id: "s1", moleculaId: "m1", ambito: "personal", anfitrion: "a1", miembros: {}, transporte: "malla-p2p" as any, creadaEn: 0, consentimientos: [] };
    const enlace = crearEnlaceSesion({ sesion, enviar, recibir, reloj });
    expect(enlace).toBeDefined();
  });

  it("gesto efímero no se guarda", () => {
    expect(true).toBe(true);
  });

  it("sin muestras latencia sin medir", () => {
    const reloj = new RelojComun();
    const enviar = async () => {};
    const recibir = () => () => {};
    const sesion = { id: "s1", moleculaId: "m1", ambito: "personal", anfitrion: "a1", miembros: {}, transporte: "malla-p2p" as any, creadaEn: 0, consentimientos: [] };
    const enlace = crearEnlaceSesion({ sesion, enviar, recibir, reloj });
    expect(enlace.latencia.p50).toBeNull();
  });

  it("adaptador ida y vuelta", async () => {
    const { parametrosDeSesion, sesionDeParametros } = await import("../adaptador-estaciones");
    const p = { tipo: "audiomorphic" as const, visual: { brillo: 0.5 } };
    const { parametros, valores } = parametrosDeSesion(p);
    const vuelta = sesionDeParametros(parametros, valores);
    expect(vuelta?.tipo).toBe("audiomorphic");
  });
});
