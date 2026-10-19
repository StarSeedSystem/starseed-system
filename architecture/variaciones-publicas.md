# Variaciones públicas: en el clic derecho de absolutamente todo

> **Petición de Alex (2026-10-19), resumida:** en todos los elementos y contenidos del OS (áreas, secciones, apps,
> páginas y todas las redes), el clic derecho tiene, además de lo que ya ofrece, **«Variaciones públicas»**: una
> ventana con las variaciones que todas las personas publicaron de ese mismo elemento, ajuste o función; notas
> públicas como publicaciones; enlaces a repos externos para instalar; fuentes, versiones y adaptaciones dentro de
> la Librería. Vale para botones, menús, fondos, configuraciones y ajustes de cada área, el lienzo universal y las
> herramientas de la Protomolécula, cada widget del Dashboard, las funciones del Escritorio, los ajustes de edición,
> decoración y desarrollo de publicaciones y mensajes, y todos los menús, funcionales y visuales. La ventana trae
> temas, varias formas de ordenar, buscador y la opción de publicar variaciones o sugerencias directamente desde el
> programa del elemento: subirlas a la Librería en una publicación, guardarlas en la Biblioteca o compartirlas
> donde sea.

Amplía `libreria-biblioteca-sync.md`, `protomolecula.md`, `referencias-inspiracion.md`, `fondos-shaders.md` y
`genesis-conectores-abiertos.md`. Principios: singularidad del contenido (se referencia, no se duplica),
licencias aplicadas y justicia restaurativa.

## 1. Lo que ya existe (medido el 2026-10-19 en `e2530e758`)

| Pieza | Dónde | Estado |
|---|---|---|
| Clic derecho reutilizable (ratón y pulsación larga) | `src/components/library/finder/use-context-trigger.ts` (`useContextTrigger`) | funciona, en 4 sitios |
| Menús propios | Finder (`finder-context-menu.tsx`, con `extraActionsFor`), Escritorio (`desktop-context-menu.tsx`), mensajes (`messages/marco/menu-hilo.tsx`), pestañas del Dashboard y otros: 33 archivos | cada uno con su forma |
| Sin clic derecho | Ajustes, Protomolécula, lienzo de diseño y rejilla de widgets | — |
| Identidad del elemento | `data-widget-key` (instancia), `data-widget-fn`, `data-widget-e`, `data-ss-background`, `data-ss-material`, `data-elemento` | parcial; sin clave común |
| Registros con id estable | `WidgetType` y `WIDGET_MANIFEST`; `curatedPresets`; `BACKGROUND_REGISTRY`; `SETTINGS_SEARCH_INDEX` y `SETTINGS_INDEX`; `APP_CATALOG`; `DockItemConfig`; `DesktopIcon`; `HerramientaProto` y átomos de la Protomolécula | funcionan |
| Formato para publicar lo visual | `src/lib/design/design-files.ts` (`DesignFile`: tema, paleta, tipografía, fondo, layout, skin de widget, estilo de componente o de página) | funciona |
| Catálogo público | `src/lib/library/public-catalog.ts` (`library_public_items`): solo lo más nuevo, sin filtro por etiqueta | hay que comprobar que la tabla existe en el proyecto activo |
| Versiones y ramas | `src/lib/versions/versions.ts` (`os_versions`), `entity-library.ts` (`branchOf`, `versions`) | funcionan dentro de la Biblioteca de cada persona |
| Publicar, guardar, compartir | `PublishDialog`, `SaveToLibrary`, `ShareToDialog`, `SaveSharePanel`, `InstallToDialog` | funcionan |
| Orden y búsqueda | `CategoryPicker` (`SortMode`: aurora, novedades, populares, relevantes, alfabético) | solo en paquetes |
| Valoraciones | `src/lib/library/ratings.ts` | solo en el aparato |
| Ventanas globales | `OSWindow` + bus y anfitrión como `astraura-158-window-bus.ts` / `-host.tsx` | funciona |

## 2. Una clave para cada elemento

`<familia>:<id>[#<parte>]`, por ejemplo `widget:clima`, `tema:synthwave-horizon`, `fondo:aurora`,
`ajuste:apariencia.radio`, `app:notas`, `dock:genesis`, `escritorio:icono`, `herramienta:photocraft`,
`atomo:video-html`, `post:<id>#estilo`, `mensaje:editor`, `menu:trinity-fab`, `boton:publicar`. Se pone en el DOM
como `data-ss-elemento` y, donde aún no está, se deduce de los atributos actuales y de los registros. La clave
nombra el **tipo** de elemento (todas las personas comparten `widget:clima`), nunca la instancia ni datos
privados.

## 3. El clic derecho

- **Anfitrión global:** escucha el clic derecho y la pulsación larga en todo el OS, busca la clave más cercana y,
  si el elemento no tiene menú propio, muestra uno con «Variaciones públicas», «Publicar mi variación» y «Copiar
  enlace al elemento». En campos de texto deja el menú del navegador; Mayúsculas + clic derecho siempre da el del
  navegador. Tecla de menú y Mayúsculas + F10 para teclado.
- **Menús propios:** los 33 que ya existen añaden la misma entrada con un ayudante común
  (`accionVariaciones(clave)`), sin cambiar su forma.

## 4. La ventana «Variaciones públicas»

Ventana del OS (bus y anfitrión como Astraura 1.58, marco `OSWindow`), con el nombre del elemento y su familia.

- **Pestañas:** Variaciones · Notas (publicaciones que referencian la clave) · Repos externos (enlaces de
  instalación con su licencia, desde la Librería y las referencias) · Fuentes y versiones (de la Librería y de
  `os_versions`).
- **Buscar, filtrar y ordenar:** texto, etiquetas, tema o registro, licencia y tipo; orden Aurora (lo que mejor
  encaja con el contexto y el ADN), novedades, populares, más usadas, mejor valoradas, alfabético.
- **Cada variación:** vista previa, «Probar» (se aplica en vivo y se deshace solo al cerrar), «Aplicar» (con
  deshacer), «Guardar en la Biblioteca», «Compartir», «Ver origen» (de qué variación deriva), valoración y
  licencia. Las que son código se abren solo aislados y piden confirmación.
- **Publicar mi variación:** captura el estado actual del elemento desde su propio programa, lo convierte en su
  formato (por ejemplo `DesignFile`) y lo publica en la Librería como publicación, lo guarda en la Biblioteca o lo
  comparte, con la cadena de origen y la licencia.
- **Sugerencias de Astraura:** genera variaciones locales primero (escalera de `genesis-conectores-abiertos.md`),
  pasa las pruebas del ADN del contexto y las ofrece para probar o publicar.

## 5. Adaptadores por familia

Cada familia declara `capturar(clave)`, `validar(payload)`, `aplicar(clave, payload)` → deshacer y, si puede,
`vistaPrevia`: apariencia (temas, paletas, fondos), widgets y Dashboard, ajustes (solo claves de
`SYNCED_KEYS`/`SYNCED_PREFIXES`), Protomolécula (herramientas, átomos y moléculas), Escritorio, dock y apps,
publicaciones y mensajes (estilos del editor). Nada se ejecuta sin validar; nada privado entra en un payload.

## 6. Datos

Tabla `os_variaciones` (clave, tipo: variacion, nota, repo, fuente o adaptacion; título, descripción, payload,
familia, versión, de_variacion, licencia, enlace externo, etiquetas, tema, autor, fechas y contadores) y
`os_variaciones_valoraciones` (una por persona), con lectura pública de lo publicado y escritura solo del autor.
Las notas son publicaciones normales con `references.elemento = <clave>`. **Migración escrita, sin aplicar: la
aplica Alex.** Se comprueba también si `library_public_items` existe en el proyecto activo.

## 7. Tareas (Ola 1019V, `cola-variaciones-publicas-1019.json`)

| Bloque | Tareas |
|---|---|
| Clave y familias | A clave canónica · B registro de familias · V validador y aislamiento |
| Adaptadores | C apariencia · D widgets · E ajustes · F Protomolécula · G Escritorio, dock y apps · H publicaciones y mensajes |
| Datos | I migración · J capa de datos · K orden y búsqueda · L notas, repos y fuentes |
| Ventana | M bus y anfitrión · O ventana · P tarjeta con probar y aplicar · Q publicar mi variación · U sugerencias de Astraura |
| Clic derecho | N anfitrión global montado · R ayudante y menús propios (Finder) · S menús de Escritorio y mensajes |
| Claves en el DOM | T widgets y Dashboard · W ajustes · X Protomolécula y lienzo |
| Abierto | Y herramienta MCP `variaciones_buscar` de Genesis |

Cada tarea toca como mucho 3 archivos y 120 líneas por archivo. Las escribe el enjambre; Claude dirige y
verifica en localhost: clic derecho sobre un widget, un ajuste, un fondo y una herramienta de la Protomolécula;
probar, aplicar, deshacer y publicar una variación con una cuenta de prueba.
