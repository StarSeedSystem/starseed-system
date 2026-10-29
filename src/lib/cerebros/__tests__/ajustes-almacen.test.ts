/** Pruebas de la lista de destinos y sus explicaciones (CB1013S, contrato §8). */
import { describe, expect, it } from "vitest";
import { defaultMemoryDestinations, type MemoryDestinationsConfig } from "@/lib/brains/memory-destinations";
import { destinosMedios, explicarDestinos, MOTORES_REALES } from "@/lib/cerebros/ajustes-almacen";

function conExternos(): MemoryDestinationsConfig {
  return {
    ...defaultMemoryDestinations(),
    external: [{ id: "srv-9", url: "https://casa.example", label: "Cerebro-almacén de casa" }],
  };
}

describe("destinosMedios", () => {
  it("de los valores por defecto salen local encendido, StarSeed encendido y Syncthing apagado", () => {
    const d = destinosMedios(defaultMemoryDestinations());
    expect(d.map((x) => ({ id: x.id, activo: x.activo }))).toEqual([
      { id: "local", activo: true },
      { id: "starseed", activo: true },
      { id: "p2p", activo: false },
    ]);
  });

  it("cada destino externo entra con su etiqueta y como cerebro-almacén", () => {
    const d = destinosMedios(conExternos());
    expect(d.filter((x) => x.origen === "externo")).toEqual([
      { id: "srv-9", etiqueta: "Cerebro-almacén de casa", activo: true, origen: "externo" },
    ]);
  });

  it("respetan StarSeed apagado y la etiqueta propia de Syncthing", () => {
    const d = destinosMedios({ ...conExternos(), starseed: { enabled: false }, p2p: { enabled: true, label: "PC de casa" } });
    const pstarseed = d.find((x) => x.id === "starseed");
    const pp2p = d.find((x) => x.id === "p2p");
    expect(pstarseed?.activo).toBe(false);
    expect(pp2p?.activo).toBe(true);
    expect(pp2p?.etiqueta).toBe("Syncthing · PC de casa");
    expect(pp2p?.origen).toBe("p2p");
  });
});

describe("explicarDestinos", () => {
  it("sin elección, un dato privado va a los destinos encendidos y el apagado queda explicado", () => {
    const lineas = explicarDestinos(destinosMedios(conExternos()), "privado", []);
    const pp2p = lineas.find((l) => l.id === "p2p");
    const pst = lineas.find((l) => l.id === "starseed");
    expect(pp2p?.va).toBe(false);
    expect(pp2p?.texto).toContain("No está encendido");
    expect(pst?.va).toBe(true);
    expect(pst?.texto).toContain("brain_memory_files");
    expect(lineas.find((l) => l.id === "srv-9")?.va).toBe(true);
  });

  it("un destino sin motor real de guardado se descarta con su motivo (sin inventar)", () => {
    const lineas = explicarDestinos(
      destinosMedios(defaultMemoryDestinations()),
      "privado",
      [],
      MOTORES_REALES.filter((m) => m !== "starseed"),
    );
    const pst = lineas.find((l) => l.id === "starseed");
    expect(pst?.va).toBe(false);
    expect(pst?.texto).toContain("sin motor");
  });

  it("con una elección, solo van los elegidos más el espejo local", () => {
    const lineas = explicarDestinos(destinosMedios(conExternos()), "privado", ["srv-9"]);
    const porId = new Map(lineas.map((l) => [l.id, l]));
    expect(porId.get("srv-9")?.va).toBe(true);
    expect(porId.get("local")?.va).toBe(true);
    expect(porId.get("starseed")?.va).toBe(false);
    expect(porId.get("starseed")?.texto).toContain("elegidos");
  });

  it("«auto» en la elección equivale a los destinos encendidos del cerebro", () => {
    const conAuto = explicarDestinos(destinosMedios(conExternos()), "privado", ["auto"]);
    const sinElegir = explicarDestinos(destinosMedios(conExternos()), "privado", []);
    expect(conAuto.map((l) => `${l.id}:${l.va}`)).toEqual(sinElegir.map((l) => `${l.id}:${l.va}`));
  });

  it("un dato público marca los destinos como válidos y el local nunca se quita", () => {
    const lineas = explicarDestinos(destinosMedios(defaultMemoryDestinations()), "publico", ["starseed"]);
    const local = lineas.find((l) => l.id === "local");
    expect(local?.va).toBe(true);
    expect(local?.texto).toContain("nunca se apaga");
  });
});
