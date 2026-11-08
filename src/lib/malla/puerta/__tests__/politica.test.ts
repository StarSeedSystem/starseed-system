import { describe, expect, it } from "vitest";
import {
  AJUSTES_PUERTA_POR_DEFECTO as D,
  CLAVE_AJUSTES_PUERTA,
  decidirServir,
  guardarAjustesPuerta,
  hostPermitidoParaOtras,
  interpretarAjustes,
  leerAjustesPuerta,
  type EstadoPropio,
} from "@/lib/malla/puerta/politica";

const bien: EstadoPropio = { conInternet: true, bateria: 0.9, cargando: false, medida: false };
const libre = { bytesHoyGrupo: 0, tunelesGrupo: 0 };

describe("ajustes", () => {
  it("lo roto o ausente vuelve a los valores por defecto", () => {
    expect(interpretarAjustes(null)).toEqual(D);
    expect(interpretarAjustes("{no es json")).toEqual(D);
    const a = interpretarAjustes(JSON.stringify({ misNeuronas: "sí", otrasCuentas: "siempre", puertos: [0, 99999, 443, 8443], topesMias: { bateriaMin: 7, bytesDia: -5 }, recordadas: { x: "permitir", y: "tal" } }));
    expect(a.misNeuronas).toBe(true);
    expect(a.otrasCuentas).toBe("preguntar");
    expect(a.puertos).toEqual([443, 8443]);
    expect(a.topesMias.bateriaMin).toBe(1);
    expect(a.topesMias.bytesDia).toBe(0);
    expect(a.recordadas).toEqual({ x: "permitir" });
  });

  it("se guardan y se leen; sin almacenamiento no lanza", () => {
    const mem = new Map<string, string>();
    const s = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(guardarAjustesPuerta({ ...D, otrasCuentas: "nunca" }, s)).toBe(true);
    expect(mem.has(CLAVE_AJUSTES_PUERTA)).toBe(true);
    expect(leerAjustesPuerta(s).otrasCuentas).toBe("nunca");
    const roto = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); } };
    expect(leerAjustesPuerta(roto)).toEqual(D);
    expect(guardarAjustesPuerta(D, roto)).toBe(false);
  });
});

describe("decidirServir", () => {
  const mia = { id: "n1", mismaCuenta: true };
  const ajena = { id: "n2", mismaCuenta: false };

  it("mi cuenta: permitido por defecto, con los topes de las mías", () => {
    const d = decidirServir(D, mia, bien, libre);
    expect(d).toMatchObject({ veredicto: "permitir", motivo: "ok" });
    expect(d.topes).toBe(D.topesMias);
  });

  it("otra cuenta: pregunta por defecto; «Nunca» deniega; «Automático» permite con topes menores", () => {
    expect(decidirServir(D, ajena, bien, libre).veredicto).toBe("preguntar");
    expect(decidirServir({ ...D, otrasCuentas: "nunca" }, ajena, bien, libre)).toMatchObject({ veredicto: "denegar", motivo: "apagada" });
    const auto = decidirServir({ ...D, otrasCuentas: "automatico" }, ajena, bien, libre);
    expect(auto.veredicto).toBe("permitir");
    expect(auto.topes).toBe(D.topesOtras);
    expect(decidirServir({ ...D, recordadas: { n2: "denegar" } }, ajena, bien, libre).veredicto).toBe("denegar");
    expect(decidirServir({ ...D, recordadas: { n2: "permitir" } }, ajena, bien, libre).veredicto).toBe("permitir");
  });

  it("una puerta pública de StarSeed cuenta como permitida aunque «Nunca» sea para cuentas ajenas", () => {
    expect(decidirServir({ ...D, otrasCuentas: "nunca" }, { id: "p", mismaCuenta: false, publico: true }, bien, libre).veredicto).toBe("permitir");
  });

  it("topes: sin internet, batería, red medida, cuota y túneles", () => {
    expect(decidirServir(D, mia, { ...bien, conInternet: false }, libre).motivo).toBe("sin-internet");
    expect(decidirServir(D, mia, { ...bien, bateria: 0.05 }, libre).motivo).toBe("bateria");
    expect(decidirServir(D, mia, { ...bien, bateria: 0.05, cargando: true }, libre).veredicto).toBe("permitir");
    expect(decidirServir(D, mia, { ...bien, medida: true }, libre).motivo).toBe("red-medida");
    expect(decidirServir({ ...D, topesMias: { ...D.topesMias, permitirRedMedida: true } }, mia, { ...bien, medida: true }, libre).veredicto).toBe("permitir");
    expect(decidirServir(D, mia, bien, { bytesHoyGrupo: D.topesMias.bytesDia, tunelesGrupo: 0 }).motivo).toBe("cuota");
    expect(decidirServir(D, mia, bien, { bytesHoyGrupo: 0, tunelesGrupo: D.topesMias.maxTuneles }).motivo).toBe("tuneles");
  });

  it("revocar gana a todo", () => {
    expect(decidirServir({ ...D, revocadas: ["n1"] }, mia, bien, libre).motivo).toBe("revocada");
  });

  it("hosts para otras cuentas: vacío = cualquiera público; con lista, solo esos", () => {
    expect(hostPermitidoParaOtras(D, "example.com")).toBe(true);
    const a = { ...D, hostsParaOtras: ["*.starseed.red", "api.ejemplo.org"] };
    expect(hostPermitidoParaOtras(a, "x.starseed.red")).toBe(true);
    expect(hostPermitidoParaOtras(a, "api.ejemplo.org")).toBe(true);
    expect(hostPermitidoParaOtras(a, "otro.com")).toBe(false);
  });
});
