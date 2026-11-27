// NEU1126E (parte 2): cuándo sale la ventana de neurona en toda la app.
import { describe, expect, it } from "vitest";
import { decidirVentanaNeurona } from "./layout-client-neurona";
import { revisarIdentidadCompartida } from "@/lib/neurons/revision-identidad";

const ahora = 1_750_000_000_000;

// Mismo formato que `capabilities.aparatos` (ids de 6+ caracteres, `n` = nombre del aparato).
function capabilities(aparatos: Record<string, { n?: string; equipo?: string; so?: string; ts: number }>) {
  return { aparatos };
}

const revisar = (cap: unknown, yoId: string) =>
  revisarIdentidadCompartida({ idNeurona: "e0b9faf2", nombreNeurona: "e0b9faf2", capabilities: cap, yoId, ahora });

describe("decidirVentanaNeurona", () => {
  const dosAparatos = revisar(
    capabilities({
      apar_a: { n: "Maggaboard", equipo: "SM-X205", so: "android", ts: ahora - 200_000 },
      apar_b: { n: "Maggadroid", equipo: "SM-X710", so: "android", ts: ahora - 100_000 },
    }),
    "apar_b",
  );

  it("dos aparatos vivos con equipo distinto → ventana «comparte neurona»", () => {
    expect(dosAparatos).not.toBeNull();
    expect(decidirVentanaNeurona({ revision: dosAparatos, revisionYaVista: false, aparatoNuevo: false, cerradaEnSesion: false })).toBe(
      "compartida",
    );
  });

  it("tras «Más tarde» o «Seguir en la misma» no vuelve a salir en esta versión", () => {
    expect(decidirVentanaNeurona({ revision: dosAparatos, revisionYaVista: true, aparatoNuevo: false, cerradaEnSesion: false })).toBeNull();
  });

  it("un solo aparato vivo → sin ventana", () => {
    const uno = revisar(capabilities({ apar_a: { n: "Maggabook", equipo: "Mac", so: "macos", ts: ahora } }), "apar_a");
    expect(uno).toBeNull();
    expect(decidirVentanaNeurona({ revision: uno, revisionYaVista: false, aparatoNuevo: false, cerradaEnSesion: false })).toBeNull();
  });

  it("huella nativa distinta → ventana «aparato nuevo»", () => {
    expect(decidirVentanaNeurona({ revision: null, revisionYaVista: false, aparatoNuevo: true, cerradaEnSesion: false })).toBe("nuevo");
  });

  it("«comparte neurona» tiene preferencia sobre «aparato nuevo»", () => {
    expect(decidirVentanaNeurona({ revision: dosAparatos, revisionYaVista: false, aparatoNuevo: true, cerradaEnSesion: false })).toBe(
      "compartida",
    );
  });

  it("cerrada con la X en esta sesión → no se repite hasta el siguiente arranque", () => {
    expect(decidirVentanaNeurona({ revision: dosAparatos, revisionYaVista: false, aparatoNuevo: true, cerradaEnSesion: true })).toBeNull();
  });
});
