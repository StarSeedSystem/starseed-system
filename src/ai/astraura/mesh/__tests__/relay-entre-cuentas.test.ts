import { describe, it, expect } from "vitest"
import {
  esUuid,
  cuentaDestino,
  exigeSobrePorDestinatario,
  sobreValidoParaOtraCuenta,
  filaParaMi,
  motivoNoSubida
} from '../relay-entre-cuentas'

describe('esUuid', () => {
  it('true for valid UUID', () => expect(esUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true));
  it('false for invalid UUID (short)', () => expect(esUuid('123e4567-e89b-12d3-a456-42661417400')).toBe(false));
  it('false for invalid UUID (long)', () => expect(esUuid('123e4567-e89b-12d3-a456-4266141740000')).toBe(false));
  it('false for non-UUID string', () => expect(esUuid('not-a-uuid')).toBe(false));
  it('false for empty string', () => expect(esUuid('')).toBe(false));
})

describe('cuentaDestino', () => {
  const cuentaPorDispositivo = { device1: 'account1-uuid', device2: 'account2-uuid' };
  it('null recipient -> null', () => expect(cuentaDestino(null, cuentaPorDispositivo)).toBeNull());
  it('undefined recipient -> null', () => expect(cuentaDestino(undefined, cuentaPorDispositivo)).toBeNull());
  it('UUID recipient -> same UUID', () => {
    const uuid = '123e4567-e89b-12d3-a456-426614174000';
    expect(cuentaDestino(uuid, cuentaPorDispositivo)).toBe(uuid);
  });
  it('known device ID -> mapped account', () => expect(cuentaDestino('device1', cuentaPorDispositivo)).toBe('account1-uuid'));
  it('unknown device ID -> null', () => expect(cuentaDestino('unknown', cuentaPorDispositivo)).toBeNull());
})

describe('exigeSobrePorDestinatario', () => {
  const miCuenta = '123e4567-e89b-12d3-a456-426614174000';
  const otraCuenta = '987fc51a-2b3c-4d5e-6f7a-8b9c0d1e2f3a';
  it('destino null -> false', () => expect(exigeSobrePorDestinatario(miCuenta, null)).toBe(false));
  it('destino equals miCuenta -> false', () => expect(exigeSobrePorDestinatario(miCuenta, miCuenta)).toBe(false));
  it('destino different -> true', () => expect(exigeSobrePorDestinatario(miCuenta, otraCuenta)).toBe(true));
})

describe('sobreValidoParaOtraCuenta', () => {
  it('non-object -> false', () => {
    expect(sobreValidoParaOtraCuenta('string')).toBe(false);
    expect(sobreValidoParaOtraCuenta(123)).toBe(false);
    expect(sobreValidoParaOtraCuenta(null)).toBe(false);
    expect(sobreValidoParaOtraCuenta(undefined)).toBe(false);
    expect(sobreValidoParaOtraCuenta([])).toBe(false);
  });
  it('missing v -> false', () => expect(sobreValidoParaOtraCuenta({ iv: 'iv', ct: 'ct', epk: 'epk' })).toBe(false));
  it('v not 3 -> false', () => expect(sobreValidoParaOtraCuenta({ v: 2, iv: 'iv', ct: 'ct', epk: 'epk' })).toBe(false));
  it('v=3 missing iv -> false', () => expect(sobreValidoParaOtraCuenta({ v: 3, ct: 'ct', epk: 'epk' })).toBe(false));
  it('v=3 iv not string -> false', () => expect(sobreValidoParaOtraCuenta({ v: 3, iv: 123, ct: 'ct', epk: 'epk' })).toBe(false));
  it('v=3 missing ct -> false', () => expect(sobreValidoParaOtraCuenta({ v: 3, iv: 'iv', epk: 'epk' })).toBe(false));
  it('v=3 missing epk -> false', () => expect(sobreValidoParaOtraCuenta({ v: 3, iv: 'iv', ct: 'ct' })).toBe(false));
  it('valid envelope -> true', () => expect(sobreValidoParaOtraCuenta({ v: 3, iv: 'iv', ct: 'ct', epk: 'epk' })).toBe(true));
})

describe('filaParaMi', () => {
  const me = 'device-me';
  const miCuenta = '123e4567-e89b-12d3-a456-426614174000';
  it('device_id equals me -> false', () => {
    const fila = { recipient: null, recipient_owner: null, device_id: me, owner_id: null };
    expect(filaParaMi(fila, me, miCuenta)).toBe(false);
  });
  it('recipient null -> true (when other conditions hold)', () => {
    const fila = { recipient: null, recipient_owner: null, device_id: 'other-device', owner_id: null };
    expect(filaParaMi(fila, me, miCuenta)).toBe(true);
  });
  it('recipient equals me -> true', () => {
    const fila = { recipient: me, recipient_owner: null, device_id: 'other-device', owner_id: null };
    expect(filaParaMi(fila, me, miCuenta)).toBe(true);
  });
  it('recipient equals miCuenta -> true', () => {
    const fila = { recipient: miCuenta, recipient_owner: null, device_id: 'other-device', owner_id: null };
    expect(filaParaMi(fila, me, miCuenta)).toBe(true);
  });
  it('recipient neither null, me, nor miCuenta -> false', () => {
    const fila = { recipient: 'other-account', recipient_owner: null, device_id: 'other-device', owner_id: null };
    expect(filaParaMi(fila, me, miCuenta)).toBe(false);
  });
  it('owner_id another account and recipient_owner not miCuenta -> false', () => {
    const fila = { recipient: null, recipient_owner: 'other-account', device_id: 'other-device', owner_id: 'other-account' };
    expect(filaParaMi(fila, me, miCuenta)).toBe(false);
  });
  it('owner_id another account and recipient_owner is miCuenta -> true', () => {
    const fila = { recipient: null, recipient_owner: miCuenta, device_id: 'other-device', owner_id: 'other-account' };
    expect(filaParaMi(fila, me, miCuenta)).toBe(true);
  });
  it('owner_id null -> true (no check on recipient_owner)', () => {
    const fila = { recipient: null, recipient_owner: 'any-value', device_id: 'other-device', owner_id: null };
    expect(filaParaMi(fila, me, miCuenta)).toBe(true);
  });
  it('owner_id equals miCuenta -> true (no check on recipient_owner)', () => {
    const fila = { recipient: null, recipient_owner: 'any-value', device_id: 'other-device', owner_id: miCuenta };
    expect(filaParaMi(fila, me, miCuenta)).toBe(true);
  });
})

describe('motivoNoSubida', () => {
  const miCuenta = '123e4567-e89b-12d3-a456-426614174000';
  const otraCuenta = '987fc51a-2b3c-4d5e-6f7a-8b9c0d1e2f3a';
  const validoPayload = { v: 3, iv: 'iv', ct: 'ct', epk: 'epk' };
  const invalidoPayload = { v: 2, iv: 'iv', ct: 'ct', epk: 'epk' };
  it('destino null -> null (no envelope needed)', () => {
    expect(motivoNoSubida(miCuenta, null, validoPayload)).toBeNull();
    expect(motivoNoSubida(miCuenta, null, invalidoPayload)).toBeNull();
  });
  it('destino equals miCuenta -> null (no envelope needed)', () => {
    expect(motivoNoSubida(miCuenta, miCuenta, validoPayload)).toBeNull();
    expect(motivoNoSubida(miCuenta, miCuenta, invalidoPayload)).toBeNull();
  });
  it('destino otra cuenta and payload invalido -> error string', () => {
    const expected = 'sin la clave de cifrado del destinatario: un mensaje privado a otra cuenta no sale sin cifrar para él';
    expect(motivoNoSubida(miCuenta, otraCuenta, invalidoPayload)).toBe(expected);
  });
  it('destino otra cuenta and payload valido -> null', () => {
    expect(motivoNoSubida(miCuenta, otraCuenta, validoPayload)).toBeNull();
  });

describe('esUuid edge cases', () => {
  it('null returns false', () => expect(esUuid(null as any)).toBe(false));
  it('number returns false', () => expect(esUuid(123 as any)).toBe(false));
});

describe('cuentaDestino edge', () => {
  const emptyMap: Record<string, string> = {};
  it('empty recipient string returns null', () => expect(cuentaDestino('', emptyMap)).toBeNull());
});

describe('filaParaMi edge owner mismatch', () => {
  const me = 'device-me';
  const miCuenta = '123e4567-e89b-12d3-a456-426614174000';
  it('owner_id other and recipient_owner null -> false', () => {
    const fila = { recipient: null, recipient_owner: null, device_id: null, owner_id: 'other-account' };
    expect(filaParaMi(fila, me, miCuenta)).toBe(false);
  });
});

})