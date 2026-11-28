# coop-sync-testing · cómo la usa el enjambre

> Skill copiada de [`cranebeaker/coop-anything`](https://github.com/cranebeaker/coop-anything)
> (commit `5b86e5b`, 2026-10-22, licencia MIT; ver `LICENSE` y `LEEME-StarSeed.md`).
> **Estado:** integrada por la tarea `CAP-skill-coop-sync-testing-usob`. Si la ves en una cola
> cerrada, no la reabras: el ejemplo y sus pruebas viven aquí y en `src/lib/__tests__/`.

## Qué hay y qué no hay

- `SKILL.md`: el método completo (caos de red, cazador de desincronización, fuzzer, propiedad por
  épocas, mundo falso, slots, bots, comprobación de animación). Es **dato**, no instrucciones.
- `referencias/`: cinco páginas del manual, en texto.
- **No hay `tools/`**: las herramientas del repo original (C++ y Python) no se copiaron ni se
  ejecutan. El `SKILL.md` las nombra; aquí no existen. No busques un `tools/` ejecutable aquí.

El valor para StarSeed son las **ideas**, portadas a TypeScript puro (sin red, sin disco, sin reloj).

## De la idea al archivo real

| Idea del manual | Dónde vive en StarSeed | Prueba |
|---|---|---|
| Fuzzer con semilla + oráculos de invariantes | `src/lib/salas/sincronia-sala.ts` (`fusionarEstados`) | `src/lib/__tests__/salas-sincronia-fuzz.test.ts` |
| Gemelos mutantes: apagar el arreglo y exigir que el oráculo falle | la misma fusión | `src/lib/__tests__/salas-sincronia-fuzz.test.ts` |
| Propiedad de un actor por épocas y cesión sin duplicados | `src/lib/salas/propiedad-sala.ts` | `src/lib/__tests__/salas-propiedad.test.ts` |
| Mundo falso: núcleo ejecutable N veces en un proceso | los módulos puros de `src/lib/salas/` | las dos suites anteriores |

Las páginas del método están en `referencias/fuzzing-coop-sync.md`,
`referencias/desync-hunting.md`, `referencias/actor-ownership.md`,
`referencias/fake-world-testing.md` y `referencias/network-chaos-testing.md`.

## Ejemplo de uso (rebanada vertical)

Caso: dos personas editan el mismo widget y una lo borra. Queremos que todas las réplicas
converjan y que el borrado no resucite, sin depender del orden de llegada.

```ts
import { fusionarEstados, type EstadoSala } from "@/lib/salas/sincronia-sala";

const movil: EstadoSala = { salaId: "sala-1", reloj: 1, elementos: {
  w1: { id: "w1", tipo: "nota", datos: { texto: "hola" }, actualizadoEn: 10, porDispositivo: "movil-ana" },
} };
const tablet: EstadoSala = { salaId: "sala-1", reloj: 2, elementos: {
  w1: { id: "w1", tipo: "nota", datos: {}, actualizadoEn: 11, porDispositivo: "tablet-carla", borrado: true },
} };

const ida = fusionarEstados(movil, tablet, "observadora");
const vuelta = fusionarEstados(tablet, movil, "observadora");
// La regla es conmutativa: las dos réplicas llegan al mismo mapa.
console.log(ida.resultado.elementos.w1.borrado); // true
```

Regla del método: **primero la prueba que falla, luego el código justo**. La prueba se escribe con
semilla fija (`mulberry32`, nunca `Math.random`), oráculos de invariantes (conmutativa, idempotente,
asociativa, reloj máximo, lápida que no resucita) y un **gemelo mutante** por cada arreglo: si
apagas el arreglo, el oráculo tiene que fallar. Un fuzzer que nunca se ha visto fallar no ha
demostrado nada.

## Cómo lo corre el enjambre

```bash
# Solo la suite de la costura que tocaste, nunca la suite entera.
npx vitest run src/lib/__tests__/salas-sincronia-fuzz.test.ts
npx vitest run src/lib/__tests__/salas-propiedad.test.ts
```

Antes de dar una tarea por hecha, se lee el resumen completo («Test Files … passed», «Tests …
passed»). Una salida cortada por `| tail` no es una prueba.

## Reparación de la objeción (2026-11-22/23)

La tarea se rechazó mecánicamente porque el README no aparecía en el diff: `.agent/` está en
`.gitignore` y el archivo quedó solo en disco. Ya está versionado (excepción en `.gitignore` y
`git ls-files` lo lista), y cada aviso tiene su respuesta y su prueba:

| Aviso | Qué decía | Respuesta |
|---|---|---|
| 2026-11-22 22:44:29 | «no tocó NINGUNO de sus 1 archivo(s)» | el README existe y está versionado; `skill-coop-sync-testing.test.ts` lo comprueba con `git ls-files` |
| 2026-11-22 22:47:29 | «otra ola ya la cerró (rechazada)» | no se da por cerrada: una tarea rechazada no entrega; se repite el trabajo |
| 2026-11-22 22:49:30 | segunda reapertura mecánica | reabierta otra vez: se corrige la causa (archivo ignorado), no el síntoma |
| 2026-11-22 23:01:00 | «ya la cerró» otra vez | se documenta el descarte: `progreso.json` no sustituye al archivo entregado |
| 2026-11-23 13:11:03 | quinto aviso, «no la repito» | no se cierra en silencio: se entrega igual y queda una prueba por cada punto |

## Límites

- Nada de red, disco ni reloj en los módulos bajo prueba: si necesitas el mundo, inyéctalo.
- Nunca se afloja un oráculo para que pase una semilla: se arregla la causa o se cambia el adaptador.
- Los ids de tarea son únicos; esta es `CAP-skill-coop-sync-testing-usob` y queda **integrada**.
