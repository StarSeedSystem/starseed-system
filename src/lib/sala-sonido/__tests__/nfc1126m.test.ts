/**
 * NFC1126M · Spotify en la sala de sonido — contrato: architecture/nfc-neuronas.md §11.
 * Todo PURO: respuestas de la API de Spotify simuladas, sin red ni disco.
 */
import { describe, it, expect } from "vitest";
import {
  construirUrlAutorizacion,
  enlaceDePista,
  esPremium,
  fuenteDesdePista,
  interpretarCola,
  interpretarDispositivos,
  planControl,
} from "../spotify";

describe("autorización (OAuth propio, PKCE)", () => {
  it("pide solo los permisos necesarios y no lleva secreto", () => {
    const url = new URL(
      construirUrlAutorizacion({
        clientId: "cli",
        redirectUri: "https://x/cb",
        estado: "e1",
        desafio: "d1",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).toBe("d1");
    expect(url.searchParams.get("client_id")).toBe("cli");
    expect(url.searchParams.get("scope")?.split(" ")).toEqual(
      expect.arrayContaining(["user-read-playback-state", "user-modify-playback-state"]),
    );
    expect(url.searchParams.has("client_secret")).toBe(false);
  });
});

describe("Premium", () => {
  it("solo «premium» controla", () => {
    expect(esPremium("premium")).toBe(true);
    expect(esPremium("free")).toBe(false);
    expect(esPremium("open")).toBe(false);
    expect(esPremium(undefined)).toBe(false);
  });
});

describe("aparatos de Spotify Connect", () => {
  it("interpreta la lista y descarta los restringidos", () => {
    const lista = interpretarDispositivos({
      devices: [
        { id: "a", name: "Salón", type: "Speaker", is_active: true, volume_percent: 40, is_restricted: false },
        { id: "b", name: "Coche", type: "Automobile", is_active: false, volume_percent: null, is_restricted: true },
        { id: null, name: "Roto", type: "Computer", is_active: false },
      ],
    });
    expect(lista).toEqual([
      { id: "a", nombre: "Salón", tipo: "Speaker", activo: true, volumen: 40 },
    ]);
  });
  it("tolera basura", () => {
    expect(interpretarDispositivos(null)).toEqual([]);
    expect(interpretarDispositivos({ devices: "x" })).toEqual([]);
  });
});

describe("cola", () => {
  it("separa lo que suena y lo que viene", () => {
    const cola = interpretarCola({
      currently_playing: { uri: "spotify:track:1", name: "Uno", duration_ms: 1000, artists: [{ name: "A" }] },
      queue: [{ uri: "spotify:track:2", name: "Dos", duration_ms: 2000, artists: [{ name: "B" }, { name: "C" }] }, { name: "sin uri" }],
    });
    expect(cola.sonando?.nombre).toBe("Uno");
    expect(cola.siguientes).toHaveLength(1);
    expect(cola.siguientes[0]).toMatchObject({ uri: "spotify:track:2", artistas: "B, C", duracionMs: 2000 });
  });
});

describe("pista → sala de sonido", () => {
  const pista = { uri: "spotify:track:abc", nombre: "Dos", artistas: "B", duracionMs: 2000 };
  it("entra como fuente «app» solo con sus datos, sin audio", () => {
    expect(fuenteDesdePista(pista, "neurona-1")).toEqual({
      id: "spotify:track:abc",
      tipo: "app",
      nombre: "Dos · B",
      duracionMs: 2000,
      aportadaPor: "neurona-1",
    });
  });
  it("da el enlace web", () => {
    expect(enlaceDePista(pista.uri)).toBe("https://open.spotify.com/track/abc");
  });
});

describe("control de reproducción", () => {
  it("Premium: arma la petición exacta", () => {
    expect(planControl("premium", { tipo: "pausar" })).toEqual({
      permitido: true,
      peticion: { metodo: "PUT", ruta: "/me/player/pause" },
    });
    expect(planControl("premium", { tipo: "volumen", porcentaje: 130 })).toMatchObject({
      permitido: true,
      peticion: { ruta: "/me/player/volume", consulta: { volume_percent: "100" } },
    });
    expect(planControl("premium", { tipo: "aparato", id: "a" })).toMatchObject({
      peticion: { ruta: "/me/player", cuerpo: { device_ids: ["a"] } },
    });
    expect(planControl("premium", { tipo: "encolar", uri: "spotify:track:2" })).toMatchObject({
      peticion: { metodo: "POST", ruta: "/me/player/queue", consulta: { uri: "spotify:track:2" } },
    });
  });
  it("sin Premium: lo dice y ofrece solo enlaces", () => {
    const plan = planControl("free", { tipo: "reanudar" });
    expect(plan.permitido).toBe(false);
    expect(plan.peticion).toBeUndefined();
    expect(plan.motivo).toMatch(/Premium/);
    expect(plan.soloEnlaces).toBe(true);
  });
  it("rechaza una URI que no es de pista", () => {
    expect(planControl("premium", { tipo: "encolar", uri: "http://malo" }).permitido).toBe(false);
  });
});
