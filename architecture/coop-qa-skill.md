# Skill coop-qa en StarSeed OS — Documentación y Ejemplo de Uso

> **Fuente:** `cranebeaker/coop-anything` (commit `5b86e5b`, MIT) · Skill copiada en `.agent/skills/coop-qa/`
> **Aplicación en StarSeed OS:** Salas compartidas (`src/lib/salas/`) y juegos de la Protomolécula (`src/lib/protomolecula/`) con **pruebas vitest puras**, sin las herramientas C++/Python del repo original.

---

## 1. Qué es la skill coop-qa

La skill **coop-qa** define una metodología para **probar funcionalidad multiusuario (co-op) sin testers humanos**:

- El código se prueba a sí mismo: bots dentro del juego/sala ejecutan pasos, esperan, asercionan estado compartido y registran PASS/FAIL.
- Se usan **instancias reales** (múltiples clientes simulados), no mocks de red.
- Cada arreglo incluye un **gemelo de mutación**: apagas el arreglo y la prueba debe fallar.
- Se prueban condiciones reales: lag, pérdida de paquetes, reconexión, desincronización.

> **En StarSeed OS:** No lanzamos ejecutables de juego. Probamos la **lógica pura de sincronía** (`fusionarEstados`, `sesion-sincronia`, `sala.ts`) y la **Protomolécula** con vitest, simulando N "clientes" que intercambian `ElementoSala` y verifican convergencia determinista.

---

## 2. Principios adaptados a StarSeed OS

| Principio original | Adaptación StarSeed OS |
|---|---|
| Instalaciones aisladas (copias del juego) | **Tests vitest aislados**: cada test crea su `EstadoSala` propio, sin estado global |
| Launcher: host + N clientes | **Test helpers** que crean N `EstadoSala` y simulan intercambio de operaciones |
| Bot dentro del juego | **Funciones puras** que emiten `Operacion` → `ElementoSala` → `fusionarEstados` |
| Suite + runner | `describe`/`it` de vitest + `npx vitest run <archivo>` |
| Mutation twins | Test compañero que invierte la condición y espera `FAIL` (o usa `vitest --update-snapshots` para snapshot testing) |
| Assert mode first | Verificar `salaId`, número de clientes, roles, `reloj` antes de asercionar resultados |
| Lag/loss runs | Helper `conLag(conPerdida)` que retrasa/descarta operaciones antes de fusionar |
| Game logs/screenshots | `console.log` estructurado + snapshots JSON de `EstadoSala` |

---

## 3. Qué se prueba con coop-qa en este repo

### 3.1 Salas (`src/lib/salas/`)
- **Fusión determinista**: `fusionarEstados(local, remoto, miDispositivo)` converge igual en todas las neuronas.
- **Prioridades P0–P3**: Efímeros (cursores) se descartan; contenido (widgets, parámetros) nunca se pierde; lápidas ganan empates.
- **Anti-eco**: Lo que emite un dispositivo y recibe de vuelta no duplica.
- **Conflictos honestos**: Dos dispositivos editan lo mismo → `conflictos[]` avisa a la UI.
- **Límite de elementos**: `excedeLimite` detecta saturación sin truncar a escondidas.
- **Divergencia legible**: `resumirDivergencia` produce frase honesta en español.

### 3.2 Protomolécula (`src/lib/protomolecula/`)
- **Sesión de sincronía**: `elementoDeOperacion`, `elementoDeEstructura`, `formaCorta`/`desdeFormaCorta` (≤200 B para LoRa).
- **Acumulador de gestos**: Emite cada ≥16 ms, confirma al soltar.
- **Convergencia de molécula**: `moleculaDesdeElementos` reconstruye estado idéntico desde `ElementoSala[]`.
- **Controlador**: `mover`, `dictar`, `deshacer` por autor, con `Operacion` reversible.
- **Vínculos de control**: MIDI/gamepad/HID/OSC/sensor → `Parametro` con curvas y modo "aprender".

### 3.3 Juegos de la Protomolécula (átomos `juegos`)
- Cuando existan átomos de categoría `juegos` (F1/F2), la misma metodología aplica: bots que juegan turnos, verifican checksums compartidos, detectan desincronización.

---

## 4. Helpers de test recomendados (patrón coop-qa)

```ts
// src/lib/__tests__/coop-qa-helpers.ts (a crear)
import type { EstadoSala, ElementoSala } from "@/lib/salas/sincronia-sala";
import type { Operacion, ParametroRef, Autor } from "@/lib/protomolecula/tipos";
import { fusionarEstados, prioridadDeElemento } from "@/lib/salas/sincronia-sala";
import { elementoDeOperacion, formaCorta, desdeFormaCorta } from "@/lib/protomolecula/sesion-sincronia";

/** Crea N estados de sala idénticos (simula N clientes conectados). */
export function crearClientes(n: number, salaId: string): EstadoSala[] {
  return Array.from({ length: n }, (_, i) => ({
    salaId,
    elementos: {},
    reloj: 0,
    miDispositivo: `cliente-${i}`,
  }));
}

/** Simula que un cliente emite una operación y las demás la reciben y fusionan. */
export function emitirYFusionar(
  clientes: EstadoSala[],
  emisorIdx: number,
  op: Operacion,
  cambio: { antes: unknown; despues: unknown; acotado: boolean; reversible: boolean }
): { estados: EstadoSala[]; conflictos: string[][] } {
  const elemento = elementoDeOperacion(op, cambio);
  const emisor = clientes[emisorIdx];
  emisor.elementos[elemento.id] = elemento;
  emisor.reloj += 1;

  const resultados = clientes.map((c, i) => {
    if (i === emisorIdx) return { resultado: c, conflictos: [] as string[] };
    return fusionarEstados(c, emisor, c.miDispositivo);
  });

  return {
    estados: resultados.map(r => r.resultado),
    conflictos: resultados.map(r => r.conflictos),
  };
}

/** Simula lag: retrasa la fusión N ms (en test puro, solo reordena operaciones). */
export function conLag(clientes: EstadoSala[], ops: Operacion[], retrasoMs: number) {
  // En test puro: aplicamos ops en orden distinto para simular llegada tardía
  return ops; // placeholder: la lógica real depende del test
}

/** Simula pérdida: descarta aleatoriamente algunas operaciones antes de fusionar. */
export function conPerdida<T>(items: T[], probabilidad: number): T[] {
  return items.filter(() => Math.random() > probabilidad);
}

/** Verifica convergencia: todos los clientes tienen el mismo estado (excepto efímeros). */
export function verificarConvergencia(clientes: EstadoSala[]): { ok: boolean; diferencias: string[] } {
  const base = clientes[0];
  const diffs: string[] = [];
  for (let i = 1; i < clientes.length; i++) {
    const otro = clientes[i];
    for (const [id, el] of Object.entries(base.elementos)) {
      if (prioridadDeElemento(el) === 0) continue; // ignorar efímeros
      const otroEl = otro.elementos[id];
      if (!otroEl || el.actualizadoEn !== otroEl.actualizadoEn || el.porDispositivo !== otroEl.porDispositivo || !!el.borrado !== !!otroEl.borrado) {
        diffs.push(`Cliente ${i} diverge en ${id}: base=${JSON.stringify(el)} vs otro=${JSON.stringify(otroEl)}`);
      }
    }
  }
  return { ok: diffs.length === 0, diferencias: diffs };
}

/** Mutation twin: invierte una condición y espera que falle. */
export function assertMutationTwin(
  nombre: string,
  testOriginal: () => void,
  testMutado: () => void
) {
  // En vitest: se usa describe.skip / test.todo o se ejecuta en CI separado
  // Aquí solo documentamos el patrón
  console.log(`[MUTATION] ${nombre}: original=PASS, mutado=FAIL esperado`);
}
```

---

## 5. Ejemplo completo: Test de fusión determinista con 4 clientes

Ver `src/lib/salas/__tests__/coop-qa-fusion-determinista.test.ts` (archivo adjunto).

---

## 6. Cómo ejecutar los tests coop-qa

```bash
# Test específico de salas
npx vitest run src/lib/salas/__tests__/coop-qa-fusion-determinista.test.ts

# Test específico de protomolecula sesión
npx vitest run src/lib/protomolecula/__tests__/sesion-sincronia.test.ts

# Todos los tests de salas
npx vitest run src/lib/salas/__tests__/

# Todos los tests de protomolecula
npx vitest run src/lib/protomolecula/__tests__/
```

> **Regla:** Cada `vitest` debe terminar imprimiendo su resumen (`Test Files … passed`, `Tests … passed`). Si no ves el resumen, **no has comprobado nada**: repite sin pipes y léelo entero.

---

## 7. Checklist de revisión coop-qa (para PRs)

- [ ] **Modo asertado**: El test verifica `salaId`, número de clientes, roles antes de asercionar resultados.
- [ ] **Convergencia**: `verificarConvergencia` pasa en todos los clientes (excepto efímeros P0).
- [ ] **Mutation twin**: Existe test compañero que apaga el arreglo y falla (o snapshot diff).
- [ ] **Lag/loss**: Al menos un test usa `conLag` / `conPerdida` y sigue pasando.
- [ ] **Anti-eco**: Verificado que emisor no duplica su propia operación al fusionar.
- [ ] **Conflictos honestos**: Dos dispositivos editan lo mismo → `conflictos[]` no vacío.
- [ ] **Lápidas**: Borrado + edición simultánea → lápida gana (no resurrección).
- [ ] **Límite elementos**: `excedeLimite` detecta >5000 vivos y avisa sin truncar.
- [ ] **Forma corta LoRa**: `formaCorta`/`desdeFormaCorta` < 200 B, round-trip idéntico.
- [ ] **Gestos efímeros**: `crearAcumuladorDeGestos` emite cada ≥16 ms, confirma al soltar.
- [ ] **Deshacer por autor**: `deshacer(autorId)` solo revierte lo suyo, no pisa a otros.

---

## 8. Referencias

- Skill original: `.agent/skills/coop-qa/SKILL.md` + `.agent/skills/coop-qa/referencias/automated-qa.md`
- Adaptación StarSeed: `.agent/skills/coop-qa/LEEME-StarSeed.md`
- Skill hermana: `.agent/skills/coop-sync-testing/` (herramientas C++/Python — **no se usan aquí**, solo ideas)
- Código probado: `src/lib/salas/sincronia-sala.ts`, `src/lib/protomolecula/sesion-sincronia.ts`, `src/lib/protomolecula/controlador.ts`
- Protocolo Jev: `python3 scripts/puente/decidir.py si-no --regla "..." --quien "coop-qa"` para decisiones de umbral.

---

## 9. Próximos pasos para el enjambre

1. **Crear helpers** en `src/lib/__tests__/coop-qa-helpers.ts` (patrón arriba).
2. **Escribir tests coop-qa** para cada función crítica de `sincronia-sala.ts` y `sesion-sincronia.ts`.
3. **Añadir mutation twins** para cada arreglo (regla 5 del SKILL.md).
4. **Integrar lag/loss** en CI: un job que corre tests con `conPerdida(0.1)` y `conLag(100)`.
5. **Documentar en Genesis** (`/genesis`) la sección "QA Automatizado" con últimos resultados.