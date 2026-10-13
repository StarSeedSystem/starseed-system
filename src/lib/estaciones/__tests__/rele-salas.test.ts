/**
 * Rescate de la rama nube/a1-20261013-072810-RTRTS1010-EV-ORACLE-1ab: el caso «entrar con tema
 * válido y dentro de límites» probaba `crearSalas` (el relé de `servicios/estaciones-rele/salas.mjs`),
 * que nunca llegó a main: aquí las salas de una estación son canales de Supabase Realtime abiertos
 * por TEMA (`canales-estacion.ts`), y su presencia la cubre `sesion-en-vivo.test.ts`. Lo que sí
 * prueba el caso y main no cubría es la mitad «tema válido»: el tema ES la sala, y quien no lo
 * sabe no entra. Hoy ese contrato es de `cripto-estacion.ts` (`temaPublico`/`temaPrivado`), sin
 * pruebas propias. Los límites del relé (`maxSalas`/`maxPorSala`/`maxBytes`) son contrato de un
 * servicio que main descartó a propósito, y copiar aquí el `crearSalas` inline de la rama sería
 * probar la propia copia del test: nada de eso se rescata.
 */
import { describe, expect, it } from "vitest";
import { temaPrivado, temaPublico } from "../cripto-estacion";

describe("el tema de cada sala", () => {
  it("una estación pública entra con su tema exacto y cada id es una sala distinta", () => {
    const tema = temaPublico("ABCDEF1234");
    expect(tema).toBe("estacion-vivo:ABCDEF1234");
    // Determinista: el mismo id nombra siempre la misma sala, y nunca la de otro id.
    expect(temaPublico("ABCDEF1234")).toBe(tema);
    expect(temaPublico("OTRO45678901")).not.toBe(tema);
  });

  it("la sala de una estación privada solo la nombra quien tiene el token", async () => {
    const tema = await temaPrivado("ABCDEF1234", "token-de-invitacion");
    // Prefijo propio (nunca el público) y 32 hex: imposible de adivinar sin el token.
    expect(tema).toMatch(/^estacion-p:[0-9a-f]{32}$/);
    expect(tema.startsWith("estacion-vivo:")).toBe(false);
    // Determinista para el mismo par id+token, distinto para otro token o id.
    expect(await temaPrivado("ABCDEF1234", "token-de-invitacion")).toBe(tema);
    expect(await temaPrivado("ABCDEF1234", "otro-token")).not.toBe(tema);
    expect(await temaPrivado("OTRO45678901", "token-de-invitacion")).not.toBe(tema);
  });
});
