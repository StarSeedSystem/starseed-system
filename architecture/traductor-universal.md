# Traductor Universal y más idiomas — contrato (TRA1116A)

Petición de Alex del 16-11: (A) más idiomas, lista alfabética y buscable, idiomas personalizables que se instalan como archivo y herramientas de traducción en el clic derecho; (B) una app de traducción universal en tiempo real, mejorada y rediseñada para StarSeed OS, con widget, publicada en la Librería, preinstalada, con idiomas descargables para usar sin internet y unida a Astraura como herramienta.

Convención: **[verificado]** = leído en el código de este repo (archivo:línea); **[conocimiento]** = lo sé de fuera y no se pudo comprobar aquí; hay que medirlo antes de prometerlo.

## 1. Qué existe y se reutiliza
- `src/lib/traduccion/motor.ts` [verificado]: motores por capas con `MotorTraduccion {id, alcance, disponible, traducir}` (:6-12); `motorNavegador` (:45, la Translator API del navegador), `motorLibreTranslate` (:66), `motorAstraura` (:80) y `crearTraductor` (:84, caché, marcas protegidas, modo privado que solo deja `aparato|cuenta|cerebro`). Si no hay motor apto lanza error: no inventa. Se reutiliza tal cual; se le **añaden** motores, no se reescribe.
- `src/lib/traduccion/libretranslate.ts` (cliente puro, lotes) y `preferencias.ts` (`starseed.traduccion.v1`, contextos `paginas|mensajes|publicaciones|agentes|astraura`, :12) [verificado]. Vale para «idioma de lectura» y «traducir solo en agentes/astraura».
- Menú del clic derecho [verificado]: `src/components/traduccion/menu-texto.tsx` registra entradas con `registrarEntradaMenuTexto` (:36) y se monta una vez; `traducir-texto.tsx:137` ya añade «Traducir selección / párrafo / página / Ver original». **Límite real:** `abreMenuTexto` (:60) no abre en campos editables (`esEditable` :52), así que «reemplazar si es editable» exige un camino nuevo (§7).
- Idiomas de la interfaz [verificado]: `src/lib/idiomas/idiomas.ts:21` lista **36** idiomas escritos a mano (`Idioma {codigo, nombre, rotulo, dir}`), `CON_CATALOGO = en, pt, fr` (:61), `aIdiomaElegible` (:70); `catalogo.ts:28` (`crearCatalogo`) y `catalogos/cargar.ts` cargan un JSON por idioma con import dinámico (lista fija de cargadores); `estado.ts:15` guarda la elección. `architecture/idiomas.md` fija el mecanismo y que `revisado:true` solo lo pone una persona.
- Voz [verificado]: reconocimiento con `SpeechRecognition` en `aurora-provider.tsx`/`quantum-orb-live-talk.tsx`; respaldo abierto opcional con transformers.js (Whisper tiny ≈40 MB, base ≈80 MB, small) importado por CDN, solo bajo opt-in (`src/lib/aurora/stt-oss/opt-in.ts:53-75`, `oss-stt.ts:176`); síntesis con `speechSynthesis` y voces de Astraura (Kokoro en navegador, daemon local; `src/ai/astraura/skills.ts:159,284`).
- Astraura [verificado]: las habilidades son `SkillCapability {id, label, systemPrompt, routing, skillIds, packageIds, defaultOn}` (`skills.ts:41-70`); el picker por chat usa `HERRAMIENTAS_ASTRAURA_VIVO` (`src/lib/astraura/chat-herramientas.ts:154`) como precedente de una herramienta propia sumada al catálogo; `ChatConfig.skills` (undefined = todas) la lee `router.ts`.
- Librería [verificado]: una app es un `LibraryPackage {kind:"app", payload:{route}}` (`packages.ts:359-392`); la siembra `defaults-seed.ts` (`SEED_VERSION = 25` :77, `RECOMMENDED_PACKAGE_IDS` :434) **excluye a propósito apps con ruta** porque «implican navegar» (comentario :88-91); instalar un paquete de la tanda 1104 solo registra el enlace. Preinstalar el traductor exige subir `SEED_VERSION` y una excepción explícita; hoy nada la tiene.
- Widgets [verificado]: tipo en `dashboard-types.ts` (`WidgetType`), medidas en `widget-manifest.ts` (`WIDGET_MANIFEST`), render en `widget-registry.tsx`; los widgets libres usan `MarcoUnificado` (`widgets-libres/`).
- Malla [verificado]: `architecture/apps-en-la-malla.md` y `src/lib/recursos/` (oferta, prestar capacidades a vínculos/grupos). No hay hoy ningún formato de «paquete» compartible por malla: se define aquí.
- **No existe** [verificado]: motor de traducción local para las apps nativas, descarga de modelos de traducción, ni la lista de idiomas del sistema vía `Intl`.

## 2. Modos de la app
| Modo | Qué hace | Fase |
|---|---|---|
| Texto | dos cajas, intercambio de idiomas, detección, copiar, leer en voz alta, historial local | 1 |
| Conversación por voz, dos sentidos | cada persona habla su idioma; reconoce, traduce, dice en voz alta; mitades de pantalla | 1 (mejor esfuerzo) |
| Texto seleccionado desde cualquier parte | clic derecho (§7) y atajo | 1 |
| Documento (.txt, .md, .srt) | traducir conservando el formato | 2 |
| Cámara / imagen | OCR local + traducción sobre la imagen: pide un motor de OCR (Tesseract WASM, ≈10-30 MB por escritura [conocimiento]) y permiso de cámara | 3 |
| Subtítulos en vivo de una llamada o transmisión | enlaza con las sesiones en vivo | 3 |

## 3. Sin internet: qué puede correr de verdad
Principio: **nunca se promete un idioma sin internet que no tenga modelo local verificado**. La app muestra por par «sin internet: sí / no / solo con descarga (N MB)».

Motores locales, de más a menos viable (tamaños [conocimiento], medir al integrar):
1. **Translator API del navegador** (`motorNavegador`, ya existe): Chrome de escritorio la trae y descarga el modelo del par en el aparato. No hay en WebView de Android ni WKWebView de macOS, ni en las apps nativas [conocimiento; sin comprobar]. El código ya devuelve «no disponible» si falta (`motor.ts:45-62`).
2. **Marian/OPUS-MT por transformers.js (ONNX cuantizado, WASM)**: un modelo por par y sentido, ≈40-80 MB [conocimiento]. Corre en cualquier WebView con WASM, también sin red una vez descargado; es el mismo mecanismo que ya usa el STT abierto [verificado: `opt-in.ts:53`]. Es la **vía principal de la fase 1** para las apps nativas y los navegadores sin Translator API. Licencias de cada modelo: comprobar una a una antes de ofrecerlo.
3. **Bergamot (modelos de Firefox Translations, WASM)**: ≈15-40 MB por par, calidad parecida a Marian pequeño [conocimiento]; candidato si ocupar menos pesa más que la calidad. Fase 2.
4. **NLLB-200 destilado (≈600 M, int8 ≈600-900 MB)**: un solo modelo para unos 200 idiomas; **no cabe cómodo** en una tableta Android modesta ni se recomienda en un Mac de 8 GB junto a otras IA locales [conocimiento]. Solo como paquete opcional «muchos idiomas» en equipos con ≥16 GB, fase 3.
5. **LibreTranslate/Argos** en una neurona con servicio o en el A1: ≈50-100 MB por par en disco [conocimiento]. Ya soportado como motor (`motor.ts:66`, `traducir-texto.tsx:19`, `http://127.0.0.1:5100`), pero **una página https no alcanza 127.0.0.1** salvo app nativa (`traducir-texto.tsx:25-29` [verificado]).

Por plataforma (resumen honesto): *navegador de escritorio*: 1, luego 2; *navegador móvil*: 2 (si la memoria da); *apps nativas (Tauri)*: 2 y, si hay servicio local, 5; *Mac 8 GB*: pares sueltos por 2 (≈50-80 MB cada uno, un par cargado a la vez); *tableta Android*: 2 con un par cargado y modelo cuantizado.

**Idiomas sin modelo local**: los de pocos recursos (varios africanos, indígenas americanos, lenguas de señas) no tienen modelo pequeño fiable; la app los marca «solo con internet» y no ofrece descarga. Un par sin modelo directo puede pasar por el inglés (dos modelos, peor calidad): se avisa.

**Paquetes de idioma sin internet**: se guardan en el almacenamiento del aparato (Cache Storage/IndexedDB en web; carpeta de datos de la app en nativo), con un índice `starseed.traductor.paquetes.v1` (par, motor, versión, tamaño, hash, fecha). Se descargan con barra de progreso y botón cancelar, **solo bajo petición** y avisando del tamaño (más aviso si la conexión es medida); se borran por par; el espacio usado se ve y tiene tope configurable. Por la malla: un aparato con el paquete puede prestarlo a su cuenta o vínculos (mismo alcance que `recursos/oferta.ts`), troceado y verificado por hash; nunca se instala un modelo sin comprobar su hash contra el índice firmado por quien lo publicó en la Librería.

## 4. Con internet
Orden, gratis primero, siempre diciendo qué motor tradujo: local descargado › navegador › LibreTranslate propio › Astraura (IA gratis primero, `motorAstraura`) › motor de la comunidad en la malla. **Ningún servicio de pago se usa sin que la persona lo conecte con su clave** (clave solo en variable de entorno o ajustes, nunca en el código ni en el archivo de idioma).

## 5. Privacidad: qué sale del aparato con cada motor
Antes de la primera traducción con cada motor la app dice, una vez por motor y por cuenta, y deja cambiar: *Local descargado / navegador*: nada sale (el navegador puede haber descargado el modelo al instalarlo). *LibreTranslate de la neurona*: sale hacia tu propio equipo. *Malla*: sale cifrado hacia aparatos de tu cuenta o vínculos. *Astraura*: el texto va al modelo que Astraura elija; **si el modo privado está activo no se usa** (`crearTraductor({privado:true})` ya lo garantiza, `motor.ts:84`). La conversación por voz: el audio no sale si el reconocimiento es local; con `SpeechRecognition` del navegador, **el audio puede ir al proveedor del navegador** y se avisa. El historial es local y se borra.

## 6. Astraura: la herramienta
**Herramienta `traductor-universal`** (habilidad de la Librería, `SkillCapability` con `packageIds:["app-traductor"]`, `defaultOn: true`, como precedente `HERRAMIENTA_CONTENIDO_VIVO`).
- **Entrada**: `{texto|textos[], origen?: "auto"|código, destino: código, tono?: "neutro"|"formal"|"cercano", contexto?: "chat"|"documento"|"voz"}`. **Salida**: `{traducciones[], origenDetectado, motor, local: boolean, aviso?}`; un fallo devuelve `{error}` explícito, nunca texto inventado.
- **Cuándo la llama sola un agente**: (a) el mensaje recibido está en un idioma distinto al del idioma de conversación de esa persona; (b) la persona pide «responde en X» o «traduce»; (c) un bot atiende a varias personas y debe contestar a cada una en la suya. No traduce lo que ya está en el idioma destino ni nombres propios ni código.
- **Idioma por persona en un bot**: mapa `{personaId → idiomaConversación}` guardado en el perfil del bot (local a la cuenta, con la cuenta si el dueño lo permite); se actualiza cuando la persona lo pide o cuando se detecta con confianza ≥ 0,8 en tres mensajes seguidos; nunca se deduce de una sola frase.
- **«Hablar en cualquier idioma en tiempo real»**: el agente piensa en el idioma del modelo y la capa de traducción convierte entrada y salida; en voz, el ciclo es reconocer → traducir → hablar y su latencia es la de §9. Funciona con cualquier modelo porque la herramienta es una capa externa al modelo.
- La habilidad aparece en el picker de herramientas por chat (`chat-herramientas.ts`) y en la Librería como habilidad instalable.

## 7. Widget
Un widget `TRADUCTOR` en `WIDGET_MANIFEST` (mínimo 2×2): caja de texto, par de idiomas con intercambio, resultado y copiar; opciones por widget: idiomas fijados, motor preferido (local/auto), tamaño de letra, mostrar historial corto, sin historial. Sin red mientras no se pulse traducir; muestra el motor usado.

## 8. Fases
- **Fase 1 (una cola, ≤40 tareas)**: contratos puros (idiomas por `Intl`, formato de paquete, motores locales, índice de paquetes), motor ONNX por transformers.js con descarga/borrado de paquetes, herramienta de Astraura, página `/traductor` (texto y conversación), widget, ficha en la Librería y siembra, selección por clic derecho con reemplazo.
- **Fase 2**: documentos, Bergamot, préstamo de paquetes por la malla, idioma por persona en bots con persistencia.
- **Fase 3**: cámara/OCR, subtítulos en vivo, NLLB opcional.

## 9. Límites honestos
La latencia de voz en tiempo real suma reconocer + traducir + hablar; en un Mac de 8 GB con un par local cabe esperar del orden de 1-3 s por frase y en una tableta modesta bastante más [conocimiento; sin medir]: la app muestra «traduciendo…» y nunca finge simultaneidad. Reconocimiento y voces dependen del navegador y del sistema, y varios idiomas no tienen voz instalada: se dice «sin voz en este aparato». Los idiomas de pocos recursos tienen traducción peor o ninguna. La primera descarga de un modelo necesita internet. La calidad automática no es revisada: se rotula «Traducción automática».

---
# PARTE A — Más idiomas, archivo de idioma y clic derecho

## A1. Lista de idiomas
- Hoy 36 a mano (`idiomas.ts:21`). La lista nueva se **genera** con la API `Intl` del aparato: códigos de `Intl` no enumera idiomas, así que los candidatos salen de una **tabla propia de códigos ISO 639** y se **filtran con `Intl.DisplayNames`** (si el aparato no sabe nombrar un código, se omite). La lista es todo lo que el aparato sabe nombrar y crece con el sistema.
- Cada idioma: **nombre propio** (`DisplayNames` con el propio código) + **nombre en el idioma actual**; marcado «más hablado» si está entre los ≈30 de mayor número de hablantes (tabla fija, [conocimiento]); orden alfabético con `Intl.Collator` del idioma actual; los más hablados pueden verse agrupados arriba, pero la lista completa es alfabética.
- Búsqueda: sin acentos ni mayúsculas, por nombre propio, nombre actual, código o alias («chino» → `zh`); tolerante a una letra errada.
- Los 36 actuales conservan `rotulo` y `dir`; sin catálogo la interfaz sigue en español y lo dice (`idiomas.md` §2.5). Dirección RTL: se deduce de una lista de escrituras RTL (`ar, he, fa, ur, ps, sd, ug, yi, dv, ku-arab`).

## A2. Archivo de idioma (`.starseed-lang.json`)
**Formato propio, versión 1**: `{formato:"starseed-idioma", version:1, codigo, nombre, nombreIngles?, dir, autor:{nombre, contacto?}, creado, revisado:{estado:"automatico"|"revisado", por?, fecha?}, licencia, base:"es", entradas:{<clave española normalizada>:<traducción>}, hash}`. Mismas claves y marcadores (`{0}`, plural `{0, plural, …}`) que `idiomas.md` §2.3. Es **solo datos**: texto, jamás código.
- **Importar de formatos comunes**: JSON plano clave→valor, JSON anidado (se aplana con puntos), `.po/.pot` (gettext), `.xliff/.xlf`, `.properties`, `.strings` (Apple), `strings.xml` (Android), `.csv/.tsv` (dos columnas). La importación **mapea claves** a las claves españolas del OS (por coincidencia exacta del texto fuente o de la clave) e informa de cuántas casaron.
- **Validación al instalar**: tamaño ≤2 MB y ≤20.000 entradas; JSON válido; `codigo` BCP-47 válido; cada entrada conserva los mismos marcadores `{n}`, ramas de plural y marcas protegidas que la fuente (se **rechaza** la entrada que pierde uno); sin HTML ni etiquetas (se **neutraliza**: se guarda como texto y se pinta como texto, nunca como HTML); caracteres de control y de dirección ocultos prohibidos; `hash` coincide. Lo inválido se lista; no se instala a medias.
- **Quién lo hizo y si está revisado**: `autor` y `revisado` visibles en la ficha del idioma («Traducción automática» / «Revisado por X el …»). Un paquete importado nunca llega marcado «revisado»: eso solo lo cambia una persona dentro del OS.
- **Compartir**: por archivo (exportar/importar), por enlace (la Librería guarda el archivo; el enlace lo apunta y se valida igual al abrir) y por la malla (mismo alcance que `recursos/oferta.ts`: cuenta, vínculos, grupo, público; troceado y con hash).
- **Qué puede y qué no hace**: puede sumar o sustituir textos de un idioma, aportar `nombre` y `dir`, y quedar instalado/desinstalado por idioma. **No** ejecuta nada, **no** carga scripts ni estilos, no toca claves de cuenta ni permisos, no puede pisar la marca protegida (`MARCAS`) ni los textos de personas, y no cambia el idioma elegido: solo lo ofrece. Un paquete que falla se ignora y la interfaz sigue en el idioma de antes. Un paquete instalado es local a la neurona; con la cuenta sincroniza solo si la persona lo activa.
- Integración: `cargar.ts` pasa de una lista fija de cargadores a «cargadores integrados + paquetes instalados» (almacén local); `CON_CATALOGO` se calcula, no se escribe a mano.

## A3. Herramientas de traducción en el clic derecho
Sobre el menú de §1 se registran, para cualquier texto seleccionado: **Traducir selección** (existe); **Reemplazar por la traducción** (solo si la selección está en un campo editable: necesita que el menú se abra también en editables cuando hay selección, hoy no lo hace, `menu-texto.tsx:60`; se cambia con cuidado para no estorbar al menú del navegador sin selección); **Leer en voz alta** (en el idioma detectado, con `speechSynthesis` o la voz de Astraura; si no hay voz del idioma, lo dice); **Añadir al paquete de idioma en edición** (si hay un paquete abierto en el editor, guarda el texto español seleccionado como clave pendiente de traducir); **Abrir en el Traductor**. Cada una dice qué motor usa y respeta el modo privado.

## Estado de la fase 1 (cola TRA1116-APP-F1)

Punteros leídos en el código de este repo el 19-11 (no promesas): todo lo de la fase 1 está en `src/lib/traductor/` y `src/components/traductor/`.

| Archivo | Qué hace |
|---|---|
| `lib/traductor/tipos.ts` | Tipos puros (`ParIdiomas`, `IdMotor`, `ResultadoTraductor`, `EstadoPar`); nunca lanza. |
| `lib/traductor/detectar.ts` | Detecta idioma por escritura y ~25 palabras frecuentes; confianza acotada; `null` con <12 letras. |
| `lib/traductor/decidir-traducir.ts` | Reglas de cuándo un agente traduce solo: idioma distinto, petición, varias personas. |
| `lib/traductor/servicio.ts` | Orquesta detectar → motores → historial/avisos; tope 5000; motores, almacenes y reloj inyectados. |
| `lib/traductor/motores-traductor.ts` | Orden de motores y filtro por privacidad (`construirMotores`, `motoresDeEsteTexto`). |
| `lib/traductor/motor-local.ts` | Adaptador de transformers.js (ONNX) como `MotorTraduccion`; lotes de 8. |
| `lib/traductor/motor-paquete-local.ts` | Carga el pipeline del paquete instalado; no descarga por su cuenta. |
| `lib/traductor/modelos-locales.ts` | Catálogo de pares OPUS-MT con inglés de centro; `modeloPara`, `estadoDePar`, `ruta2saltos`. |
| `lib/traductor/descargar.ts` | Descarga con progreso, cancelación y verificación de hash; red, reloj y almacén inyectados. |
| `lib/traductor/gestion-paquetes.ts` | Índice y almacén de binarios; borrar por par y resumen de espacio usado/tope. |
| `lib/traductor/indice-paquetes.ts` | Índice local persistente (`localStorage` inyectable), evento `starseed:traductor-paquetes`; ignora valores corruptos. |
| `lib/traductor/historial.ts` | Historial local, tope 50 entradas y 2000 caracteres; opción «sin historial». |
| `lib/traductor/idioma-por-persona.ts` | Mapa persona→idioma con racha y confianza, tope 500; almacén inyectable. |
| `lib/traductor/privacidad.ts` | Aviso por motor (qué sale del aparato) y su aceptación. |
| `lib/traductor/conversacion.ts` | Máquina de turnos A/B de la conversación por voz; reloj, traducción y voz inyectados. |
| `lib/traductor/voz-escucha.ts` | Reconocimiento unificado (navegador u OSS), estados provisionales y errores. |
| `lib/traductor/voz-habla.ts` | Síntesis por `lang`, cola de frases y «no hay voz de ese idioma» sin usar otra. |
| `lib/traductor/herramienta-astraura.ts` | La herramienta `traductor-universal` (entrada/salida explícita) para Astraura. |
| `components/traductor/traductor-app.tsx` | App de tres pestañas con el servicio real; Astraura queda fuera del modo privado. |
| `components/traductor/panel-texto.tsx` | Caja de origen y resultado, tope 5000, traducir-mientras-escribo, copiar, voz y aviso. |
| `components/traductor/selector-par.tsx` | Dos desplegables buscables, intercambio e insignia «sin internet / descarga / solo internet». |
| `components/traductor/gestor-paquetes.tsx` | Descarga y borrado de paquetes con progreso, cancelación y estado. |
| `components/traductor/widget-traductor.tsx` | Widget compacto (par, resultado, copiar, voz) con ajustes. |
| `components/traductor/aviso-privacidad.tsx` | Diálogo de aviso ante la primera traducción con un motor. |

### Modelos que siguen `verificado:false`

Los **10** pares de `src/lib/traductor/modelos-locales.ts` están `verificado:false`, con `hash:""` y bytes estimados (60 MB), no medidos: `Xenova/opus-mt-es-en`, `opus-mt-en-es`, `opus-mt-fr-en`, `opus-mt-en-fr`, `opus-mt-de-en`, `opus-mt-en-de`, `opus-mt-pt-en`, `opus-mt-en-pt`, `opus-mt-it-en` y `opus-mt-en-it`. Mientras no se verifiquen repo, tamaño y hash, **ningún par se puede prometer como «sin internet»**: `estadoDePar` devuelve `sin-internet` solo si el repo figura en `instalados`, y esa lista no está validada aquí.

### Lo que sigue y no está hecho

- **Bergamot**: solo evaluado como alternativa (§3.3); no hay motor ni modelos integrados.
- **Documentos** (.txt, .md, .srt): no hay traductor que conserve el formato; es fase 2.
- **Préstamo de paquetes por la malla**: el formato y el hash están descritos (§3), pero no hay transporte ni verificación contra el índice firmado.
- **OCR** (cámara/imagen): no implementado; es fase 3.
- **Subtítulos en vivo** de llamadas o transmisiones: no implementados; es fase 3.
- **Latencia real por aparato**: sin medir. Las cifras de §9 son [conocimiento] y la app muestra «traduciendo…» sin fingir simultaneidad.
