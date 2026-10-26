# SOP: Centro de Control (cortina Logic) y grabadora de pantalla

**Qué es**: el panel de la derecha (nodo Logic, ámbar `#FFBF00`/`#D4AF37`) con los accesos rápidos del sistema y, desde la Ola 1025U, una grabadora de pantalla inspirada en [Cap](https://github.com/CapSoftware/Cap). Rediseño CTL1025U.

## 1. Dónde vive cada cosa

| Pieza | Archivo |
|---|---|
| Armazón (cabecera, barra, carril con scroll, pie) | `src/components/layout/trinity/control-center.tsx` |
| Secciones | `trinity/tabs/*` (`quick-settings-tab` = Inicio, `smart-home-tab` = Atmósfera, `connections-tab`, `notifications-tab` = Alertas, `system-tab`) y `trinity/logic/grabar/seccion-grabar.tsx` |
| Piezas de diseño | `trinity/logic/` (`pildora-estado`, `seccion-logic`, `segmentado`, `boton-logic`, `fila-acceso`, `fila-interruptor`, `deslizador-logic`, `barra-secciones`, `organizador-secciones`, `cabecera-control`) |
| Lógica pura | `trinity/logic/orden-modulos.ts`, `estado-aparato.ts`, `datos-sistema.ts` |
| Grabadora (sin React) | `src/lib/grabacion/*` |
| Navegar entre secciones | `pedirSeccion(id)` en `control-center-events.ts` |

## 2. Secciones

Ids estables (se guardan en `config.controlCenter.{moduleOrder,hiddenModules}`): `quick` Inicio · `grabar` Grabar · `home` Atmósfera · `conexiones` Conexiones · `notif` Alertas · `system` Sistema. Se abre en **Inicio**.

- **Orden y ocultas**: `resolverOrden` descarta ids desconocidos, añade al final los nuevos y **sustituye el orden de fábrica antiguo** (`system, quick, home, notif`, con o sin `conexiones`) por el nuevo: nadie lo eligió a mano. Un orden distinto se respeta. Nunca se puede ocultar la última sección.
- **Rutas**: «Sistema» lleva a páginas que existen (`/profile`, `/cuenta` y sus `?section=`, `/almacenes`, `/sincronizacion`, `/servidores`). Antes cuatro de seis daban 404 (`/settings/privacy|storage|system|appearance`). `logic/__tests__/datos-sistema.test.ts` recorre `src/app` y falla si una ruta o un ancla de `/cuenta` desaparece.
- **Estado del aparato** (cabecera): batería y tipo de red solo si el navegador los da (Chromium); neurona (medio) y sesión siempre. Nada inventado.

## 3. Diseño y gestos

- Cristal oscuro ámbar + flor de la vida muy tenue; Rajdhani en titulares (`font-headline`), Inter en el cuerpo; iconos de Lucide.
- Dianas ≥ 44 px (pastillas 56 px). Un único carril con scroll (`min-h-0 max-h-full`, reglas Adendas 63 §15 y 66 §14). A 360 px el panel mide 331 px: los textos de las pastillas pasan a segunda línea antes que cortarse.
- Animaciones de 150–300 ms solo con `transform`/`opacity`, con `motion-safe:`/`motion-reduce:`.
- Teclado: pestañas de Radix (flechas, Inicio, Fin, foco itinerante). Móvil: la **barra de secciones se desliza con el dedo**; el arrastre de la cortina ignora los elementos con scroll horizontal, así que no la cierra. No se cambia de sección deslizando el contenido porque ese gesto es el que cierra el panel.

## 4. Grabadora

`getDisplayMedia` (pantalla/ventana/pestaña) + cámara opcional dibujada en un lienzo (círculo, esquina y tamaño a elegir) + micrófono + sonido del sistema si el navegador lo da → `MediaRecorder` con el mejor `mimeType` (`formato.ts`). Cuenta atrás 0/3/5 s, pausa, parar, duración, tamaño en vivo, vista previa, descargar, guardar en la Biblioteca y captura de un fotograma a PNG.

- **Capas**: `soporte` (detección) → `formato` → `maquina` (reductor puro) → `composicion`/`audio`/`latido` → `controlador` (efectos) → `global` (única por pestaña) → `guardar`.
- **La grabación vive fuera de React** (`controladorGlobal()`): sigue si se cambia de sección o se cierra el panel; la cabecera enseña una franja «Grabando 00:12» que vuelve a ella. Mientras graba hay aviso del navegador al cerrar o recargar la pestaña, y un aviso emergente al terminar con el panel cerrado.
- **Permisos solo al pulsar** «Grabar» o «Captura de pantalla» (con el gesto del clic; la pantalla se pide primero). Si falla la cámara o el micrófono se avisa y se sigue; si se cancela el selector de pantalla no es un error.
- **Biblioteca**: `saveMediaToLibrary` (origen «Capturas», carpeta «Imágenes y videos › Capturas»), tope 50 MB de `os-files`. Si pesa más: solo descargar, con el motivo. Autoparada a 400 MiB.
- **Cámara superpuesta**: un `Worker` (blob) marca el ritmo del dibujo para que la pestaña oculta no se estrangule; aun así un navegador puede frenar una pestaña totalmente tapada. Esa vía depende de que esta página siga viva; sin cámara superpuesta se graba la pista directa.
- **Cap**: enlace a <https://cap.so> como alternativa nativa (más calidad, sin los límites del navegador). Se instala aparte; desde aquí no se instala nada.

## 5. Límites por navegador (lo que la interfaz dice, no lo que promete)

| Navegador | Pantalla | Sonido del sistema | Formato |
|---|---|---|---|
| Chrome / Edge escritorio | sí | probable (hay que marcar «Compartir audio») | WebM (y MP4 en versiones recientes) |
| Firefox escritorio | sí | no | WebM |
| Safari macOS | sí | no | solo MP4 |
| iPhone / iPad (cualquier navegador) | **no** (no hay `getDisplayMedia`) | no | MP4 |
| Chrome / Firefox en Android | **no** | no | WebM |
| Sin HTTPS (salvo `localhost`) | no | no | — |

Sin pantalla, la sección enseña el motivo y los pasos del aparato (iOS: «Grabación de pantalla» del Centro de control; Android: «Grabadora de pantalla»), ofrece la app Cámara (`/camara`) si hay cámara y deja solo «Solo cámara». Sin nada que grabar no queda ningún botón de grabar.

## 6. Pendiente de otras olas

- La CSP (`next.config.ts`) está en *Report-Only* y no define `media-src`: la vista previa `blob:` caería en `default-src 'self'` al pasar a forzar. Añadir `media-src 'self' blob:` antes.
- Batería y tipo de red: solo Chromium; en Safari y Firefox esos chips no salen.

## 7. Pruebas

`npx vitest run src/lib/grabacion src/components/layout/trinity` (controlador con `MediaRecorder` simulado: `src/lib/grabacion/falsos-prueba.ts`), más `side-curtains.test.tsx` y `apertura-desde-borde.test.tsx`, que montan este panel.

## 8. Añadir una sección

1. Componente en `trinity/tabs/` o `trinity/logic/`. 2. Entrada en `SECCIONES` (`control-center.tsx`) y en `ORDEN_POR_DEFECTO` (`logic/orden-modulos.ts`; una prueba exige que coincidan). 3. Documentar su id arriba y en `control-center-events.ts`.
