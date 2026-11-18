import { describe, it, expect } from "vitest";

import type { Lana } from "../matriz-enlaces";
import { lanasDeNativo, decidirPareja, elegirGoWifiDirect, NeuronaLanas } from "../matriz-enlaces";

import type { CapacidadesWifi } from "../enlace-wifi-directo";

describe("matriz-tres-neuronas-1118", () => {
  const mac = {
    id: "mac-1",
    plataforma: "macos" as const,
    lanas: lanasDeNativo({
      plataforma: "macos",
      ble: { disponible: true, l2cap: true, roles: ["central", "periferico"] },
      nativo: true,
    }),
  };

  const android = {
    id: "android-1",
    plataforma: "android" as const,
    lanas: lanasDeNativo({
      plataforma: "android",
      ble: { disponible: true, l2cap: true, roles: ["central", "periferico"] },
      wifi: {
        plataforma: "android",
        ap: ["wifi-direct"],
        cliente: ["wifi-direct"],
        permiso: "concedido",
        radioUnica: false,
        wifi: true,
        lanas: ["wifi-direct-concurrente"],
      },
      nativo: true,
    }),
  };

  const linuxSinP2P = {
    id: "linux-1",
    plataforma: "linux" as const,
    lanas: lanasDeNativo({
      plataforma: "linux",
      ble: { disponible: true, l2cap: true, roles: ["central", "periferico"] },
      wifi: {
        plataforma: "linux",
        ap: [],
        cliente: [],
        permiso: "concedido",
        radioUnica: true,
        wifi: true,
        lanas: [],
      },
      nativo: true,
    }),
  };

  it("linux resulta con wifi-direct go=false y cliente=false", () => {
    expect(mac.lanas["wifi-direct"].go).toBe(false);
    expect(linuxSinP2P.lanas["wifi-direct"].cliente).toBe(false);
  });

  it("decidirPareja(mac, linux, {mismaRed:true}) deja 'lan-tcp' en lanas y 'wifi-direct' en descartadas", () => {
    const decision = decidirPareja(mac, linuxSinP2P, { mismaRed: true });
    expect(decision.lanas.find((l: any) => l.lana === "lan-tcp")).toBeDefined();
    expect(decision.descartadas.find((d: any) => d.lana === "wifi-direct")).toBeDefined();
  });

  it("decidirPareja(android, linux, {mismaRed:true}) tambien descarta 'wifi-direct' con un motivo que contiene 'ninguna'", () => {
    const decision = decidirPareja(android, linuxSinP2P, { mismaRed: true });
    const descartada = decision.descartadas.find((d: any) => d.lana === "wifi-direct");
    expect(descartada).toBeDefined();
    expect(descartada!.motivo).toContain("ninguna");
  });

  it("decidirPareja(mac, android) descarta 'wifi-direct' (Mac no lo tiene)", () => {
    const decision = decidirPareja(mac, android, { mismaRed: true });
    const descartada = decision.descartadas.find((d: any) => d.lana === "wifi-direct");
    expect(descartada).toBeDefined();
  });

  it("con mismaRed:false las tres parejas pierden 'lan-tcp'", () => {
    const d1 = decidirPareja(mac, android, { mismaRed: false });
    const d2 = decidirPareja(mac, linuxSinP2P, { mismaRed: false });
    const d3 = decidirPareja(android, linuxSinP2P, { mismaRed: false });
    expect(d1.lanas.find((l: any) => l.lana === "lan-tcp")).toBeUndefined();
    expect(d2.lanas.find((l: any) => l.lana === "lan-tcp")).toBeUndefined();
    expect(d3.lanas.find((l: any) => l.lana === "lan-tcp")).toBeUndefined();
  });

  it("un Linux con cap {ap:['wifi-direct'], cliente:[], lanas:['wifi-direct','wifi-direct-concurrente']} puede ser go frente a Android cliente", () => {
    const linuxCap = {
      id: "linux-2",
      plataforma: "linux" as const,
      lanas: lanasDeNativo({
        plataforma: "linux",
        ble: { disponible: true, l2cap: true, roles: ["central", "periferico"] },
        wifi: {
          plataforma: "linux",
          ap: ["wifi-direct"],
          cliente: [],
          permiso: "concedido",
          radioUnica: true,
          wifi: true,
          lanas: ["wifi-direct", "wifi-direct-concurrente"],
        },
        nativo: true,
      }),
    };

    const androidSinWifiDir = {
      id: "android-2",
      plataforma: "android" as const,
      lanas: lanasDeNativo({
        plataforma: "android",
        ble: { disponible: true, l2cap: true, roles: ["central", "periferico"] },
        wifi: {
          plataforma: "android",
          ap: [],
          cliente: ["wifi-direct"],
          permiso: "concedido",
          radioUnica: false,
          wifi: true,
          lanas: [],
        },
        nativo: true,
      }),
    };

    const r = elegirGoWifiDirect(linuxCap, androidSinWifiDir);
    expect(r).toEqual({ go: "linux-2", cliente: "android-2" });
  });
});
