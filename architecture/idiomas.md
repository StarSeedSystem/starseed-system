# StarSeed OS en cualquier idioma — contrato (IDI1115N, primera entrega)

Petición de Alex del 15-11: un modo multiidioma para todo StarSeed OS, elegido al crear la cuenta (en la ventana de acceso) y en los ajustes de cada neurona, sugerido la primera vez por lo que informa el aparato.

## 1. Qué había y qué se reutiliza
`src/lib/traduccion/` (TRD1020) traduce **contenido ajeno** (páginas, mensajes, publicaciones) con motores por capas (navegador › LibreTranslate › malla › Astraura) y red inyectada; sus preferencias (`starseed.traduccion.v1`, que viaja con la cuenta) guardan el idioma de lectura por perfil. No traduce la interfaz. Aquí se reutilizan: `recogerTextos` de `pagina.ts` (mismas exclusiones), `preferencias.ts` (el valor de la cuenta vive en el perfil `_cuenta` de ese mapa) y el motor `motorNavegador` para rellenar catálogos. No se reutiliza su `aplicar`/`observar` por una razón: aquel observador salta los nodos ya traducidos y React reescribe el mismo nodo de texto cuando cambia un valor; y no hay red en el pintado.

## 2. Mecanismo (español = fuente)
1. **Catálogos por texto fuente**: `src/lib/idiomas/catalogos/<idioma>.json` → `{codigo, revisado, entradas}`; la clave es el texto español normalizado (espacios colapsados). Los componentes no se tocan.
2. **Una capa** (`capa.ts`, montada por `<CapaIdioma/>` en el layout raíz) recorre el DOM, traduce nodos de texto y los atributos `title`, `alt`, `aria-label`, `placeholder`, y un `MutationObserver` sigue lo que React cambie. `cambiar()` restaura el español y retraduce en el mismo instante.
3. **Valores, plurales, números y fechas** (`formato.ts`): las claves con valores usan `{0}`, `{1}`; la traducción puede usar `{0, number}`, `{0, date, short}` y `{0, plural, one {# neurona} other {# neuronas}}` (`Intl.PluralRules/NumberFormat/DateTimeFormat`). Un valor que es a su vez un texto del catálogo se traduce. Un patrón con menos de 6 caracteres fijos (`{0} en {1}`) no se usa: casaría con cualquier frase.
4. **Texto de personas** (mensajes, nombres, publicaciones, documentos, red): nunca se traduce aquí. La capa solo toca lo que es EXACTAMENTE una clave del catálogo; además respeta `translate="no"`, `data-no-traducir`, `code`, `pre`, `textarea`, `input`, `select`, `[contenteditable]` y `[hidden]`. Quien pinte texto ajeno que pudiera coincidir con una clave debe marcarlo `translate="no"`.
5. **Derecha a izquierda**: `ar`, `he`, `fa`, `ur` ponen `dir="rtl"` en `<html>`. `lang` y `dir` solo cambian si el idioma tiene catálogo (si no, el texto sigue en español y no se miente).
6. **Antes del primer pintado**: un guion en el `<head>` (`arranque.ts`) lee la elección y fija `lang`/`dir`; si hay catálogo vela el cuerpo (`html[data-idioma-pendiente] body{opacity:0}`) hasta que la capa lo quita, con tope de 2,5 s.
7. **Sin red**: el catálogo va en el paquete (import dinámico, un trozo por idioma): sirve igual en las apps nativas con interfaz estática.
8. **Revisado o automático**: `revisado:true` solo cuando una persona lo comprobó; si no, `automático`. El selector lo dice siempre («Catálogo revisado» / «Traducción automática, sin revisar» / «Aún sin catálogo: se verá en español»). `ESTADO_CATALOGO` (idiomas.ts) debe coincidir con el JSON: lo comprueba una prueba.

## 3. La elección
- Esta neurona: `starseed.idioma.neurona.v1` (localStorage, local: fuera de `SYNCED_KEYS`; no es secreto ni sesión, migra como normal).
- La cuenta: `starseed.traduccion.v1`, perfil `_cuenta`, campo `idioma`: valor por defecto de los aparatos siguientes. Rige: neurona › cuenta › español.
- Sugerencia (`estado.ts`): `window.__STARSEED_IDIOMAS_NATIVOS__` (lo que informe el lado nativo, lista de códigos; **aún no hay comando nativo que la rellene**) y `navigator.languages`. Se ofrece primero en el selector («Sugerido para este aparato»); NUNCA se aplica sola ni pisa una elección hecha.

## 4. Selector
`components/idiomas/selector-idioma.tsx`: botón con globo; el rótulo recorre «Elegir idioma» en 36 idiomas, cada segundo, cada uno en su escritura (`aria-hidden`; el nombre accesible es uno estable); panel en línea con sugerido, todos por su nombre propio y búsqueda; teclado completo (↓ ↑ Enter Esc); 44 px de alto mínimo, usable a 360 px. Montado en la ventana de acceso (`auth/ventana-acceso.tsx`) y en Ajustes › Neuronas (`settings/neurons/ajuste-idioma.tsx`).

## 5. Medir y rellenar
- `node scripts/idiomas/extraer.mjs`: API del compilador de TypeScript; recoge texto JSX, atributos visibles, literales de JSX en expresiones, textos de avisos/diálogos (`toast`, `confirm`…), propiedades de datos con texto (`label`, `titulo`…), `setXxxMensaje(...)` y los literales de los archivos de datos de la guía (`ARCHIVOS_DATOS`); patrones con `{n}`; por área (primeras carpetas de `src/app` y `src/components`). Escribe `catalogos/fuente.json`.
- `unidades.json` define las unidades de la entrega (acceso, shell, ajustes, ajustes-neuronas) por prefijo de archivo; `sin-traducir.json` lo que no se traduce (direcciones de ejemplo, marca, nombres propios de idioma, mensajes de desarrollo); `completas.json` lo que cada idioma declara completo.
- `node scripts/idiomas/rellenar.mjs --idioma <código> --area <unidad|components/x> --motor <libretranslate|comando|archivo> [--url|--cmd|--archivo]`: traduce lo que falta con el motor elegido, protege marcas y valores, **rechaza** la entrada que pierde un valor, una etiqueta, una rama de plural o una marca, y escribe `revisado:false`.
- `node scripts/idiomas/cobertura.mjs [--areas]`: cobertura por idioma y unidad/área. La prueba `__tests__/cobertura.test.ts` falla si una unidad declarada completa tiene entradas ausentes, inválidas o caducas.
- `node scripts/idiomas/comprobar-ingles.mjs` (Playwright, con el arnés `scripts/idiomas/arnes`, sin Next): en inglés, la ventana de acceso y Ajustes › Neuronas no enseñan ningún texto del catálogo fuente a 1280×800 y 360×800.

## 6. Lo que esta capa no traduce todavía
Texto armado en el código (concatenaciones, plantillas fuera de JSX y de avisos), textos de nodos hermanos que forman una sola frase (`{n} neuronas` en JSX son dos nodos), fechas y números que el código ya formateó, lienzos (`canvas`, WebGL), diálogos nativos del sistema, las apps nativas mismas y el texto de personas (por diseño). Se miden con las «sospechas» de `comprobar-ingles.mjs`.

## 7. Más idiomas, archivo de idioma y clic derecho (16-11)
Contrato de la parte A: `architecture/traductor-universal.md` (apartado «PARTE A»). Lo que se suma a este documento sin cambiar lo anterior:
- **Lista generada** (`lista-mundial.ts`): candidatos de la tabla ISO 639 filtrados con `Intl.DisplayNames`; cada idioma lleva nombre propio, nombre en el idioma actual, dirección, marca de «más hablado», alias y si tiene catálogo. `Intl.Collator` ordena y `agrupar()` separa los más hablados; lo que el aparato no sabe nombrar se omite.
- **Archivo `.starseed-lang.json`** (`paquete/formato.ts`): formato `starseed-idioma` versión 1 con `codigo`, `nombre`, `dir`, `autor`, `creado`, `revisado`, `licencia`, `base:"es"`, `entradas` y `hash`, con topes de 2 MB y 20.000 entradas. Es **solo datos**: nunca código, estilos ni scripts.
- **Validación** (`paquete/validar.ts`): código BCP-47, dirección, autor, claves prohibidas, entradas sin caracteres de control ni dirección oculta y sin HTML; un paquete importado nunca entra como «revisado». Un fallo se lista y no se instala a medias.
- **Almacén local y carga**: `paquete/almacen.ts` guarda los paquetes en `starseed.idiomas.paquetes.v1` (tope de 12 paquetes y 6 MB, evento de cambio); `catalogos/cargar.ts` suma a los cargadores integrados (`en`, `pt`, `fr`) los paquetes instalados, con memoria por idioma.
- **Clic derecho** (`entradas-idioma.ts` define las entradas y `montaje-idioma.tsx` las registra una vez): traducir la selección, reemplazarla solo en campos editables, leerla en voz alta, añadirla al paquete en edición y abrirla en el Traductor. Cada una dice qué motor usa y respeta el modo privado.

**Lo que sigue y no está hecho:** compartir por malla desde la interfaz y la revisión humana de paquetes.
