/**
 * Wi-Fi P2P sin router ni hotspot (WFA1109A): la matriz de decisión por pareja, la migración del permiso del punto
 * de acceso, la escalada de la llamada sin hotspot, la pastilla y los textos de Ajustes.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CapacidadesWifi } from "@/lib/malla/enlace-wifi-directo";
import { elegirRoles, ipEnlaceLocalV6, ipPrivada, requierePuntoAcceso, rolesValidos } from "@/lib/malla/enlace-wifi-directo";
import { decidirEnlaceWifi, etiquetaEnlaceP2p, fijarEnlacesWifi, ETIQUETA_WIFI_DIRECTO } from "@/lib/malla/enlace-wifi-orquestacion";
import {
  CLAVE_MARCA_PUNTO_ACCESO,
  CLAVE_PUNTO_ACCESO,
  ETIQUETA_PUNTO_ACCESO,
  ETIQUETA_WIFI_P2P,
  TEXTO_PAREJAS,
  TEXTO_PERMITIR_PUNTO_ACCESO,
  capacidadesDeSaludo,
  conLanas,
  decidirParP2p,
  direccionAwdl,
  lanasEnComun,
  leerLanasDeSaludo,
  planMigracionPuntoAcceso,
  puedeOfrecerSinSaberDelOtro,
  textoPastillaP2p,
} from "@/lib/malla/wifi-p2p";
import { fijarPuntoAcceso, migrarPuntoAcceso, puntoAccesoPermitido, reiniciarPuntoAccesoParaPruebas } from "@/lib/malla/punto-acceso-ajuste";
import { pasoWifiDe, textoEscalada, TEXTO_PANTALLA_SIN_P2P } from "@/lib/llamadas/escalada-wifi";
import { textoCapacidades } from "@/components/settings/neurons/ajuste-enlace-wifi";

const base = { permiso: "concedido" as const, wifi: true };
const ANDROID_AWARE: CapacidadesWifi = { ...base, plataforma: "android", ap: ["wifi-aware", "hotspot-local", "wifi-direct"], cliente: ["wifi-aware", "wifi-direct"], radioUnica: false, lanas: ["wifi-aware", "wifi-direct-concurrente"] };
const ANDROID_DIRECT: CapacidadesWifi = { ...base, plataforma: "android", ap: ["hotspot-local", "wifi-direct"], cliente: ["wifi-direct"], radioUnica: false, lanas: ["wifi-direct-concurrente"] };
const MAC_AWDL: CapacidadesWifi = { ...base, plataforma: "macos", ap: [], cliente: ["corewlan", "guiado"], radioUnica: true, lanas: ["awdl"] };
const MAC_SIN_AWDL: CapacidadesWifi = { ...MAC_AWDL, lanas: [] };
const optin = (c: CapacidadesWifi): CapacidadesWifi => conLanas(c, true);

describe("matriz de decisión por pareja (sin abrir nada)", () => {
  it("Android ↔ Android: Aware si los dos lo tienen; si no, Wi-Fi Direct concurrente (nunca el hotspot)", () => {
    expect(decidirParP2p(ANDROID_AWARE, ANDROID_AWARE)).toMatchObject({ tipo: "p2p", lana: "wifi-aware" });
    expect(decidirParP2p(ANDROID_AWARE, ANDROID_DIRECT)).toMatchObject({ tipo: "p2p", lana: "wifi-direct-concurrente" });
    expect(decidirParP2p(ANDROID_DIRECT, ANDROID_DIRECT)).toMatchObject({ tipo: "p2p", lana: "wifi-direct-concurrente" });
    // Aunque haya permitido el punto de acceso: entre dos Android manda el P2P.
    expect(decidirParP2p(optin(ANDROID_AWARE), optin(ANDROID_DIRECT)).tipo).toBe("p2p");
  });

  it("Mac ↔ Mac: AWDL; Mac sin AWDL no lo tiene", () => {
    expect(decidirParP2p(MAC_AWDL, MAC_AWDL)).toMatchObject({ tipo: "p2p", lana: "awdl" });
    expect(decidirParP2p(MAC_AWDL, MAC_SIN_AWDL).tipo).toBe("bluetooth");
  });

  it("Mac ↔ Android: Bluetooth, salvo que las DOS hayan permitido el punto de acceso", () => {
    expect(decidirParP2p(MAC_AWDL, ANDROID_AWARE).tipo).toBe("bluetooth");
    expect(decidirParP2p(optin(MAC_AWDL), ANDROID_AWARE).tipo).toBe("bluetooth"); // solo el Mac: no basta
    expect(decidirParP2p(MAC_AWDL, optin(ANDROID_AWARE)).tipo).toBe("bluetooth"); // solo el Android: tampoco
    expect(decidirParP2p(optin(MAC_AWDL), optin(ANDROID_AWARE)).tipo).toBe("punto-acceso");
  });

  it("AWDL nunca vale con un Android aunque lo anuncie", () => {
    const raro: CapacidadesWifi = { ...ANDROID_DIRECT, lanas: ["awdl"] };
    expect(lanasEnComun(MAC_AWDL, raro)).toEqual([]);
  });

  it("una app anterior (sin `lanas`) con Wi-Fi Direct se entiende como Wi-Fi Direct concurrente", () => {
    const vieja: CapacidadesWifi = { ...base, plataforma: "android", ap: ["hotspot-local", "wifi-direct"], cliente: ["wifi-direct"], radioUnica: false };
    expect(decidirParP2p(vieja, vieja)).toMatchObject({ tipo: "p2p", lana: "wifi-direct-concurrente" });
    expect(decidirParP2p(MAC_AWDL, vieja).tipo).toBe("bluetooth");
  });
});

describe("el punto de acceso es opt-in en los roles", () => {
  const a = { neurona: "n-and", cap: ANDROID_DIRECT };
  it("sin permiso de las dos no hay roles Mac ↔ Android; con él, sí", () => {
    expect(elegirRoles(a, { neurona: "n-mac", cap: MAC_AWDL })).toBeNull();
    expect(elegirRoles({ ...a, cap: optin(ANDROID_DIRECT) }, { neurona: "n-mac", cap: MAC_AWDL })).toBeNull();
    const r = elegirRoles({ ...a, cap: optin(ANDROID_DIRECT) }, { neurona: "n-mac", cap: optin(MAC_AWDL) });
    expect(r).not.toBeNull();
    expect(requierePuntoAcceso(r!.metodoAp, r!.metodoCliente)).toBe(true);
  });

  it("Android ↔ Android elige Aware sin ningún permiso extra, y nunca un cliente de punto de acceso", () => {
    const r = elegirRoles({ neurona: "a", cap: ANDROID_AWARE }, { neurona: "b", cap: ANDROID_AWARE });
    expect(r).toMatchObject({ metodoAp: "wifi-aware", metodoCliente: "wifi-aware" });
    expect(rolesValidos(r, { neurona: "a", cap: ANDROID_AWARE }, { neurona: "b", cap: ANDROID_AWARE })).toBe(true);
  });
});

describe("direcciones P2P", () => {
  it("IPv6 de enlace local con ámbito (Aware) en forma canónica; sin ámbito o global, no", () => {
    expect(ipEnlaceLocalV6("FE80:0:0:0:1:2:3:4%aware_data0")).toBe("fe80::1:2:3:4%aware_data0");
    expect(ipEnlaceLocalV6("fe80::1")).toBeNull();
    expect(ipEnlaceLocalV6("2001:db8::1%eth0")).toBeNull();
    expect(ipPrivada("fe80::1:2:3:4%aware_data0")).toBe("fe80::1:2:3:4%aware_data0");
    expect(ipPrivada("8.8.8.8")).toBeNull();
  });
  it("awdl:<huella> se normaliza", () => {
    expect(direccionAwdl("AWDL:0123456789ABCDEF")).toBe("awdl:0123456789abcdef");
    expect(direccionAwdl("awdl:")).toBeNull();
    expect(direccionAwdl("192.168.1.2")).toBeNull();
  });
});

describe("migración del permiso del punto de acceso (apagado por defecto)", () => {
  it("plan puro: sin marca se apaga lo que hubiera; con marca al día no se toca", () => {
    expect(planMigracionPuntoAcceso(null, null)).toEqual({ valor: "0", marca: "1" });
    expect(planMigracionPuntoAcceso(null, "1")).toEqual({ valor: "0", marca: "1" });
    expect(planMigracionPuntoAcceso(null, "0")).toEqual({ valor: null, marca: "1" });
    expect(planMigracionPuntoAcceso("1", "1")).toEqual({ valor: null, marca: null });
  });

  describe("con almacén", () => {
    const mem = new Map<string, string>();
    const alm = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    beforeEach(() => mem.clear());

    it("un valor «1» heredado se apaga una vez; lo que la persona elija después se respeta", () => {
      mem.set(CLAVE_PUNTO_ACCESO, "1");
      migrarPuntoAcceso(alm);
      expect(mem.get(CLAVE_PUNTO_ACCESO)).toBe("0");
      expect(mem.get(CLAVE_MARCA_PUNTO_ACCESO)).toBe("1");
      mem.set(CLAVE_PUNTO_ACCESO, "1"); // la persona lo permite
      migrarPuntoAcceso(alm);
      expect(mem.get(CLAVE_PUNTO_ACCESO)).toBe("1");
    });

    it("sin nada guardado, queda apagado", () => {
      migrarPuntoAcceso(alm);
      expect(mem.get(CLAVE_PUNTO_ACCESO)).toBe("0");
    });
  });

  describe("ajuste en memoria", () => {
    afterEach(() => reiniciarPuntoAccesoParaPruebas());
    it("por defecto apagado; fijarlo lo cambia", () => {
      reiniciarPuntoAccesoParaPruebas();
      expect(puntoAccesoPermitido()).toBe(false);
      fijarPuntoAcceso(true);
      expect(puntoAccesoPermitido()).toBe(true);
      fijarPuntoAcceso(false);
      expect(puntoAccesoPermitido()).toBe(false);
    });
  });
});

describe("capacidades en el saludo (hacia atrás compatibles)", () => {
  it("anuncia carriles y opt-in; lo desconocido se ignora", () => {
    expect(capacidadesDeSaludo(optin(ANDROID_AWARE))).toEqual(["wifi-aware", "wifi-direct-concurrente", "punto-acceso-optin"]);
    expect(capacidadesDeSaludo(MAC_AWDL)).toEqual(["awdl"]);
    expect(capacidadesDeSaludo(null)).toEqual([]);
    expect(leerLanasDeSaludo(["awdl", "x", 3, "awdl"])).toEqual(["awdl"]);
    expect(leerLanasDeSaludo("no")).toEqual([]);
  });
});

describe("escalada de la llamada sin hotspot", () => {
  const comun = {
    clase: "llamada" as const,
    enlaceActual: { tipo: "ble" as const, kbps: 200 },
    cerca: true,
    fase: "inactivo" as const,
    ajuste: "automatico" as const,
    ahora: 1_000_000,
  };

  it("Mac ↔ Android sin permiso: no abre ni pregunta, se queda en Bluetooth (sin aviso de Wi-Fi)", () => {
    const d = decidirEnlaceWifi({ ...comun, capPropia: MAC_AWDL, capOtro: ANDROID_AWARE });
    expect(d.accion).toBe("nada");
    expect(d.sinP2p).toBe(true);
    const p = decidirEnlaceWifi({ ...comun, ajuste: "preguntar", capPropia: ANDROID_AWARE, capOtro: MAC_AWDL });
    expect(p.accion).toBe("nada");
    expect(p.sinP2p).toBe(true);
  });

  it("sin saber del otro: un Mac sin permiso no ofrece nada; un Android con P2P sí", () => {
    expect(puedeOfrecerSinSaberDelOtro(MAC_AWDL)).toBe(false);
    expect(puedeOfrecerSinSaberDelOtro(ANDROID_AWARE)).toBe(true);
    expect(decidirEnlaceWifi({ ...comun, capPropia: MAC_AWDL }).sinP2p).toBe(true);
  });

  it("Android ↔ Android y Mac ↔ Mac sí abren su carril", () => {
    expect(decidirEnlaceWifi({ ...comun, capPropia: ANDROID_AWARE, capOtro: ANDROID_DIRECT }).accion).toBe("abrir");
  });

  it("con el permiso de las dos, Mac ↔ Android vuelve al punto de acceso", () => {
    const d = decidirEnlaceWifi({ ...comun, capPropia: optin(MAC_AWDL), capOtro: optin(ANDROID_AWARE) });
    expect(d.accion).toBe("abrir");
  });

  it("el paso de la llamada «sin-p2p» y sus textos: Bluetooth, sin prompt de Wi-Fi", () => {
    const vacia = { estado: { fase: "inactivo", otro: null }, propuesta: null, pregunta: null, avisoRadio: null };
    const inst = { ...vacia, sinP2p: ["n-android"] };
    expect(pasoWifiDe(inst, "n-android", "automatico").paso).toBe("sin-p2p");
    expect(pasoWifiDe(inst, "otra", "automatico").paso).toBe("inactivo");
    const t = textoEscalada({ paso: "sin-p2p", webrtcConectado: false, videoPedido: true, videoDatosActivo: true });
    expect(t).toMatch(/Bluetooth/);
    expect(t).not.toMatch(/abrir/);
    expect(TEXTO_PANTALLA_SIN_P2P).toMatch(/no hay Wi.Fi P2P sin hotspot/);
  });
});

describe("pastilla y textos de Ajustes", () => {
  afterEach(() => fijarEnlacesWifi([]));

  it("pastilla: Wi-Fi P2P · Aware/AWDL · sin router", () => {
    expect(textoPastillaP2p("awdl")).toBe("Wi‑Fi P2P · AWDL · sin router");
    expect(textoPastillaP2p("wifi-aware")).toBe("Wi‑Fi P2P · Aware · sin router");
    expect(etiquetaEnlaceP2p("nativo:awdl:0123456789abcdef", [])).toBe("Wi‑Fi P2P · AWDL · sin router");
    expect(etiquetaEnlaceP2p("nativo:fe80::1%aware_data0", [])).toBe("Wi‑Fi P2P · Aware · sin router");
    expect(etiquetaEnlaceP2p("nativo:10.0.0.9", [])).toBe(ETIQUETA_WIFI_DIRECTO);
  });

  it("nombres de la interfaz", () => {
    expect(ETIQUETA_WIFI_P2P).toBe("Wi‑Fi P2P (sin router ni hotspot)");
    expect(ETIQUETA_PUNTO_ACCESO).toBe("Red directa por punto de acceso");
    expect(TEXTO_PERMITIR_PUNTO_ACCESO).toBe("Permitir red directa por punto de acceso (la Mac deja su Wi‑Fi mientras dure)");
  });

  it("una línea por pareja: Android↔Android, Apple↔Apple, Mac↔Android = Bluetooth", () => {
    expect(TEXTO_PAREJAS.map((p) => p.id)).toEqual(["android-android", "apple-apple", "mac-android"]);
    expect(TEXTO_PAREJAS.find((p) => p.id === "mac-android")!.texto).toMatch(/Bluetooth/);
    expect(TEXTO_PAREJAS.find((p) => p.id === "apple-apple")!.texto).toMatch(/AWDL/);
    expect(TEXTO_PAREJAS.find((p) => p.id === "android-android")!.texto).toMatch(/Aware/);
  });

  it("las capacidades del punto de acceso solo se muestran si la persona lo permitió", () => {
    expect(textoCapacidades(MAC_AWDL, false)).not.toMatch(/permitido por ti/);
    expect(textoCapacidades(optin(MAC_AWDL), true)).toMatch(/permitido por ti/);
  });
});
