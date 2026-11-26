# Co-op Sync Testing Skill para StarSeed OS

Esta skill adapta las ideas de prueba de sincronización cooperativa del proyecto `coop-anything` (cranebeaker/coop-anything) a TypeScript puro para StarSeed OS, sin red ni disco.

## Qué es

Un conjunto de patrones y herramientas de prueba para encontrar bugs de sincronización en sistemas distribuidos/cooperativos **antes** de que lleguen a producción. Las ideas principales:

1. **Fuzzing con semilla y oráculos de invariantes** — Miles de sesiones N-jugador deterministas que verifican reglas que nunca deben romperse
2. **Propiedad por épocas** — Un dueño por actor/elemento por época, transferencias con handshake
3. **Mundo falso (fake world)** — Probar la lógica de sincronización sin lanzar el juego/red, con reloj virtual y red con pérdidas
4. **Gemelos de mutación** — Cada fix lleva un test que demuestra que el guardia funciona (apaga el guardia → el test falla)

## Cómo se usa en StarSeed OS

El valor está en las **IDEAS de prueba**, portadas a TypeScript puro sobre `src/lib/salas/sincronia-sala.ts`:

```typescript
// Ejemplo: fuzzer con semilla para fusionarEstados
import { fusionarEstados, type EstadoSala, type ElementoSala } from "../salas/sincronia-sala";

// 1. Generador determinista desde semilla
function generarSesion(semilla: number): { estados: EstadoSala[]; acciones: Accion[] } {
  const rng = new SeededRNG(semilla);
  // ... genera N estados y acciones aleatorias pero reproducibles
}

// 2. Oráculos (reglas que NUNCA deben romperse)
const oraculos = {
  convergencia: (estados: EstadoSala[]) => estados.every(e => iguales(e, estados[0])),
  sinDobleAplicacion: (log: Evento[]) => !log.some(e => e.contador > 1),
  epocaValida: (eventos: Evento[]) => eventos.every(e => e.epocaActual >= e.epocaPrevia),
};

// 3. Ejecutar y verificar
for (let semilla = 0; semilla < 10000; semilla++) {
  const { estados, acciones } = generarSesion(semilla);
  const resultado = ejecutarSync(estados, acciones);
  for (const [nombre, check] of Object.entries(oraculos)) {
    if (!check(resultado)) {
      // Shrink: reducir a la secuencia mínima que falla
      const minimo = shrink(acciones, (a) => !check(ejecutarSync(estados, a)));
      throw new Error(`Oráculo ${nombre} roto con semilla ${semilla}: ${JSON.stringify(minimo)}`);
    }
  }
}
```

## Archivos de referencia

- `SKILL.md` — Descripción original de la skill (herramientas del hub)
- `LEEME-StarSeed.md` — Adaptación a StarSeed OS
- `referencias/` — 5 páginas del manual original:
  - `fuzzing-coop-sync.md` — Fuzzing con semilla y oráculos
  - `actor-ownership.md` — Propiedad por épocas
  - `fake-world-testing.md` — Mundo falso sin juego
  - `desync-hunting.md` — Cazador de desincronizaciones con trazas
  - `network-chaos-testing.md` — Caos de red controlado

## Patrones clave para el enjambre

### 1. Fuzzer con semilla (para `sincronia-sala.ts`)

```typescript
// tests/fuzzer-salas.ts
import { describe, it, expect } from "vitest";
import { fusionarEstados, type EstadoSala, type ElementoSala } from "../salas/sincronia-sala";

describe("Fuzzer de fusión de salas", () => {
  it("convergencia determinista con 1000 semillas", () => {
    for (let semilla = 0; semilla < 1000; semilla++) {
      const { local, remoto, dispositivo } = generarCasoAleatorio(semilla);
      const r1 = fusionarEstados(local, remoto, dispositivo);
      const r2 = fusionarEstados(remoto, local, dispositivo);
      expect(r1.resultado).toEqual(r2.resultado); // Simetría
      expect(r1.conflictos.sort()).toEqual(r2.conflictos.sort());
    }
  });
});
```

### 2. Propiedad por épocas (para elementos con dueño)

```typescript
// Extender ElementoSala con época y dueño
interface ElementoConEpoca extends ElementoSala {
  epoca: number;
  duenio: string;
}

// Regla: solo el dueño en la época actual puede publicar
function puedePublicar(el: ElementoConEpoca, dispositivo: string, epocaActual: number): boolean {
  return el.duenio === dispositivo && el.epoca === epocaActual;
}
```

### 3. Gemelos de mutación (mutation twins)

```typescript
// Cada test tiene su gemelo que rompe la guardia a propósito
describe("fusionarEstados · guardia de época", () => {
  it("rechaza actualización de época anterior", () => {
    const viejo = crearElemento({ epoca: 5, duenio: "A" });
    const nuevo = crearElemento({ epoca: 6, duenio: "B" });
    expect(puedePublicar(viejo, "A", 6)).toBe(false);
  });

  // GEMelo: apaga la comprobación de época → debe fallar
  it("MUTANT: sin comprobación de época acepta actualización vieja", () => {
    const viejo = crearElemento({ epoca: 5, duenio: "A" });
    // Con la guardia rota (epocaNoValidada = true), esto pasaría incorrectamente
    expect(puedePublicarConMutacion(viejo, "A", 6, { epocaNoValidada: true })).toBe(true);
  });
});
```

## Cómo integrar en una tarea del enjambre

1. **Alcance**: ≤ 3 archivos, ≤ 120 líneas cada uno
2. **Archivos típicos**:
   - `src/lib/salas/__tests__/fuzzer-sincronia.test.ts` — Fuzzer con oráculos
   - `src/lib/salas/__tests__/mutation-twins.test.ts` — Gemelos de mutación
   - `src/lib/salas/sincronia-fuzzer.ts` — Utilidades puras del fuzzer (sin test)
3. **Puertas**: `tsc` → `vitest run src/lib/salas/__tests__/fuzzer-sincronia.test.ts` → `next build`

## Ejemplo completo

Ver `src/lib/salas/__tests__/coop-sync-testing-ejemplo.test.ts` (creado por esta tarea).

## Referencias externas

- Original: https://github.com/cranebeaker/coop-anything (commit 5b86e5b, MIT)
- `architecture/repos-libreria-1025.md` — Tareas INF1025I e INF1025J