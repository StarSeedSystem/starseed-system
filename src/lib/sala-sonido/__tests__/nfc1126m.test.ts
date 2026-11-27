/**
 * NFC1126M · Integración con Spotify Connect.
 * Contrato: architecture/nfc-neuronas.md §11.
 * Pruebas de funciones puras: identificación de tipo de aparato,
 * extracción de cola y validación de URI.
 */
import { describe, it, expect } from "vitest";
import {
  calcularTiempoRestante,
  extraerColaDeRespuesta,
  identificarTipoAparato,
  validarUriSpotify,
  type EstadoSpotify,
  type PistaSpotify,
} from "../spotify";

describe("identificarTipoAparato", () => {
  it("identifica iPhone y iPad como phone", () => {
    expect(identificarTipoAparato("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)")).toBe("phone");
    expect(identificarTipoAparato("Mozilla/5.0 (iPad; CPU OS 17_0)")).toBe("phone");
  });

  it("identifica Android como phone", () => {
    expect(identificarTipoAparato("Mozilla/5.0 (Linux; Android 14)")).toBe("phone");
  });

  it("identifica Windows como computer", () => {
    expect(identificarTipoAparato("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")).toBe("computer");
  });

  it("identifica Macintosh como computer", () => {
    expect(identificarTipoAparato("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)")).toBe("computer");
  });

  it("identifica Linux como computer", () => {
    expect(identificarTipoAparato("Mozilla/5.0 (X11; Linux x86_64)")).toBe("computer");
  });

  it("identifica Car como car", () => {
    expect(identificarTipoAparato("Car/10.0")).toBe("car");
  });

  it("devuelve unknown para tipos no reconocidos", () => {
    expect(identificarTipoAparato("SomeRandomUserAgent/1.0")).toBe("unknown");
  });
});

describe("validarUriSpotify", () => {
  it("acepta URIs de track válidas", () => {
    expect(validarUriSpotify("spotify:track:11dFgVXZFVCL4uQ4t4GHgM")).toBe(true);
  });

  it("acepta URIs de album válidas", () => {
    expect(validarUriSpotify("spotify:album:0Jn9rG7t9lZ5qJ4F6wE5qL")).toBe(true);
  });

  it("acepta URIs de artist válidas", () => {
    expect(validarUriSpotify("spotify:artist:06HL4z0CvFAxyc27GXpf02")).toBe(true);
  });

  it("acepta URIs de playlist válidas", () => {
    expect(validarUriSpotify("spotify:playlist:37i9dQZF1DXcBWIGoYBM5M")).toBe(true);
  });

  it("rechaza URIs con formato incorrecto", () => {
    expect(validarUriSpotify("spotify://track:123")).toBe(false);
    expect(validarUriSpotify("https://open.spotify.com/track/123")).toBe(false);
    expect(validarUriSpotify("spotify:track")).toBe(false);
    expect(validarUriSpotify("")).toBe(false);
  });
});

describe("extraerColaDeRespuesta", () => {
  it("extrae pistas de una respuesta de cola con items", () => {
    const respuesta = {
      items: [
        {
          track: {
            id: "track1",
            name: "Song One",
            artists: [{ name: "Artist One" }, { name: "Artist Two" }],
            album: { name: "Album One" },
            duration_ms: 210000,
          },
        },
        {
          track: {
            id: "track2",
            name: "Song Two",
            artists: [{ name: "Artist Three" }],
            album: { name: "Album Two" },
            duration_ms: 180000,
          },
        },
      ],
    };
    const cola = extraerColaDeRespuesta(respuesta);
    expect(cola).toHaveLength(2);
    expect(cola[0]).toMatchObject({
      id: "track1",
      nombre: "Song One",
      artista: "Artist One, Artist Two",
      album: "Album One",
      duracionMs: 210000,
    });
    expect(cola[1].artista).toBe("Artist Three");
  });

  it("maneja items sin track", () => {
    const respuesta = { items: [{ uri: "spotify:track:track3" }] };
    const cola = extraerColaDeRespuesta(respuesta);
    expect(cola).toHaveLength(1);
    expect(cola[0].id).toBe("spotify:track:track3");
    expect(cola[0].artista).toBe("");
  });

  it("devuelve lista vacía si no hay items", () => {
    expect(extraerColaDeRespuesta({})).toEqual([]);
    expect(extraerColaDeRespuesta({ items: null })).toEqual([]);
  });
});

describe("calcularTiempoRestante", () => {
  it("calcula el tiempo hasta que la cola esté vacía (suma de duraciones restantes)", () => {
    const estados: EstadoSpotify[] = [
      {
        reproduciendo: true,
        progresoMs: 5_000,
        duracionMs: 210_000,
        pistaActual: "track1",
        artista: "Artist One",
        album: "Album One",
        enCola: [
          { id: "track2", nombre: "Song Two", artista: "Artist Two", album: "Album Two", duracionMs: 180_000 },
        ],
      },
    ];
    expect(calcularTiempoRestante(estados)).toBe(180_000);
  });

  it("devuelve 0 para lista vacía", () => {
    expect(calcularTiempoRestante([])).toBe(0);
  });

  it("cuenta solo pistas en cola, no la actual", () => {
    const estados: EstadoSpotify[] = [
      {
        reproduciendo: true,
        progresoMs: 5_000,
        duracionMs: 210_000,
        pistaActual: "track1",
        artista: "Artist One",
        album: "Album One",
        enCola: [],
      },
    ];
    expect(calcularTiempoRestante(estados)).toBe(0);
  });
});