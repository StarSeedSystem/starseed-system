/**
 * GUI1021N (Ola 1021G) · guardia: ningún aviso «Inicia sesión para…» suelto sin la guía.
 *
 * §5 de `architecture/guias-introduccion.md`: el aviso de sesión debe llevar SIEMPRE acceso a
 * la guía, sea con cuenta o sin ella. Esta prueba recorre `src/components` (sin `__tests__`)
 * y falla si un .tsx tiene el texto suelto: fuera de un uso de `<AvisoSesion` o de un toast
 * que ofrezca la acción de la guía («Conoce StarSeed» → `abrirGuia`). Permite además los
 * errores de retoma («Inicia sesión de nuevo…»), `auth-gate.tsx`, la propia `AvisoSesion` y
 * la consola de la terminal. Lo suelto heredado del código de hoy está registrado en la
 * línea base (`src/lib/onboarding/avisos-sesion-base.ts`); un suelto que no conste allí es
 * un aviso nuevo y cae la cascadura.
 *
 * La lógica es PURA (`guardia-avisos-sesion.ts`): aquí solo se recorre el árbol para darle
 * las líneas reales y se prueban las funciones con artefactos propios.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  avisosNuevos,
  avisosSuelto,
  complementoDe,
  esErrorRetoma,
  TEXTO_AVISO,
} from "@/lib/onboarding/guardia-avisos-sesion";

const RAIZ = path.join(__dirname, "..", "..", "components");

/** Los .tsx de src/components, sin las carpetas `__tests__`. */
function recorrer(dir: string, salida: string[] = []): string[] {
  for (const nombre of readdirSync(dir).sort()) {
    const ruta = path.join(dir, nombre);
    if (statSync(ruta).isDirectory()) {
      if (nombre !== "__tests__") recorrer(ruta, salida);
    } else if (/\.tsx$/.test(nombre)) {
      salida.push(ruta);
    }
  }
  return salida;
}

describe("guardia de avisos de sesión con la guía (GUI1021N)", () => {
  it("ningún aviso «Inicia sesión para…» nuevo queda suelto sin la guía", () => {
    const fallos: string[] = [];
    for (const archivo of recorrer(RAIZ)) {
      const relativo = path.relative(RAIZ, archivo).split(path.sep).join("/");
      const lineas = readFileSync(archivo, "utf8").split("\n");
      for (const nuevo of avisosNuevos(relativo, avisosSuelto(lineas))) {
        fallos.push(`${relativo}:${nuevo.linea}: «…${nuevo.complemento}»`);
      }
    }
    expect(
      fallos.length,
      `Avisos «${TEXTO_AVISO}…» NUEVOS y sueltos (los sueltos heredados están en ` +
        `avisos-sesion-base.ts; usa <AvisoSesion> o un toast con la acción de la guía):\n` +
        fallos.join("\n"),
    ).toBe(0);
  });

  it("la forma buena: un texto dentro de un uso de <AvisoSesion no está suelto", () => {
    expect(
      avisosSuelto(['<AvisoSesion texto="Inicia sesión para comentar en la red real" />']),
    ).toEqual([]);
    expect(
      avisosSuelto([
        "      {sinCuenta && (",
        "        <AvisoSesion",
        '          compacto',
        '          texto="Inicia sesión para jugar. Sin cuenta puedes mirar, pero no jugar."',
        "        />",
        "      )}",
      ]),
    ).toEqual([]);
  });

  it("la forma buena: un toast que ofrece la acción de la guía tampoco lo está", () => {
    expect(
      avisosSuelto([
        'toast.error("Inicia sesión para crear en la red", {',
        '  action: { label: "Conoce StarSeed", onClick: () => abrirGuia({ desde: "aviso" }) },',
        "});",
      ]),
    ).toEqual([]);
  });

  it("la forma mala: un toast sin la guía y un <div> suelto cuentan como suelto", () => {
    const sueltos = avisosSuelto([
      'toast.error("Inicia sesión para crear un grupo.");',
      '<div className="salida">Inicia sesión para ver tu galería personal.</div>',
    ]);
    expect(sueltos).toEqual([
      { linea: 1, complemento: "crear un grupo." },
      { linea: 2, complemento: "ver tu galería personal." },
    ]);
  });

  it("los errores de retoma «Inicia sesión de nuevo…» están permitidos", () => {
    expect(esErrorRetoma('toast.error("La sesión caducó. Inicia sesión de nuevo para seguir.");')).toBe(true);
    expect(esErrorRetoma("Inicia sesión para ver tu galería")).toBe(false);
    expect(avisosSuelto(['toast.error("Inicia sesión de nuevo para continuar con tu trabajo.")'])).toEqual([]);
  });

  it("el complemento del aviso se corta donde acaba su texto", () => {
    expect(complementoDe('  title="Inicia sesión para usar tu Biblioteca"')).toEqual("usar tu Biblioteca");
    expect(complementoDe("  Inicia sesión para sincronizar; mientras tanto queda en este aparato.")).toEqual("sincronizar");
    expect(complementoDe('const aviso = "Inicia sesión para girar el orbe";')).toEqual("girar el orbe");
    expect(complementoDe("no hay aviso aquí")).toEqual("");
  });

  it("un suelto de la línea base pasa; uno que no conste allí falla; los exentos, no", () => {
    const deHoy = { linea: 7, complemento: "ver tus mundos" };
    const nuevo = { linea: 12, complemento: "encender tu faro nuevo" };
    expect(avisosNuevos("dashboard/widgets/gen4/multiverse-hub-widget.tsx", [deHoy, nuevo])).toEqual([nuevo]);
    expect(avisosNuevos("dashboard/widgets/gen4/multiverse-hub-widget.tsx", [deHoy])).toEqual([]);
    expect(avisosNuevos("auth/auth-gate.tsx", [nuevo])).toEqual([]);
  });
});
