/**
 * INT1109C — el contrato de capacidades de punta a punta: las formas JSON que devuelven `ble_estado` y
 * `enlace_wifi_capacidades` en CADA plataforma (las mismas que prueban los tests de Rust: `ble::roles_y_l2cap_por_plataforma`,
 * `win_p2p_logica`, `enlace_wifi_linux_logica`, `wifi_p2p_logica`) y cómo `lanas-propias` las convierte en carriles.
 */
import { afterEach, describe, expect, it } from "vitest";
import { lanasInferidas, lanasDeSaludo, puedePuntoAcceso } from "../matriz-enlaces";
import { refrescarLanasPropias } from "../lanas-propias";

type Json = Record<string, unknown>;

/** Lo que serializa `EstadoBle` (solo lo que lee la matriz). */
const ble = (plataforma: string, extra: Json = {}): Json => ({
  disponible: true,
  activo: true,
  radio: "encendida",
  plataforma,
  roles: ["central", "periferico"],
  l2cap: true,
  ...extra,
});

/** Lo que serializa `CapacidadesWifi` (claves de Rust: `radio_unica`). */
const wifi = (plataforma: string, ap: string[], cliente: string[], lanas: string[]): Json => ({
  plataforma,
  ap,
  cliente,
  permiso: "concedido",
  radio_unica: false,
  wifi: true,
  motivo: "",
  lanas,
});

async function lanasDe(plataforma: string, bleJson: Json | null, wifiJson: Json | null, puntoAcceso = false) {
  const r = await refrescarLanasPropias({
    plataforma,
    puntoAcceso,
    llamar: (async (cmd: string) => {
      if (cmd === "ble_estado") return bleJson ? { ok: true, valor: bleJson } : { ok: false };
      if (cmd === "enlace_wifi_capacidades") return wifiJson ? { ok: true, valor: wifiJson } : { ok: false };
      return { ok: false };
    }) as never,
  });
  return r;
}

afterEach(() => undefined);

describe("lanas propias desde lo nativo, plataforma por plataforma", () => {
  it("macOS: Bluetooth en los dos papeles con L2CAP, AWDL; ni Wi‑Fi Direct ni Aware", async () => {
    const r = await lanasDe("macos", ble("macos"), wifi("macos", [], ["corewlan", "guiado"], ["awdl"]));
    expect(r.plataforma).toBe("macos");
    expect(r.lanas).toMatchObject({
      "lan-tcp": true,
      "ble-gatt": { central: true, periferico: true },
      "ble-l2cap": true,
      awdl: true,
      "wifi-aware": false,
      "wifi-direct": { go: false, cliente: false, concurrente: false },
      "punto-acceso-optin": false,
    });
  });

  it("macOS: el punto de acceso solo si la persona lo permitió (y como cliente)", async () => {
    const cap = wifi("macos", [], ["corewlan", "guiado"], ["awdl"]);
    expect((await lanasDe("macos", ble("macos"), cap, false)).lanas["punto-acceso-optin"]).toBe(false);
    expect((await lanasDe("macos", ble("macos"), cap, true)).lanas["punto-acceso-optin"]).toBe(true);
  });

  it("Android: Aware + Wi‑Fi Direct concurrente, Bluetooth con L2CAP desde la API 29", async () => {
    const cap = wifi("android", ["wifi-aware", "hotspot-local", "wifi-direct"], ["wifi-aware", "wifi-direct"], ["wifi-aware", "wifi-direct-concurrente"]);
    const r = await lanasDe("android", ble("android"), cap, true);
    expect(r.lanas).toMatchObject({
      "ble-gatt": { central: true, periferico: true },
      "ble-l2cap": true,
      "wifi-aware": true,
      "wifi-direct": { go: true, cliente: true, concurrente: true },
      "punto-acceso-optin": true,
      awdl: false,
    });
    const viejo = await lanasDe("android", ble("android", { l2cap: false }), cap);
    expect(viejo.lanas["ble-l2cap"]).toBe(false);
    expect(viejo.lanas["ble-gatt"]).toEqual({ central: true, periferico: true });
    expect(viejo.lanas["punto-acceso-optin"]).toBe(false);
  });

  it("Windows: Bluetooth sin L2CAP y Wi‑Fi Direct en los dos papeles (ya no «solo red local»)", async () => {
    const cap = wifi("windows", ["wifi-direct"], ["wifi-direct"], ["wifi-direct", "wifi-direct-concurrente"]);
    const r = await lanasDe("windows", ble("windows", { l2cap: false }), cap, true);
    expect(r.lanas).toMatchObject({
      "lan-tcp": true,
      "ble-gatt": { central: true, periferico: true },
      "ble-l2cap": false,
      "wifi-direct": { go: true, cliente: true, concurrente: true },
      awdl: false,
      "wifi-aware": false,
      "punto-acceso-optin": false, // Windows no usa el punto de acceso aunque el ajuste esté encendido
    });
  });

  it("Linux: Bluetooth con L2CAP; una sola tarjeta = dueño del grupo sin poder unirse", async () => {
    const cap = wifi("linux", ["wifi-direct"], [], ["wifi-direct", "wifi-direct-concurrente"]);
    const r = await lanasDe("linux", ble("linux"), cap);
    expect(r.lanas).toMatchObject({
      "ble-gatt": { central: true, periferico: true },
      "ble-l2cap": true,
      "wifi-direct": { go: true, cliente: false, concurrente: true },
    });
  });

  it("sin radio Bluetooth (roles vacíos, no disponible) no hay carril Bluetooth", async () => {
    const sin = ble("windows", { disponible: false, radio: "no-disponible", roles: [], l2cap: false });
    const r = await lanasDe("windows", sin, wifi("windows", [], [], []));
    expect(r.lanas["ble-gatt"]).toEqual({ central: false, periferico: false });
    expect(r.lanas["ble-l2cap"]).toBe(false);
    expect(r.lanas["wifi-direct"]).toEqual({ go: false, cliente: false, concurrente: false });
    expect(r.lanas["lan-tcp"]).toBe(true);
  });

  it("solo un papel: un Windows sin periférico anuncia solo central, y sin L2CAP", async () => {
    const r = await lanasDe("windows", ble("windows", { roles: ["central"], l2cap: false }), null);
    expect(r.lanas["ble-gatt"]).toEqual({ central: true, periferico: false });
  });

  it("si las órdenes nativas no responden no se inventa nada", async () => {
    const r = await lanasDe("linux", null, null);
    expect(r.lanas["ble-gatt"]).toEqual({ central: false, periferico: false });
    expect(r.lanas["wifi-direct"].go).toBe(false);
    expect(r.lanas["lan-tcp"]).toBe(true);
  });
});

describe("saludos anteriores: se mantienen conservadores", () => {
  it("una app anterior de Windows/Linux (listas vacías) solo tenía la red local", () => {
    for (const p of ["windows", "linux"]) {
      const l = lanasInferidas(p, { nativo: true, cap: { plataforma: p as never, ap: [], cliente: [], permiso: "no-aplica", radioUnica: false, wifi: false, lanas: [] } });
      expect(l).toMatchObject({ "lan-tcp": true, "ble-gatt": { central: false, periferico: false }, "ble-l2cap": false, "wifi-direct": { go: false, cliente: false, concurrente: false } });
    }
  });

  it("una ficha con Wi‑Fi Direct de Windows/Linux se lee papel por papel", () => {
    const linux = lanasDeSaludo(undefined, "linux", { cap: { plataforma: "linux" as never, ap: ["wifi-direct"], cliente: [], permiso: "concedido", radioUnica: false, wifi: true, lanas: ["wifi-direct", "wifi-direct-concurrente"] } });
    expect(linux.anunciadas).toBe(false);
    expect(linux.lanas["wifi-direct"]).toEqual({ go: true, cliente: false, concurrente: true });
    expect(linux.lanas["ble-gatt"]).toEqual({ central: false, periferico: false }); // Bluetooth solo si lo anuncia
  });

  it("un Mac no gana Wi‑Fi Direct por una lista rara", () => {
    const l = lanasInferidas("macos", { nativo: true, cap: { plataforma: "macos", ap: ["wifi-direct"], cliente: ["wifi-direct"], permiso: "concedido", radioUnica: true, wifi: true, lanas: ["wifi-direct-concurrente"] } });
    expect(l["wifi-direct"]).toEqual({ go: false, cliente: false, concurrente: false });
  });

  it("puedePuntoAcceso", () => {
    const cap = (ap: string[], cliente: string[]) => ({ plataforma: "android" as never, ap: ap as never, cliente: cliente as never, permiso: "concedido" as const, radioUnica: false, wifi: true });
    expect(puedePuntoAcceso("android", cap(["hotspot-local"], []))).toBe(true);
    expect(puedePuntoAcceso("android", cap(["wifi-direct"], []))).toBe(false);
    expect(puedePuntoAcceso("macos", cap([], ["guiado"]))).toBe(true);
    expect(puedePuntoAcceso("windows", cap(["wifi-direct"], ["wifi-direct"]))).toBe(false);
    expect(puedePuntoAcceso("android", null)).toBe(true); // sin dato nativo, la persona manda
    expect(puedePuntoAcceso("linux", null)).toBe(false);
  });
});
