# SOP · Dock: mantener presionado, arrastrar y opciones por icono

> Ola 1025U · V1a · 2026-10-26. Fuente de verdad del gesto y del menú de los iconos del OmniDock
> (Trinity Anchor). El registro de accesos (`dock-config.ts`, `app-catalog.ts`, CLAUDE.md §11) no cambia.

## Qué hace

Sobre cualquier icono del dock, con ratón, dedo o lápiz:

| Gesto | Resultado |
|---|---|
| Toque / clic | Navega, igual que siempre. |
| **Mantener 450 ms y soltar** (sin arrastrar) | Abre el **menú de opciones** del icono. |
| **Mantener 450 ms y arrastrar** | **Reordena** el icono en el dock de ese perfil. Soltar sobre una carpeta lo mete dentro. |
| Clic derecho · tecla Menú · Mayús+F10 | Abre el mismo menú (teclado y ratón). |
| Menú → «Mover en el dock» | Modo teclado: ← → mueven, Intro suelta, Esc cancela. |

El orden se guarda en **`starseed.dock.items.v2`** (y las carpetas en `starseed.dock.folders.v1`) por
`saveDockConfig` / `saveDockFolders`: el mismo almacén que ya viaja con la cuenta (`user_settings.prefs`).
No hay almacén nuevo.

## Umbrales (pedidos por Alex)

- **450 ms** de pulsación sin soltar (`RETARDO_PULSACION_MS`).
- **8 px**: moverse **más** de 8 px antes de los 450 ms cancela (era un deslizamiento del carril); cumplido
  el tiempo, moverse más de 8 px ya es arrastre. Exactamente 8 px no cancela.
- Animación de hueco y de aterrizaje: **200 ms**, solo `transform` (y `opacity` en el menú). Con
  `prefers-reduced-motion` / «Reducir movimiento» el icono cae al instante.

## Piezas

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Puro | `src/lib/dock/pulsacion-larga.ts` | Máquina de estados `inactivo → esperando → activa → arrastrando`, temporizadores inyectables. |
| Puro | `src/lib/dock/orden-dock.ts` | Entradas del carril, `reordenarRaiz`, `reordenarEnCarpeta`, meter/sacar de carpeta, quitar/devolver, geometría del hueco. Devuelven la **misma referencia** si no hay cambio. |
| Puro | `src/lib/dock/acciones-rapidas.ts` | Catálogo de 2–5 acciones por app + genéricas. |
| Puro | `src/lib/dock/eventos-dock.ts` | Contrato con V1b (diseño de iconos). |
| Hook | `src/components/layout/dock/use-pulsacion-larga.ts` | Pointer Events → detector. Un solo puntero a la vez. |
| Hook | `src/components/layout/dock/use-gesto-dock.ts` | Mide celdas, mueve el icono, vista previa del hueco, auto-desplazamiento del carril, teclado, anuncios. |
| UI | `src/components/layout/dock/menu-dock-item.tsx` | Menú liquid-glass (portal, 360 px, filas de 44 px). Se carga con `React.lazy` desde el dock. |
| UI | `src/components/layout/dock/aviso-deshacer.tsx` | «Quitado del dock · Deshacer» (8 s). |
| UI | `src/components/layout/dock/acciones-internas.ts` | Ejecuta las acciones `funcion` / `evento` / `ruta`. |
| Dock | `src/components/layout/omni-dock.tsx` | Cablea todo; cada celda lleva `data-dock-celda`, `data-dock-carril`, `data-dock-pulsable`, `data-dock-carpeta`. |

El dock vive en el layout raíz: lo ligero (gesto, orden) entra con él; el menú y el catálogo de apps se
cargan solo al abrir el primer menú.

## Convivencia con los gestos que ya había

- **Bajar el dock** (`DockDeslizable` / `useArrastrePanel`): mientras el gesto está activo o arrastrando,
  el `pointermove` del carril no se propaga (`stopPropagation`); el `pointerup/cancel` sí.
- **Arrastre con ratón para desplazar el carril**: se apaga al activarse la pulsación; y una pulsación
  que espera se cancela si el carril empieza a desplazarse.
- **Táctil**: `touchmove` no pasivo que hace `preventDefault` solo con el gesto activo/arrastrando.
- **Clic posterior**: tras una pulsación o un arrastre el clic se suprime (hasta 450 ms o el siguiente `pointerdown`).
- `contextmenu` siempre se anula en un icono (en móvil el menú del sistema pisaría el nuestro).

## Menú de un icono

1. **Acciones rápidas** propias de esa app (catálogo) o las genéricas.
2. **Abrir · Abrir en ventana nueva · Información** (descripción del `APP_CATALOG` si la hay).
3. **Mover en el dock**, **Sacar de «carpeta»** / **Meter en «carpeta»**.
4. **Cambiar diseño de este icono** y **Plantillas de iconos del perfil** → ver «Contrato con V1b».
5. **Quitar del dock** → apaga el icono (`enabled:false`, no lo borra) y ofrece **Deshacer**.
   Los accesos fundamentales (`settings`, `mylib`, `hub`; invariantes del núcleo) no se pueden quitar desde
   aquí: la fila sale deshabilitada con su motivo.

## Contrato con V1b (diseño de iconos)

Dos eventos de `window`, **cancelables**, con `detail.atender()`:

- `starseed:dock-diseno-icono` · `detail: { itemId, atender }`
- `starseed:dock-plantillas` · `detail: { atender }`

Quien los atienda debe llamar `event.preventDefault()` o `detail.atender()` (con una basta). Lo cómodo:
`escucharDisenoIcono(fn)` y `escucharPlantillas(fn)` de `@/lib/dock/eventos-dock` lo hacen solos y devuelven
la función para desmontar. **Si nadie los atiende, el menú dice «Próximamente…» y se queda abierto**: no
promete lo que no hace.

## Cómo añadir acciones rápidas a una app

1. Una entrada en `CATALOGO` (`acciones-rapidas.ts`) con el **id del botón del dock** (2–5 acciones). Para un
   botón que comparte las de otro, una línea en `COMPARTEN`.
2. Cada acción es de uno de tres tipos y **debe existir de verdad**:
   - `ruta`: una página de `src/app/**`. Si lleva query, declara `lee: { archivo, param, valor }` con el
     archivo que la lee; la prueba comprueba que lo menciona.
   - `evento`: un `CustomEvent` con oyente real (`addEventListener` en `src/`). Si el oyente solo vive en una
     página, `soloEnRutas: ["/esa-ruta"]`.
   - `funcion`: una función del OS implementada en `acciones-internas.ts` (carga perezosa).
3. Si el icono es nuevo en `IconoAccion`, añádelo también a `ICONOS_ACCION` en `menu-dock-item.tsx`
   (TypeScript lo exige).
4. `npx vitest run src/lib/dock/__tests__/acciones-rapidas.test.ts`: rutas, queries, eventos, ids únicos,
   2–5 por app y nombres (nunca «Mando» a secas) quedan comprobados contra el árbol real.

Deep-link añadido por esta ola: `/messages?nuevo=1` abre «Nuevo chat».

## Pruebas

- `src/lib/dock/__tests__/{pulsacion-larga,orden-dock,acciones-rapidas}.test.ts` (puras; la última lee `src/app`).
- `src/components/layout/dock/__tests__/omni-dock-pulsacion.test.tsx`: monta el dock; mantener → menú,
  toque que navega, arrastre → orden guardado, carpeta (soltar encima y reordenar dentro), Escape, movimiento reducido, teclado, quitar con
  deshacer, accesos fundamentales y el contrato con V1b. jsdom no maqueta: la geometría se simula.

## Límites honestos

- Sacar un icono de una carpeta **arrastrándolo fuera** no existe: se hace con «Sacar de «carpeta»» en el
  menú. Arrastrar dentro de una carpeta abierta solo reordena sus hijos.
- La vibración al levantar (`navigator.vibrate`) solo existe en Android; en iOS no hay háptica web.
- Con muchos iconos, el auto-desplazamiento del borde (44 px, hasta 14 px por fotograma) no se ha medido
  en dispositivos reales: hay que probarlo en un móvil de 360 px.
- «Abrir en ventana nueva» abre la ruta en una pestaña nueva del navegador (no una ventana del escritorio del OS).
