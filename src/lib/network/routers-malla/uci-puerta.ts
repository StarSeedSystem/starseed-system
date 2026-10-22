/** UCI de puertas a internet en routers malla (§8.1 «Routers portátiles»: SIM/Wi‑Fi/USB/cable).
 * Puro: sin red, disco ni `node:*`. Sangría con tabulador pegado.
 * Los tipos vienen de la única lista del contrato (`TIPOS_PUERTA` de las puertas a internet, TIP1013B):
 * el satélite se declara en la tesela pero hoy no tiene UCI que lo genere, así que queda fuera aquí. */

import { TIPOS_PUERTA } from "../../malla/cristal/puertas-internet";

export type TipoPuerta = Exclude<(typeof TIPOS_PUERTA)[number], "satelite">;

export interface CfgPuerta {
  tipo: TipoPuerta; apn?: string; protocolo?: 'qmi' | 'mbim' | 'ncm'; dispositivo?: string;
  ssidExterno?: string; claveExterna?: string; bajadaKbps: number; subidaKbps: number;
}

const q = (v: string | number): string => `'${String(v).replace(/'/g, "'\\''")}'`;
const seccion = (tipo: string, nombre: string, ops: Array<[string, string | number]>): string =>
  [`config ${tipo} ${q(nombre)}`, ...ops.map(([k, v]) => `    option ${k} ${q(v)}`)].join("\n");

export function uciPuerta(e: CfgPuerta, opciones?: { conBat?: boolean }): { network: string; firewall: string } {
  const isMovil = e.tipo === 'movil-4g' || e.tipo === 'movil-5g';
  let net = '';
  if (isMovil) {
    net = seccion('interface', 'wwan', [['proto', e.protocolo ?? 'qmi'], ['device', e.dispositivo ?? '/dev/cdc-wdm0'],
      ['apn', e.apn ?? ''], ['pdptype', 'ipv4v6']]);
  } else if (e.tipo === 'wifi-externa') {
    net = seccion('wifi-iface', 'puerta', [['device', 'radio_troncal'], ['mode', 'sta'],
      ['network', 'wwan'], ['ssid', e.ssidExterno ?? ''], ['encryption', 'sae-mixed'], ['key', e.claveExterna ?? '']]) +
      '\n\n' + seccion('interface', 'wwan', [['proto', 'dhcp']]);
  } else if (e.tipo === 'usb-telefono') {
    net = seccion('interface', 'wwan', [['proto', 'dhcp'], ['device', 'usb0']]);
  } else {
    net = seccion('interface', 'wan', [['proto', 'dhcp']]);
  }
  const bat = seccion('interface', 'bat0', [['proto', 'batadv'], ['gw_mode', 'server'],
    ['gw_bandwidth', `${e.bajadaKbps}kbit/${e.subidaKbps}kbit`]]);
  // conBat: false omite la sección bat0 (la pone uciMalla con su BATMAN_V y el ancho medido),
  // para no duplicar bat0 al componer la malla con la puerta declarada.
  const conBat = opciones?.conBat !== false;
  const firewall = seccion('zone', 'wwan', [['name', 'wwan'], ['network', 'wwan'], ['input', 'REJECT'],
    ['output', 'ACCEPT'], ['forward', 'REJECT'], ['masq', '1'], ['mtu_fix', '1']]) + '\n\n' +
    seccion('forwarding', 'lan_to_wwan', [['src', 'lan'], ['dest', 'wwan']]);
  return { network: `${net}${conBat ? `\n\n${bat}` : ""}\n`, firewall: `${firewall}\n` };
}

export const uciClientePuerta = (): string =>
  seccion('interface', 'bat0', [['proto', 'batadv'], ['gw_mode', 'client'], ['gw_sel_class', '5000']]) +
  '\n# en BATMAN_V, gw_sel_class es la mejora mínima en kbit/s para cambiar de puerta\n';

export function guionGuardianTope(e: {
  interfaz: string; topeMb: number; reservaPct: number; bajadaKbps: number; subidaKbps: number;
}): string {
  const topeBytes = e.topeMb * 1024 * 1024;
  const reserva = e.reservaPct / 100;
  const umbralBytes = Math.floor(topeBytes * (1 - reserva));
  return `#!/bin/sh
# StarSeed: guardián de puerta ${e.interfaz} (tope ${e.topeMb}MB, reserva ${e.reservaPct}%)
DIR=/etc/starseed; [ -d "$DIR" ] || mkdir -p "$DIR"
MES=$(date +%Y%m); ARCH=$DIR/uso-puerta-$MES
VAL=$(cat /sys/class/net/${e.interfaz}/statistics/rx_bytes 2>/dev/null) || exit 0
BRUTO=$VAL; [ -f "$ARCH" ] && PREV=$(cat "$ARCH") && [ "$VAL" -ge "$PREV" ] && ACUM=$(($(cat "$ARCH.acum" 2>/dev/null || echo 0) + VAL - PREV)) || ACUM=$VAL
echo "$BRUTO" > "$ARCH"; echo "$ACUM" > "$ARCH.acum"
if [ "$ACUM" -ge ${umbralBytes} ]; then
  batctl gw_mode client; logger "StarSeed: tope ${e.topeMb}MB alcanzado en ${e.interfaz}, desactivando gw server"
else
  batctl gw_mode server ${e.bajadaKbps}kbit/${e.subidaKbps}kbit
fi
`;
}