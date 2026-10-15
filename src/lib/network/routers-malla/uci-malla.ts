export interface ConfigMalla {
  router: string;
  meshId: string;
  claveMalla: string;
  region: string;
  troncal: {
    banda: '2g' | '5g' | '6g';
    canal: number;
    anchoMhz: number;
    pireDbm: number;
  };
  cliente: {
    canal: number;
    ssid: string;
    clave: string;
  };
}

export function htmodePorBandaYAncho(banda: '2g' | '5g' | '6g', anchoMhz: number): string {
  switch (banda) {
    case '2g':
      return 'HT20';
    case '5g':
      if (anchoMhz >= 80) return 'HE80';
      if (anchoMhz === 40) return 'VHT40';
      return 'VHT20';
    case '6g':
      if (anchoMhz >= 160) return 'HE160';
      if (anchoMhz >= 80) return 'HE80';
      if (anchoMhz === 40) return 'VHT40';
      return 'VHT20';
    default:
      return 'HT20';
  }
}

export function uciMalla(e: ConfigMalla): { wireless: string; network: string } {
  const { router, meshId, claveMalla, region, troncal, cliente } = e;
  const { banda, canal, anchoMhz, pireDbm } = troncal;

  const htmode = htmodePorBandaYAncho(banda, anchoMhz);

  const wireless = `
config wifi-device '${router}-radio0'
    option type 'mac80211'
    option channel '${canal}'
    option hwmode '11${banda === '2g' ? 'g' : 'a'}'
    option htmode '${htmode}'
    option path '1e140000.pci'
    option country '${region}'
    option txpower '${pireDbm}'

config wifi-config
    option mode 'mesh'
    option mesh_id '${meshId}'
    option encryption 'sae'
    option key '${claveMalla}'
    option mesh_fwding '0'
    option network 'bat0_hardif_mesh'

config wifi-config 'ap-lan'
    option mode 'ap'
    option ssid '${cliente.ssid}'
    option encryption 'sae'
    option key '${cliente.clave}'
    option network 'lan'
  `.trim();

  const network = `
config interface 'bat0'
    option proto 'batadv'
    option routing_algo 'BATMAN_V'

config interface 'bat0_hardif'
    option proto 'batadv_hardif'
    option master 'bat0'

config bridge 'br-lan'
    option type 'bridge'
    list device 'bat0'
    list device 'lan'
  `.trim();

  return { wireless, network };
}

export function guionAplicar(cfg: ConfigMalla): string {
  const { router, meshId, claveMalla, region, troncal, cliente } = cfg;
  const { banda, canal, anchoMhz, pireDbm } = troncal;

  const htmode = htmodePorBandaYAncho(banda, anchoMhz);

  return `#!/bin/sh
# Guion de aplicación para malla SiO₂ - configuración OpenWrt mesh
# Copia de seguridad previa
cp -r /etc/config /etc/config.antes-starseed-$(date +%Y%m%d%H%M%S)

# Instalar paquetes necesarios
opkg update
opkg install kmod-batman-adv batctl-default wpad-mesh-mbedtls

# Escribir configuración wireless
cat > /etc/config/wireless << WIRELESS_EOF
config wifi-device '${router}-radio0'
    option type 'mac80211'
    option channel '${canal}'
    option hwmode '11${banda === '2g' ? 'g' : 'a'}'
    option htmode '${htmode}'
    option path '1e140000.pci'
    option country '${region}'
    option txpower '${pireDbm}'

config wifi-config
    option mode 'mesh'
    option mesh_id '${meshId}'
    option encryption 'sae'
    option key '${claveMalla}'
    option mesh_fwding '0'
    option network 'bat0_hardif_mesh'

config wifi-config 'ap-lan'
    option mode 'ap'
    option ssid '${cliente.ssid}'
    option encryption 'sae'
    option key '${cliente.clave}'
    option network 'lan'
WIRELESS_EOF

# Escribir configuración network
cat > /etc/config/network << NETWORK_EOF
config interface 'bat0'
    option proto 'batadv'
    option routing_algo 'BATMAN_V'

config interface 'bat0_hardif'
    option proto 'batadv_hardif'
    option master 'bat0'

config bridge 'br-lan'
    option type 'bridge'
    list device 'bat0'
    list device 'lan'
NETWORK_EOF

# Recargar wifi y reiniciar red
wifi reload
/etc/init.d/network restart
`;
}