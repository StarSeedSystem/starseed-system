import { describe, it, expect } from "vitest";
import {
  MAX_BYTES_ETIQUETA, TIPO_MIME_NODO, accionesDeEncuentro, configPorDefecto, destinoValido, prepararEtiqueta,
  resumenParaVisitante, validarConfig, type ConfigNodo,
} from "../nodo-oferta";
import { RADIO_ESCENA, RECIENTE_MS, VENTANA_FRESCURA_MS, marcadoresNfc, type EncuentroNfc } from "../../senales/mapa-3d";

const base = (o: Partial<ConfigNodo> = {}): ConfigNodo => ({
  ...configPorDefecto("etiqueta"), nombre: "Casa común",
  ofertas: [{ tipo: "pagina", titulo: "Bienvenida", destino: "/hub" }],
  acciones: ["ubicacion_mapa"], privacidad: { guarda: "alias", retencionDias: 7 }, mapa: "privada", ...o,
});

describe("nodo-oferta · validación", () => {
  it("acepta una config correcta", () => {
    const r = validarConfig(base());
    expect(r.ok).toBe(true);
  });
  it("destinos: acepta rutas, ids y https; rechaza javascript:, http y espacios", () => {
    expect(destinoValido("/hub")).toBe(true);
    expect(destinoValido("https://starseed-os.vercel.app")).toBe(true);
    expect(destinoValido("javascript:alert(1)")).toBe(false);
    expect(destinoValido("http://x.org")).toBe(false);
    expect(destinoValido("a b")).toBe(false);
  });
  it("junta todos los errores", () => {
    const r = validarConfig({ version: 2, tipo: "x", nombre: "", ofertas: [], acciones: ["raro"], privacidad: {}, mapa: "?" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores.length).toBeGreaterThanOrEqual(5);
  });
  it("registro de entrada exige evento y guardar algo", () => {
    const sinEvento = validarConfig(base({ acciones: ["registro_evento"] }));
    expect(sinEvento.ok).toBe(false);
    const nada = validarConfig(base({ acciones: ["registro_evento"], eventoId: "ev1", privacidad: { guarda: "nada", retencionDias: 0 } }));
    expect(nada.ok).toBe(false);
    expect(validarConfig(base({ acciones: ["registro_evento"], eventoId: "ev1" })).ok).toBe(true);
  });
  it("la retención es coherente con lo que se guarda", () => {
    expect(validarConfig(base({ privacidad: { guarda: "nada", retencionDias: 5 } })).ok).toBe(false);
    expect(validarConfig(base({ privacidad: { guarda: "cuenta", retencionDias: 0 } })).ok).toBe(false);
    expect(validarConfig(base({ privacidad: { guarda: "cuenta", retencionDias: 400 } })).ok).toBe(false);
  });
});

describe("nodo-oferta · visitante, encuentro y etiqueta", () => {
  it("el resumen dice qué se guarda y dónde se ve el encuentro", () => {
    const t = resumenParaVisitante(base({ mapa: "publica" })).join(" ");
    expect(t).toContain("Guarda tu alias");
    expect(t).toContain("7 días");
    expect(t).toContain("mapa público");
    expect(resumenParaVisitante(base({ privacidad: { guarda: "nada", retencionDias: 0 }, acciones: [] }))).toEqual(["No guarda nada de ti."]);
  });
  it("traduce lo declarado a acciones de encuentro", () => {
    expect(accionesDeEncuentro(base({ acciones: ["registro_evento", "ubicacion_mapa"], eventoId: "e" })))
      .toEqual(["abrir_oferta_nodo", "registrar_entrada_evento", "registrar_ubicacion"]);
    expect(accionesDeEncuentro(base({ ofertas: [], acciones: [] }))).toEqual([]);
  });
  it("prepara la etiqueta y respeta el tamaño máximo", () => {
    const r = prepararEtiqueta(base());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.etiqueta.tipoMime).toBe(TIPO_MIME_NODO);
      expect(r.etiqueta.bytes).toBeLessThanOrEqual(MAX_BYTES_ETIQUETA);
      expect(JSON.parse(r.etiqueta.carga).nombre).toBe("Casa común");
    }
    const grande = base({ ofertas: Array.from({ length: 8 }, (_, i) => ({ tipo: "enlace" as const, titulo: "t".repeat(70), destino: "https://x.org/" + "a".repeat(200) + i })) });
    expect(prepararEtiqueta(grande).ok).toBe(false);
    expect(prepararEtiqueta(base({ nombre: "" })).ok).toBe(false);
  });
});

describe("mapa-3d · encuentros NFC", () => {
  const AHORA = 10_000_000;
  const e = (o: Partial<EncuentroNfc> = {}): EncuentroNfc => ({ id: "a", nombre: "A", x: 1, z: 2, cuando: AHORA - 1000, ubicacion: "privada", propio: true, ...o });
  it("no dibuja lo que no permitió ubicación ni lo que no tiene sitio", () => {
    expect(marcadoresNfc([e({ ubicacion: "no" }), e({ x: undefined }), e({ z: Number.NaN })], AHORA)).toEqual([]);
  });
  it("los privados ajenos no se ven; los públicos ajenos sí", () => {
    const r = marcadoresNfc([e({ id: "p", propio: false }), e({ id: "q", propio: false, ubicacion: "publica" })], AHORA);
    expect(r.map((m) => m.id)).toEqual(["q"]);
    expect(r[0].publico).toBe(true);
  });
  it("caducan, marcan lo reciente y recortan al disco", () => {
    const r = marcadoresNfc([
      e({ id: "viejo", cuando: AHORA - VENTANA_FRESCURA_MS - 1 }),
      e({ id: "lejos", x: 100, z: 0, cuando: AHORA - RECIENTE_MS - 1 }),
      e({ id: "ya" }),
    ], AHORA);
    expect(r.map((m) => m.id)).toEqual(["lejos", "ya"]);
    expect(r[0].x).toBeCloseTo(RADIO_ESCENA);
    expect(r[0].reciente).toBe(false);
    expect(r[1].reciente).toBe(true);
  });
});
