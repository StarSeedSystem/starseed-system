---
id: DIS1114C
ola: DIS1114
titulo: Panel de lanzamiento Swiss-Grid con kinetic type y animación 60fps
fecha: 2026-11-14
---

## La tarea DIS1114C
Título: Panel de lanzamiento Swiss-Grid con tipografía Fontshare y animación 60fps
Archivos declarados:
- src/components/launch/LaunchPanel.tsx (nuevo)
- src/components/launch/launch-panel.module.css (nuevo)
- src/components/launch/__tests__/launch-panel.test.tsx (nuevo)

### Qué hay que hacer

Un componente de UI que muestra tarjetas de lanzamiento (*product facts*, *launch cards*) con
estética **Swiss Grid**: cuadrícula con proporción **1:1.618** para los paneles cardinales,
titulares en **Inter**, cuerpo en **system-ui**, paleta StarSeed (zenith `#007FFF`, horizonte
`#10B981`, lógica `#FFBF00`, raíz `#DC143C`, neutro `#FFFFFF`), gradiente radial de acento al
**15 %** de cobertura, píldoras de acción con radio **> 16 px**, sin sombras múltiples y con
los controles en el perímetro (nunca centrados).

**Animación 60 fps**: las tarjetas entran con desplazamiento vertical + *fade-in*, y solo
con `transform` y `opacity` (nunca dimensiones: nada de animar `width`, `height`, `top` ni
`left`). Nada de dependencias nuevas: `framer-motion` ya está en `package.json` (`^12.29.2`)
y se puede usar, pero si lo usas el movimiento tiene que salir de `transform`/`opacity`.

**La jugada rara**: una **única** línea de horizonte que atraviesa la tarjeta sin tocar el
centro (proporción 1:2), animada con `transform: translateX`. Aparece **una sola vez por
vista**, nunca en dos tarjetas a la vez.

**Variantes** (prop `variante`, sin `any`):

- `sobria`: solo *fade-in*, colores neutros predominantes.
- `expresiva`: micro-movimientos de escala en los íconos y acento zenith al pasar el cursor.
- `experimental`: la línea de horizonte se desplaza con `translateX` al navegar.

**Accesibilidad**: `prefers-reduced-motion` respetado (sin movimiento, todo legible),
contraste ≥ 4.5:1, dianas ≥ 44 px, titulares ≥ 28 px, escala tipográfica φ (1,25 en móvil) y
espaciado Fibonacci. Etiquetas y roles correctos; texto de UI en español con acentos.

### Archivos y límites

Máximo 3 archivos, ≤ 120 líneas cada uno. No reescribas archivos grandes que ya existen. No
añadas dependencias ni cambies `package.json`. Los hex de la paleta viven **una sola vez**,
en el archivo CSS; en el TSX se usan clases o variables.

### Puertas

Antes de tocar nada, mide la línea base:
`NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit --skipLibCheck -p .`
Al terminar: **cero errores nuevos** y `npx vitest run src/components/launch` en verde. Si
una prueba falla, se arregla el código, no la prueba.

### Pruebas (mínimo, 4 casos)

1. Renderiza las tarjetas con su título y su cuerpo.
2. La línea de horizonte aparece **una sola vez** en el DOM.
3. Con `prefers-reduced-motion` simulado, no hay animación (no hay `transform` aplicado).
4. Contraste: el texto de la tarjeta tiene contraste ≥ 4.5:1 frente a su fondo (comprueba con
   una función de contraste propia en la prueba, no con axe).

### Al terminar

Un commit con este asunto exacto:
`Ola DIS1114 · Carril Opus · DIS1114C: Panel de lanzamiento Swiss-Grid con kinetic type y animación 60fps`
y al final `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
Empuja a `nube/cc-20261114/ola/DIS1114C`:
`git push origin HEAD:refs/heads/nube/cc-20261114/ola/DIS1114C`.
La última línea de tu respuesta es UNA de estas:
`INTEGRABLE · rama <nombre> · tsc y vitest en verde (<n> pruebas)` ·
`PENDIENTE-DE: <qué>` · `NO APLICA: <motivo>`.
