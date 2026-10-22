/** Routers como titanio de la malla (§8 «Tras OpenWrt» de architecture/malla-cristalina-sio2.md): UCI de 802.11s +
 * batman-adv (BATMAN_V) y el guion sh que lo aplica por SSH. Puro: sin red, sin disco ni `node:*`. Pide OpenWrt 23.05 o
 * 24.10 (opkg, wpad-mesh-mbedtls, radios con `band`, puente `config device` br-lan); las de apk aún no. SIN PROBAR
 * en un router real: solo vitest sobre el texto. Sangría con espacios: un tabulador pegado dispara el autocompletado. */
import { uciPuerta, uciClientePuerta, guionGuardianTope, type CfgPuerta } from './uci-puerta';
import { restanteParaOtrosMb, TIPOS_PUERTA, type PuertaInternet } from '../../malla/cristal/puertas-internet';

export type BandaWifi = "2g" | "5g" | "6g";
export interface TroncalUci { banda: BandaWifi; canal: number; anchoMhz: number; pireDbm: number }
export interface ClienteUci { canal: number; ssid: string; clave: string }
/** Puerta de internet declarada en el router (§8.1) con el tope del dueño que necesita el guardián. */
export interface CfgPuertaMalla extends CfgPuerta { topeMensualMb?: number; reservaDuenoPct?: number }
export interface CfgUciMalla { router: string; meshId: string; claveMalla: string; region: string; troncal: TroncalUci; cliente: ClienteUci; puerta?: CfgPuertaMalla }
export interface UciMalla { wireless: string; network: string; firewall?: string }
type Opciones = Array<[string, string | number]>;

const ANCHOS: Record<BandaWifi, number[]> = { "2g": [20, 40], "5g": [20, 40, 80, 160], "6g": [20, 40, 80, 160] };
const PREFIJO: Record<BandaWifi, string> = { "2g": "HT", "5g": "VHT", "6g": "HE" };
/** Canales que existen en cada banda; la tabla legal fina por región (DFS, PIRE) la aplica plan-radios. */
const CANALES: Record<BandaWifi, [number, number]> = { "2g": [1, 14], "5g": [32, 177], "6g": [1, 233] };

/** htmode: el mayor ancho que admite la banda sin pasarse del pedido (2,4 GHz no llega a 80). */
const htmode = (b: BandaWifi, mhz: number): string => `${PREFIJO[b]}${ANCHOS[b].filter((a) => a <= mhz).pop() ?? 20}`;
/** Valor UCI entre comillas simples; una comilla dentro va como '\'' (igual que `uci export`). */
const q = (v: string | number): string => `'${String(v).replace(/'/g, "'\\''")}'`;
const seccion = (tipo: string, nombre: string, opciones: Opciones, puertos: string[] = []): string => [`config ${tipo} ${q(nombre)}`,
  ...opciones.map(([k, v]) => `    option ${k} ${q(v)}`), ...puertos.map((p) => `    list ports ${q(p)}`)].join("\n");
const control = (s: string): boolean => [...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);
const corto = (s: string): boolean => s.length > 0 && !control(s) && new TextEncoder().encode(s).length <= 32;

/** Rechaza lo que el router no aceptaría o aceptaría mal: mejor un error claro que una malla muda. */
function validar(e: CfgUciMalla): string {
  const pais = e.region.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(pais) || pais === "EU") throw new Error(`La región del router debe ser su país en dos letras (ES, FR, US…): «${e.region}» no lo es`);
  if (!corto(e.meshId) || !corto(e.cliente.ssid)) throw new Error("meshId y ssid: de 1 a 32 bytes, sin caracteres de control");
  const wpa = /^[\x20-\x7e]{8,63}$/;
  if (!wpa.test(e.claveMalla) || !wpa.test(e.cliente.clave)) throw new Error("Las claves: de 8 a 63 caracteres ASCII imprimibles");
  // La banda acaba dentro del guion sh: solo pasan las tres conocidas (un JSON guardado podría traer otra cosa)
  if (!Object.keys(PREFIJO).includes(e.troncal.banda)) throw new Error("La banda de la troncal debe ser 2g, 5g o 6g");
  for (const item of [[e.troncal.banda, e.troncal.canal], ["2g", e.cliente.canal]] as Array<[BandaWifi, number]>)
    if (!Number.isInteger(item[1]) || item[1] < CANALES[item[0]][0] || item[1] > CANALES[item[0]][1]) throw new Error(`El canal ${item[1]} no existe en ${item[0]}`);
  if (!(e.troncal.pireDbm >= 0 && e.troncal.pireDbm <= 36)) throw new Error("La PIRE de la troncal: de 0 a 36 dBm");
  return pais;
}

/** Interfaces de batman-adv: bat0 (BATMAN_V) y la malla como su hardif (MTU ≥ 1532 para tramas de 1500).
 * Con puerta declarada (§8.1), el titanio la anuncia: bat0 va en `gw_mode server` con el ancho medido. */
const interfacesBat = (gw?: { bajadaKbps: number; subidaKbps: number }): string[] => {
  const opciones: Array<[string, string | number]> = [["proto", "batadv"], ["routing_algo", "BATMAN_V"],
    ["bridge_loop_avoidance", "1"], ["distributed_arp_table", "1"]];
  if (gw) opciones.push(["gw_mode", "server"], ["gw_bandwidth", `${gw.bajadaKbps}kbit/${gw.subidaKbps}kbit`]);
  return [seccion("interface", "bat0", opciones),
    seccion("interface", "bat0_hardif_mesh", [["proto", "batadv_hardif"], ["master", "bat0"], ["mtu", "1536"]])];
};

/** La puerta declarada (§8.1): el tipo debe constar en la lista del contrato; el satélite ya está
 * fuera por el tipo de `CfgPuerta` (hoy sin UCI que lo genere). */
function validarPuerta(p: CfgPuertaMalla): CfgPuerta {
  if (!(TIPOS_PUERTA as readonly string[]).includes(p.tipo)) {
    throw new Error(`El tipo de puerta «${p.tipo}» no está en la lista del contrato (§8.1)`);
  }
  return p;
}

/** Interfaces UCI de la puerta, sin repetir bat0 (lo lleva `interfacesBat`). */
function redPuerta(p: CfgPuertaMalla): { network: string; firewall: string } {
  const salida = uciPuerta(p, { conBat: false });
  return { network: salida.network, firewall: salida.firewall };
}

/** Guion guardián de la puerta (§8.1): un guardián en el router cuenta los bytes y deja de anunciar
 * la puerta al llegar al tope del dueño — exactamente cuando `restanteParaOtrosMb` llega a cero
 * (reserva del dueño 20 % editable); vuelve con el mes nuevo. Puerta sin tope: no hay guardián. */
export function guardianDePuerta(
  p: Pick<CfgPuertaMalla, "tipo" | "bajadaKbps" | "subidaKbps" | "topeMensualMb" | "reservaDuenoPct">,
  interfaz?: string,
): string | null {
  // La puerta declarada en la tesela (`PuertaInternet`): sin tope no hay medida, y sin medida no hay guardián
  const declarada: PuertaInternet = {
    id: "puerta", neurona: "-", cuenta: "-", tipo: p.tipo,
    bajadaKbps: p.bajadaKbps, subidaKbps: p.subidaKbps, latenciaMs: 0,
    medida: p.topeMensualMb !== undefined, topeMensualMb: p.topeMensualMb,
    reservaDuenoPct: p.reservaDuenoPct, compartir: "nadie",
  };
  if (restanteParaOtrosMb(declarada) === null) return null;
  const ifaz = interfaz ?? (p.tipo === "cable" ? "wan" : "wwan");
  return guionGuardianTope({
    interfaz: ifaz, topeMb: p.topeMensualMb ?? 0, reservaPct: p.reservaDuenoPct ?? 20,
    bajadaKbps: p.bajadaKbps, subidaKbps: p.subidaKbps,
  });
}

/** Genera la configuración completa de la malla (§8). Incluye la puerta de internet opcional (§8.1)
 * si la configuración incluye los parámetros de puerta. */
export function uciMalla(e: CfgUciMalla): UciMalla {
  const country = validar(e), { troncal: t, cliente: c } = e;
  const p = e.puerta ? validarPuerta(e.puerta) : null;
  const unaRadio = t.banda === "2g"; // troncal en 2,4 GHz = una sola radio: el AP comparte su canal
  // txpower es potencia en el conector: igualarla a la PIRE legal supone una antena de 0 dBi.
  const radios = [seccion("wifi-device", "radio_troncal", [["type", "mac80211"], ["band", t.banda], ["channel", t.canal],
    ["htmode", htmode(t.banda, t.anchoMhz)], ["country", country], ["txpower", Math.floor(t.pireDbm)]])];
  if (!unaRadio) radios.push(seccion("wifi-device", "radio_cliente", [["type", "mac80211"], ["band", "2g"],
    ["channel", c.canal], ["htmode", "HT20"], ["country", country]]));
  const malla = seccion("wifi-iface", "malla0", [["device", "radio_troncal"], ["mode", "mesh"], ["mesh_id", e.meshId],
    ["encryption", "sae"], ["key", e.claveMalla], ["mesh_fwding", "0"], ["network", "bat0_hardif_mesh"]]);
  const ap = seccion("wifi-iface", "ap0", [["device", unaRadio ? "radio_troncal" : "radio_cliente"], ["mode", "ap"],
    ["ssid", c.ssid], ["encryption", "sae-mixed"], ["key", c.clave], ["network", "lan"]]);
  const red = p ? redPuerta(p) : null;
  const network = [
    ...interfacesBat(p ? { bajadaKbps: p.bajadaKbps, subidaKbps: p.subidaKbps } : undefined),
    seccion("device", "br_lan", [["name", "br-lan"], ["type", "bridge"]], ["bat0"]),
  ];
  const wireless = `${[...radios, malla, ap].join("\n\n")}\n`;
  return {
    wireless,
    network: red ? `${network.join("\n\n")}\n\n${red.network}` : `${network.join("\n\n")}\n`,
    ...(red ? { firewall: red.firewall } : {}),
  };
}

/** `uciPuerta(e)` genera la configuración UCI para una puerta de internet (§8.1): móvil (4G/5G), Wi-Fi externo,
 * USB teléfono o cable. Devuelve {network, firewall} con la interfaz wwan, bat0 en modo server con gw_bandwidth,
 * y zona firewall wwan con masq y forwarding desde lan. Re-exportada desde uci-puerta. */
export { uciPuerta };

/** `uciClientePuerta()` configura bat0 en modo client (§8.1). Re-exportada desde uci-puerta.
 * En BATMAN_V, `gw_sel_class` es la mejora mínima en kbit/s para cambiar de puerta. */
export { uciClientePuerta };

/** `guionGuardianTope(e)` genera el guion sh para /etc/starseed/guardian-puerta.sh + línea de cron cada 5 min (§8.1).
 * Suma rx+tx de /sys/class/net/<if>/statistics, guarda el último bruto y acumula por mes en /etc/starseed/uso-puerta-AAAAMM
 * (si el bruto baja, fue un reinicio: suma el bruto); al llegar a tope × (1 − reserva) hace `batctl gw_mode client`
 * y lo anota con `logger`; con el mes nuevo vuelve a `batctl gw_mode server <bw>`. Ninguna clave en comentarios.
 * Re-exportada desde uci-puerta. */
export { guionGuardianTope };

/** Guion sh para pegar por SSH: copia, comprobaciones, paquetes, configuración y vuelta atrás sola en 5 min.
 * Con puerta declarada (§8.1) también aplica su red, su firewall y el guardián del tope con su cron. */
export function guionAplicar(cfg: CfgUciMalla): string {
  const { wireless } = uciMalla(cfg);
  const puertaAplicar = cfg.puerta
    ? { red: redPuerta(cfg.puerta), guardian: guardianDePuerta(cfg.puerta) }
    : null;
  const gw = cfg.puerta ? { bajadaKbps: cfg.puerta.bajadaKbps, subidaKbps: cfg.puerta.subidaKbps } : undefined;
  const dos = cfg.troncal.banda !== "2g";
  const radio = (b: BandaWifi, v: string): string => `${v}=$(radio ${b}) || fallo "no encuentro la radio de ${b} con su path"`;
  return String.raw`#!/bin/sh
# StarSeed: adopta «${limpio(cfg.router)}» como titanio de la malla (802.11s + batman-adv). Aún sin probar en un router real.
(
fallo() { echo "StarSeed: $1"; exit 1; }
# 1. Copia de seguridad antes de tocar nada; la primera se conserva porque es la original
for f in wireless network; do
  [ -f /etc/config/$f.antes-starseed ] || cp -p /etc/config/$f /etc/config/$f.antes-starseed || fallo "no pude copiar $f"
done
# 2. Comprobaciones sin cambiar nada: radio por banda (su path la ata al chip) y LAN = puente br-lan
radio() { for s in $(uci -q show wireless | sed -n 's/^wireless\.\([^.=]*\)=wifi-device$/\1/p'); do
  [ "$(uci -q get "wireless.$s.band")" = "$1" ] && uci -q get "wireless.$s.path" && return 0; done; return 1; }
${radio(cfg.troncal.banda, "RT")}${dos ? `\n${radio("2g", "RC")}` : ""}
B=$(uci -q show network | sed -n "s/^network\.\([^.=]*\)\.name='br-lan'$/\1/p" | head -n 1)
[ -n "$B" ] && [ "$(uci -q get "network.$B.type")" = bridge ] && [ "$(uci -q get network.lan.device)" = br-lan ] ||
  fallo "la LAN no es el puente br-lan (config device) de OpenWrt 21.02+: no toco nada"
# 3. Paquetes: batman-adv primero; wpad-mesh se baja ANTES de quitar el wpad de ahora (y si falla, vuelve el de antes)
command -v opkg >/dev/null || fallo "este OpenWrt no tiene opkg (las versiones con apk aún no están cubiertas)"
opkg update || fallo "opkg update falló (¿sin internet?): solo se hizo la copia"
opkg install kmod-batman-adv batctl-default || fallo "no pude instalar batman-adv: solo se hizo la copia"
V=$(opkg list-installed | sed -n 's/^\(wpad[^ ]*\) .*/\1/p')
if [ "$V" != wpad-mesh-mbedtls ]; then
  rm -rf /tmp/starseed-ipk; mkdir /tmp/starseed-ipk && cd /tmp/starseed-ipk && opkg download wpad-mesh-mbedtls $V || fallo "no pude bajar wpad-mesh-mbedtls"
  for p in $V; do opkg remove "$p"; done
  opkg install ./wpad-mesh-mbedtls_*.ipk || { for p in $V; do opkg install ./"$p"_*.ipk; done; fallo "wpad-mesh-mbedtls no entró: vuelve el wpad de antes"; }
fi
# 4. Configuración: wireless entera; en network, batman-adv y bat0 como un puerto más del br-lan (sin rehacerlo)
cat > /etc/config/wireless <<'STARSEED_FIN'
${wireless.trimEnd()}
STARSEED_FIN
uci set wireless.radio_troncal.path="$RT"${dos ? `; uci set wireless.radio_cliente.path="$RC"` : ""}; uci commit wireless
uci -q delete network.bat0; uci -q delete network.bat0_hardif_mesh
uci -q del_list "network.$B.ports=bat0"; uci add_list "network.$B.ports=bat0"; uci commit network
cat >> /etc/config/network <<'STARSEED_FIN'

${interfacesBat(gw).join("\n\n")}${puertaAplicar ? `\n\n${puertaAplicar.red.network.trimEnd()}` : ""}
STARSEED_FIN${puertaAplicar ? `
cat >> /etc/config/firewall <<'STARSEED_FIN'

${puertaAplicar.red.firewall.trimEnd()}
STARSEED_FIN
mkdir -p /etc/starseed
cat > /etc/starseed/guardian-puerta.sh <<'STARSEED_GUARDIAN'
${puertaAplicar.guardian?.trimEnd() ?? "# puerta sin tope declarada: sin guardián (la tesela dice qué se comparte)"}
STARSEED_GUARDIAN
crontab -l 2>/dev/null | grep -v guardian-puerta.sh
{ crontab -l 2>/dev/null; echo '*/5 * * * * sh /etc/starseed/guardian-puerta.sh'; } | crontab -` : ""}
# 5. Vuelta atrás: a mano cuando quieras, y sola en 5 minutos si no confirmas (como «aplicar» de LuCI)
printf '%s\n' 'cp /etc/config/wireless.antes-starseed /etc/config/wireless' 'cp /etc/config/network.antes-starseed /etc/config/network' \
  'wifi reload; /etc/init.d/network restart' > /root/starseed-volver.sh
T=/tmp/starseed-pendiente-$(date +%s); touch "$T"
( trap '' HUP; sleep 300; [ -f "$T" ] && rm -f "$T" && sh /root/starseed-volver.sh ) </dev/null >/dev/null 2>&1 &
echo "StarSeed: listo. Si sigues entrando al router, confírmalo antes de 5 min: rm /tmp/starseed-pendiente-* (si no, vuelve solo a la copia)."
echo "StarSeed: para volver cuando quieras: sh /root/starseed-volver.sh. Si no es la pasarela, apaga su DHCP (uci set dhcp.lan.ignore=1) y dale otra IP."
wifi reload
/etc/init.d/network restart
)
`;
}

/** Nombre apto para un comentario: sin saltos, comillas ni nada que el shell interprete. */
const limpio = (s: string): string => s.replace(/[^0-9A-Za-zÀ-ÿ ._-]/g, "").slice(0, 40).trim() || "router";