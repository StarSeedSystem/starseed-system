/** Guion sh para /etc/starseed/guardian-puerta.sh y el cron asociado. */
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
