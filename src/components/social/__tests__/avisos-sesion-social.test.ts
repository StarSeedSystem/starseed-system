/**
 * GUI1021M3 · Los avisos de sesión del área social.
 *
 * Las tarjetas y cabeceras de la red no escriben su propio «Inicia sesión»: usan
 * `AvisoSesion`, la puerta común a `/bienvenida` y a la guía. Estas comprobaciones
 * leen el JSX de los tres puntos de entrada y vigilan que el aviso no vuelva a
 * duplicarse a mano ni apunte al viejo `/login`.
 *
 * Origen: rama nube/cr-20261028/ola/GUI1021M3c, adaptada a la API de main (las
 * tarjetas usan la versión compacta; las cabeceras, la completa).
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const RUTA_COMPONENTES = path.join(process.cwd(), "src/components/social");
const IMPORT_AVISO = 'import { AvisoSesion } from "@/components/auth/aviso-sesion";';

function fuente(archivo: string): string {
  return readFileSync(path.join(RUTA_COMPONENTES, archivo), "utf8");
}

function avisosDe(codigo: string): string[] {
  return codigo.match(/<AvisoSesion[\s\S]*?\/>/g) ?? [];
}

interface Caso {
  archivo: string;
  etiqueta: string;
  textos: string[];
}

const AVISOS: Caso[] = [
  {
    archivo: "PostCard.tsx",
    etiqueta: "la tarjeta de publicación",
    textos: [
      "Inicia sesión para comentar en la red real",
      "Inicia sesión para reaccionar",
      "Inicia sesión para comentar",
    ],
  },
  {
    archivo: "entity-header.tsx",
    etiqueta: "la cabecera de entidad",
    textos: ['Inicia sesión para ${isCommunity ? "unirte" : "seguir"}'],
  },
  {
    archivo: "governance-entity-page.tsx",
    etiqueta: "la página de gobernanza",
    textos: ["Inicia sesión para afiliarte"],
  },
];

describe("avisos de sesión en la red social", () => {
  it.each(AVISOS)(
    "«$etiqueta» ($archivo) va por AvisoSesion y conserva el texto",
    ({ archivo, textos }) => {
      const codigo = fuente(archivo);
      expect(codigo).toContain(IMPORT_AVISO);
      expect(codigo).toContain("<AvisoSesion");
      for (const texto of textos) {
        expect(codigo, `${archivo}: debe conservar «${texto}»`).toContain(texto);
      }
    },
  );

  it("los avisos dentro de tarjetas van en versión compacto", () => {
    const avisos = avisosDe(fuente("PostCard.tsx"));
    expect(avisos.length, "PostCard debe pintar avisos de sesión").toBeGreaterThan(0);
    for (const aviso of avisos) {
      expect(aviso, `PostCard: ${aviso}`).toMatch(/\bcompacto\b/);
    }
  });

  it("no queda ningún aviso suelto de «Inicia sesión» apuntando a /login", () => {
    for (const { archivo } of AVISOS) {
      const codigo = fuente(archivo);
      expect(codigo, `${archivo}: sin enlaces sueltos a /login`).not.toMatch(/href=["']\/login["']/);

      const sinAvisos = codigo.replace(/<AvisoSesion[\s\S]*?\/>/g, "");
      const lineas = sinAvisos.split("\n");
      for (let i = 0; i < lineas.length; i++) {
        if (!lineas[i].includes("Inicia sesión")) continue;
        // El placeholder del cuadro de comentarios no es un aviso: la palabra
        // `placeholder` aparece hasta dos líneas por encima del texto del ternario.
        const contexto = lineas.slice(Math.max(0, i - 2), i + 1).join(" ");
        if (!contexto.includes("placeholder")) {
          expect.fail(`${archivo}: aviso suelto fuera de AvisoSesion → ${lineas[i].trim()}`);
        }
      }
    }
  });

  it("governance-entity-page conserva su enlace de volver (no era un aviso)", () => {
    const codigo = fuente("governance-entity-page.tsx");
    expect(codigo).toContain('import Link from "next/link";');
    expect(codigo).toMatch(/<Link href=\{backHref\}/);
  });
});
