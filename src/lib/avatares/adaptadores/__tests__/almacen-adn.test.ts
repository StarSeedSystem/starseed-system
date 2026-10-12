import { describe, expect, it } from "vitest";
import { saveAdnToLibrary, loadAdnEntry, parseAdnEntry, sanearAdn, removeAdnFromLibrary } from "@/lib/avatares/adaptadores/almacen-adn";
import { AdnAvatar } from "@/lib/avatares/adn/adn";

// Un ADN de prueba sencillo
const adnDePrueba: AdnAvatar = {
  v: 1,
  id: "test-adn-1",
  nombre: "Avatar de Prueba",
  dueno: { tipo: "perfil", id: "perfil-1" },
  base: { tipo: "orbe" },
  esqueleto: { tipo: "ninguno", articulaciones: 0 },
  morfologia: {},
  materiales: {},
  piezas: [],
  expresionBase: {},
  aura: { tono: 200, intensidad: 0.6, ligadaEmocion: true },
  movimiento: { energia: 0.5, amplitud: 0.5, ritmo: 0.5, postura: 0.5 },
  visibilidad: "privado",
  procedencia: [],
  rev: 0,
};

describe("Almacén de ADN en la Biblioteca", () => {
  it("guarda y carga un ADN en la Biblioteca", async () => {
    await saveAdnToLibrary(adnDePrueba, "privado");
    const entry = await loadAdnEntry("biblioteca:test-adn-1");
    expect(entry).not.toBeNull();
    expect(entry!.id).toBe("test-adn-1");
    expect(entry!.kind).toBe("avatar-adn");
    expect(entry!.visibilidad).toBe("privado");
    await removeAdnFromLibrary("biblioteca:test-adn-1");
  });

  it("parsea el raw JSON a AdnAvatar", async () => {
    await saveAdnToLibrary(adnDePrueba, "privado");
    const entry = await loadAdnEntry("biblioteca:test-adn-1");
    expect(entry).not.toBeNull();
    const parsed = await parseAdnEntry(entry!);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe("test-adn-1");
    expect(parsed!.nombre).toBe("Avatar de Prueba");
    await removeAdnFromLibrary("biblioteca:test-adn-1");
  });

  it("valida el ADN con sanearAdn", () => {
    const cleaned = sanearAdn(adnDePrueba);
    expect(cleaned).not.toBeNull();
    expect(cleaned!.id).toBe("test-adn-1");
    expect(cleaned!.v).toBe(1);
  });

  it("rejaza el ADN inválido", () => {
    const invalid = { id: "", v: 2 } as unknown;
    const cleaned = sanearAdn(invalid);
    expect(cleaned).toBeNull();
  });

  it("devuelve null al cargar un ref que no existe", async () => {
    const entry = await loadAdnEntry("biblioteca:inexistente");
    expect(entry).toBeNull();
  });

  it("elimina un ADN de la Biblioteca", async () => {
    await saveAdnToLibrary(adnDePrueba, "privado");
    await removeAdnFromLibrary("biblioteca:test-adn-1");
    const entry = await loadAdnEntry("biblioteca:test-adn-1");
    expect(entry).toBeNull();
  });
});