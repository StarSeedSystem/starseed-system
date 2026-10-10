import { describe, expect, it } from "vitest";
import { ETIQUETA_AJENA, anonimizarAjenas, avatarDeSenal, contarPorCuenta, cuentaDe, esPublica, filtrarPorCuenta } from "../cuentas";
import { ID_PROPIA, senal } from "../__fixtures__/vivo";

const ajena = (id: string, nombre: string | null = "Casa de María") =>
  senal(id, {
    antenna: "relay", label: nombre ?? "Neurona StarSeed (anónima)",
    starseed: { via: "relay-beacon", sourceId: `src-${id}`, neuronId: `neu-${id}`, name: nombre, ownAccount: false, capabilities: ["relé StarSeed"] },
  });
const propia = senal("neuron:1", { antenna: "account", starseed: ID_PROPIA });
const sinCuenta = senal("ble:1", { antenna: "ble" });

describe("a quién pertenece cada señal", () => {
  it("propia, otra o ninguna según la identidad verificada", () => {
    expect(cuentaDe(propia)).toBe("propia");
    expect(cuentaDe(ajena("beacon:a"))).toBe("otra");
    expect(cuentaDe(sinCuenta)).toBe("ninguna");
  });

  it("cuenta y filtra", () => {
    const lista = [propia, ajena("beacon:a"), ajena("beacon:b"), sinCuenta];
    expect(contarPorCuenta(lista)).toEqual({ todas: 4, propia: 1, otra: 2, ninguna: 1 });
    expect(filtrarPorCuenta(lista, "todas")).toHaveLength(4);
    expect(filtrarPorCuenta(lista, "otra").map((s) => s.id)).toEqual(["beacon:a", "beacon:b"]);
    expect(filtrarPorCuenta(lista, "ninguna")).toEqual([sinCuenta]);
  });
});

describe("las cuentas ajenas son anónimas", () => {
  it("pierden su nombre aunque el faro comparta etiqueta, y no quedan rastros en el texto que se muestra", () => {
    const [a] = anonimizarAjenas([ajena("beacon:a", "Casa de María")]);
    expect(a.label).toBe(ETIQUETA_AJENA);
    expect(a.starseed?.name).toBeNull();
    expect(a.starseed?.neuronId).toBeUndefined();
    expect(JSON.stringify({ l: a.label, d: a.detail, n: a.starseed?.name })).not.toContain("María");
  });

  it("con varias se distinguen por un sufijo estable (por id, no por orden de llegada)", () => {
    const x = anonimizarAjenas([ajena("beacon:b"), ajena("beacon:a")]);
    const y = anonimizarAjenas([ajena("beacon:a"), ajena("beacon:b")]);
    expect(x.find((s) => s.id === "beacon:a")?.label).toBe(`${ETIQUETA_AJENA} #1`);
    expect(x.find((s) => s.id === "beacon:b")?.label).toBe(`${ETIQUETA_AJENA} #2`);
    expect(y.find((s) => s.id === "beacon:a")?.label).toBe(`${ETIQUETA_AJENA} #1`);
  });

  it("conserva el sourceId (las acciones reales lo necesitan), no muta y deja intacto lo que no es ajeno", () => {
    const orig = ajena("beacon:a");
    const [a, p, b] = anonimizarAjenas([orig, propia, sinCuenta]);
    expect(a.starseed?.sourceId).toBe("src-beacon:a");
    expect(orig.label).toBe("Casa de María");
    expect(p).toBe(propia);
    expect(b).toBe(sinCuenta);
  });

  it("un enlace directo que tú emparejaste a propósito no se anonimiza", () => {
    const directo = senal("local:x", { antenna: "account", label: "Móvil de Rosa", starseed: { via: "direct-link", sourceId: "local:x", name: "Móvil de Rosa", ownAccount: false, capabilities: [] } });
    expect(anonimizarAjenas([directo])[0]).toBe(directo);
  });
});

describe("cuentas ajenas que eligieron mostrarse en el radar público", () => {
  const publica = (id: string, extra: Record<string, unknown> = {}) =>
    senal(id, {
      antenna: "relay", label: "Casa de María",
      starseed: { via: "relay-beacon", sourceId: `src-${id}`, neuronId: `neu-${id}`, name: "Casa de María", ownAccount: false, capabilities: [], publico: true, avatarUrl: "https://cdn.example.org/maria.jpg", deviceKind: "tablet", ...extra },
    });

  it("se ve lo que ELLA marcó compartir (nombre, foto, aparato)", () => {
    const p = publica("beacon:p");
    expect(esPublica(p)).toBe(true);
    const [salida] = anonimizarAjenas([p]);
    expect(salida).toBe(p);
    expect(salida.label).toBe("Casa de María");
    expect(avatarDeSenal(salida, "https://cdn.example.org/yo.jpg")).toBe("https://cdn.example.org/maria.jpg");
  });
  it("si tú apagas «ver datos públicos», vuelve a ser anónima y sin foto", () => {
    const [a] = anonimizarAjenas([publica("beacon:p")], { verPublicos: false });
    expect(a.label).toBe(ETIQUETA_AJENA);
    expect(a.starseed).toMatchObject({ name: null, avatarUrl: undefined, publico: undefined, deviceKind: undefined });
    expect(avatarDeSenal(a, null)).toBeNull();
  });
  it("sin permiso (no es pública) siguen anónimas aunque lleven foto en el dato", () => {
    const s = senal("beacon:q", { antenna: "relay", label: "X", starseed: { via: "relay-beacon", sourceId: "q", name: "X", ownAccount: false, capabilities: [], avatarUrl: "https://cdn.example.org/x.jpg" } });
    const [a] = anonimizarAjenas([s]);
    expect(a.label).toBe(ETIQUETA_AJENA);
    expect(avatarDeSenal(a, null)).toBeNull();
  });
  it("las públicas no numeran a las anónimas", () => {
    const lista = anonimizarAjenas([publica("beacon:p"), ajena("beacon:a"), ajena("beacon:b")]);
    expect(lista.find((s) => s.id === "beacon:a")?.label).toBe(`${ETIQUETA_AJENA} #1`);
    expect(lista.find((s) => s.id === "beacon:b")?.label).toBe(`${ETIQUETA_AJENA} #2`);
  });
  it("tus aparatos llevan la foto de tu perfil; una dirección insegura no pasa; BLE y compañía, nunca", () => {
    expect(avatarDeSenal(propia, "https://cdn.example.org/yo.jpg")).toBe("https://cdn.example.org/yo.jpg");
    expect(avatarDeSenal(propia, "http://inseguro.example/yo.jpg")).toBeNull();
    expect(avatarDeSenal(propia, null)).toBeNull();
    expect(avatarDeSenal(sinCuenta, "https://cdn.example.org/yo.jpg")).toBeNull();
  });
  it("una foto peligrosa en el faro ajeno no llega a pintarse", () => {
    expect(avatarDeSenal(publica("beacon:m", { avatarUrl: "https://192.168.1.2/x.jpg" }), null)).toBeNull();
  });
});
