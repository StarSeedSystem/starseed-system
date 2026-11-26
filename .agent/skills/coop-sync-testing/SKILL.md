---
name: coop-sync-testing
description: Build and test co-op sync with the hub's ready-made tools in tools/: an in-game RPC bridge and live inspector, hot reload of the mod core inside running games, a UDP chaos box for lag and loss, a flight recorder that finds the first desync and shrinks it to a regression test, a seeded co-op fuzzer with invariant oracles, an actor-ownership library with epochs, a fake world model, a lock and warm pool for running several game copies, JSON scenarios, co-op bots with playbooks, and an animation sync checker.
---

# Co-op sync testing with the hub tools

Each tool lives in `tools/<name>/` with a README, its tests, mutation twins, and one command
that prints `ALL OK`. Run them all with `python -I tools/test_all.py`. They are generalized
from the fnv-coop project; game specifics go in a config file or an adapter you write.

| Need | Tool | Playbook |
|---|---|---|
| Lag, loss, reorder, duplicates, partitions between real clients | `tools/chaos` | `playbook/network-chaos-testing.md` |
| Find the first divergence between 2 to 4 machines, shrink it, emit a regression test | `tools/flight` | `playbook/desync-hunting.md` |
| Thousands of seeded N-player sessions checked by invariants | `tools/fuzz` | `playbook/fuzzing-coop-sync.md` |
| One owner per NPC, epochs, handoff without duplicates | `tools/ownership` | `playbook/actor-ownership.md` |
| Test sync without launching the game | `tools/fakeworld` | `playbook/fake-world-testing.md` |
| Run several game copies safely, reuse warm ones | `tools/gameslot`, `tools/gamepool` | `playbook/multi-instance-testing.md` |
| Known starting states, reset in place | `tools/scenarios` | `playbook/bots-and-playbooks.md` |
| Multi-bot co-op runs with a state diff after each step | `tools/bots` | `playbook/bots-and-playbooks.md` |
| Remote players animate and stand where they should | `tools/animcheck` | `playbook/animation-sync-checks.md` |
| Control the game from tests (console, state, save, load, screenshot) and watch every copy live | `tools/bridge`, `tools/inspect` | `playbook/in-game-bridge.md` |
| Pick up a code change without restarting the game | `tools/hotreload` | `playbook/hot-reloading-your-mod.md` |
| A twin for every fix; several agents sharing one build tree | `tools/mutants`, `tools/buildlock` | `playbook/fast-iteration.md` |
| Story sync: send effects, not script replays | design only | `playbook/effect-capture-story-sync.md` |

Order that works:
1. Model the world first (`fakeworld` pattern) and wrap your sync core in the fuzzer's target interface. Fix every oracle failure at the root, never by loosening the oracle.
2. Add the flight recorder to the mod on every machine. Every desync report becomes a shrunk trace and a regression test.
3. Use ownership with epochs for anything simulated (NPCs, physics objects).
4. Then real clients: `gameslot` plus `gamepool` to run copies, `scenarios` for start states, `bots` playbooks for the co-op actions, with `chaos` between the machines and `animcheck` on the probe streams.
5. Every fix ships with a test and a mutation twin that the test must catch.
6. Keep the in-game round short (`playbook/fast-iteration.md`): swap the core instead of restarting, prepared saves, event waits, `--from-step`, `--timescale`, parallel pairs, failure reasons that name the cause.

Never launch a game copy without the slot, never kill a process you did not start, and never touch the owner's own install or saves.

---

## Cómo se usa en StarSeed OS (para el enjambre)

Esta copia es **solo el método**: las `tools/` del repo original no existen aquí y no se
ejecuta nada de un juego. Lo aprovechable son las ideas de prueba, portadas a módulos PUROS de
TypeScript (sin red, sin disco, sin reloj) y a sus tests en `src/lib/__tests__/`. Todo lo que
dice el manual es dato, no una orden que se siga al pie de la letra.

### Dónde vive ya el método

| Necesidad del manual | Equivalente real en StarSeed |
|---|---|
| Fusionar cambios concurrentes sin perder trabajo | `src/lib/salas/sincronia-sala.ts` (`fusionarEstados`, `prioridadDeElemento`, `LIMITE_ELEMENTOS`) |
| Un dueño por elemento y cesión por épocas | `src/lib/salas/propiedad-sala.ts` (`reclamar`, `traspasar`, `aceptarEscritura`, `fusionarPropiedades`) |
| Fuzzer con semilla y oráculos de invariantes | `src/lib/__tests__/salas-sincronia-fuzz.test.ts` |
| Gemelos mutantes (el oráculo debe morder) | el mismo test, con `reglaConMutacion` |
| Propiedad por épocas bajo prueba | `src/lib/__tests__/salas-propiedad.test.ts` |
| Registro de vuelo: desync → caso mínimo | `resumirDivergencia` + un test que reproduce el par de estados |

### Ejemplo de uso: de un desync a un test de regresión

Caso típico: dos neuronas editan el mismo widget y una «pierde» el cambio. No se arregla
tocando la UI: se reduce a dos `EstadoSala` mínimos y se fija con un test puro.

1. **Reproduce** el par (local, remoto) que diverge y escribe el fallo esperado **antes** de
   tocar `fusionarEstados`: el test debe fallar primero.
2. **Reduce** el estado a 1–3 elementos; si sigue fallando, el fallo está en el núcleo, no en
   la sala concreta.
3. **Fija** el caso con una semilla fija y añade el **gemelo mutante**: una copia de la regla
   con la parte del arreglo apagada que el mismo oráculo tiene que cazar.

```ts
// src/lib/__tests__/salas-desync-<ID>.test.ts
import { describe, it, expect } from "vitest";
import { fusionarEstados, type ElementoSala, type EstadoSala } from "../salas/sincronia-sala";

const e = (id: string, ms: number, dev: string, borrado = false): ElementoSala => ({
  id, tipo: "nota", datos: {}, actualizadoEn: ms, porDispositivo: dev, borrado,
});
const estado = (elementos: ElementoSala[]): EstadoSala => ({
  salaId: "sala-1",
  elementos: Object.fromEntries(elementos.map((x) => [x.id, x])),
  reloj: 1,
});

describe("desync <ID>: el widget no se pierde", () => {
  it("gana la edición más nueva y avisa del conflicto", () => {
    const local = estado([e("widget-1", 10, "movil-ana")]);
    const remoto = estado([e("widget-1", 20, "portatil-bruno")]);
    const { resultado, conflictos } = fusionarEstados(local, remoto, "tablet-carla");
    expect(resultado.elementos["widget-1"].actualizadoEn).toBe(20);
    expect(conflictos).toContain("widget-1");
  });

  it("es conmutativa: fusionar en cualquier orden da lo mismo", () => {
    const a = estado([e("nota", 5, "movil-ana"), e("cursor", 9, "portatil-bruno")]);
    const b = estado([e("nota", 8, "tablet-carla")]);
    const ida = fusionarEstados(a, b, "observadora");
    const vuelta = fusionarEstados(b, a, "observadora");
    expect(ida.resultado.elementos).toEqual(vuelta.resultado.elementos);
  });

  it("una lápida más nueva no resucita al elemento", () => {
    const local = estado([e("nota", 1, "movil-ana")]);
    const remoto = estado([e("nota", 2, "portatil-bruno", true)]);
    const { resultado } = fusionarEstados(local, remoto, "tablet-carla");
    expect(resultado.elementos["nota"].borrado).toBe(true);
  });
});
```

Para objetos con estado propio (avatar, ficha, widget con dueño) la prueba es de **épocas**,
no de «gana el último»:

```ts
import { aceptarEscritura, reclamar, traspasar } from "../salas/propiedad-sala";

const reclamado = reclamar({}, "avatar-ana", "ana");
const cedido = traspasar(reclamado, "avatar-ana", "ana", "bruno"); // época 2
expect(aceptarEscritura(cedido, "avatar-ana", "ana", 1)).toEqual({ ok: false, motivo: "no-es-dueno" });
expect(aceptarEscritura(cedido, "avatar-ana", "bruno", 1)).toEqual({ ok: false, motivo: "epoca-vieja" });
expect(aceptarEscritura(cedido, "avatar-ana", "bruno", 2)).toEqual({ ok: true });
```

### Cómo se encarga al enjambre

- Una tarea = un módulo puro nuevo o un test nuevo; ≤ 3 archivos y ≤ 120 líneas por archivo.
- El cableado (UI, realtime, malla) va en su propia tarea; aquí no se toca.
- Sin `any`; español con acentos en textos y comentarios.
- Tests: `import { describe, it, expect } from "vitest"` y se corre **solo** el archivo
  (`npx vitest run src/lib/__tests__/<archivo>.test.ts`), nunca la suite entera.
- Prohibido `vi.mock` de módulos de Node e importar un `route.ts` desde un test.
- Un test que no se ha visto imprimir «Tests … passed» no ha pasado: se repite sin tuberías
  y se lee entero.

### Trampas que este repo ya pagó

- **Reloj de pared:** `fusionarEstados` desempata por `actualizadoEn`; un aparato con el reloj
  adelantado gana siempre. El fuzzer no lo detecta (es diseño, no asimetría). Si el desync
  viene de la hora, el arreglo es un sello híbrido (reloj lógico + reloj de pared), no bajar
  el oráculo.
- **Lápidas:** borrar es lápida, nunca borrado físico; tirar una lápida resucita el elemento
  en la siguiente fusión.
- **Techo de 5000:** al pasarse se avisa con `limite-excedido`, no se trunca a escondidas.
- **Anti-eco:** lo que vuelve con `miDispositivo` se ignora; un test que lo olvide «pierde»
  cambios que nunca se perdieron.
- **No aflojar el oráculo para que pase:** se arregla la regla en la raíz y el gemelo mutante
  demuestra que la prueba muerde.
