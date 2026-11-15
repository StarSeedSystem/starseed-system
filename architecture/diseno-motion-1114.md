# Diseños de movimiento de los sueños del 2026-11-14 · dos tareas para el enjambre

Dos entregables del análisis nocturno (`cola-suenos-entregables-2026-11-14.json`) que son
**código**, no informes. Esta ola no tenía ni una sola tarea de código: 42 análisis y 0
escrituras. Estos dos contratos son las primeras dos piezas que el enjambre escribe de verdad.

Cada tarea es un **módulo puro nuevo y pequeño**: ≤ 3 archivos, ≤ 120 líneas por archivo.
El cableado a una página va en otra tarea (no aquí). Nada de `any`. Textos de UI en español
con acentos. `cursor-pointer` en lo clicable. Pruebas con `vitest` (`describe`, `it`,
`expect` de `vitest`; `globals` está en `false` en este repo).

## ADN (lee `memory/principles.md` antes de escribir)

- Paleta Trinity: **zenith** `#007FFF`, **horizonte** `#10B981`, **lógica** `#FFBF00`,
  **raíz/anchor** `#DC143C`, neutro `#FFFFFF`. Los cuatro colores **no se mezclan en un
  mismo elemento**: uno por elemento o por variante.
- Gradiente radial de acento, ~15 % de cobertura.
- Tipografía: titulares ≥ 28 px con **Inter**; cuerpo con **system-ui** y ≤ 65 caracteres.
  Escala φ (1,25 en móvil) y espaciado Fibonacci.
- Sin sombras múltiples. Sin animar dimensiones: solo `transform` y `opacity`.
- Controles en el perímetro, no centrados. Píldoras de acción con radio > 16 px.
- Contraste ≥ 4.5:1. Dianas ≥ 44 px.
- La *jugada rara*: **una** línea de horizonte que atraviesa el fondo sin pasar por el centro
  (proporción 1:2). Una sola vez por vista.
- `prefers-reduced-motion` manda: sin movimiento, la vista sigue siendo legible.

## DIS1114A · Componente React «KineticTitle»

**Archivos declarados**

1. `src/components/kinetic/KineticTitle.tsx` (nuevo)
2. `src/components/kinetic/__tests__/kinetic-title.test.tsx` (nuevo; las pruebas de
   componentes van en `__tests__/` y corren en jsdom)

**Qué**

Componente que compone una secuencia de titular cinética al estilo *Swiss kinetic type*:
el título entra por tramos con una sola pista visual, al ritmo. Física de resortes con
`framer-motion` (ya está en `package.json`: `^12.29.2`; no añadas dependencias) usando
`stiffness`, `damping` y `mass` como parámetros con valores por defecto razonables y
ajustables por prop. Nada de animar `width`, `height`, `top` ni `left`.

**Props mínimas** (sin `any`)

- `titulo: string`
- `variante?: "sobria" | "expresiva" | "experimental"` (por defecto `"sobria"`)
- `ritmo?: number` (ms entre tramos; por defecto 90)
- `className?: string`

**Variantes**

- *Sobria*: acento solo zenith, movimiento sutil, fondo neutro.
- *Expresiva*: los cuatro colores en secuencia, ritmo más rápido, rebote visible.
- *Experimental*: al pasar el cursor dispara un resorte extra (sin audio: no hay pistas de
  sonido en el OS).

**Prueba (mínimo, 4 casos)**

1. Renderiza el titular y sus tramos.
2. Con `variante="expresiva"` aparecen las cuatro clases de color (una por tramo), nunca
   mezcladas en un mismo elemento.
3. Con `prefers-reduced-motion` (simulado con `window.matchMedia`) **no** hay animación:
   el texto queda visible y sin transformación.
4. La línea de horizonte aparece **una sola vez** en el DOM.

## DIS1114B · Transición Risograph para anuncios

**Archivos declarados**

1. `src/lib/video/editorial-paper/tokens.ts` (nuevo)
2. `src/lib/video/editorial-paper/transitions.ts` (nuevo)
3. `src/lib/video/editorial-paper/__tests__/transitions.test.ts` (nuevo)

**Qué**

Dos tintas con registro desalineado (*off-register*): azul eléctrico y verde esmeralda,
desplazamiento fuera de registro y grano de dos tintas. Duración **0,8 s**. El compositor de
video (`src/components/creation/lienzo-composer.tsx`) hoy no soporta dos tintas; esta tarea
**solo** deja los tokens y la función de transición listos, con una bandera
`useRisographTransition` que permite volver al estilo anterior. El cableado en el compositor
va en otra tarea.

**Tokens** (`tokens.ts`): `zenith`, `horizonte`, `logica`, `anchor`, `neutro` con su valor y
su cobertura; más el gradiente radial de acento al 15 %. Aquí sí viven los hex (una sola
vez, en el archivo de tokens).

**Transición** (`transitions.ts`): una función pura que devuelve la transición (desplazamiento
off-register, dos tintas, duración 0,8 s, easing) y respeta la bandera: con
`useRisographTransition = false` devuelve la transición anterior sin cambios.

**Prueba (mínimo, 4 casos)**

1. Con la bandera activa: duración 0,8 s y dos tintas.
2. El desplazamiento es *off-register*: no es cero y no cruza el centro (comprueba que el
   eje vertical y el horizontal no se anulan).
3. Con la bandera inactiva: la transición es la anterior (sin dos tintas).
4. Los tokens tienen los cuatro colores Trinity y el neutro, con cobertura declarada.
