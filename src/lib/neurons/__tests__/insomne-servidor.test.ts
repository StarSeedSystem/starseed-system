/**
 * INS1027B · neurona insomne: lectura de la sesión de Insomnia en macOS.
 * Contrato: `architecture/neurona-insomne.md` §3. Se usan carpetas temporales
 * reales (sin `vi.mock` de `node:*`) y nunca se importa la ruta de Next.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { carpetaInsomniaPorDefecto, leerEstadoInsomne } from "../insomne-servidor";

const AHORA = Date.parse("2026-10-27T12:00:00.000Z");

let carpeta = "";

function sembrar(nombre: string, datos: unknown): void {
  writeFileSync(join(carpeta, nombre), typeof datos === "string" ? datos : JSON.stringify(datos));
}

beforeEach(() => {
  carpeta = mkdtempSync(join(tmpdir(), "insomne-servidor-"));
});

afterEach(() => {
  rmSync(carpeta, { recursive: true, force: true });
});

describe("carpetaInsomniaPorDefecto", () => {
  it("cuelga de Library/Application Support del home recibido", () => {
    expect(carpetaInsomniaPorDefecto("/Users/prueba")).toBe("/Users/prueba/Library/Application Support/Insomnia");
  });
});

describe("leerEstadoInsomne · fuera de macOS", () => {
  it("Linux y Windows dicen «sin proveedor activo», aunque haya archivos", () => {
    sembrar("session.json", { endsAt: "2026-10-27T13:00:00Z" });
    for (const plataforma of ["linux", "win32", "android"]) {
      const estado = leerEstadoInsomne({ plataforma, carpeta, ahora: AHORA });
      expect(estado).toMatchObject({ activo: false, hasta: null, proveedor: "no" });
      expect(estado.motivo).toContain("sin proveedor activo");
    }
  });
});

describe("leerEstadoInsomne · macOS", () => {
  it("sin archivos, Insomnia no está instalada o no tiene sesión", () => {
    const estado = leerEstadoInsomne({ plataforma: "darwin", carpeta, ahora: AHORA });
    expect(estado).toMatchObject({ activo: false, hasta: null, proveedor: "no" });
    expect(estado.motivo).toContain("no está instalada");
  });

  it("una sesión vigente sale activa con su hora de fin", () => {
    sembrar("session.json", { startedAt: "2026-10-27T11:00:00Z", endsAt: "2026-10-27T13:00:00Z" });
    const estado = leerEstadoInsomne({ plataforma: "darwin", carpeta, ahora: AHORA });
    expect(estado).toMatchObject({
      activo: true, hasta: "2026-10-27T13:00:00Z", proveedor: "insomnia",
    });
  });

  it("una sesión vencida no se finge activa", () => {
    sembrar("session.json", { endsAt: "2026-10-27T11:00:00Z" });
    const estado = leerEstadoInsomne({ plataforma: "darwin", carpeta, ahora: AHORA });
    expect(estado).toMatchObject({ activo: false, hasta: "2026-10-27T11:00:00Z", proveedor: "insomnia" });
    expect(estado.motivo).toContain("vencida");
  });

  it("una prórroga posterior al fin mantiene la sesión activa", () => {
    sembrar("session.json", {
      endsAt: "2026-10-27T11:00:00Z",
      extensions: ["2026-10-27T14:00:00Z"],
    });
    const estado = leerEstadoInsomne({ plataforma: "darwin", carpeta, ahora: AHORA });
    expect(estado).toMatchObject({ activo: true, hasta: "2026-10-27T14:00:00Z" });
  });

  it("state.json aporta batería, corriente y calor, y session.json manda al solaparse", () => {
    sembrar("state.json", { bateria: 42, cargando: true, calor: "serio", endsAt: "2026-10-27T10:00:00Z" });
    sembrar("session.json", { endsAt: "2026-10-27T13:00:00Z", calor: "normal" });
    const estado = leerEstadoInsomne({ plataforma: "darwin", carpeta, ahora: AHORA });
    expect(estado).toMatchObject({
      activo: true, hasta: "2026-10-27T13:00:00Z", bateria: 42, cargando: true, calor: "normal",
    });
  });

  it("un JSON roto no lanza: se trata como sin sesión legible", () => {
    sembrar("session.json", "{ esto no es json");
    sembrar("state.json", { bateria: 80 });
    const estado = leerEstadoInsomne({ plataforma: "darwin", carpeta, ahora: AHORA });
    expect(estado).toMatchObject({ activo: false, hasta: null, proveedor: "no", bateria: 80 });
    expect(estado.motivo).toContain("sin sesión");
  });

  it("el estado devuelto nunca contiene rutas del disco", () => {
    sembrar("session.json", { endsAt: "2026-10-27T13:00:00Z", ruta: "/Users/alex/privado" });
    const texto = JSON.stringify(leerEstadoInsomne({ plataforma: "darwin", carpeta, ahora: AHORA }));
    expect(texto).not.toContain(carpeta);
    expect(texto).not.toContain("/Users/alex");
    expect(texto).not.toContain("Application Support");
  });
});
