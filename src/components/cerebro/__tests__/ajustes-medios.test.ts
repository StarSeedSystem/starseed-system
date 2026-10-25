/** Pruebas de las purezas de los ajustes de medios (CB1013S, contrato §8). */

import { describe, expect, it } from "vitest";
import {
  destinosDeMemorias,
  idsElegidosDestinos,
  lineasDestino,
  opcionesDeMedio,
  parcheDestinos,
} from "@/lib/cerebros/medios-puras";

describe("opcionesDeMedio", () => {
  it("«Automático» va primero y no se repiten ids", () => {
    const opciones = opcionesDeMedio(
      [{ id: "srv1", name: "Mi Hostinger" }, { id: "srv0", name: "Local" }, { id: "srv1", name: "Duplicado" }],
      [{ id: "n1", name: "Mac de Alex" }, { id: "srv0", name: "Colisión" }],
    );
    expect(opciones.map((o) => o.id)).toEqual(["auto", "srv1", "srv0", "n1"]);
    expect(opciones[0]).toEqual({ id: "auto", texto: "Automático", grupo: "auto" });
    expect(opciones.find((o) => o.id === "srv0")?.texto).toBe("Local");
    expect(opciones.find((o) => o.id === "srv1")?.grupo).toBe("servidor");
    expect(opciones.find((o) => o.id === "n1")?.grupo).toBe("neurona");
  });

  it("sin nombre usa el id y no lanza con listas vacías", () => {
    const opciones = opcionesDeMedio([{ id: "srv9", name: "   " }], []);
    expect(opciones.map((o) => o.id)).toEqual(["auto", "srv9"]);
    expect(opciones[1].texto).toBe("srv9");
    expect(opcionesDeMedio([], [])).toHaveLength(1);
  });
});

describe("destinosDeMemorias", () => {
  it(" marca local fijo, externos con su etiqueta y p2p apagado, con explicación honesta", () => {
    const destinos = destinosDeMemorias({
      starseed: { enabled: false },
      external: [{ id: "ext1", url: "https://x.example", label: "Mi servidor" }],
      p2p: { enabled: true, label: "PC de casa" },
    });
    expect(destinos.map((d) => d.id)).toEqual(["local", "starseed", "ext1", "p2p"]);
    const porId = new Map(destinos.map((d) => [d.id, d]));
    expect(porId.get("local")).toMatchObject({ activo: true, fijo: true, explicacion: "Los datos se quedan en este aparato (espejo local)." });
    expect(porId.get("starseed")?.explicacion).toBe("StarSeed: apagado; no se envían datos a este destino.");
    expect(porId.get("ext1")).toMatchObject({ texto: "Mi servidor", fijo: true, explicacion: "Los datos se envían por internet a «Mi servidor» (bundle de memorias)." });
    expect(porId.get("p2p")).toMatchObject({ texto: "Syncthing · PC de casa", explicacion: "Los datos se espejan entre tus aparatos con Syncthing." });
  });

  it("sin configuración: StarSeed encendido por defecto y Syncthing sin etiqueta", () => {
    const destinos = destinosDeMemorias(undefined);
    const porId = new Map(destinos.map((d) => [d.id, d]));
    expect(porId.get("starseed")?.activo).toBe(true);
    expect(porId.get("starseed")?.explicacion).toContain("StarSeed store de tu cuenta");
    expect(porId.get("p2p")?.texto).toBe("Syncthing (P2P)");
    expect(porId.get("p2p")?.explicacion).toContain("apagado");
  });
});

describe("lineasDestino", () => {
  it("con destinosDe(): dato privado no va a un destino público", () => {
    const base = [{ id: "x", texto: "Tablero público", activo: true, fijo: false, destino: { id: "x", tipo: "servidor" as const, motor: "starseed", publico: true } }];
    expect(lineasDestino(base, "privado")[0].explicacion).toBe("Los datos no van aquí: destino público no permitido para dato privado/interno.");
  });
  it("con destinosDe(): destino admisible explica adónde va", () => {
    const base = [{ id: "starseed", texto: "StarSeed", activo: true, fijo: false, destino: { id: "starseed", tipo: "servidor" as const, motor: "starseed", publico: false } }];
    expect(lineasDestino(base, "privado")[0].explicacion).toBe("Los datos van a la StarSeed store de tu cuenta (brain_memory_files, solo para ti).");
  });
});

describe("idsElegidosDestinos", () => {
  it("local siempre; starseed, externos y p2p según estén encendidos", () => {
    expect(idsElegidosDestinos(undefined)).toEqual(["local", "starseed"]);
    expect(idsElegidosDestinos({ starseed: { enabled: false }, external: [{ id: "ext1", url: "u", label: "E" }], p2p: { enabled: true } })).toEqual(["local", "ext1", "p2p"]);
  });
});

describe("parcheDestinos", () => {
  it("solo toca starseed y p2p; conserva el folder de Syncthing", () => {
    const d = {
      local: { enabled: true as const },
      starseed: { enabled: true },
      external: [{ id: "ext1", url: "u", label: "E" }],
      p2p: { enabled: true, folderId: "f1", label: "PC" },
    };
    expect(parcheDestinos(d, ["local", "p2p"])).toEqual({
      starseed: { enabled: false },
      p2p: { enabled: true, folderId: "f1", label: "PC" },
    });
    expect(parcheDestinos(d, ["local", "starseed", "ext1"]).p2p).toEqual({ enabled: false, folderId: "f1", label: "PC" });
  });
});
