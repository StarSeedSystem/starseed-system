/** Señales insomne (INS1027C): el anuncio «siempre disponible hasta HH:MM» viaja en la presencia. */
import { describe, expect, it } from "vitest";

import {
  INTERVALO_INSOMNE_MS,
  insomneDesdeRespuesta,
  resumirSenales,
  firmaSenales,
  tocaRefrescarInsomne,
  type EntradasSenales,
} from "../senales-medio";

const FIN: number = Date.parse("2026-10-28T09:30:00.000Z");
const AHORA: number = Date.parse("2026-10-28T09:00:00.000Z");

describe("insomneDesdeRespuesta", () => {
  it("acepta una sesión activa y viva, con fecha ISO o en ms", () => {
    expect(insomneDesdeRespuesta({ activo: true, hasta: "2026-10-28T09:30:00.000Z", proveedor: "insomnia" }, AHORA))
      .toEqual({ hasta: FIN, proveedor: "insomnia" });
    expect(insomneDesdeRespuesta({ activo: true, hasta: FIN, proveedor: "caffeinate" }, AHORA))
      .toEqual({ hasta: FIN, proveedor: "caffeinate" });
  });
  it("no anuncia lo vencido, lo inactivo, lo mal formado ni sin proveedor", () => {
    expect(insomneDesdeRespuesta({ activo: true, hasta: "2026-10-27T09:30:00.000Z", proveedor: "insomnia" }, AHORA)).toBeUndefined();
    expect(insomneDesdeRespuesta({ activo: false, hasta: "2026-10-28T09:30:00.000Z", proveedor: "insomnia" }, AHORA)).toBeUndefined();
    expect(insomneDesdeRespuesta({ activo: true, hasta: "ayer", proveedor: "insomnia" }, AHORA)).toBeUndefined();
    expect(insomneDesdeRespuesta({ activo: true }, AHORA)).toBeUndefined();
    expect(insomneDesdeRespuesta({ activo: true, hasta: FIN }, AHORA)).toBeUndefined();
    expect(insomneDesdeRespuesta(null, AHORA)).toBeUndefined();
    expect(insomneDesdeRespuesta("sesión", AHORA)).toBeUndefined();
  });
});

describe("tocaRefrescarInsomne", () => {
  it("consulta como mucho una vez cada 60 segundos", () => {
    expect(INTERVALO_INSOMNE_MS).toBe(60_000);
    expect(tocaRefrescarInsomne(-1, AHORA)).toBe(true);
    expect(tocaRefrescarInsomne(AHORA - INTERVALO_INSOMNE_MS + 1_000, AHORA)).toBe(false);
    expect(tocaRefrescarInsomne(AHORA - INTERVALO_INSOMNE_MS, AHORA)).toBe(true);
    expect(tocaRefrescarInsomne(0, NaN)).toBe(false);
  });
});

describe("resumirSenales y firmaSenales con el anuncio insomne", () => {
  const base = (insomne?: EntradasSenales["insomne"]): EntradasSenales => ({
    enLinea: true, malla: { propios: 1, otrasCuentas: 0 }, bluetooth: null,
    serie: { api: true, puertos: 0 }, ...(insomne ? { insomne } : {}),
  });
  it("viaja con la presencia y cambia la firma cuando cambia", () => {
    const conInsomne = resumirSenales(base({ hasta: FIN, proveedor: "insomnia" }));
    const sinInsomne = resumirSenales(base());
    expect(conInsomne.insomne).toEqual({ hasta: FIN, proveedor: "insomnia" });
    expect(sinInsomne.insomne).toBeUndefined();
    expect(firmaSenales(conInsomne)).not.toBe(firmaSenales(sinInsomne));
    const otraHora = resumirSenales(base({ hasta: FIN + 60_000, proveedor: "insomnia" }));
    expect(firmaSenales(otraHora)).not.toBe(firmaSenales(conInsomne));
  });
  it("quien limpia lo vencido es insomneDesdeRespuesta: el resumen no re-filtra", () => {
    const entrada = base({ hasta: Date.parse("2026-10-27T09:30:00.000Z"), proveedor: "insomnia" });
    expect(resumirSenales(entrada).insomne).toEqual(entrada.insomne);
    expect(insomneDesdeRespuesta({ activo: true, hasta: Date.parse("2026-10-27T09:30:00.000Z"), proveedor: "insomnia" }, AHORA))
      .toBeUndefined();
  });
});
