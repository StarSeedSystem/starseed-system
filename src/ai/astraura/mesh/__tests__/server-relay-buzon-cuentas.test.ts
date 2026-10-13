import { describe, it, expect } from "vitest";
// RC1013C · Relevo entre cuentas, lado RECEPTOR: el buzón (pullRelayInbox) tiene
// que recoger lo que OTRA cuenta me dejó y retirarlo del servidor al leerlo.
// Ramas PURAS: `retirarTrasLeer` (borrado tras leer) desde server-relay y el
// filtro `filaParaMi` (qué filas son para mí) desde relay-entre-cuentas.
// Cliente falso: sin red — solo entrada → salida.
import { retirarTrasLeer } from "../server-relay";
import { filaParaMi } from "../relay-entre-cuentas";

const MI_CUENTA = "123e4567-e89b-12d3-a456-426614174000";
const OTRA_CUENTA = "987fc51a-2b3c-4d5e-6f7a-8b9c0d1e2f3a";
const ME = "dev-local-1";
const DEV_OTRO = "dev-remoto-9";

describe("filaParaMi (relevos recibidos de otra cuenta)", () => {
  it("acepta una fila de OTRA cuenta dirigida a la mía", () => {
    expect(
      filaParaMi(
        { recipient: null, recipient_owner: MI_CUENTA, device_id: DEV_OTRO, owner_id: OTRA_CUENTA },
        ME,
        MI_CUENTA,
      ),
    ).toBe(true);
  });

  it("acepta una fila de otra cuenta dirigida a MI neurona (recipient = device_id)", () => {
    expect(
      filaParaMi(
        { recipient: ME, recipient_owner: MI_CUENTA, device_id: DEV_OTRO, owner_id: OTRA_CUENTA },
        ME,
        MI_CUENTA,
      ),
    ).toBe(true);
  });

  it("descarta una fila de otra cuenta dirigida a UN TERCERO (recipient_owner ajeno)", () => {
    expect(
      filaParaMi(
        { recipient: null, recipient_owner: OTRA_CUENTA, device_id: DEV_OTRO, owner_id: OTRA_CUENTA },
        ME,
        MI_CUENTA,
      ),
    ).toBe(false);
  });

  it("descarta mi PROPIA fila de relé (mi neurona emisora, mismo sondeo)", () => {
    expect(
      filaParaMi(
        { recipient: null, recipient_owner: null, device_id: ME, owner_id: MI_CUENTA },
        ME,
        MI_CUENTA,
      ),
    ).toBe(false);
  });

  it("descarta lo de otra neurona de MI cuenta dirigido a otra cuenta", () => {
    expect(
      filaParaMi(
        { recipient: "dev-x", recipient_owner: OTRA_CUENTA, device_id: "dev-hermano", owner_id: MI_CUENTA },
        ME,
        MI_CUENTA,
      ),
    ).toBe(false);
  });
});

describe("retirarTrasLeer (borrado tras leer del servidor)", () => {
  const filaAjena = { owner_id: OTRA_CUENTA };
  const filaMia = { owner_id: MI_CUENTA };
  const filaSinOwner = { owner_id: null };

  it("fila de otra cuenta y descifrada bien -> se retira", () =>
    expect(retirarTrasLeer(filaAjena, MI_CUENTA, true)).toBe(true));

  it("fila de otra cuenta SIN abrir -> se queda (caduca sola)", () =>
    expect(retirarTrasLeer(filaAjena, MI_CUENTA, false)).toBe(false));

  it("fila de MI cuenta aunque descifrada -> no se retira (la ve mi cuenta)", () =>
    expect(retirarTrasLeer(filaMia, MI_CUENTA, true)).toBe(false));

  it("fila sin owner_id no se toca", () =>
    expect(retirarTrasLeer(filaSinOwner, MI_CUENTA, true)).toBe(false));
});

describe("campo cuentaOrigen (etiqueta para la interfaz)", () => {
  // Simulación de la rama pura del buzón: la etiqueta solo se añade si el owner
  // de la fila es OTRA cuenta (la mía no la lleva).
  function etiqueta(fila: { owner_id: string | null }, miCuenta: string): { cuentaOrigen?: string } {
    return fila.owner_id !== null && fila.owner_id !== miCuenta ? { cuentaOrigen: fila.owner_id } : {};
  }

  it("fila de otra cuenta recibe cuentaOrigen con el uuid de origen", () =>
    expect(etiqueta({ owner_id: OTRA_CUENTA }, MI_CUENTA)).toEqual({ cuentaOrigen: OTRA_CUENTA }));

  it("fila de mi cuenta no lleva la etiqueta", () =>
    expect(etiqueta({ owner_id: MI_CUENTA }, MI_CUENTA)).toEqual({}));

  it("fila sin owner_id no lleva la etiqueta", () =>
    expect(etiqueta({ owner_id: null }, MI_CUENTA)).toEqual({}));
});
