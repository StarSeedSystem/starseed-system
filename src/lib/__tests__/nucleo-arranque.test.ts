// StarSeed OS — Prueba del CABLEADO del núcleo en el arranque del OS.
//
// `paquete-sistema` no importa a sus guardianes: se los inyecta el arranque
// (`@/components/system/arranque-nucleo`, montado en el layout raíz). Aquí se
// comprueban las dos mitades de esa promesa:
//   1) sin cablear, `revisar` falla CERRADO («nucleo-configurado»);
//   2) tras el cableado, un paquete legítimo se revisa de verdad y es
//      instalable, y uno que rompe una invariante SIGUE sin serlo.
//
// Los `import()` son dinámicos a propósito: el estado del núcleo es de módulo,
// así que hay que poder observarlo ANTES de que el arranque lo registre.

import { describe, it, expect } from "vitest";
import type { UiSpec } from "@/lib/nucleo/ui-spec";
import type { PaqueteSistema } from "@/lib/nucleo/paquete-sistema";

const AHORA = 1_757_000_000_000;

/** Interfaz impecable: vocabulario cerrado, props declaradas, cero problemas. */
function uiSpecLimpia(): UiSpec {
  return {
    version: 1,
    superficie: "escritorio",
    titulo: "Escritorio Nébula",
    bloques: [
      {
        tipo: "panel",
        id: "panel-inicio",
        props: { titulo: "Bienvenida" },
        hijos: [{ tipo: "texto", id: "texto-inicio", props: { contenido: "Hola, mundo" } }],
      },
      { tipo: "acciones", id: "acciones-inicio", props: { acciones: ["abrir-biblioteca"] } },
    ],
    tema: "nebula",
  };
}

/** Paquete honrado: no esconde nada del sistema ni lleva secretos dentro. */
function paqueteLegitimo(): PaqueteSistema {
  return {
    id: "paq-nebula",
    nombre: "Escritorio Nébula",
    autor: { perfil: "alex", nombre: "Alex" },
    creadoEn: AHORA,
    uiSpec: uiSpecLimpia(),
    permisosPedidos: ["ver-widgets"],
    requiere: [],
    firma: "firma-de-prueba",
    version: 1,
  };
}

/** Mismo paquete, pero pidiendo esconder Ajustes: rompe «salida-siempre». */
function paqueteQueRompeElNucleo(): PaqueteSistema {
  return { ...paqueteLegitimo(), id: "paq-jaula", permisosPedidos: ["ocultar-ajustes"] };
}

const IDS = (violaciones: { invariante: string }[]): string[] =>
  violaciones.map((v) => v.invariante);

describe("arranque del núcleo", () => {
  it("falla cerrado y, tras el cableado, distingue paquetes seguros e inseguros", async () => {
    const nucleo = await import("@/lib/nucleo/paquete-sistema");

    // Antes del cableado: nadie ha registrado guardianes, así que ni el paquete
    // más honrado entra. Es el fallo correcto, pero deja la Biblioteca muerta.
    expect(nucleo.nucleoRegistrado()).toBeNull();
    const antes = nucleo.revisar(paqueteLegitimo());
    expect(IDS(antes.violaciones)).toContain("nucleo-configurado");
    expect(nucleo.esInstalable(antes)).toBe(false);

    // El arranque del OS (layout raíz → ArranqueNucleo) inyecta los guardianes
    // al evaluar su módulo; llamarlo otra vez conserva la misma configuración.
    const arranque = await import("@/components/system/arranque-nucleo");
    const guardianesRegistrados = nucleo.nucleoRegistrado();
    expect(guardianesRegistrados).not.toBeNull();
    expect(arranque.arrancarNucleo()).toBe(false);
    expect(nucleo.nucleoRegistrado()).toBe(guardianesRegistrados);

    // Después: se revisa de verdad y el paquete legítimo es instalable.
    const despues = nucleo.revisar(paqueteLegitimo());
    expect(IDS(despues.violaciones)).not.toContain("nucleo-configurado");
    expect(despues.violaciones).toEqual([]);
    expect(despues.secretosDetectados).toEqual([]);
    expect(despues.seguro).toBe(true);
    expect(nucleo.esInstalable(despues)).toBe(true);

    // El cableado no relaja el núcleo: un paquete que rompe una invariante
    // recibe un veredicto real y sigue sin poder instalarse.
    const revision = nucleo.revisar(paqueteQueRompeElNucleo());
    expect(IDS(revision.violaciones)).not.toContain("nucleo-configurado");
    expect(IDS(revision.violaciones)).toContain("salida-siempre");
    expect(revision.violaciones[0]?.comoArreglarlo).toMatch(/Retira el permiso/);
    expect(revision.seguro).toBe(false);
    expect(nucleo.esInstalable(revision)).toBe(false);
    expect(revision.resumen).toContain("NO INSTALABLE");
  });
});
