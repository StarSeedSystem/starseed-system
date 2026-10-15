/**
 * UCI config for OpenWrt mesh nodes (§8). Pure module.
 */

export interface TroncalConfig { banda: '2g'|'5g'|'6g'; canal: number; anchoMhz: number; pireDbm: number; }
export interface ClienteConfig { canal: number; ssid: string; clave: string; }
export interface UciMallaEntrada { router: string; meshId: string; claveMalla: string; region: string; troncal: TroncalConfig; cliente: ClienteConfig; }
export interface UciMallaSalida { wireless: string; network: string; }

function obtenerHtmode(b: '2g'|'5g'|'6g', w: number): string {
  const h: Record<string, Record<string, string>> = {
    '2g': { '20': 'HT20', '40': 'HT40' },
    '5g': { '20': 'VHT20', '40': 'VHT40', '80': 'VHT80', '160': 'VHT160' },
    '6g': { '20': 'HE20', '40': 'HE40', '80': 'HE80', '160': 'HE160' }
  };
  return h[b][w.toString()] || (b === '2g' ? 'HT20' : b === '5g' ? 'VHT20' : 'HE20');
}

function obtenerNombreRadio(b: '2g'|'5g'|'6g'): string { return ['radio0','radio1','radio2'][['2g','5g','6g'].indexOf(b)] || 'radio0'; }
function obtenerCountry(r: string): string { return ({ 'ES':'ES','US':'US','EU':'DE','UK':'GB','FR':'FR','IT':'IT','JP':'JP','CA':'CA','AU':'AU' })[r] || 'US'; }

export function uciMalla(e: UciMallaEntrada): UciMallaSalida {
  const { meshId, claveMalla, region, troncal, cliente } = e;
  const htmode = obtenerHtmode(troncal.banda, troncal.anchoMhz);
  const country = obtenerCountry(region);
  const radio = obtenerNombreRadio(troncal.banda);
  
  const wireless = [
    `config wifi-device '${radio}'`,
    `	option type 'mac80211'`,
    `	option path 'platform/10300000.wmac'`,
    `	option channel '${troncal.canal}'`,
    `	option htmode '${htmode}'`,
    `	option country '${country}'`,
    '',
    `config wifi-iface 'malla_troncal'`,
    `	option device '${radio}'`,
    `	option mode 'mesh'`,
    `	option mesh_id '${meshId}'`,
    `	option encryption 'sae'`,
    `	option key '${claveMalla}'`,
    `	option mesh_fwding '0'`,
    `	option network 'bat0_hardif_mesh'`,
    '',
    `config wifi-iface 'ap_cliente'`,
    `	option device 'radio0'`,
    `	option mode 'ap'`,
    `	option ssid '${cliente.ssid}'`,
    `	option encryption 'psk2'`,
    `	option key '${cliente.clave}'`,
    `	option network 'lan'`,
    `	option isolate '0'`,
  ].join('\n');

  const network = [
    `config interface 'bat0'`,
    `	option proto 'batadv'`,
    `	option routing_algo 'BATMAN_V'`,
    `	option mesh 'bat0_hardif_mesh'`,
    '',
    `config interface 'bat0_hardif'`,
    `	option proto 'batadv_hardif'`,
    `	option master 'bat0'`,
    '',
    `config interface 'lan'`,
    `	option type 'bridge'`,
    `	option ifname 'eth0'`,
    `	option proto 'static'`,
    `	option ipaddr '192.168.1.1'`,
    `	option netmask '255.255.255.0'`,
    `	option ip6assign '60'`,
    `	option stp '1'`,
    '',
    `config device 'lan_bat0'`,
    `	option name 'bat0'`,
    `	option type '8021ad'`,
    `	option ifname 'lan'`,
  ].join('\n');

  return { wireless, network };
}

export function guionAplicar(cfg: UciMallaEntrada): string {
  const { wireless, network } = uciMalla(cfg);
  return `#!/bin/sh
echo "Aplicando configuración de malla StarSeed OS..."
opkg update
opkg install kmod-batman-adv batctl-default wpad-mesh-mbedtls
cp /etc/config/wireless /etc/config/wireless.antes-starseed || exit 1
cp /etc/config/network /etc/config/network.antes-starseed || exit 1
cat > /etc/config/wireless << 'EOF'
${wireless}
EOF
cat > /etc/config/network << 'EOF'
${network}
EOF
wifi reload || exit 1
/etc/init.d/network restart || exit 1
echo "Configuración aplicada correctamente.";
`.trim();
}