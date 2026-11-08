/**
 * Protocolo PURO del enlace Wi-Fi directo (WFD1108A): roles (Android primero), mensajes (nunca
 * credenciales en claro), credenciales, confianza y la máquina de estados (éxito, plazos, rechazo,
 * permiso denegado, respaldo, cruce de ofertas, inactividad). Contrato: architecture/wifi-directo.md.
 */
import { describe, expect, it } from "vitest";
import {
  INACTIVIDAD_WIFI_MS,
  PLAZOS_WIFI,
  SIN_CAPACIDADES,
  TEXTO_RECHAZO,
  WIFI_INICIAL,
  claveValida,
  elegirRoles,
  leerCable,
  leerCapacidades,
  leerCredenciales,
  leerMensajeWifi,
  pasoWifi,
  remitenteDeConfianza,
  rolesValidos,
  ssidValido,
  type AccionWifi,
  type CapacidadesWifi,
  type CredencialesWifi,
  type EstadoWifi,
  type EventoWifi,
  type MensajeWifi,
  type Propio,
} from "@/lib/malla/enlace-wifi-directo";

const ANDROID: CapacidadesWifi = { plataforma: "android", ap: ["hotspot-local", "wifi-direct"], cliente: ["wifi-direct"], permiso: "concedido", radioUnica: false, wifi: true };
const MAC: CapacidadesWifi = { plataforma: "macos", ap: [], cliente: ["corewlan", "guiado"], permiso: "concedido", radioUnica: true, wifi: true };
const EPUB: JsonWebKey = { kty: "EC", crv: "P-256", x: "xxxxxxxx", y: "yyyyyyyy" };

const TEL: Propio = { neurona: "tel-1", nombre: "Teléfono", cap: ANDROID, epub: EPUB };
const MACP: Propio = { neurona: "mac-1", nombre: "Mac", cap: MAC, epub: EPUB };

function cred(ahora: number, extra: Partial<CredencialesWifi> = {}): CredencialesWifi {
  return { ssid: "StarSeed-ab12", clave: "clave-larga-123", banda: "5", ipAp: "192.168.49.1", puerto: 47071, metodo: "hotspot-local", caduca: ahora + 60_000, ...extra };
}

function enviados(acciones: AccionWifi[]): MensajeWifi[] {
  return acciones.flatMap((a) => (a.a === "enviar" ? [a.msg as MensajeWifi] : []));
}

describe("roles: quién levanta la red", () => {
  it("Android ↔ Mac: el Android con su punto de acceso local y el Mac se une con CoreWLAN", () => {
    const r = elegirRoles({ neurona: "mac-1", cap: MAC }, { neurona: "tel-1", cap: ANDROID });
    expect(r).toEqual({ ap: "tel-1", cliente: "mac-1", metodoAp: "hotspot-local", metodoCliente: "corewlan" });
  });

  it("Android ↔ Android: Wi-Fi Direct en los dos (conservan su Wi-Fi) y punto de acceso la de id menor", () => {
    const a = elegirRoles({ neurona: "b-tel", cap: ANDROID }, { neurona: "a-tel", cap: ANDROID });
    expect(a).toEqual({ ap: "a-tel", cliente: "b-tel", metodoAp: "wifi-direct", metodoCliente: "wifi-direct" });
    expect(elegirRoles({ neurona: "a-tel", cap: ANDROID }, { neurona: "b-tel", cap: ANDROID })).toEqual(a);
  });

  it("es simétrico: las dos neuronas calculan lo mismo", () => {
    expect(elegirRoles({ neurona: "tel-1", cap: ANDROID }, { neurona: "mac-1", cap: MAC })).toEqual(elegirRoles({ neurona: "mac-1", cap: MAC }, { neurona: "tel-1", cap: ANDROID }));
  });

  it("dos Mac, Wi-Fi apagado, permiso denegado o el navegador: nada (se sigue por el enlace de antes)", () => {
    expect(elegirRoles({ neurona: "mac-1", cap: MAC }, { neurona: "mac-2", cap: MAC })).toBeNull();
    expect(elegirRoles({ neurona: "mac-1", cap: MAC }, { neurona: "tel-1", cap: { ...ANDROID, wifi: false } })).toBeNull();
    expect(elegirRoles({ neurona: "mac-1", cap: MAC }, { neurona: "tel-1", cap: { ...ANDROID, permiso: "denegado" } })).toBeNull();
    expect(elegirRoles({ neurona: "mac-1", cap: MAC }, { neurona: "nav", cap: SIN_CAPACIDADES })).toBeNull();
    expect(elegirRoles({ neurona: "x", cap: ANDROID }, { neurona: "x", cap: ANDROID })).toBeNull();
  });

  it("sin punto de acceso local: grupo Wi-Fi Direct y el Mac entra como en cualquier red; sin CoreWLAN, guiado", () => {
    expect(elegirRoles({ neurona: "mac-1", cap: MAC }, { neurona: "tel-1", cap: { ...ANDROID, ap: ["wifi-direct"] } })).toMatchObject({ metodoAp: "wifi-direct", metodoCliente: "corewlan" });
    expect(elegirRoles({ neurona: "mac-1", cap: { ...MAC, cliente: ["guiado"] } }, { neurona: "tel-1", cap: ANDROID })).toMatchObject({ metodoAp: "hotspot-local", metodoCliente: "guiado" });
  });

  it("un Android nunca se une sin preguntar a un punto de acceso normal", () => {
    const soloLocal = { ...ANDROID, ap: ["hotspot-local" as const] };
    expect(elegirRoles({ neurona: "a", cap: soloLocal }, { neurona: "b", cap: soloLocal })).toBeNull();
  });

  it("rolesValidos rechaza lo que no puede cada uno", () => {
    const a = { neurona: "tel-1", cap: ANDROID };
    const b = { neurona: "mac-1", cap: MAC };
    expect(rolesValidos({ ap: "tel-1", cliente: "mac-1", metodoAp: "hotspot-local", metodoCliente: "corewlan" }, a, b)).toBe(true);
    expect(rolesValidos({ ap: "mac-1", cliente: "tel-1", metodoAp: "hotspot-local", metodoCliente: "wifi-direct" }, a, b)).toBe(false);
    expect(rolesValidos({ ap: "tel-1", cliente: "mac-1", metodoAp: "hotspot-local", metodoCliente: "wifi-direct" }, a, b)).toBe(false);
    expect(rolesValidos({ ap: "tel-1", cliente: "otra", metodoAp: "hotspot-local", metodoCliente: "corewlan" }, a, b)).toBe(false);
  });

  it("lee capacidades con lo que no entiende fuera", () => {
    expect(leerCapacidades({ plataforma: "android", ap: ["hotspot-local", "x", "hotspot-local"], cliente: ["corewlan"], permiso: "raro", radio_unica: true, wifi: true })).toEqual({
      plataforma: "android",
      ap: ["hotspot-local"],
      cliente: ["corewlan"],
      permiso: "no-aplica",
      radioUnica: true,
      wifi: true,
    });
    expect(leerCapacidades(null)).toBeNull();
  });
});

describe("mensajes y credenciales", () => {
  const base = { v: 1, sesion: "wfd-1", de: "tel-1", para: "mac-1", ts: 5 };

  it("un `listo` de fase «red» sin sobre cifrado no se acepta jamás", () => {
    expect(leerMensajeWifi({ t: "enlace.wifi.listo", ...base, fase: "red", ssid: "x", clave: "en-claro-123" })).toBeNull();
    const ok = leerMensajeWifi({ t: "enlace.wifi.listo", ...base, fase: "red", cred: { v: 3, iv: "aa", ct: "bb", epk: { ...EPUB, ext: true } } });
    expect(ok).toMatchObject({ fase: "red", cred: { v: 3, epk: EPUB } });
    expect(JSON.stringify(ok)).not.toContain("ext");
  });

  it("una clave pública con su parte privada (`d`) no vale; de = para tampoco", () => {
    expect(leerMensajeWifi({ t: "enlace.wifi.oferta", ...base, cap: ANDROID, epub: { ...EPUB, d: "secreta" }, clase: "archivo" })).toBeNull();
    expect(leerMensajeWifi({ t: "enlace.wifi.oferta", ...base, para: "tel-1", cap: ANDROID, epub: EPUB, clase: "archivo" })).toBeNull();
    expect(leerMensajeWifi({ t: "enlace.wifi.oferta", ...base, cap: ANDROID, epub: EPUB, clase: "rara" })).toMatchObject({ clase: "manual" });
  });

  it("una respuesta que acepta necesita capacidades, roles y clave; un rechazo, solo su motivo", () => {
    expect(leerMensajeWifi({ t: "enlace.wifi.respuesta", ...base, acepta: true, cap: MAC })).toBeNull();
    expect(leerMensajeWifi({ t: "enlace.wifi.respuesta", ...base, acepta: false, motivo: "nunca" })).toMatchObject({ acepta: false, motivo: "nunca" });
    expect(leerMensajeWifi({ t: "enlace.wifi.cierre", ...base, motivo: "inventado" })).toMatchObject({ motivo: "persona" });
  });

  it("el cable lleva el sobre firmado y nada más", () => {
    expect(leerCable('{"t":"enlace.wifi.oferta","s":{"v":2}}')).toEqual({ t: "enlace.wifi.oferta", s: { v: 2 } });
    expect(leerCable('{"t":"nl.hola","s":{}}')).toBeNull();
    expect(leerCable({ t: "enlace.wifi.cierre" })).toBeNull();
  });

  it("valida SSID y contraseña WPA2 como Rust", () => {
    expect(ssidValido("StarSeed-ab12")).toBe(true);
    expect(ssidValido("")).toBe(false);
    expect(ssidValido("a".repeat(33))).toBe(false);
    expect(ssidValido("con\u0000nulo")).toBe(false);
    expect(claveValida("1234567")).toBe(false);
    expect(claveValida("12345678")).toBe(true);
    expect(claveValida("x".repeat(64))).toBe(false);
    expect(claveValida("ñandú-123")).toBe(false);
  });

  it("credenciales caducadas, sin contraseña o con método raro no se usan", () => {
    expect(leerCredenciales(cred(1000), 1000)).toMatchObject({ ssid: "StarSeed-ab12", ipAp: "192.168.49.1" });
    expect(leerCredenciales(cred(1000, { caduca: 999 }), 1000)).toBeNull();
    expect(leerCredenciales({ ...cred(1000), clave: "corta" }, 1000)).toBeNull();
    expect(leerCredenciales({ ...cred(1000), metodo: "otro" }, 1000)).toBeNull();
    expect(leerCredenciales({ ...cred(1000), ipAp: "8.8.8.8" }, 1000)).toMatchObject({ ipAp: null });
  });

  it("solo se negocia con una neurona vinculada (misma huella), ligada o de la malla de la cuenta", () => {
    const vinculos = [{ neurona: "tel-1", huella: "h1" }];
    expect(remitenteDeConfianza({ de: "tel-1", huella: "h1", vinculos, ligaduras: [] })).toBe(true);
    expect(remitenteDeConfianza({ de: "tel-1", huella: "otra", vinculos, ligaduras: [] })).toBe(false);
    expect(remitenteDeConfianza({ de: "tel-2", huella: "h2", vinculos, ligaduras: [{ neurona: "tel-2", huella: "h2" }] })).toBe(true);
    expect(remitenteDeConfianza({ de: "tel-3", huella: "h3", vinculos, ligaduras: [], origen: { tipo: "cuenta" } })).toBe(true);
    expect(remitenteDeConfianza({ de: "tel-3", huella: "h3", vinculos, ligaduras: [], origen: { tipo: "rele" } })).toBe(false);
    expect(remitenteDeConfianza({ de: "tel-1", huella: undefined, vinculos, ligaduras: [] })).toBe(false);
  });
});

/* ══════════════ Máquina de estados: dos neuronas a mano ══════════════ */

interface Lado {
  propio: Propio;
  e: EstadoWifi;
  acciones: AccionWifi[];
}

function lado(propio: Propio): Lado {
  return { propio, e: { ...WIFI_INICIAL }, acciones: [] };
}

function paso(l: Lado, ev: EventoWifi): AccionWifi[] {
  const r = pasoWifi(l.e, ev);
  l.e = r.estado;
  l.acciones.push(...r.acciones);
  return r.acciones;
}

/** Entrega lo que `de` mandó en estas acciones al otro lado. */
function entregar(acciones: AccionWifi[], a: Lado, ahora: number, ajuste: "automatico" | "preguntar" | "nunca" = "automatico"): AccionWifi[] {
  const out: AccionWifi[] = [];
  for (const m of enviados(acciones)) out.push(...paso(a, { t: "recibido", ahora, msg: m, propio: a.propio, ajuste }));
  return out;
}

describe("máquina de estados", () => {
  it("éxito Android (punto de acceso) ↔ Mac (cliente): oferta → respuesta → red → unida → activo", () => {
    const mac = lado(MACP);
    const tel = lado(TEL);
    const a1 = paso(mac, { t: "abrir", ahora: 0, sesion: "wfd-1", otro: "tel-1", clase: "archivo", propio: MACP });
    expect(mac.e.fase).toBe("ofreciendo");
    expect(enviados(a1)[0]).toMatchObject({ t: "enlace.wifi.oferta", de: "mac-1", para: "tel-1", clase: "archivo" });
    const a2 = entregar(a1, tel, 10);
    expect(tel.e.fase).toBe("abriendo-red");
    expect(a2).toContainEqual({ a: "abrir-ap", sesion: "wfd-1", metodo: "hotspot-local" });
    entregar(a2, mac, 20);
    expect(mac.e.fase).toBe("esperando-red");
    expect(mac.e.roles).toMatchObject({ ap: "tel-1", metodoCliente: "corewlan" });
    // La parte nativa del Android levantó la red: las credenciales salen SOLO por la acción de cifrar.
    const a3 = paso(tel, { t: "red-lista", ahora: 3000, cred: cred(3000) });
    expect(tel.e.fase).toBe("esperando-union");
    expect(a3).toEqual([{ a: "enviar-credenciales", cred: cred(3000), epub: EPUB, sesion: "wfd-1", para: "mac-1" }]);
    expect(JSON.stringify(tel.e)).not.toContain("clave-larga-123");
    // El Mac descifra (lo hace el motor) y se une.
    const a4 = paso(mac, { t: "credenciales", ahora: 3100, sesion: "wfd-1", cred: cred(3000) });
    expect(a4).toEqual([{ a: "unirse", sesion: "wfd-1", metodo: "corewlan", cred: cred(3000) }]);
    expect(mac.e.fase).toBe("uniendo");
    expect(JSON.stringify(mac.e)).not.toContain("clave-larga-123");
    const a5 = paso(mac, { t: "unida", ahora: 9000, ipPropia: "192.168.49.23", mbps: 433.2 });
    expect(mac.e).toMatchObject({ fase: "activo", ipPropia: "192.168.49.23", ipOtro: "192.168.49.1", mbps: 433 });
    expect(a5).toContainEqual({ a: "activo", sesion: "wfd-1" });
    entregar(a5, tel, 9010);
    expect(tel.e).toMatchObject({ fase: "activo", ipOtro: "192.168.49.23", ipPropia: "192.168.49.1", mbps: 433 });
  });

  it("plazo: sin respuesta en 15 s se cierra y se sigue por el enlace de antes", () => {
    const mac = lado(MACP);
    paso(mac, { t: "abrir", ahora: 0, sesion: "wfd-2", otro: "tel-1", clase: "llamada", propio: MACP });
    expect(paso(mac, { t: "tic", ahora: PLAZOS_WIFI.respuesta - 1 })).toEqual([]);
    const a = paso(mac, { t: "tic", ahora: PLAZOS_WIFI.respuesta });
    expect(mac.e.fase).toBe("fallido");
    expect(a.find((x) => x.a === "respaldo")).toBeTruthy();
    expect(enviados(a)[0]).toMatchObject({ t: "enlace.wifi.cierre", motivo: "plazo" });
    expect(a.some((x) => x.a === "cerrar-nativo")).toBe(false); // nada nativo arrancó
  });

  it("plazo del punto de acceso esperando al cliente: apaga la red", () => {
    const tel = lado(TEL);
    entregar([{ a: "enviar", msg: { t: "enlace.wifi.oferta", v: 1, sesion: "s", de: "mac-1", para: "tel-1", ts: 0, cap: MAC, epub: EPUB, clase: "archivo" } }], tel, 0);
    paso(tel, { t: "red-lista", ahora: 1000, cred: cred(1000) });
    const a = paso(tel, { t: "tic", ahora: 1000 + PLAZOS_WIFI.esperarUnion });
    expect(tel.e.fase).toBe("fallido");
    expect(a).toContainEqual({ a: "cerrar-nativo", sesion: "s" });
  });

  it("rechazo: con «Nunca» la otra contesta que no y quien ofreció cae al respaldo con el motivo", () => {
    const mac = lado(MACP);
    const tel = lado(TEL);
    const a1 = paso(mac, { t: "abrir", ahora: 0, sesion: "s3", otro: "tel-1", clase: "archivo", propio: MACP });
    const a2 = entregar(a1, tel, 5, "nunca");
    expect(tel.e.fase).toBe("inactivo");
    expect(enviados(a2)[0]).toMatchObject({ t: "enlace.wifi.respuesta", acepta: false, motivo: "nunca" });
    const a3 = entregar(a2, mac, 6);
    expect(mac.e).toMatchObject({ fase: "fallido", codigo: "nunca", motivo: TEXTO_RECHAZO.nunca });
    expect(a3.find((x) => x.a === "respaldo")).toMatchObject({ motivo: expect.stringContaining("Se sigue por el enlace de antes") });
  });

  it("rechazo por capacidad: dos Mac no pueden y lo dicen", () => {
    const m1 = lado(MACP);
    const m2 = lado({ ...MACP, neurona: "mac-2" });
    const a2 = entregar(paso(m1, { t: "abrir", ahora: 0, sesion: "s", otro: "mac-2", clase: "archivo", propio: MACP }), m2, 1);
    expect(enviados(a2)[0]).toMatchObject({ acepta: false, motivo: "sin-capacidad" });
  });

  it("«Preguntar»: la persona decide; sin decisión a tiempo es un no", () => {
    const tel = lado(TEL);
    const oferta: AccionWifi = { a: "enviar", msg: { t: "enlace.wifi.oferta", v: 1, sesion: "s4", de: "mac-1", para: "tel-1", ts: 0, cap: MAC, epub: EPUB, clase: "pantalla", nombre: "Mac" } };
    const a = entregar([oferta], tel, 0, "preguntar");
    expect(tel.e.fase).toBe("decidiendo");
    expect(a).toEqual([{ a: "preguntar-persona", sesion: "s4", otro: "mac-1", nombreOtro: "Mac", clase: "pantalla" }]);
    const b = paso(tel, { t: "persona", ahora: 100, acepta: true, propio: TEL });
    expect(tel.e.fase).toBe("abriendo-red");
    expect(enviados(b)[0]).toMatchObject({ acepta: true, roles: { ap: "tel-1" } });

    const otro = lado(TEL);
    entregar([oferta], otro, 0, "preguntar");
    const c = paso(otro, { t: "tic", ahora: PLAZOS_WIFI.persona });
    expect(otro.e.fase).toBe("cerrado");
    expect(enviados(c)[0]).toMatchObject({ acepta: false, motivo: "persona", de: "tel-1", para: "mac-1" });
  });

  it("permiso denegado al levantar la red: cierre al otro, radio apagada y respaldo", () => {
    const mac = lado(MACP);
    const tel = lado(TEL);
    entregar(entregar(paso(mac, { t: "abrir", ahora: 0, sesion: "s5", otro: "tel-1", clase: "archivo", propio: MACP }), tel, 1), mac, 2);
    const a = paso(tel, { t: "error-nativo", ahora: 50, codigo: "permiso-denegado", texto: "Android no dio «Dispositivos cercanos»" });
    expect(tel.e).toMatchObject({ fase: "fallido", codigo: "permiso-denegado" });
    expect(a).toContainEqual({ a: "cerrar-nativo", sesion: "s5" });
    entregar(a, mac, 60);
    expect(mac.e.fase).toBe("fallido");
    expect(mac.acciones.some((x) => x.a === "respaldo")).toBe(true);
  });

  it("credenciales que no se descifran: no se intenta unir y se avisa", () => {
    const mac = lado(MACP);
    const tel = lado(TEL);
    entregar(entregar(paso(mac, { t: "abrir", ahora: 0, sesion: "s6", otro: "tel-1", clase: "archivo", propio: MACP }), tel, 1), mac, 2);
    const a = paso(mac, { t: "credenciales-invalidas", ahora: 3, sesion: "s6" });
    expect(mac.e.codigo).toBe("credenciales");
    expect(a.some((x) => x.a === "unirse")).toBe(false);
    expect(enviados(a)[0]).toMatchObject({ t: "enlace.wifi.cierre", motivo: "credenciales" });
  });

  it("cruce de ofertas: queda la de la neurona de id menor y la otra la atiende", () => {
    const mac = lado(MACP); // «mac-1» > «a-tel»
    const tel = lado({ ...TEL, neurona: "a-tel" });
    const om = paso(mac, { t: "abrir", ahora: 0, sesion: "sm", otro: "a-tel", clase: "archivo", propio: MACP });
    const ot = paso(tel, { t: "abrir", ahora: 0, sesion: "st", otro: "mac-1", clase: "archivo", propio: tel.propio });
    // La de «a-tel» gana: el Mac olvida la suya y contesta; «a-tel» ignora la del Mac.
    const rm = entregar(ot, mac, 1);
    expect(enviados(rm)[0]).toMatchObject({ t: "enlace.wifi.respuesta", sesion: "st", acepta: true });
    expect(entregar(om, tel, 1)).toEqual([]);
    expect(tel.e.sesion).toBe("st");
  });

  it("ocupada con otra neurona: la segunda oferta se rechaza", () => {
    const tel = lado(TEL);
    entregar([{ a: "enviar", msg: { t: "enlace.wifi.oferta", v: 1, sesion: "s1", de: "mac-1", para: "tel-1", ts: 0, cap: MAC, epub: EPUB, clase: "archivo" } }], tel, 0);
    const a = entregar([{ a: "enviar", msg: { t: "enlace.wifi.oferta", v: 1, sesion: "s2", de: "mac-2", para: "tel-1", ts: 0, cap: MAC, epub: EPUB, clase: "archivo" } }], tel, 1);
    expect(enviados(a)[0]).toMatchObject({ para: "mac-2", acepta: false, motivo: "ocupada" });
    expect(tel.e.sesion).toBe("s1");
  });

  it("activo: sin uso 5 minutos se cierra solo; con uso sigue; el cierre del otro no es un fallo", () => {
    const mac = lado(MACP);
    const tel = lado(TEL);
    entregar(entregar(paso(mac, { t: "abrir", ahora: 0, sesion: "s7", otro: "tel-1", clase: "archivo", propio: MACP }), tel, 1), mac, 2);
    paso(tel, { t: "red-lista", ahora: 10, cred: cred(10) });
    paso(mac, { t: "credenciales", ahora: 11, sesion: "s7", cred: cred(10) });
    entregar(paso(mac, { t: "unida", ahora: 20, ipPropia: "192.168.49.5" }), tel, 21);
    paso(mac, { t: "uso", ahora: 1000 });
    expect(paso(mac, { t: "tic", ahora: 20 + INACTIVIDAD_WIFI_MS })).toEqual([]);
    const a = paso(mac, { t: "tic", ahora: 1000 + INACTIVIDAD_WIFI_MS });
    expect(mac.e).toMatchObject({ fase: "cerrado", codigo: "inactivo" });
    expect(a).toContainEqual({ a: "cerrar-nativo", sesion: "s7" });
    expect(a.some((x) => x.a === "respaldo")).toBe(false);
    entregar(a, tel, 2000);
    expect(tel.e).toMatchObject({ fase: "cerrado" });
    expect(tel.acciones).toContainEqual({ a: "cerrar-nativo", sesion: "s7" });
  });

  it("mensajes de otra sesión o para otra neurona no mueven nada", () => {
    const mac = lado(MACP);
    paso(mac, { t: "abrir", ahora: 0, sesion: "s8", otro: "tel-1", clase: "archivo", propio: MACP });
    const antes = mac.e;
    paso(mac, { t: "recibido", ahora: 1, propio: MACP, ajuste: "automatico", msg: { t: "enlace.wifi.cierre", v: 1, sesion: "otra", de: "tel-1", para: "mac-1", ts: 1, motivo: "persona" } });
    paso(mac, { t: "recibido", ahora: 1, propio: MACP, ajuste: "automatico", msg: { t: "enlace.wifi.cierre", v: 1, sesion: "s8", de: "tel-1", para: "mac-9", ts: 1, motivo: "persona" } });
    expect(mac.e).toBe(antes);
  });
});
