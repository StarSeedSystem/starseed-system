import { describe, expect, it } from "vitest";
import {
  ESPERA_MAX_FALLO_MS,
  ESPERA_OK_MS,
  ESPERA_PRIMERA_MS,
  configConClave,
  esperaTras,
  iniciarClaveFaroNativa,
  mismaConfigFaro,
  sincronizarClaveFaro,
  type DepsFaroCuenta,
} from "../faro-clave-cuenta";
import type { ConfigAntenas } from "../tipos";

const CFG: ConfigAntenas = { clave_faro: null, neurona: null, conocidas: [], meshtastic_hosts: ["10.0.0.9"], nas: true, faro_apagado: false };
const fijo = (b: number) => (n: Uint8Array) => n.fill(b);

function crear(p: Partial<{ nativa: boolean; cuenta: boolean; ajuste: string | null; cfg: ConfigAntenas; ids: string[]; otraNeuronaEscribe: string; configFalla: boolean; configurarFalla: boolean }> = {}) {
  const e = {
    ajuste: p.ajuste === undefined ? null : p.ajuste,
    cfg: p.cfg ?? CFG,
    llamadas: [] as string[],
    configurada: [] as ConfigAntenas[],
    escrituras: 0,
  };
  const deps: DepsFaroCuenta = {
    esNativa: () => p.nativa !== false,
    hayCuenta: async () => {
      e.llamadas.push("hayCuenta");
      return p.cuenta !== false;
    },
    leerAjuste: async () => {
      e.llamadas.push("leerAjuste");
      return e.ajuste;
    },
    escribirAjuste: async (clave) => {
      e.llamadas.push("escribirAjuste");
      e.escrituras++;
      e.ajuste = p.otraNeuronaEscribe ?? clave; // otra neurona pudo escribir justo después
    },
    idNeurona: () => "mac-1",
    idsNeuronasCuenta: async () => p.ids ?? ["tab-1", "mac-1", "tab-1", "  "],
    antenasConfig: async () => {
      e.llamadas.push("antenasConfig");
      return p.configFalla ? { ok: false, motivo: "app sin config" } : { ok: true, valor: e.cfg };
    },
    antenasConfigurar: async (c) => {
      e.llamadas.push("antenasConfigurar");
      if (p.configurarFalla) return { ok: false, motivo: "disco lleno" };
      e.configurada.push(c);
      e.cfg = c;
      return { ok: true, valor: {} as never };
    },
  };
  return { deps, e };
}

describe("clave de faro de la cuenta → app nativa", () => {
  it("fuera de la app nativa no llama a nada (ni lee ni crea)", async () => {
    const { deps, e } = crear({ nativa: false });
    expect(await sincronizarClaveFaro(deps)).toMatchObject({ ok: false, motivo: "no-nativa" });
    expect(e.llamadas).toEqual([]);
  });

  it("sin sesión no crea ninguna clave", async () => {
    const { deps, e } = crear({ cuenta: false });
    expect(await sincronizarClaveFaro(deps)).toMatchObject({ ok: false, motivo: "sin-cuenta" });
    expect(e.llamadas).toEqual(["hayCuenta"]);
    expect(e.escrituras).toBe(0);
  });

  it("crea la clave una sola vez, la guarda en la cuenta y la pone en la app con esta neurona y las otras conocidas", async () => {
    const { deps, e } = crear();
    const r = await sincronizarClaveFaro(deps, fijo(0xab));
    expect(r).toEqual({ ok: true, aplicado: true, claveNueva: true, conocidas: 1 });
    expect(e.ajuste).toBe("ab".repeat(32));
    expect(e.escrituras).toBe(1);
    expect(e.configurada).toHaveLength(1);
    expect(e.configurada[0]).toEqual({ ...CFG, clave_faro: "ab".repeat(32), neurona: "mac-1", conocidas: ["tab-1"] });
    // Lo que la app tenía de otras cosas se conserva.
    expect(e.configurada[0].meshtastic_hosts).toEqual(["10.0.0.9"]);
    expect(e.configurada[0].nas).toBe(true);
  });

  it("el resultado nunca lleva la clave", async () => {
    const { deps } = crear();
    const r = await sincronizarClaveFaro(deps, fijo(0xcd));
    expect(JSON.stringify(r)).not.toContain("cd".repeat(32));
  });

  it("reutiliza la que ya hay en la cuenta y, si la app ya la tiene igual, no reescribe su archivo", async () => {
    const lista: ConfigAntenas = { ...CFG, clave_faro: "ef".repeat(32), neurona: "mac-1", conocidas: ["tab-1"] };
    const { deps, e } = crear({ ajuste: "EF".repeat(32), cfg: lista });
    const r = await sincronizarClaveFaro(deps, fijo(1));
    expect(r).toEqual({ ok: true, aplicado: false, claveNueva: false, conocidas: 1 });
    expect(e.escrituras).toBe(0);
    expect(e.llamadas).not.toContain("antenasConfigurar");
  });

  it("si otra neurona escribió su clave a la vez, esta usa la que quedó en la cuenta", async () => {
    const { deps, e } = crear({ otraNeuronaEscribe: "12".repeat(32) });
    await sincronizarClaveFaro(deps, fijo(0xab));
    expect(e.configurada[0].clave_faro).toBe("12".repeat(32));
  });

  it("una clave guardada rota (no son 64 hex) no se usa tal cual: se crea una buena", async () => {
    const { deps, e } = crear({ ajuste: "no-es-una-clave" });
    const r = await sincronizarClaveFaro(deps, fijo(0x07));
    expect(r).toMatchObject({ ok: true, claveNueva: true });
    expect(e.ajuste).toBe("07".repeat(32));
  });

  it("dice por qué falla: la app no da su config / no puede guardarla", async () => {
    expect(await sincronizarClaveFaro(crear({ configFalla: true }).deps, fijo(1))).toMatchObject({ ok: false, motivo: "sin-config", detalle: "app sin config" });
    expect(await sincronizarClaveFaro(crear({ configurarFalla: true }).deps, fijo(1))).toMatchObject({ ok: false, motivo: "no-aplicada", detalle: "disco lleno" });
  });

  it("un error con la clave dentro la tapa en el detalle", async () => {
    const { deps } = crear();
    deps.antenasConfig = async () => {
      throw new Error(`falló con ${"ab".repeat(32)} dentro`);
    };
    const r = await sincronizarClaveFaro(deps, fijo(0xab));
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).not.toContain("ab".repeat(32));
  });

  it("si no se pueden listar las neuronas, igualmente reparte la clave", async () => {
    const { deps, e } = crear();
    deps.idsNeuronasCuenta = async () => {
      throw new Error("sin red");
    };
    expect(await sincronizarClaveFaro(deps, fijo(5))).toMatchObject({ ok: true, aplicado: true, conocidas: 0 });
    expect(e.configurada[0].conocidas).toEqual([]);
  });
});

describe("piezas puras", () => {
  it("configConClave: sin duplicados, sin la propia, ordenadas; conserva el resto", () => {
    const c = configConClave(CFG, "aa".repeat(32), "mac-1", ["z", "mac-1", "a", "a", ""]);
    expect(c).toEqual({ ...CFG, clave_faro: "aa".repeat(32), neurona: "mac-1", conocidas: ["a", "z"] });
  });

  it("mismaConfigFaro ignora el orden de las conocidas", () => {
    const a: ConfigAntenas = { ...CFG, clave_faro: "k", neurona: "n", conocidas: ["b", "a"] };
    expect(mismaConfigFaro(a, { ...a, conocidas: ["a", "b"] })).toBe(true);
    expect(mismaConfigFaro(a, { ...a, clave_faro: "otra" })).toBe(false);
    expect(mismaConfigFaro(a, { ...a, conocidas: ["a"] })).toBe(false);
  });

  it("esperaTras: acierto 30 min; fallo 30 s ×4 hasta 30 min; sin app nativa, no insiste pronto", () => {
    expect(esperaTras({ ok: true, aplicado: true, claveNueva: false, conocidas: 0 }, 0)).toBe(ESPERA_OK_MS);
    const f = { ok: false, motivo: "sin-cuenta", detalle: "" } as const;
    expect(esperaTras(f, 0)).toBe(30_000);
    expect(esperaTras(f, 1)).toBe(120_000);
    expect(esperaTras(f, 2)).toBe(480_000);
    expect(esperaTras(f, 9)).toBe(ESPERA_MAX_FALLO_MS);
    expect(esperaTras({ ok: false, motivo: "no-nativa", detalle: "" }, 0)).toBe(ESPERA_MAX_FALLO_MS);
  });
});

describe("iniciarClaveFaroNativa (calendario)", () => {
  function reloj() {
    const cola: Array<{ f: () => void; ms: number; id: number }> = [];
    let n = 0;
    return {
      cola,
      poner: (f: () => void, ms: number) => {
        const id = ++n;
        cola.push({ f, ms, id });
        return id;
      },
      quitar: (h: unknown) => {
        const i = cola.findIndex((x) => x.id === h);
        if (i >= 0) cola.splice(i, 1);
      },
      async dispara() {
        const t = cola.shift();
        t?.f();
        await new Promise((r) => setTimeout(r, 0));
        await new Promise((r) => setTimeout(r, 0));
      },
    };
  }

  it("la primera vuelta a los 5 s; tras acierto, la siguiente a los 30 min; la parada la cancela", async () => {
    const r = reloj();
    const { deps } = crear();
    const parar = iniciarClaveFaroNativa({ deps: async () => deps, poner: r.poner, quitar: r.quitar });
    expect(r.cola.map((x) => x.ms)).toEqual([ESPERA_PRIMERA_MS]);
    await r.dispara();
    expect(r.cola.map((x) => x.ms)).toEqual([ESPERA_OK_MS]);
    parar();
    expect(r.cola).toEqual([]);
  });

  it("tras un fallo reintenta pronto (30 s) y luego más despacio", async () => {
    const r = reloj();
    const { deps } = crear({ cuenta: false });
    iniciarClaveFaroNativa({ deps: async () => deps, poner: r.poner, quitar: r.quitar });
    await r.dispara();
    expect(r.cola.map((x) => x.ms)).toEqual([30_000]);
    await r.dispara();
    expect(r.cola.map((x) => x.ms)).toEqual([120_000]);
  });

  it("en la web normal no vuelve a mirar", async () => {
    const r = reloj();
    const { deps } = crear({ nativa: false });
    iniciarClaveFaroNativa({ deps: async () => deps, poner: r.poner, quitar: r.quitar });
    await r.dispara();
    expect(r.cola).toEqual([]);
  });
});
