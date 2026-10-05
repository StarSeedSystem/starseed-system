/**
 * CAMR · regulación — perfil legal ampliado: casos límite por región.
 */
import { describe, expect, it } from "vitest";

import {
  BANDAS_RADIOAFICIONADO,
  PERFILES_WIFI,
  VENTANA_CICLO_MS,
  aireConsumidoMs,
  cabeEnCiclo,
  dentroDeLey,
  permiteCifrado,
  pire,
  registraTransmision,
  ventanaCicloVacia,
} from "../regulacion";
import type { PerfilLegal } from "../regulacion";

const perfil = (parcial: Partial<PerfilLegal>): PerfilLegal => ({
  regionLora: null,
  regionWifi: null,
  indicativo: null,
  ...parcial,
});

describe("pire", () => {
  it("potencia + ganancia − pérdidas", () => {
    expect(pire(20, 5, 1)).toBe(24);
    expect(pire(20, 0, 0)).toBe(20);
  });
});

describe("permiteCifrado", () => {
  it("false en radioaficionado, true en el resto", () => {
    for (const b of Object.keys(BANDAS_RADIOAFICIONADO)) expect(permiteCifrado(b)).toBe(false);
    expect(permiteCifrado("EU_868")).toBe(true);
    expect(permiteCifrado("wifi-5g")).toBe(true);
  });
});

describe("ciclo de trabajo (ventana 1 h)", () => {
  it("registra, mide y caduca tras 1 h", () => {
    let v = ventanaCicloVacia();
    v = registraTransmision(v, "EU_868", 1_000, 36_000); // 1 % de la hora
    expect(aireConsumidoMs(v, "EU_868", 1_000)).toBe(36_000);
    expect(aireConsumidoMs(v, "EU_868", 1_000 + VENTANA_CICLO_MS)).toBe(0);
  });

  it("límite EU_868 10 %: no cabe el ms que lo supera", () => {
    let v = ventanaCicloVacia();
    const limite = 0.1 * VENTANA_CICLO_MS; // 360 000 ms
    v = registraTransmision(v, "EU_868", 0, limite);
    expect(cabeEnCiclo(v, "EU_868", 10, 1, 60)).toBe(false);
    expect(cabeEnCiclo(v, "EU_868", 10, 0, 60)).toBe(true);
  });

  it("UA_868 (1 %) es más estricta: el mismo aire no cabe", () => {
    let v = ventanaCicloVacia();
    v = registraTransmision(v, "UA_868", 0, 0.01 * VENTANA_CICLO_MS);
    expect(cabeEnCiclo(v, "UA_868", 1, 1, 60)).toBe(false);
  });
});

describe("dentroDeLey · radioaficionado", () => {
  const radio20m = { frecuenciaMhz: 14.1, potenciaDbm: 27 };
  it("sin indicativo → no ok", () => {
    const v = dentroDeLey({ banda: "ham-20m", radio: radio20m }, perfil({}));
    expect(v.ok).toBe(false);
    expect(v.motivos.join(" ")).toContain("indicativo");
  });
  it("con indicativo y en rango → ok", () => {
    const v = dentroDeLey({ banda: "ham-20m", radio: radio20m }, perfil({ indicativo: "EA1XYZ" }));
    expect(v.ok).toBe(true);
  });
  it("cifrado prohibido aunque haya indicativo", () => {
    const v = dentroDeLey(
      { banda: "ham-2m", radio: { frecuenciaMhz: 145, potenciaDbm: 27 }, cifrado: true },
      perfil({ indicativo: "EA1XYZ" }),
    );
    expect(v.ok).toBe(false);
    expect(v.motivos.join(" ")).toContain("cifrar");
  });
  it("fuera de banda y exceso de potencia → motivos", () => {
    const v = dentroDeLey(
      { banda: "ham-70cm", radio: { frecuenciaMhz: 445, potenciaDbm: 36 } },
      perfil({ indicativo: "EA1XYZ" }),
    );
    expect(v.ok).toBe(false);
    expect(v.motivos.length).toBe(2);
  });
});

describe("dentroDeLey · Wi-Fi por región", () => {
  it("canal 12 (2 467 MHz) legal en EU, inexistente en US", () => {
    const radio = { frecuenciaMhz: 2467, potenciaDbm: 18 };
    expect(dentroDeLey({ banda: "wifi-2g", radio }, perfil({ regionWifi: "EU" })).ok).toBe(true);
    expect(dentroDeLey({ banda: "wifi-2g", radio }, perfil({ regionWifi: "US" })).ok).toBe(false);
  });
  it("PIRE EU 2,4 GHz: 20 ok, 21 no (con ganancia de antena)", () => {
    const base = { banda: "wifi-2g" as const };
    const ok = dentroDeLey(
      { ...base, radio: { frecuenciaMhz: 2412, potenciaDbm: 18, gananciaAntenaDbi: 2, perdidasDb: 1 } },
      perfil({ regionWifi: "EU" }),
    );
    expect(ok.ok).toBe(true); // PIRE 19
    const mal = dentroDeLey(
      { ...base, radio: { frecuenciaMhz: 2412, potenciaDbm: 18, gananciaAntenaDbi: 4, perdidasDb: 1 } },
      perfil({ regionWifi: "EU" }),
    );
    expect(mal.ok).toBe(false); // PIRE 21
    expect(mal.motivos.join(" ")).toContain("PIRE");
  });
  it("6 GHz usa PIRE de su región (US 30 dBm, EU 23 dBm)", () => {
    const radio = { frecuenciaMhz: 5950 + 5 * 1, potenciaDbm: 25 };
    expect(dentroDeLey({ banda: "wifi-6g", radio }, perfil({ regionWifi: "US" })).ok).toBe(true);
    expect(dentroDeLey({ banda: "wifi-6g", radio }, perfil({ regionWifi: "EU" })).ok).toBe(false);
  });
  it("sin región Wi-Fi no se evalúa", () => {
    expect(dentroDeLey({ banda: "wifi-2g", radio: { frecuenciaMhz: 2412, potenciaDbm: 10 } }, perfil({})).ok).toBe(false);
  });
});

describe("dentroDeLey · LoRa ISM", () => {
  it("EU_868: en banda y potencia justa al tope → ok; +1 dBm → no", () => {
    const ok = dentroDeLey({ banda: "EU_868", radio: { frecuenciaMhz: 869.5, potenciaDbm: 27 } }, perfil({}));
    expect(ok.ok).toBe(true);
    const mal = dentroDeLey({ banda: "EU_868", radio: { frecuenciaMhz: 869.5, potenciaDbm: 27.1 } }, perfil({}));
    expect(mal.ok).toBe(false);
  });
  it("fuera del rango de frecuencia → motivo", () => {
    const v = dentroDeLey({ banda: "US", radio: { frecuenciaMhz: 868, potenciaDbm: 20 } }, perfil({}));
    expect(v.ok).toBe(false);
  });
  it("ciclo agotado bloquea la transmisión", () => {
    let ventana = ventanaCicloVacia();
    ventana = registraTransmision(ventana, "EU_868", 0, 0.1 * VENTANA_CICLO_MS);
    const v = dentroDeLey(
      { banda: "EU_868", radio: { frecuenciaMhz: 869.5, potenciaDbm: 20 }, durMs: 100, ahora: 60, ventana },
      perfil({}),
    );
    expect(v.ok).toBe(false);
    expect(v.motivos.join(" ")).toContain("ciclo");
  });
  it("banda desconocida → no ok", () => {
    expect(dentroDeLey({ banda: "MARTE", radio: { frecuenciaMhz: 1, potenciaDbm: 0 } }, perfil({})).ok).toBe(false);
  });
});

describe("tablas", () => {
  it("Wi-Fi EU 2,4 GHz cubre canales 1–13 con PIRE 20", () => {
    const g24 = PERFILES_WIFI.EU.g24;
    expect(g24.length).toBe(13);
    expect(g24[0]).toEqual({ canal: 1, frecMhz: 2412, pireDbm: 20 });
    expect(g24[12].canal).toBe(13);
  });
  it("radioaficionado cubre HF, VHF y UHF", () => {
    const gamas = new Set(Object.values(BANDAS_RADIOAFICIONADO).map((b) => b.gama));
    expect(gamas).toEqual(new Set(["HF", "VHF", "UHF"]));
  });
});
