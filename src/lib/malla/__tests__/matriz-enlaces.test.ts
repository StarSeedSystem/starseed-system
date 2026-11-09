/**
 * Matriz de enlaces directos 6×6 (MTZ1109A): las 36 parejas ordenadas, roles y GO, combinaciones de carriles,
 * compatibilidad con saludos antiguos, fallo y retroceso por carril, y la coherencia con `decidirParP2p` / `elegirRoles`.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { CapacidadesWifi } from "@/lib/malla/enlace-wifi-directo";
import { elegirRoles } from "@/lib/malla/enlace-wifi-directo";
import { decidirParP2p } from "@/lib/malla/wifi-p2p";
import { holaNativa, leerHola } from "@/lib/malla/red-local-nativa";
import {
  ORDEN_LANAS,
  PLATAFORMAS_MATRIZ,
  SIN_LANAS,
  decidirPareja,
  elegirGoWifiDirect,
  elegirRolesBle,
  filasCompatibilidad,
  lanaDeEnlace,
  lanasDeNativo,
  lanasDeSaludo,
  lanasInferidas,
  lanasParaPesado,
  lanasPlenas,
  leerLanas,
  matrizPlena,
  plataformaMatriz,
  type Lana,
  type LanasAnunciadas,
  type NeuronaLanas,
  type PlataformaMatriz,
} from "@/lib/malla/matriz-enlaces";
import {
  ESPERA_BASE_MS,
  ESPERA_MAX_MS,
  enEspera,
  enlaceEnEspera,
  esperaTrasFallo,
  fallosEnlaces,
  frasesFallos,
  lanasCaidas,
  olvidarFallosEnlaces,
  registrarExitoEnlace,
  registrarFalloEnlace,
  textoFalloSenal,
} from "@/lib/malla/fallos-enlaces";
import { enlaceFueraDeMatriz, fijarLanasPropias, olvidarLanasVecinas, refrescarLanasPropias, registrarLanasVecina } from "@/lib/malla/lanas-propias";
import { enriquecerConFallosEnlace } from "@/ai/astraura/mesh/senales-fallos-enlace";
import type { DetectedSignal } from "@/ai/astraura/mesh/signals";

const n = (id: string, plataforma: PlataformaMatriz, lanas: LanasAnunciadas = lanasPlenas(plataforma)): NeuronaLanas => ({ id, plataforma, lanas });
const nombres = (d: { lanas: Array<{ lana: Lana }> }) => d.lanas.map((x) => x.lana);

/* Lo que debe salir con TODO publicado y en la misma red, por pareja NO ordenada. */
const BT2: Lana[] = ["ble-l2cap", "ble-gatt", "lan-tcp"];
const ESPERADO: Record<string, Lana[]> = {
  "macos|macos": ["awdl", ...BT2],
  "macos|ios": ["awdl", ...BT2],
  "ios|ios": ["awdl", ...BT2],
  "macos|windows": ["ble-gatt", "lan-tcp"],
  "ios|windows": ["ble-gatt", "lan-tcp"],
  "macos|linux": BT2,
  "ios|linux": BT2,
  "macos|android": BT2,
  "ios|android": BT2,
  "android|android": ["wifi-aware", "wifi-direct", ...BT2],
  "android|windows": ["wifi-direct", "ble-gatt", "lan-tcp"],
  "android|linux": ["wifi-direct", ...BT2],
  "windows|windows": ["wifi-direct", "ble-gatt", "lan-tcp"],
  "windows|linux": ["wifi-direct", "ble-gatt", "lan-tcp"],
  "linux|linux": ["wifi-direct", ...BT2],
};
const esperadoDe = (a: PlataformaMatriz, b: PlataformaMatriz): Lana[] => {
  if (a === "web" || b === "web") return [];
  return ESPERADO[`${a}|${b}`] ?? ESPERADO[`${b}|${a}`];
};

describe("matriz 6×6 con todo publicado (36 parejas ordenadas)", () => {
  const todas = matrizPlena();
  it("hay 36 parejas ordenadas", () => {
    expect(todas).toHaveLength(36);
    expect(new Set(todas.map((x) => `${x.de}|${x.con}`)).size).toBe(36);
  });
  it.each(todas.map((x) => [`${x.de} → ${x.con}`, x] as const))("%s: carriles en el orden del contrato", (_t, x) => {
    expect(nombres(x.decision)).toEqual(esperadoDe(x.de, x.con));
    // El orden siempre es el del contrato.
    const idx = nombres(x.decision).map((l) => ORDEN_LANAS.indexOf(l));
    expect(idx).toEqual([...idx].sort((p, q) => p - q));
  });
  it.each(todas.map((x) => [`${x.de} → ${x.con}`, x] as const))("%s: simétrica (la otra punta decide igual)", (_t, x) => {
    const a = n(`${x.de}-1`, x.de);
    const b = n(`${x.con}-2`, x.con);
    const ab = decidirPareja(a, b, { mismaRed: true });
    const ba = decidirPareja(b, a, { mismaRed: true });
    expect(ba.lanas.map((l) => ({ ...l }))).toEqual(ab.lanas.map((l) => ({ ...l })));
  });
  it("la web no tiene antenas: ningún carril, con su frase", () => {
    for (const x of todas.filter((t) => t.de === "web" || t.con === "web")) {
      expect(x.decision.lanas).toEqual([]);
      expect(x.decision.limite).toBe("Web/PWA: sin antenas directas; usa la red local por la app nativa o la malla");
    }
  });
  it("frases de límite: Mac ↔ Windows solo Bluetooth; Mac ↔ Linux con L2CAP", () => {
    const d = (x: PlataformaMatriz, y: PlataformaMatriz) => decidirPareja(n("a", x), n("b", y), { mismaRed: true });
    expect(d("macos", "windows").limite).toBe("Mac ↔ Windows: solo Bluetooth (macOS no tiene Wi‑Fi Direct)");
    expect(d("windows", "macos").limite).toBe("Mac ↔ Windows: solo Bluetooth (macOS no tiene Wi‑Fi Direct)"); // siempre Apple primero, igual en las dos puntas
    expect(d("macos", "linux").limite).toContain("L2CAP");
    expect(d("android", "android").limite).toContain("Wi‑Fi Aware");
  });
  it("AWDL solo Apple↔Apple y Aware solo Android↔Android aunque lo anuncien otros", () => {
    const todo: LanasAnunciadas = { ...lanasPlenas("android"), awdl: true, "wifi-aware": true };
    expect(nombres(decidirPareja(n("a", "windows", todo), n("b", "linux", todo), { mismaRed: true }))).toEqual(["wifi-direct", "ble-l2cap", "ble-gatt", "lan-tcp"]);
    expect(nombres(decidirPareja(n("a", "macos", todo), n("b", "android", todo), { mismaRed: true }))).not.toContain("awdl");
  });
});

describe("combinaciones de carriles disponibles (Android ↔ Android)", () => {
  // 4 interruptores → 16 combinaciones: aware, wifi-direct, l2cap, red local.
  const casos = Array.from({ length: 16 }, (_, i) => ({ aware: !!(i & 1), wd: !!(i & 2), l2cap: !!(i & 4), lan: !!(i & 8) }));
  it.each(casos.map((c) => [JSON.stringify(c), c] as const))("%s", (_t, c) => {
    const l: LanasAnunciadas = {
      ...lanasPlenas("android"),
      "wifi-aware": c.aware,
      "wifi-direct": { go: c.wd, cliente: c.wd, concurrente: true },
      "ble-l2cap": c.l2cap,
      "lan-tcp": c.lan,
    };
    const esperado: Lana[] = [...(c.aware ? ["wifi-aware" as const] : []), ...(c.wd ? ["wifi-direct" as const] : []), ...(c.l2cap ? ["ble-l2cap" as const] : []), "ble-gatt", ...(c.lan ? ["lan-tcp" as const] : [])];
    expect(nombres(decidirPareja(n("a", "android", l), n("b", "android", l), { mismaRed: true }))).toEqual(esperado);
  });
  it("lan-tcp: fuera si no están en la misma red; condicional si no se sabe", () => {
    const a = n("a", "linux");
    const b = n("b", "linux");
    expect(nombres(decidirPareja(a, b, { mismaRed: false }))).not.toContain("lan-tcp");
    const sin = decidirPareja(a, b);
    expect(sin.lanas.find((x) => x.lana === "lan-tcp")?.condicional).toBe(true);
    expect(decidirPareja(a, b, { mismaRed: true }).lanas.find((x) => x.lana === "lan-tcp")?.condicional).toBeUndefined();
  });
  it("sin ningún Bluetooth ni Wi-Fi, solo la red local; sin nada, vacío", () => {
    const solo: LanasAnunciadas = { ...SIN_LANAS, "lan-tcp": true };
    expect(nombres(decidirPareja(n("a", "linux", solo), n("b", "windows", solo), { mismaRed: true }))).toEqual(["lan-tcp"]);
    expect(nombres(decidirPareja(n("a", "linux", SIN_LANAS), n("b", "windows", SIN_LANAS), { mismaRed: true }))).toEqual([]);
  });
});

describe("roles Bluetooth y propietario del grupo (GO) de Wi‑Fi Direct", () => {
  it("Wi‑Fi Direct: manda quien conserva su Wi‑Fi (concurrente), aunque su id sea mayor", () => {
    const win = n("a-win", "windows"); // no concurrente
    const and = n("z-and", "android"); // concurrente
    expect(elegirGoWifiDirect(win, and)).toEqual({ go: "z-and", cliente: "a-win" });
    expect(elegirGoWifiDirect(and, win)).toEqual({ go: "z-and", cliente: "a-win" });
    const d = decidirPareja(win, and, { mismaRed: true }).lanas.find((l) => l.lana === "wifi-direct");
    expect(d).toMatchObject({ go: "z-and", cliente: "a-win", dejanWifi: ["a-win"] });
  });
  it("a igual capacidad, el id menor", () => {
    expect(elegirGoWifiDirect(n("b-lin", "linux"), n("a-win", "windows"))).toEqual({ go: "a-win", cliente: "b-lin" });
    expect(elegirGoWifiDirect(n("b-and", "android"), n("a-and", "android"))).toEqual({ go: "a-and", cliente: "b-and" });
  });
  it("un solo rol posible: ese (GO solo uno, cliente solo el otro)", () => {
    const soloGo = n("x", "linux", { ...lanasPlenas("linux"), "wifi-direct": { go: true, cliente: false, concurrente: false } });
    const soloCli = n("a", "windows", { ...lanasPlenas("windows"), "wifi-direct": { go: false, cliente: true, concurrente: false } });
    expect(elegirGoWifiDirect(soloGo, soloCli)).toEqual({ go: "x", cliente: "a" });
    expect(elegirGoWifiDirect(soloGo, soloGo)).toBeNull();
  });
  it("Bluetooth: central el id menor si valen las dos; si solo vale una asignación, esa", () => {
    expect(elegirRolesBle(n("b", "macos"), n("a", "android"))).toEqual({ central: "a", periferico: "b" });
    const soloCentral = n("m", "windows", { ...lanasPlenas("windows"), "ble-gatt": { central: true, periferico: false } });
    const soloPeri = n("z", "linux", { ...lanasPlenas("linux"), "ble-gatt": { central: false, periferico: true } });
    expect(elegirRolesBle(soloCentral, soloPeri)).toEqual({ central: "m", periferico: "z" });
    expect(elegirRolesBle(soloPeri, soloCentral)).toEqual({ central: "m", periferico: "z" });
    expect(elegirRolesBle(soloCentral, soloCentral)).toBeNull();
  });
  it("L2CAP necesita los mismos roles que GATT; sin roles compatibles no sale ni uno ni otro", () => {
    const dosCentrales = { ...lanasPlenas("macos"), "ble-gatt": { central: true, periferico: false } };
    const d = decidirPareja(n("a", "macos", dosCentrales), n("b", "linux", dosCentrales), { mismaRed: true });
    expect(nombres(d)).toEqual(["lan-tcp"]);
    expect(d.descartadas.map((x) => x.lana)).toEqual(expect.arrayContaining(["ble-l2cap", "ble-gatt"]));
  });
  it("lo que decide la matriz coincide con `elegirRoles` (quien levanta la red)", () => {
    const cap = (plataforma: CapacidadesWifi["plataforma"], lanas: CapacidadesWifi["lanas"]): CapacidadesWifi => ({
      plataforma,
      ap: ["wifi-direct"],
      cliente: ["wifi-direct"],
      permiso: "concedido",
      radioUnica: false,
      wifi: true,
      lanas,
    });
    const win = cap("windows", ["wifi-direct"]);
    const and = cap("android", ["wifi-direct-concurrente"]);
    const lin = cap("linux", ["wifi-direct"]);
    expect(elegirRoles({ neurona: "a-win", cap: win }, { neurona: "z-and", cap: and })?.ap).toBe("z-and");
    expect(elegirRoles({ neurona: "z-and", cap: and }, { neurona: "a-win", cap: win })?.ap).toBe("z-and");
    expect(elegirRoles({ neurona: "b-lin", cap: lin }, { neurona: "a-win", cap: win })?.ap).toBe("a-win");
    expect(elegirRoles({ neurona: "a-win", cap: win }, { neurona: "b-lin", cap: lin })).toMatchObject({ ap: "a-win", cliente: "b-lin", metodoAp: "wifi-direct", metodoCliente: "wifi-direct" });
  });
});

describe("`decidirParP2p` en el 6×6 de Wi‑Fi", () => {
  const cap = (plataforma: CapacidadesWifi["plataforma"], extra: Partial<CapacidadesWifi> = {}): CapacidadesWifi => ({ plataforma, ap: [], cliente: [], permiso: "concedido", radioUnica: false, wifi: true, ...extra });
  const wd = (plataforma: CapacidadesWifi["plataforma"], lanas: CapacidadesWifi["lanas"]) => cap(plataforma, { ap: ["wifi-direct"], cliente: ["wifi-direct"], lanas });
  it("Windows ↔ Linux por Wi‑Fi Direct estándar: P2P, avisando que se deja el Wi‑Fi", () => {
    expect(decidirParP2p(wd("windows", ["wifi-direct"]), wd("linux", ["wifi-direct"]))).toMatchObject({ tipo: "p2p", lana: "wifi-direct", dejaWifi: true });
  });
  it("Android concurrente ↔ Windows: Wi‑Fi Direct (el Windows deja su Wi‑Fi); Android ↔ Android concurrente: sin dejar nada", () => {
    expect(decidirParP2p(wd("android", ["wifi-direct-concurrente"]), wd("windows", ["wifi-direct"]))).toMatchObject({ tipo: "p2p", lana: "wifi-direct", dejaWifi: true });
    const dos = decidirParP2p(wd("android", ["wifi-direct-concurrente"]), wd("android", ["wifi-direct-concurrente"]));
    expect(dos).toMatchObject({ tipo: "p2p", lana: "wifi-direct-concurrente" });
    expect((dos as { dejaWifi?: boolean }).dejaWifi).toBeUndefined();
  });
  it("Mac ↔ Windows y Mac ↔ Linux: Bluetooth (macOS no tiene Wi‑Fi Direct)", () => {
    const mac = cap("macos", { cliente: ["corewlan"], radioUnica: true, lanas: ["awdl"] });
    expect(decidirParP2p(mac, wd("windows", ["wifi-direct"])).tipo).toBe("bluetooth");
    expect(decidirParP2p(mac, wd("linux", ["wifi-direct"])).tipo).toBe("bluetooth");
    expect(decidirParP2p(wd("windows", ["wifi-direct"]), mac).tipo).toBe("bluetooth");
  });
  it("el punto de acceso sigue siendo opt-in", () => {
    const mac = cap("macos", { cliente: ["corewlan"], radioUnica: true, lanas: ["awdl"] });
    const and = cap("android", { ap: ["hotspot-local"], lanas: [] });
    expect(decidirParP2p(mac, and).tipo).toBe("bluetooth");
    expect(decidirParP2p({ ...mac, lanas: ["awdl", "punto-acceso-optin"] }, { ...and, lanas: ["punto-acceso-optin"] }).tipo).toBe("punto-acceso");
    const d = decidirPareja(n("m", "macos", { ...lanasPlenas("macos"), "punto-acceso-optin": true }), n("a", "android", { ...lanasPlenas("android"), "punto-acceso-optin": true }), { mismaRed: true });
    expect(d.puntoAcceso).toBe(true);
    expect(nombres(d)).not.toContain("punto-acceso-optin");
  });
});

describe("compatibilidad con saludos antiguos y construcción desde lo nativo", () => {
  it("el saludo nuevo lleva `lanas` y `plataforma`, y se lee igual", () => {
    const lanas = lanasPlenas("linux");
    const h = holaNativa({ de: { neurona: "n1", nombre: "Portátil" }, para: "n2", limites: null, webrtc: false, ts: 1, lanas, plataforma: "linux" });
    expect(h.lanas).toEqual(lanas);
    expect(h.plataforma).toBe("linux");
    const leido = leerHola(JSON.parse(JSON.stringify(h)));
    expect(leido?.lanas).toEqual(lanas);
    expect(leido?.plataforma).toBe("linux");
  });
  it("el saludo viejo no trae nada y se lee igual que siempre", () => {
    const h = holaNativa({ de: { neurona: "n1", nombre: "Mac" }, para: "n2", limites: null, webrtc: true, ts: 1 });
    expect("lanas" in h).toBe(false);
    expect("plataforma" in h).toBe(false);
    const leido = leerHola(JSON.parse(JSON.stringify(h)));
    expect(leido).not.toBeNull();
    expect(leido?.lanas).toBeUndefined();
  });
  it("un `lanas` mal formado se descarta; los valores raros pasan a falso", () => {
    expect(leerLanas("x")).toBeNull();
    expect(leerLanas([1])).toBeNull();
    expect(leerLanas({ "lan-tcp": "sí", awdl: 1, "ble-gatt": { central: true } })).toMatchObject({ "lan-tcp": false, awdl: false, "ble-gatt": { central: true, periferico: false } });
    const h = leerHola({ t: "nl.hola", v: 1, de: { neurona: "n", nombre: "x" }, para: "p", ts: 1, webrtc: false, lanas: "roto", plataforma: "linux" });
    expect(h?.lanas).toBeUndefined();
  });
  it("normaliza plataformas", () => {
    expect(["macOS", "Darwin", "iPadOS", "Windows 11", "Ubuntu", "Android 14", "iPhone", "navegador", undefined].map(plataformaMatriz)).toEqual(["macos", "macos", "ios", "windows", "linux", "android", "ios", "web", "web"]);
  });
  it("una app anterior sin `lanas` se infiere de su plataforma y sus campos viejos", () => {
    const capMac: CapacidadesWifi = { plataforma: "macos", ap: [], cliente: ["corewlan"], permiso: "concedido", radioUnica: true, wifi: true, lanas: ["awdl"] };
    const capAnd: CapacidadesWifi = { plataforma: "android", ap: ["wifi-aware", "wifi-direct", "hotspot-local"], cliente: ["wifi-aware", "wifi-direct"], permiso: "concedido", radioUnica: false, wifi: true, lanas: ["wifi-aware", "wifi-direct-concurrente"] };
    const mac = lanasDeSaludo(undefined, undefined, { cap: capMac });
    expect(mac).toMatchObject({ plataforma: "macos", anunciadas: false });
    expect(mac.lanas).toMatchObject({ awdl: true, "ble-l2cap": true, "lan-tcp": true, "wifi-aware": false });
    const and = lanasDeSaludo(undefined, "android", { cap: capAnd });
    expect(and.lanas).toMatchObject({ "wifi-aware": true, "wifi-direct": { go: true, cliente: true, concurrente: true }, "ble-gatt": { central: true, periferico: true } });
    // Windows/Linux de antes: solo la red local (no tenían Bluetooth ni Wi‑Fi P2P).
    const win = lanasInferidas("windows", { nativo: true });
    expect(win).toMatchObject({ "lan-tcp": true, "ble-l2cap": false, "ble-gatt": { central: false, periferico: false }, "wifi-direct": { go: false, cliente: false } });
    // Una web (sin parte nativa conocida): ninguna antena.
    expect(lanasDeSaludo(undefined, "MacIntel", {}).lanas).toEqual(SIN_LANAS);
    // Un par viejo Mac ↔ Android sigue dando Bluetooth + red local, como siempre.
    const par = decidirPareja({ id: "m", plataforma: "macos", lanas: mac.lanas }, { id: "a", plataforma: "android", lanas: and.lanas }, { mismaRed: true });
    expect(nombres(par)).toEqual(["ble-l2cap", "ble-gatt", "lan-tcp"]);
  });
  it("lo anunciado manda sobre lo inferido", () => {
    const d = lanasDeSaludo(lanasPlenas("windows"), "windows");
    expect(d.anunciadas).toBe(true);
    expect(d.lanas["ble-gatt"]).toEqual({ central: true, periferico: true });
  });
  it("lanasDeNativo: Windows con Bluetooth GATT y Wi‑Fi Direct publicados por la parte nativa", () => {
    const wifi: CapacidadesWifi = { plataforma: "windows", ap: ["wifi-direct"], cliente: ["wifi-direct"], permiso: "concedido", radioUnica: true, wifi: true, lanas: ["wifi-direct"] };
    const l = lanasDeNativo({ plataforma: "windows", nativo: true, ble: { disponible: true, l2cap: false, roles: ["central", "periferico"] }, wifi });
    expect(l).toMatchObject({ "lan-tcp": true, "ble-gatt": { central: true, periferico: true }, "ble-l2cap": false, "wifi-direct": { go: true, cliente: true, concurrente: false }, awdl: false, "wifi-aware": false });
  });
  it("lanasDeNativo: Linux con Bluetooth no disponible y sin Wi‑Fi Direct → solo la red local; el Mac con AWDL activo", () => {
    expect(lanasDeNativo({ plataforma: "linux", nativo: true, ble: { disponible: false }, wifi: null })).toMatchObject({ "ble-gatt": { central: false, periferico: false }, "ble-l2cap": false, "wifi-direct": { go: false, cliente: false } });
    expect(lanasDeNativo({ plataforma: "macos", nativo: true, ble: { disponible: true }, wifi: null, awdl: { disponible: true } })).toMatchObject({ awdl: true, "ble-l2cap": true });
    expect(lanasDeNativo({ plataforma: "macos", nativo: false })).toEqual(SIN_LANAS);
    expect(lanasDeNativo({ plataforma: "android", nativo: true, wifi: null, puntoAccesoOptin: true })["punto-acceso-optin"]).toBe(true);
  });
  it("`refrescarLanasPropias` lee las tres órdenes nativas", async () => {
    const llamadas: string[] = [];
    const r = await refrescarLanasPropias({
      plataforma: "linux",
      puntoAcceso: false,
      llamar: (async (cmd: string) => {
        llamadas.push(cmd);
        if (cmd === "ble_estado") return { ok: true, valor: { disponible: true, roles: ["central", "periferico"], l2cap: true } };
        if (cmd === "enlace_wifi_capacidades") return { ok: true, valor: { plataforma: "linux", ap: ["wifi-direct"], cliente: ["wifi-direct"], permiso: "no-aplica", wifi: true, lanas: ["wifi-direct-concurrente"] } };
        return { ok: false };
      }) as never,
    });
    expect(llamadas.sort()).toEqual(["awdl_estado", "ble_estado", "enlace_wifi_capacidades"]);
    expect(r.plataforma).toBe("linux");
    expect(r.lanas).toMatchObject({ "ble-l2cap": true, "wifi-direct": { go: true, cliente: true, concurrente: true } });
  });
});

describe("planificador: varios carriles a la vez para lo pesado", () => {
  it("Wi‑Fi P2P + Bluetooth + red local a la vez", () => {
    expect(lanasParaPesado(decidirPareja(n("a", "android"), n("b", "android"), { mismaRed: true }))).toEqual(["wifi-aware", "ble-l2cap", "lan-tcp"]);
    expect(lanasParaPesado(decidirPareja(n("a", "macos"), n("b", "windows"), { mismaRed: true }))).toEqual(["ble-gatt", "lan-tcp"]);
    expect(lanasParaPesado(decidirPareja(n("a", "windows"), n("b", "linux"), { mismaRed: true }))).toEqual(["wifi-direct", "ble-gatt", "lan-tcp"]);
    expect(lanasParaPesado(decidirPareja(n("a", "web"), n("b", "linux"), { mismaRed: true }))).toEqual([]);
  });
  it("lana de un enlace del transporte", () => {
    expect(lanaDeEnlace("ble:ab12", "ble")).toBe("ble-gatt");
    expect(lanaDeEnlace("nativo:192.168.1.5", "nativo")).toBe("lan-tcp");
    expect(lanaDeEnlace("nativo:awdl:abc123", "nativo")).toBe("awdl");
    expect(lanaDeEnlace("nativo:fe80::1", "nativo")).toBe("wifi-aware");
    expect(lanaDeEnlace("cuenta:x", "cuenta")).toBeNull();
  });
  describe("enlaces que la matriz no admite", () => {
    afterEach(() => olvidarLanasVecinas());
    it("un enlace Bluetooth hacia una vecina que anunció que no tiene Bluetooth se descarta; con datos dudosos, se deja", () => {
      fijarLanasPropias({ plataforma: "macos", lanas: lanasPlenas("macos") });
      registrarLanasVecina("vecina", { ...SIN_LANAS, "lan-tcp": true }, "windows");
      const e = { id: "ble:x", tipo: "ble", alcanza: { neuronDeviceId: "vecina" } };
      expect(enlaceFueraDeMatriz(e)).toBe(true);
      expect(enlaceFueraDeMatriz({ id: "nativo:10.0.0.2", tipo: "nativo", alcanza: { neuronDeviceId: "vecina" } })).toBe(false);
      // vecina de app anterior (inferida): no se cierra ninguna puerta a ciegas
      registrarLanasVecina("vieja", undefined, undefined, {});
      expect(enlaceFueraDeMatriz({ id: "ble:y", tipo: "ble", alcanza: { neuronDeviceId: "vieja" } })).toBe(false);
    });
  });
});

describe("fallo por pareja y carril, con retroceso", () => {
  afterEach(() => olvidarFallosEnlaces());
  it("la espera se duplica hasta el tope", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 20].map(esperaTrasFallo)).toEqual([ESPERA_BASE_MS, 2 * ESPERA_BASE_MS, 4 * ESPERA_BASE_MS, 8 * ESPERA_BASE_MS, 16 * ESPERA_BASE_MS, ESPERA_MAX_MS, ESPERA_MAX_MS, ESPERA_MAX_MS, ESPERA_MAX_MS]);
  });
  it("registra por pareja y carril, espera, y vuelve a probar al pasar el plazo", () => {
    const f1 = registrarFalloEnlace("lin", "wifi-direct", "sin permiso", 1000)!;
    expect(f1).toMatchObject({ veces: 1, hasta: 1000 + ESPERA_BASE_MS });
    expect(enEspera("lin", "wifi-direct", 1000 + ESPERA_BASE_MS - 1)).toBe(true);
    expect(enEspera("lin", "wifi-direct", 1000 + ESPERA_BASE_MS)).toBe(false);
    expect(enEspera("lin", "ble-gatt", 1001)).toBe(false);
    expect(enEspera("otra", "wifi-direct", 1001)).toBe(false);
    const f2 = registrarFalloEnlace("lin", "wifi-direct", "no contesta", 1000 + ESPERA_BASE_MS)!;
    expect(f2.veces).toBe(2);
    expect(f2.hasta - f2.at).toBe(2 * ESPERA_BASE_MS);
  });
  it("un éxito borra el fallo", () => {
    registrarFalloEnlace("lin", "awdl", "x", 1);
    expect(fallosEnlaces()).toHaveLength(1);
    registrarExitoEnlace("lin", "awdl");
    expect(fallosEnlaces()).toHaveLength(0);
  });
  it("la matriz salta al siguiente carril mientras el caído espera", () => {
    const a = n("a-win", "windows");
    const b = n("b-lin", "linux");
    expect(nombres(decidirPareja(a, b, { mismaRed: true }))[0]).toBe("wifi-direct");
    const d = decidirPareja(a, b, { mismaRed: true, caidas: ["wifi-direct"] });
    expect(nombres(d)).toEqual(["ble-gatt", "lan-tcp"]);
    expect(d.descartadas.find((x) => x.lana === "wifi-direct")).toMatchObject({ caida: true });
    // Y si caen todos los directos, queda la red local; si cae también, ninguno directo.
    expect(nombres(decidirPareja(a, b, { mismaRed: true, caidas: ["wifi-direct", "ble-gatt"] }))).toEqual(["lan-tcp"]);
    expect(nombres(decidirPareja(a, b, { mismaRed: true, caidas: new Set<Lana>(["wifi-direct", "ble-gatt", "lan-tcp"]) }))).toEqual([]);
  });
  it("Señales: «Wi‑Fi Direct con <neurona>: falló (motivo) · sigue por Bluetooth»", () => {
    const yo = n("a-win", "windows");
    const otra = n("b-lin", "linux");
    registrarFalloEnlace("b-lin", "wifi-direct", "sin permiso", 5000);
    const frases = frasesFallos(yo, new Map([["b-lin", otra]]), () => "Portátil", 5001, { mismaRed: true });
    expect(frases).toEqual([{ otra: "b-lin", lana: "wifi-direct", texto: "Wi‑Fi Direct con Portátil: falló (sin permiso) · sigue por Bluetooth" }]);
    expect(textoFalloSenal("X", { lana: "ble-gatt", motivo: "m" }, "lan-tcp")).toBe("Bluetooth con X: falló (m) · sigue por la red local");
    expect(textoFalloSenal("X", { lana: "ble-gatt", motivo: "m" }, null)).toContain("sigue por la malla");
    expect(frasesFallos(yo, new Map([["b-lin", otra]]), () => "P", 5000 + ESPERA_BASE_MS + 1)).toEqual([]);
  });
  it("enlaceEnEspera y lanasCaidas miran la pareja", () => {
    registrarFalloEnlace("lin", "awdl", "x", Date.now());
    expect(lanasCaidas("lin")).toEqual(["awdl"]);
    expect(enlaceEnEspera({ id: "nativo:awdl:abc", tipo: "nativo", alcanza: { neuronDeviceId: "lin" } })).toBe(true);
    expect(enlaceEnEspera({ id: "nativo:awdl:abc", tipo: "nativo", alcanza: { neuronDeviceId: "otra" } })).toBe(false);
    expect(enlaceEnEspera({ id: "nativo:10.0.0.3", tipo: "nativo", alcanza: { neuronDeviceId: "lin" } })).toBe(false);
  });
  it("Señales enriquece solo la señal de esa neurona", () => {
    const base = { id: "neuron:b-lin", metrics: [], placement: { detail: "x" } } as unknown as DetectedSignal;
    const otra = { id: "neuron:z", metrics: [], placement: {} } as unknown as DetectedSignal;
    const r = enriquecerConFallosEnlace([base, otra], [{ otra: "b-lin", texto: "Wi‑Fi Direct con P: falló (m) · sigue por Bluetooth" }]);
    expect(r[0].placement?.detail).toContain("Wi‑Fi Direct con P: falló (m) · sigue por Bluetooth");
    expect(r[0].metrics.some((m) => m.label === "Carril directo")).toBe(true);
    expect(r[1]).toBe(otra);
    const sin = [base];
    expect(enriquecerConFallosEnlace(sin, [])).toBe(sin);
  });
});

describe("tabla de la cuenta (datos)", () => {
  it("una fila por pareja con carriles y límite; avisa de apps anteriores", () => {
    const filas = filasCompatibilidad([
      { ...n("m", "macos"), nombre: "Mac", anunciadas: true },
      { ...n("w", "windows"), nombre: "Sobremesa", anunciadas: true },
      { ...n("v", "linux", lanasInferidas("linux", { nativo: false })), nombre: "Viejo", anunciadas: false },
    ], { mismaRed: true });
    expect(filas).toHaveLength(3);
    expect(filas[0].decision.limite).toBe("Mac ↔ Windows: solo Bluetooth (macOS no tiene Wi‑Fi Direct)");
    expect(filas[0].carriles).toEqual(["Bluetooth", "red local"]);
    expect(filas[1].aviso).toContain("Viejo");
    expect(PLATAFORMAS_MATRIZ).toHaveLength(6);
  });
});
