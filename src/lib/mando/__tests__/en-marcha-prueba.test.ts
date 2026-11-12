import { describe, expect, it } from "vitest";

import { sanearEnMarcha, vistaEnMarcha, type EnMarcha } from "../en-marcha";
import { leerRegistroCarril } from "../carril-claude";
import { pruebaParaEnviar, sanearPrueba } from "../pruebas-vivas";
import type { VersionPrueba } from "../lanzamientos-pruebas-tipos";

import type { Tipicos } from "../pruebas-vivas-tipos";
const SIN = { macos: { minutos: null, muestras: 0 }, windows: { minutos: null, muestras: 0 }, linux: { minutos: null, muestras: 0 }, android: { minutos: null, muestras: 0 } } as Tipicos;
const AHORA = Date.parse("2026-11-12T02:00:00Z");
const pl = (plataforma: string, estado: string, extra: Record<string, unknown> = {}) => ({ plataforma, titulo: plataforma, estado, desde: "2026-11-12T01:45:00Z", hasta: null, job: null, url: null, detalle: "", ...extra });
const v = (n: number, plataformas: unknown[]) =>
    ({ numero: n, version: `0.5.1-prueba.${n}`, etiqueta: `prueba.${n}`, sha: "b".repeat(40), fecha: "2026-11-12T01:40:00Z", plataformas, publicadaEnTodas: false, comprobaciones: [], desconocido: [] }) as unknown as VersionPrueba;
const base = (): EnMarcha => ({ generadoMs: AHORA, carril: leerRegistroCarril({ latido: new Date(AHORA).toISOString(), tareas: [] }), puerta: null });

describe("«Qué corre ahora» con una prueba", () => {
  it("una prueba compilando cuenta como algo que corre", () => {
    const p = pruebaParaEnviar([v(40, [pl("macos", "compilando", { pasos: { hechos: 3, total: 10, actual: "Compilar" } })])], { ...SIN, macos: { minutos: 20, muestras: 3 } }, AHORA);
    expect(p?.fase).toBe("compilando");
    const vista = vistaEnMarcha({ ...base(), pruebas: p }, AHORA);
    expect(vista.algoCorre).toBe(true);
    expect(vista.prueba).not.toBeNull();
  });
  it("una prueba fallida se enseña pero no es un proceso vivo", () => {
    const p = pruebaParaEnviar([v(40, [pl("linux", "fallo", { job: "os · ubuntu-24.04" })])], SIN, AHORA);
    expect(p?.fase).toBe("fallo");
    expect(p?.falloEn[0]).toContain("os · ubuntu-24.04");
    const vista = vistaEnMarcha({ ...base(), pruebas: p }, AHORA);
    expect(vista.algoCorre).toBe(false);
    expect(vista.prueba).not.toBeNull();
  });
  it("una prueba publicada del todo no sale", () => {
    expect(pruebaParaEnviar([{ ...v(39, [pl("macos", "publicada")]), publicadaEnTodas: true } as VersionPrueba], SIN, AHORA)).toBeNull();
  });
  it("sin tipico no inventa minutos", () => {
    const p = pruebaParaEnviar([v(40, [pl("macos", "compilando")])], SIN, AHORA);
    expect(p?.plataformas[0].tipicoMin).toBeNull();
  });
  it("lo que llega de otra neurona pasa por la lista blanca", () => {
    const sucio = { numero: 40, fase: "compilando", esperaA: null, plataformas: [{ id: "macos", titulo: "macOS", estado: "compilando", token: "SECRETO", extra: 1 }], falloEn: ["x"], generadoMs: AHORA, prompt: "SECRETO" };
    const limpio = sanearPrueba(sucio);
    expect(JSON.stringify(limpio)).not.toContain("SECRETO");
    expect(sanearPrueba({ numero: 40, fase: "inventada" })).toBeNull();
    expect(sanearPrueba("hola")).toBeNull();
    const en = sanearEnMarcha({ ...base(), pruebas: sucio });
    expect(JSON.stringify(en)).not.toContain("SECRETO");
  });
});
