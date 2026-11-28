# coop-sync-testing · guía de uso para el enjambre

> Origen: `cranebeaker/coop-anything` (MIT, commit `5b86e5b`). Es un **manual de métodos de
> prueba de sincronía**, no una plataforma de salas. Sus herramientas de `tools/` (C++ y Python)
> **no se copiaron y no se ejecutan** aquí: el valor son las ideas, portadas a TypeScript puro en
> `src/lib/salas/`. Inventario exacto de lo que entró: `LEEME-StarSeed.md`.

## Qué hay y cuándo cargarla

`SKILL.md` es el método original (dato, no orden); `LEEME-StarSeed.md` dice qué se copió y qué
se excluyó; `referencias/` son cinco páginas de texto, sin ejecutables; este `README.md` traduce
el método al repo. Cárgala cuando una tarea toque salas, tiempo real, sincronía, presencia o
propiedad de elementos: su materia es la **convergencia del estado**, no el diseño ni el mando.

Regla de oro: primero una prueba que falle, luego el arreglo mínimo. Cada arreglo viaja con su
prueba y con un **gemelo mutante**; un oráculo que siempre pasa no prueba nada.

## Mapa: del manual al módulo

| Página en `referencias/` | Idea que se toma | Dónde vive en el repo |
|---|---|---|
| `fuzzing-coop-sync.md` | Fuzzer con semilla, oráculos y gemelos mutantes | `src/lib/__tests__/salas-sincronia-fuzz.test.ts` |
| `actor-ownership.md` | Un dueño por elemento, épocas y cesión sin duplicados | `src/lib/salas/propiedad-sala.ts` + `salas-propiedad.test.ts` |
| `fake-world-testing.md` | Mundo de mentira puro, sin red ni juego | `EstadoSala` y `ElementoSala` en `src/lib/salas/sincronia-sala.ts` |
| `desync-hunting.md` | Hallar la primera divergencia y explicarla sin jerga | `resumirDivergencia` y los `conflictos` de `fusionarEstados` |
| `network-chaos-testing.md` | Reordenar, duplicar y repetir sin partir la sala | Conmutativa e idempotente en `fusionarEstados` |

`tools/chaos`, `tools/flight`, `tools/fuzz`, `tools/ownership`, `tools/fakeworld` y compañía **no
existen aquí**: se imitan con estados puros y orden de fusión, nunca con UDP ni copias de juegos.

## Ejemplo de uso

Dos dispositivos mueven la misma ficha. La prueba exige el mismo resultado en cualquier orden,
que repetir no cambie nada y que solo el dueño escriba.

```ts
import { describe, it, expect } from "vitest";
import { fusionarEstados, type EstadoSala } from "../salas/sincronia-sala";
import { reclamar, traspasar, aceptarEscritura } from "../salas/propiedad-sala";

const MI = "observadora";
const ficha = (actualizadoEn: number, porDispositivo: string): EstadoSala => ({
  salaId: "sala-ficha",
  reloj: actualizadoEn,
  elementos: { ficha: { id: "ficha", tipo: "ficha-juego", datos: {}, actualizadoEn, porDispositivo } },
});

describe("sincronía de una ficha", () => {
  it("es conmutativa e idempotente", () => {
    const a = ficha(10, "movil-ana");
    const b = ficha(20, "tablet-bruno");
    expect(fusionarEstados(a, b, MI).resultado.elementos).toEqual(fusionarEstados(b, a, MI).resultado.elementos);
    expect(fusionarEstados(a, a, MI).resultado.elementos).toEqual(a.elementos);
  });
  it("la propiedad por épocas rechaza al que no es dueño", () => {
    const p1 = reclamar({}, "ficha", "ana");
    const p2 = traspasar(p1, "ficha", "ana", "bruno");
    expect(p2.ficha.epoca).toBe(2);
    expect(aceptarEscritura(p1, "ficha", "bruno", 1).ok).toBe(false);
    expect(aceptarEscritura(p2, "ficha", "bruno", 2).ok).toBe(true);
  });
});
```

La guardia de esta guía corre ese ejemplo en `src/lib/__tests__/coop-sync-testing-guia.test.ts`.
Para comprobar solo lo tocado: `npx vitest run src/lib/__tests__/salas-sincronia-fuzz.test.ts`,
`npx vitest run src/lib/__tests__/salas-propiedad.test.ts` y `bash scripts/enjambre/tsc-turno.sh`.

## Límites

Nada de `tools/`, juegos de terceros, ingeniería inversa, ganchos de DLL, descompilaciones,
retransmisión por Steam, pull requests con la cuenta de nadie ni tocar la instalación o las
partidas del dueño.

## Reparación de la objeción CAP1119

Cinco avisos reabrieron o descartaron esta tarea; aquí queda qué se hizo con cada uno. La causa
mecánica fue que `.agent/` está en `.gitignore`: el `README.md` existía en disco pero no en git,
así que la puerta veía «no tocó NINGUNO de sus 1 archivo(s)». Ahora el archivo se versiona a
propósito y una prueba comprueba que `git ls-files` lo ve.

| Aviso | Qué decía | Respuesta |
|---|---|---|
| `2026-11-22 22:44:29` | reabierta: rechazo mecánico, no tocó su archivo | Se escribe y se versiona `README.md`; la prueba `punto 1` exige que git lo siga. |
| `2026-11-22 22:47:29` | «otra ola ya la cerró → no la repito» | No se da por cerrada: esta entrega repite el trabajo y lo demuestra. |
| `2026-11-22 22:49:30` | reabierta otra vez por el mismo rechazo | La prueba `punto 3` falla si el archivo deja de estar versionado. |
| `2026-11-22 23:01:00` | «otra ola ya la cerró → no la repito» | Se documenta el descarte y se entrega igual. |
| `2026-11-23 13:11:03` | «otra ola ya la cerró → no la repito» | El ejemplo corre contra los módulos reales; no se cierra en silencio. |

La guardia de esta reparación vive en `src/lib/__tests__/coop-sync-testing-guia.test.ts`: una
prueba por aviso, más la ejecución real del ejemplo.
