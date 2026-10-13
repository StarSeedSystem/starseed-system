export function esUuid(s: string): boolean {
  if (typeof s !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(s);
}

export function cuentaDestino(
  recipient: string | null | undefined,
  cuentaPorDispositivo: Record<string, string>
): string | null {
  if (recipient === null || recipient === undefined) {
    return null;
  }
  if (esUuid(recipient)) {
    return recipient;
  }
  return cuentaPorDispositivo[recipient] ?? null;
}

export function exigeSobrePorDestinatario(
  miCuenta: string,
  destino: string | null
): boolean {
  return destino !== null && destino !== miCuenta;
}

export function sobreValidoParaOtraCuenta(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return false;
  }
  const p = payload as Record<string, unknown>;
  return (
    typeof p.v === 'number' && p.v === 3 &&
    typeof p.iv === 'string' &&
    typeof p.ct === 'string' &&
    typeof p.epk === 'string'
  );
}

export function filaParaMi(
  fila: {
    recipient: string | null;
    recipient_owner: string | null;
    device_id: string | null;
    owner_id: string | null;
  },
  me: string,
  miCuenta: string
): boolean {
  const ownerIsAnotherAccount =
    fila.owner_id !== null &&
    fila.owner_id !== undefined &&
    fila.owner_id !== miCuenta;
  const recipientOwnerIsMe = fila.recipient_owner === miCuenta;
  return (
    fila.device_id !== me &&
    (fila.recipient === null ||
      fila.recipient === me ||
      fila.recipient === miCuenta) &&
    (!ownerIsAnotherAccount || recipientOwnerIsMe)
  );
}

export function motivoNoSubida(
  miCuenta: string,
  destino: string | null,
  payload: unknown
): string | null {
  if (!exigeSobrePorDestinatario(miCuenta, destino)) {
    return null;
  }
  if (!sobreValidoParaOtraCuenta(payload)) {
    return 'sin la clave de cifrado del destinatario: un mensaje privado a otra cuenta no sale sin cifrar para él';
  }
  return null;
}