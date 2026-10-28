/**
 * GUI1021M2 · Avisos de sesión del hub XR, la red mesh y el estudio de diseño.
 *
 * Los tres avisos «Inicia sesión para…» de estas ventanas ya no son textos sueltos:
 * usan `AvisoSesion` (GUI1021L), la puerta común a `/bienvenida` y a la guía de
 * introducción. La prueba lee el JSX de cada archivo (igual que
 * `src/components/social/__tests__/avisos-sesion-social.test.ts`) y vigila que
 * conserve el texto de cada sitio y que no vuelva a apuntar al viejo `/login`.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const IMPORT_AVISO = /import \{ AvisoSesion \} from ["']@\/components\/auth\/aviso-sesion["'];/;

function fuente(archivo: string): string {
  return readFileSync(path.join(process.cwd(), "src/components", archivo), "utf8");
}

interface Caso {
  archivo: string;
  etiqueta: string;
  texto: string;
}

const AVISOS: Caso[] = [
  {
    archivo: "xr/xr-network-hub.tsx",
    etiqueta: "el hub XR",
    texto: "Inicia sesión para ver tu red real en 3D. Mientras tanto puedes explorar el espacio.",
  },
  {
    archivo: "mesh/network-feed.tsx",
    etiqueta: "el feed de la red",
    texto: "Inicia sesión y ten el internet público encendido en Señales para participar en el feed.",
  },
  {
    archivo: "estudio/DesignStudio.tsx",
    etiqueta: "el estudio de diseño",
    texto: "Inicia sesión y administra páginas/grupos para aplicar ahí.",
  },
];

describe("avisos de sesión del hub XR, la red y el estudio (GUI1021M2)", () => {
  it.each(AVISOS)(
    "«$etiqueta» ($archivo) va por AvisoSesion y conserva el texto",
    ({ archivo, texto }) => {
      const codigo = fuente(archivo);
      expect(codigo).toMatch(IMPORT_AVISO);
      expect(codigo).toContain("<AvisoSesion");
      expect(codigo, `${archivo}: debe conservar «${texto}»`).toContain(texto);
      expect(codigo, `${archivo}: sin enlaces sueltos a /login`).not.toMatch(/href=["']\/login["']/);
    },
  );

  it("los avisos dentro de paneles van en versión compacto (excepto el del hub, a pantalla completa)", () => {
    const delFeed = fuente("mesh/network-feed.tsx").match(
      /<AvisoSesion[^>]*texto="Inicia sesión y ten el internet público[^>]*\/>/,
    );
    expect(delFeed?.[0] ?? "").toMatch(/\bcompacto\b/);
    const delEstudio = fuente("estudio/DesignStudio.tsx").match(
      /<AvisoSesion[^>]*texto="Inicia sesión y administra páginas\/grupos[^>]*\/>/,
    );
    expect(delEstudio?.[0] ?? "").toMatch(/\bcompacto\b/);
  });
});
