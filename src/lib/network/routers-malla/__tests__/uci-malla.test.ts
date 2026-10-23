import { describe, expect, it } from "vitest";

import { guionAplicar, uciMalla, type BandaWifi, type CfgUciMalla } from "../uci-malla";

const CLAVE_MALLA = "malla-secreta-123";
const CLAVE_AP = "wifi-casa-456";

const cfg = (banda: BandaWifi = "5g", anchoMhz = 80, extra: Partial<CfgUciMalla> = {}): CfgUciMalla => ({
  router: "Salón", meshId: "starseed-malla", claveMalla: CLAVE_MALLA, region: "es", cliente: { canal: 6, ssid: "StarSeed", clave: CLAVE_AP },
  troncal: { banda, canal: banda === "2g" ? 1 : 36, anchoMhz, pireDbm: 23.7 }, ...extra,
});

/** Secciones UCI por nombre: «config tipo 'nombre'» → sus líneas de opción, sin sangría. */
function secciones(texto: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const bloque of texto.trim().split(/\n\s*\n/)) {
    const [cabecera, ...resto] = bloque.split("\n");
    out[/'([^']+)'$/.exec(cabecera)?.[1] ?? ""] = resto.map((l) => l.trim());
  }
  return out;
}

describe("uciMalla", () => {
  it("troncal 5g: radio con canal, htmode y country; malla 802.11s cifrada para batman-adv", () => {
    const w = secciones(uciMalla(cfg()).wireless);
    expect(w.radio_troncal).toEqual(expect.arrayContaining(["option band '5g'", "option channel '36'", "option htmode 'VHT80'",
      "option country 'ES'", "option txpower '23'"]));
    expect(w.malla0).toEqual([
      "option device 'radio_troncal'", "option mode 'mesh'", "option mesh_id 'starseed-malla'",
      "option encryption 'sae'", `option key '${CLAVE_MALLA}'`, "option mesh_fwding '0'", "option network 'bat0_hardif_mesh'",
    ]);
    expect(w.radio_cliente).toEqual(expect.arrayContaining(["option band '2g'", "option channel '6'", "option country 'ES'"]));
    expect(w.ap0).toEqual(expect.arrayContaining(["option device 'radio_cliente'", "option mode 'ap'", "option ssid 'StarSeed'",
      `option key '${CLAVE_AP}'`, "option network 'lan'"]));
  });

  it("network: bat0 BATMAN_V, la hardif con master bat0 y bat0 dentro de br-lan", () => {
    const n = secciones(uciMalla(cfg()).network);
    expect(n.bat0).toEqual(expect.arrayContaining(["option proto 'batadv'", "option routing_algo 'BATMAN_V'"]));
    expect(n.bat0_hardif_mesh).toEqual(expect.arrayContaining(["option proto 'batadv_hardif'", "option master 'bat0'"]));
    expect(n.br_lan).toEqual(["option name 'br-lan'", "option type 'bridge'", "list ports 'bat0'"]);
  });

  it.each([
    ["6g", 160, "HE160"], ["6g", 80, "HE80"], ["5g", 80, "VHT80"], ["5g", 60, "VHT40"], ["5g", 10, "VHT20"],
    ["2g", 40, "HT40"], ["2g", 20, "HT20"], ["2g", 80, "HT40"],
  ] as Array<[BandaWifi, number, string]>)("htmode de %s a %i MHz = %s", (banda, ancho, esperado) => {
    expect(secciones(uciMalla(cfg(banda, ancho)).wireless).radio_troncal).toContain(`option htmode '${esperado}'`);
  });

  it.each(["us", "FR", " jp "])("el país sale de la región %j en mayúsculas y sin espacios", (region) => {
    expect(secciones(uciMalla(cfg("5g", 80, { region })).wireless).radio_troncal)
      .toContain(`option country '${region.trim().toUpperCase()}'`);
  });

  it("troncal en 2,4 GHz: una sola radio y el AP comparte su canal", () => {
    const w = secciones(uciMalla(cfg("2g", 20)).wireless);
    expect(w.radio_cliente).toBeUndefined();
    expect(w.ap0).toContain("option device 'radio_troncal'");
    expect(guionAplicar(cfg("2g", 20))).not.toContain("RC=");
  });

  it("escapa la comilla simple como uci export", () => {
    expect(uciMalla(cfg("5g", 80, { claveMalla: "ab'cdefgh" })).wireless).toContain("option key 'ab'\\''cdefgh'");
  });

  const troncal = (t: Partial<CfgUciMalla["troncal"]>): Partial<CfgUciMalla> => ({ troncal: { ...cfg().troncal, ...t } });
  it.each([
    [{ region: "EU" }, /país/], [{ meshId: "x".repeat(33) }, /32 bytes/], [{ claveMalla: "corta-1" }, /8 a 63/],
    [{ cliente: { canal: 6, ssid: "S", clave: "lin\nea-larga" } }, /8 a 63/], [{ cliente: { canal: 36, ssid: "S", clave: CLAVE_AP } }, /en 2g/],
    [troncal({ banda: "5g; reboot" as BandaWifi }), /2g, 5g o 6g/], [troncal({ canal: 6 }), /canal 6 no existe en 5g/],
    [troncal({ pireDbm: Number.NaN }), /PIRE/], [troncal({ pireDbm: 40 }), /PIRE/],
  ] as Array<[Partial<CfgUciMalla>, RegExp]>)("rechaza la entrada no válida %# sin enseñar ninguna clave", (extra, motivo) => {
    const e = cfg("5g", 80, extra);
    expect(() => uciMalla(e)).toThrow(motivo);
    for (const clave of [e.claveMalla, e.cliente.clave]) expect(() => uciMalla(e)).not.toThrow(clave);
  });
});

describe("guionAplicar", () => {
  const g = guionAplicar(cfg());
  const pos = (t: string): number => { const i = g.indexOf(t); expect(i, t).toBeGreaterThanOrEqual(0); return i; };

  it("hace la copia y comprueba radios y br-lan antes de instalar o escribir nada", () => {
    const copia = pos("cp -p /etc/config/$f /etc/config/$f.antes-starseed");
    expect(g).toContain("for f in wireless network; do");
    const comprobado = pos("fallo \"la LAN no es el puente br-lan");
    expect(copia).toBeLessThan(pos("RT=$(radio 5g)"));
    for (const paso of ["opkg update", "opkg install", "opkg remove", "cat > /etc/config/wireless", "uci add_list",
      "cat >> /etc/config/network", "wifi reload", "/etc/init.d/network restart"]) expect(comprobado).toBeLessThan(pos(paso));
  });

  it("empieza por sh y lleva al router la malla hardif completa, no solo bat0", () => {
    expect(g.startsWith("#!/bin/sh\n")).toBe(true);
    expect(g).toContain("config interface 'bat0_hardif_mesh'");
    expect(g).toContain("option master 'bat0'");
    expect(g).toContain("option mtu '1536'");
  });

  it("instala batman-adv, cambia wpad sin quedarse sin él, escribe con heredoc y reinicia al final", () => {
    expect(pos("opkg install kmod-batman-adv batctl-default")).toBeLessThan(pos("opkg download wpad-mesh-mbedtls $V"));
    expect(pos("opkg download wpad-mesh-mbedtls")).toBeLessThan(pos('opkg remove "$p"'));
    expect(g).toContain('opkg install ./"$p"_*.ipk; done; fallo');
    expect(g).toContain(`cat > /etc/config/wireless <<'STARSEED_FIN'\n${uciMalla(cfg()).wireless}STARSEED_FIN\n`);
    expect(g).toContain("cat >> /etc/config/network <<'STARSEED_FIN'\n\nconfig interface 'bat0'\n");
    expect(g).not.toContain("config device 'br_lan'"); // bat0 entra en el br-lan que ya hay, que conserva sus puertos y opciones
    expect(pos('uci add_list "network.$B.ports=bat0"')).toBeGreaterThan(pos('uci -q del_list "network.$B.ports=bat0"'));
    expect(pos('uci set wireless.radio_troncal.path="$RT"')).toBeGreaterThan(pos("cat > /etc/config/wireless"));
    expect(g.trimEnd().split("\n").slice(-3)).toEqual(["wifi reload", "/etc/init.d/network restart", ")"]);
  });

  it("deja cómo volver y vuelve sola en 5 minutos si nadie confirma, aunque se corte el SSH", () => {
    expect(g).toContain("'cp /etc/config/network.antes-starseed /etc/config/network'");
    const temporizador = pos("( trap '' HUP; sleep 300; [ -f \"$T\" ] && rm -f \"$T\" && sh /root/starseed-volver.sh )");
    expect(temporizador).toBeGreaterThan(pos("> /root/starseed-volver.sh"));
    expect(temporizador).toBeLessThan(g.lastIndexOf("wifi reload"));
    expect(g).toContain("rm /tmp/starseed-pendiente-*");
  });

  it("las claves solo van en sus líneas «option key»: ni en comentarios ni en nombres; sin tabuladores", () => {
    for (const clave of [CLAVE_MALLA, CLAVE_AP]) {
      expect(g.split(clave).length - 1).toBe(1);
      expect(g.split("\n").find((l) => l.includes(clave))?.trim()).toBe(`option key '${clave}'`);
    }
    expect(g).not.toContain("\t");
    const raro = guionAplicar(cfg("5g", 80, { router: "Torre\nrm -rf /" })).split("\n");
    expect(raro.filter((l) => l.includes("Torre")).every((l) => l.startsWith("#"))).toBe(true);
    expect(raro.some((l) => l.startsWith("rm"))).toBe(false);
  });
});
