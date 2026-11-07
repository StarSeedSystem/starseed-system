# Auditoría y unificación de gestión de prefers-reduced-motion

## Resumen

Este documento describe la estrategia para unificar la gestión de `prefers-reduced-motion` en los componentes de avatar de StarSeed OS. La auditoría reveló múltiples implementaciones duplicadas que seguían patrones similares pero tenían pequeñas variaciones, lo que aumentaba el mantenimiento y podía causar inconsistencias.

## Problema identificados

### Referencia obsoleta
- La referencia a `src/components/avatares/avatar-vivo.tsx:370` ya no es válida; el archivo actual tiene 412 líneas

### Implementaciones duplicadas encontradas

1. **`src/lib/avatares/movimiento/motor.ts:103-111`**
   - Función `prefiereReducirMovimiento()` que lee `window.matchMedia("(prefers-reduced-motion: reduce)").matches`
   - Usada por el motor de movimiento principal para decidir el nivel

2. **`src/components/avatares/avatar-vivo.tsx:168-182`**
   - Estado `reducir` y `useEffect` que añade un listener al media query
   - Duplicación directa del patrón del motor

3. **`src/components/movimiento/cristal-3d.tsx:8-20`**
   - Estado `reduced` similar con un patrón idéntico

4. **`src/components/aurora/quantum-orb.tsx:778-785`**
   - Función `prefersReducedMotion()` exportada con la misma lógica

5. **Otros componentes**
   - Múltiples componentes independientes (cards, loaders, fondos, mapas de señales) que tienen sus propias implementaciones

### Costos de la duplicación

- **Mantenimiento**: Cada cambio requiere actualizaciones en múltiples lugares
- **Inconsistencias**: Diferentes componentes pueden tener diferentes respuestas al cambio del sistema
- **Rendimiento**: Extra listeners y verificaciones redundantes
- **Cobertura de pruebas**: Las pruebas necesitan mocks separados para cada componente

## Estrategia unificada

### 1. Singleton centralizado (`src/lib/avatares/movimiento/prm.ts`)

Creado un singleton PRM centralizado que:

- **Expone un único punto de entrada**: `isReducedMotion()` (y `isReducedMotionActive()` para compatibilidad)
- **Gestiona el estado**: Lee la preferencia una sola vez por sesión
- **Sincroniza**: Escucha los cambios del sistema y notifica a todos los suscriptores
- **SSR-safe**: Trata el caso de servidor sin ventana adecuadamente

### 2. Sustitución del código del motor (`src/lib/avatares/movimiento/motor.ts`)

- Reemplazar `prefiereReducirMovimiento()` por la función `isReducedMotion()` del singleton
- Eliminar la lógica de matchMedia local (archivo ahora más limpio)

### 3. Limpieza de componentes (`src/components/avatares/avatar-vivo.tsx`)

- Eliminar el `useEffect` y el estado `reducir` del avatar
- Usar `isReducedMotion()` del singleton en su lugar (líneas 166-182 eliminadas)

### 4. Actualización de componentes secundarios

- `src/components/movimiento/cristal-3d.tsx`
- `src/components/aurora/quantum-orb.tsx`
- `src/components/movimiento/lottie-vista.tsx` (test file)
- Cualquier otro componente que tenga su propio código de prefers-reduced-motion

### 5. Infraestructura de pruebas

- Actualizar `src/components/movimiento/__tests__/lottie-vista.test.tsx` para mockear el singleton en vez de el patrón matchMedia local
- Crear tests para el singleton (ver sección de tests a continuación)

## Guía de implementación para otros componentes

### Componentes que necesitan unificación

Cuando un componente necesite verificar `prefers-reduced-motion`:

```typescript
// Importar el singleton (única exportación)
import { isReducedMotion } from "@/lib/avatares/movimiento/prm";

// Leer valor (SSR-safe, singleton memoizado)
const reducido = isReducedMotion();

// Opcional: suscribirse a cambios del sistema operativo
useEffect(() => {
  const cancel = subscribePRM((activo) => {
    // forzar actualizaciones de estado si es necesario
  });
  return cancel;
}, []);
```

### Evitar duplicación

**Prohibido**: No escribir un `useEffect` propio que use `matchMedia` para `prefers-reduced-motion`.

**Permitido**: Usar `isReducedMotion()` del singleton para lecturas.

### Mantener la salud del singleton

El singleton NO debería tener un cleanup explícito (se destruye con el módulo).

## Beneficios de la unificación

### 1. Cierta consistencia

- Un único origen de verdad: Todas las componentes usan la misma fuente para PRM
- Actualizaciones atómicas: El sistema operativo cambia todo simultáneamente
- Comportamiento predecible: Sin componentes que se queden atrás

### 2. Simplicidad del mantenimiento

- Función única para corregir: Los bugs solo necesitan una reparación
- Reducción de líneas: Múltiples duplicaciones eliminadas
- Cobertura de pruebas: Las pruebas del singleton cubren todo PRM

### 3. Salud del sistema

- Evita memory leaks: Un listener por sesión en vez de múltiples
- Detección temprana de bugs: Pruebas centralizadas detectan problemas

### 4. Mejoras en las pruebas

- Mock central: Los tests mockean un solo singleton en vez de múltiples componentes
- Esperas deterministas: PRM compartido entre pruebas evita interferencias

## Tests

### Test del singleton PRM

```typescript
// src/lib/avatares/movimiento/__tests__/prm.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isReducedMotion, subscribePRM } from "../prm";

// Mockear el mediaQueryList para pruebas deterministas
function mockMatchMedia(matches: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query.includes("reduced-motion") ? matches : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("isReducedMotion singleton PRM", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Resetear el módulo para pruebas limpias
    vi.resetModules();
    // Reimportar después de resetear para evitar caché
  });

  it("lee el estado inicial del sistema", () => {
    mockMatchMedia(false);
    expect(isReducedMotion()).toBe(false);
  });

  it("lee true cuando el sistema pide menos movimiento", () => {
    mockMatchMedia(true);
    expect(isReducedMotion()).toBe(true);
  });

  it("se actualiza cuando el sistema operativo cambia", () => {
    mockMatchMedia(false);
    const estados: boolean[] = [];
    const cancel = subscribePRM((activo) => estados.push(activo));

    mockMatchMedia(true);
    (window.matchMedia as any).mock.results[0].value.dispatchEvent?.new Event('change');

    expect(estados).toContain(true);
    cancel();
  });
});
```

### Pruebas de componentes que usan el singleton

```typescript
// Ejemplo: Componente actualizado usando PRM centralizado

import { isReducedMotion } from "@/lib/avatares/movimiento/prm";

function MiComponente() {
  const reducido = isReducedMotion();

  // El resto del componente...
}
```

### Pruebas de componentes antiguos

```typescript
// Eliminar pruebas de componentes antiguos que dependían de código local de PRM
// Ejemplo: lottie-vista.test.tsx actualizado para mockear el singleton en vez de window.matchMedia local
```

## Orden de integración

1. **Crear singleton PRM** ✅ (`src/lib/avatares/movimiento/prm.ts`)
2. **Actualizar motor de movimiento** (`src/lib/avatares/movimiento/motor.ts`)
3. **Limpiar AvatarVivo** (`src/components/avatares/avatar-vivo.tsx`)
4. **Actualizar otros componentes**
5. **Migrar tests**
6. **Verificar todo**

## Orden de revisión

1. Todos los imports deben ser relativos (`./prm`)
2. No usar `any` para el código PRM
3. Mantener la prueba TDD: Escribir tests para el singleton primero
4. Reducir mutations: Editar archivos uno por uno en ≤ 80 líneas
5. Correr pruebas: `npx vitest run src/lib/avatares/movimiento/__tests__/prm.test.ts`
6. Correr tests del motor: `npx vitest run src/lib/avatares/movimiento/__tests__/movimiento-niveles.test.ts`

## Estado actual

**EN PROGRESO**: El singleton ha sido creado, pero necesita ser:

1. Integrado con el motor de movimiento
2. Usado por AvatarVivo
3. Integrado con componentes secundarios
4. Probado completamente

El patrón y la estrategia están definidos en este documento para unificación consistente.

## Casos especiales

### SSR (renderizado en servidor)

El singleton maneja el caso `typeof window === "undefined"` retornando `false`. Los componentes nunca necesitan verificar el SSR explícitamente.

### Múltiples pestañas

El singleton mantiene el estado PRM actual del sistema operativo; cambios en cualquier pestaña se reflejan en todas las componentes instantáneamente.

### performance

El listener del singleton solo se añade una vez por sesión; las lecturas son O(1) con lectura memoizada.

### modo oscuro/sistema

Respeta los cambios dinámicos del sistema operativo; no necesita hooks adicionales.
