/**
 * Margen de tiempo de las pruebas de componentes (2026-10-05).
 *
 * QUÉ: en jsdom, `findBy*` y `waitFor` esperan hasta 5 s en vez del 1 s por defecto.
 * POR QUÉ: la publicación de las 00:52 cayó con 13 pruebas en rojo que en el contenedor y en
 * la Mac sin carga pasan todas (`catalogo-gen4.test.tsx`: 89 de 89 sola). Con el enjambre
 * vivo, la Mac de 8 GB tenía unos 100 MB libres y una carga de 20 a 34, y un render que suele
 * tardar 200 ms tardaba más de un segundo. No es código roto: es un plazo pensado para una
 * máquina ociosa.
 * CÓMO: solo actúa donde hay `document` (los `*.test.tsx`). En el entorno `node` no importa
 * nada, así que la lógica pura sigue igual de rápida.
 */
if (typeof document !== "undefined") {
  // @ts-ignore
const { configure } = await import("@testing-library/react");
  configure({ asyncUtilTimeout: 5000 });

  // FIX1114A — desmonta lo montado al terminar cada prueba.
  // QUÉ: con `globals: false` Testing Library no registra su `cleanup` solo, así que un árbol
  // montado por una prueba seguía vivo (con sus efectos y sus promesas) hasta que jsdom se
  // desmontaba al acabar el archivo. Un sondeo que resolvía entonces llamaba a `setState` con
  // `window` ya inexistente: «Unhandled Errors» con todos los archivos en verde y vitest en 1.
  // Visto en la Mac (13-11, `window is not defined`) y en la CI de main (14-11).
  // CÓMO: `cleanup` es idempotente; las pruebas que ya lo llaman a mano no cambian.
  const { afterEach } = await import("vitest");
  const { cleanup } = await import("@testing-library/react");
  afterEach(() => {
    cleanup();
  });
}

// @ts-ignore
export {};
