# Matriz real de permisos por medio (PRM1119B · 2026-11-19)

**Qué es:** la tabla, por medio de ejecución, de qué permiso hace falta, cómo se lee su estado, cómo se pide y qué pantalla de Ajustes se abre si la persona lo rechazó.

**Por qué:** «automático» no significa «autoconcedido». La app pide en el momento justo, abre la pantalla exacta y mira lo que pasó; nunca escribe la base de datos del sistema ni pulsa diálogos por guion.

**Código:** `src/lib/permisos/matriz.ts` (puro) y su prueba `src/lib/permisos/__tests__/matriz.test.ts`. Reutiliza `src/lib/nativa/permisos-registro.ts` y `src/lib/nativa/permisos-enlaces.ts`; los enlaces de los sistemas nativos están desarrollados en `architecture/permisos-enlaces-directos.md`.

## Cómo leer una casilla

Cada celda lleva `pedido · detección · ajustes`.

- `aviso`: el sistema pregunta con su diálogo; `aviso-único`: preguntó una vez y después solo se cambia en Ajustes; `panel`: solo se da en Ajustes; `por-uso`: el sistema pregunta al usar la función; `declaración`: basta el manifiesto; `nada`: este medio no lo pide.
- `API`: se puede leer; `indirecta`: se deduce de un efecto; `no`: no se puede leer.
- `sí`: hay enlace a la pantalla exacta (o a la ficha de la app); `no`: no hay enlace fiable; `—`: no aplica.

## Matriz

| Permiso | macOS | Windows | Linux X11 | Linux Wayland | Android | iOS | Navegador / PWA | Terminal |
|---|---|---|---|---|---|---|---|---|
| Micrófono | aviso · API · sí | por-uso · no · sí | nada · no · no | nada · no · no | aviso · API · sí | aviso · API · no | aviso · API · no | nada · no · no |
| Cámara | aviso · API · sí | por-uso · no · sí | nada · no · no | nada · no · no | aviso · API · sí | aviso · API · no | aviso · API · no | nada · no · no |
| Pantalla | aviso-único · API · sí | nada · API · — | nada · API · — | por-uso · indirecta · no | por-uso · no · no | por-uso · API · no | por-uso · API · no | nada · no · no |
| Accesibilidad | aviso-único · API · sí | nada · API · — | nada · API · — | por-uso · indirecta · no | panel · API · sí | nada · API · — | nada · API · — | nada · no · — |
| Monitorización de entrada | aviso-único · API · sí | nada · API · — | nada · API · — | nada · API · — | nada · API · — | nada · API · — | nada · API · — | nada · no · — |
| Bluetooth | aviso · API · sí | nada · API · sí | nada · API · — | nada · API · — | aviso · API · sí | aviso · API · no | aviso · API · no | nada · no · no |
| Red local | aviso · indirecta · sí | por-uso · no · no | nada · API · — | nada · API · — | nada · API · — | nada · API · — | nada · indirecta · — | nada · API · no |
| Notificaciones | aviso · indirecta · sí | nada · no · sí | nada · no · — | nada · no · — | aviso · API · sí | aviso · API · sí | aviso · API · no | nada · no · no |
| Ubicación | por-uso · API · sí | por-uso · no · sí | — | — | por-uso · API · sí | por-uso · API · no | por-uso · API · no | nada · no · — |
| Batería | — | — | — | — | aviso · API · sí | — | — | — |
| Capacidades del aparato | nada · API · — | nada · API · — | nada · API · — | nada · API · — | nada · API · — | nada · API · — | nada · API · — | nada · API · — |

Los nombres de pantalla y lo exacto que se pulsa en macOS, Windows, Android y Linux están en `architecture/permisos-enlaces-directos.md`. En iOS y en el navegador no hay enlace propio: se abre el diálogo del sistema o la ficha de la app; en el terminal manda el sistema anfitrión.

## Falta frente a denegado a mano

| Situación leída | Qué hace la app |
|---|---|
| `sin-preguntar` y el permiso es `aviso` | Pide una vez con su porqué. |
| `denegado` (la persona dijo que no) | Nunca vuelve a pedir: abre Ajustes si hay enlace; si no lo hay, dice «Sin acción». |
| `aviso-único` ya mostrado | Aunque el sistema no distinga el «no», no repite el aviso: abre Ajustes. |
| `por-uso` | No pide nada antes; el sistema pregunta al usar la función y un «no» no se guarda como denegado. |
| `panel` | Abre la pantalla exacta; el interruptor lo pulsa la persona. |
| `desconocido` | Pide solo si el permiso es de aviso; si el sistema no deja leer, espera al uso. |

El plan `planDePermisos` separa los permisos en cuatro cajones —`pedir`, `ajustes`, `esperar`, `sinCambios`— para instalar y para abrir. La opción `utiles` evita pedir permisos de fases futuras y la opción `yaPedidos` evita repetir avisos únicos.

## Nunca

- Nunca se concede un permiso por la persona: no hay acción «conceder» en la matriz.
- Nunca se toca la base de datos de permisos del sistema, se usan interfaces privadas ni se pulsan diálogos por guion.
- Nunca se abre una pantalla distinta «parecida» cuando no hay enlace fiable: se dice que no lo hay y se explica dónde mirar.
- Nunca se pide lo que no sirve para ninguna función construida en la fase actual.
