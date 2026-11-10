# Modelos locales recomendados por neurona (MOD1110A · 2026-11-10; ampliado por MOD1110B · 2026-11-10: variantes sin filtros e instalación guiada de Ollama)

> Astraura y la Biblioteca recomiendan modelos locales a cada neurona con un método común: **encaje por
> hardware, puntuación comparable, rasgos, ruta y datos con fecha que se revisan solos**. Extiende lo que
> ya había (`perfil-hardware.ts`, `auto-actualizar-modelos.ts`, `capas/catalogo.ts`, `src/ai/astraura/model-scout.ts`);
> no lo sustituye. Código: `src/lib/astraura/modelos/*`.

## 1. De dónde viene el método (y qué NO se tomó)

Alex compartió una página pública de terceros, un «selector de modelos». Se tomó solo **el método**:
encaje por memoria/VRAM/disco, puntuación comparable del Epoch Capabilities Index (ECI) expresada como «tan
bueno como el mejor modelo cerrado de <fecha>», rasgos (contexto, herramientas, visión), una ruta
(local u otro sitio) y cifras con fecha que se vuelven a comprobar.

No se tomó: su código ni sus textos; sus instrucciones de instalación de otras herramientas; su API de pago que aloja
las variantes «abliterated» (**sin entrada, sin enlace y sin ruta**: `urlPermitida` lo impide y hay prueba). Las variantes
«abliterated» en sí **sí entran, desde MOD1110B, como una clase aparte, opcional y apagada por defecto** (§10, decisión 1);
el resto del catálogo son builds normales de los editores (`clase: "normal"`). Y **no se tomaron sus cifras a ciegas**:
cada entrada se contrastó el 2026-11-10 con fuentes vivas (§4).

## 2. Qué existía y qué se amplió

| Pieza previa | Qué hacía | Qué se añadió |
|---|---|---|
| `perfil-hardware.ts` | nivel, RAM del navegador, plataforma | `detectarChip()` (apple-silicon, nvidia, amd, cpu, android-soc) |
| `capas/catalogo.ts` + `config/capas-astraura.json` | capas 1.58-bit, Needle, Bonsai, voz (SHA-256) | `modelosDesdeCapas()`: las capas **usables** entran en la misma comparación |
| `auto-actualizar-modelos.ts` (`queAplicar`) | decide si se aplica un top nuevo | se reutiliza tal cual en `decidirAplicarMejora()` (lo fijado a mano no se toca) |
| `src/ai/astraura/model-fit.ts`, `model-scout.ts`, `model-requirements.ts` (Adendas 109/138) | encaje cualitativo y tok/s estimados (llmfit) | **Conviven**: aquellos recomiendan *fuentes* del router (WebGPU, OpenRouter, voz); este módulo recomienda *modelos locales concretos* con puntuación comparable y ruta |
| `src/lib/malla/puerta/ia.ts` | IA de otra neurona por la malla | su idea es la **ruta «neurona-malla»** (§6); no se modificó |
| `ModelDownloadsPanel`, `installed-models.ts` | descargas de modelos del navegador | el flujo nuevo no los toca; la descarga de Ollama es propia (§7) |

## 3. Qué ejecuta modelos locales en StarSeed hoy (dicho con honestidad)

Comprobado en el repo, no en un aparato real:

- **Escritorio (Tauri)**: el backend **Astraura 1.58** (llama-server/BitNet en `127.0.0.1:8000`, ver `native/astraura-voice/daemon.mjs`
  y `via-158-local.ts`) y, **si la persona lo tiene instalado**, **Ollama** (`11434`) o LM Studio (`1234`): la puerta de la
  malla ya los conoce (`native/servidor-local/puerta.cjs`, `PUERTOS_IA_LOCAL`). **StarSeed no arranca Ollama y, desde MOD1110B, ofrece una instalación guiada que pregunta primero** (§11); sin ella, solo lo detecta.
- **Navegador, PWA y WebView de Android**: WebGPU (WebLLM, SmolLM3, capas ONNX) y Needle por WASM. **No hay llama-server ni Ollama.**
  No se encontró en el repo ningún motor local en Android más allá de WASM/WebGPU: una tablet Android recomienda solo capas WebGPU/ONNX y Needle.
- **MLX**: solo como *builds de Ollama* (`qwen3.5:9b-mlx`…) en Apple silicon. No hay runtime MLX propio.

Consecuencia (regla dura): **nunca se recomienda un modelo cuyo runtime la neurona no tenga**. Un modelo de Ollama sin Ollama
sale «No cabe» con motivo `sin-runtime`, y la recomendación dice cuántos modelos más abriría instalar Ollama (`abriria`).

## 4. El catálogo: campos, fuentes y fechas

`CatalogoModelos` (`tipos.ts`) → `modelos: ModeloLocal[]`, `frontera: PuntoFrontera[]`, `revisado`, `familiasVistas`.
Cada `ModeloLocal`: `id` (etiqueta de Ollama o id de capa), `familia`, `editor`, `clase: "normal"`, `tipo` (`estandar` | `capa-158` | `needle`),
`runtimes`, `descargaGb`, `contextoK`, `herramientas`, `vision`, `razonamiento`, `licencia`, `puntuacion` (ECI + fecha del modelo + nombre en Epoch + día de
comprobación), `estado` (`comprobado` | `sin-comprobar` | `candidato`), `comprobado` (día), `fuentes` (URL).

**Semilla verificada el 2026-11-10 — 20 modelos estándar + las capas usables del catálogo de capas:**

- Ollama (`/library/<familia>/tags` y `/library/<familia>`): tamaño de descarga (el menor del rango, que es lo que lee el actualizador), contexto, entrada
  texto/imagen e insignias tools/vision/thinking. Familias: Qwen3.5 (2b, 4b, 9b, 27b, 35b-a3b, 122b y MLX 4b/9b/35b), Gemma 4 (e2b, e4b, 12b, 26b, 31b), gpt-oss (20b, 120b),
  Qwen3.8 27b, GLM-4.7-Flash, DeepSeek-R1 distill (8b, 70b).
- Epoch AI (`https://epoch.ai/data/eci_scores.csv`): ECI de **Qwen3.5-9B 139,35**, **Qwen3.5-35B-A3B 143,97**, **Gemma 4 26B A4B 141,70**,
  **Gemma 4 31B IT 144,24**, **gpt-oss-20b 135,04**, **gpt-oss-120b 140,21**. Frontera = récords sucesivos de modelos **cerrados** del mismo CSV
  (de GPT-4o may. 2024 a Claude Fable 5.2, 174,24, 2026-11-09).
- Capas: SHA-256 verificado en `config/capas-astraura.json`; sin puntuación ECI (se dice).

**Lo que NO se pudo verificar → sin puntuación (nunca inventada):** ECI de qwen3.5 2b/4b/27b/122b, gemma4 e2b/e4b/12b, qwen3.8:27b, glm-4.7-flash y los destilados de
DeepSeek-R1 (Epoch no los lista; solo lista modelos grandes o de otra versión). Sus datos de Ollama sí están contrastados, así que se pueden recomendar **por encaje**,
pero sin «equivale a…». Licencias: solo donde Epoch o la página de Ollama la declaran; el resto, «sin comprobar».

**Dónde la fuente viva discrepó de la página de terceros (manda la fuente viva):** gpt-oss 20B 135,04 (página: 137,75), gpt-oss 120B 140,21 (139,83), Gemma 4 26B 141,70
(141,95), Gemma 4 31B 144,24 (143,08), Qwen3.5 9B 139,35 (139,37), Qwen3.5 35B-A3B 143,97 (142,56). La página daba **151,8 a «Qwen3.8 27B»**: Epoch **no mide** ese modelo
abierto (solo «Qwen3.8 Max», cerrado) → queda sin puntuación. Tampoco se copiaron sus mínimos de memoria: se derivan (§5).

## 5. Regla de encaje (propia)

Requisitos derivados del tamaño de descarga **comprobado** (`requisitosDe`):

- memoria mínima = descarga × 1,15 + 3,5 GB · cómoda = descarga × 1,5 + 5 GB
- VRAM mínima = descarga × 1,1 + 1 GB · cómoda = descarga × 1,3 + 2 GB · disco = descarga × 1,1 + 1 GB
- las capas usan la RAM que declara su catálogo de capas.

Veredictos (`encajar`): **Recomendado** · **Cabe justo: irá lento** · **No cabe en esta neurona** · **Falta disco: libera N GB**.

- Apple silicon = memoria unificada. GPU NVIDIA/AMD con VRAM conocida: VRAM cómoda ⇒ recomendado; VRAM mínima o RAM cómoda (parte en CPU) ⇒ justo.
- Sin GPU utilizable: solo lo ≤ 8 GB; «recomendado» solo ≤ 3,5 GB con memoria cómoda («con CPU sola, el más pequeño o no local»).
- Con batería, un modelo > 8 GB baja a «justo». Las capas 1.58-bit y Needle no piden GPU.
- Los builds MLX solo en Apple silicon. «Falta disco» no se aplica a lo ya instalado.

## 6. Casos, ranking y rutas

Casos: conversación · código y agentes · archivos privados · voz · visión · bots y dots · capas de conciencia · trabajo en segundo plano.

- Ranking de calidad (conversación, código, privados, visión): primero el veredicto, luego **ECI**, luego el build MLX en Mac, luego el papel de la capa y el tamaño.
  Sin ECI, la capa 1.58-bit gana a un modelo estándar *solo* si este solo cabe «justo» (p. ej. Mac de 8 GB).
- Bots y dots / segundo plano / reflejos: **Needle y las capas 1.58-bit primero** (deseo de Alex); capas de conciencia: la capa más capaz que cabe holgada.
  El reflejo (Needle) acompaña siempre que cabe. El «modelo fuerte y eficiente» se añade cuando la neurona lo aguanta.
- **Ruta** cuando local no es lo adecuado (`recomendar`): 1) la IA de **otra neurona de la misma cuenta por la malla** (si está en línea y sirve su IA y allí cabe holgado);
  2) **servidor propio**; 3) **proveedor externo**, solo si la persona lo permite. En casos exigentes (conversación, código, privados, visión) una neurona que solo llega «justo» prefiere la de otra neurona.
- **Privacidad**: los **archivos privados no van a un proveedor externo** salvo que la persona marque «También para mis archivos privados». Neurona de la cuenta y servidor propio sí.
  Sin ruta permitida, el resultado es `ninguna` con el porqué.
- La malla se decide aquí por la ficha (`ollama`/`astraura158.online`); que la puerta de esa neurona esté realmente alcanzable lo confirma `elegirNodoIaMalla` (`src/lib/malla/puerta/ia.ts`) al usarla.

## 7. Autoactualización diaria (`actualizar-catalogo.ts`)

- Con conexión y **como mucho una vez al día** (`debeRevisar`; el botón «Revisar ahora» fuerza). Sin conexión se usa el último catálogo y se muestra su fecha.
- `revisarFuentes` lee, por el puente `/api/astraura/modelos-fuentes` (lista cerrada, sin redirecciones, tope 4 MB), el CSV de Epoch, el índice «más nuevas» de Ollama y las páginas de cada familia.
  Una fuente caída **nunca** borra ni rejuvenece datos. `fusionar`: etiqueta presente ⇒ `comprobado = hoy` (cambia de tamaño/contexto ⇒ se anota); etiqueta que desaparece ⇒ `sin-comprobar`
  (deja de recomendarse); ECI y frontera se refrescan; **familias nuevas entran como `candidato` y no se recomiendan** hasta contrastarlas.
- Se recalcula la recomendación antes/después: si cambia a **un modelo con mejor puntuación** para esta neurona, sale **un** aviso discreto (no se repite; `avisosVistos`).
  Si la persona dejó «Automático», `decidirAplicarMejora` (que reutiliza `queAplicar`) decide si se aplica sin intervención; lo fijado a mano no se toca.
- **Nota de diseño, sin código — distribuir el catálogo por la malla.** El catálogo ya es un JSON versionado con fechas; puede viajar como un **canal firmado** del motor del enjambre
  (`src/lib/enjambre/canal.ts`, `firmas.ts`: registro `{nombre, seq, raiz, tamano, ts, ambito}` firmado por la neurona que revisó). Una neurona sin conexión recibiría de otra neurona de la
  cuenta el catálogo con `seq` mayor y firma válida y lo fusionaría con `fusionar` (gana la fecha `comprobado` más reciente por modelo). Solo biblioteca, **sin cablear** en esta ola.

## 8. Ajustes, Biblioteca y persistencia

- **Ajustes de Astraura**: bloque «Modelo local recomendado para esta neurona» (`ModelosRecomendados`, montado en `NeuronModelsPanel`, pestaña Neuronas de Astraura):
  recomendación por caso con su frase, comparación (ECI, equivalencia, descarga, memoria, disco, contexto), ruta, **«Automático» por defecto**, modo manual por caso, privacidad,
  aviso discreto y «Revisar ahora». Si la memoria viene del navegador (tope de 8 GB) lo dice y pide la real.
- **Biblioteca**: pestaña «Modelos de IA» (`?tab=modelos-ia`): tarjetas con para qué sirve, comparación, encaje en esta neurona y «En tu MaggaBook cabría…», filtros por caso,
  candidatos/sin comprobar aparte y sin botón de instalar.
- **Instalar siempre pregunta antes, con el tamaño** (`planInstalar` → `PreguntaDescarga`); `ejecutarInstalacion` no toca la red sin `confirmado: true` ni con bloqueo. La descarga es `POST /api/pull` al Ollama de la
  máquina; si el navegador integrado bloquea ese puerto (pasó con el 8000), se muestra el comando `ollama pull <modelo>`. Las capas se instalan con el instalador de capas existente.
- **Persistencia** (`almacen.ts`, por neurona, **no** viaja con la cuenta): `starseed.astraura.modelos.{catalogo,ajustes,revision,instalados}.v1`. `migrarAjustes` da modo «automático» a las cuentas que no tenían la clave
  y acepta la forma antigua `{auto}` (regla de propagación del OS).
- Hierro real: `conHierroMedido` usa `GET /hierro` del servicio local de la app nativa (`hierro-local.ts`: RAM, VRAM, disco, chip) cuando existe; si no, memoria estimada y disco «sin medir» (se dice).

## 9. Qué se verificó y qué no

- Verificado: pruebas de vitest (tabla perfil × caso, privacidad, ruta por malla, fusión con fechas, almacén, instalación con pregunta, componentes) y `tsc` limitado `EXIT=0`; los parsers se probaron contra páginas reales de Ollama/Epoch del 2026-11-10.
- **No** se probó en aparatos reales: la descarga con Ollama desde el WebView, `/hierro` en la app nativa, ni el puente `/api/astraura/modelos-fuentes` empaquetado en Tauri/Android. No se hizo `next build`.

## 10. Decisiones de Alex y lo que sigue abierto

### Decididas (Alex, 2026-11-09; implementadas por MOD1110B el 2026-11-10)

**Decisión 1 — Variantes «abliterated»: se listan como una clase aparte y opcional («Variantes sin filtros»).**
Una variante «abliterated» es un modelo abierto al que un tercero de la comunidad (no el editor) le quitó los rechazos. Reglas, todas con prueba:

- **Catálogo.** `clase: "abliterated"` solo para builds **verificados el 2026-11-10 contra la página viva de Ollama** (que la etiqueta existe, tamaño de descarga y contexto en
  `https://ollama.com/huihui_ai/<familia>/tags`, e insignias tools/vision/thinking en `https://ollama.com/huihui_ai/<familia>`). Cada una lleva `comprobado`, `fuentes`, `publicador` (`huihui_ai`, lista cerrada
  `PUBLICADORES_SIN_FILTROS`) y `baseId` (el modelo normal de que deriva). `modeloValido` descarta cualquier «abliterated» sin ese rastro, con otro publicador, con otra fuente o con `puntuacion` propia.
- **Números honestos.** Nadie midió estos builds: `puntuacion` es **siempre null** («sin medir»). La tarjeta enseña aparte la del modelo base, rotulada «puntuación de la base, no de esta variante».
  Un build que pierde herramientas (`pierdeHerramientas`: la base las tiene y él no) lo dice en la tarjeta y **no se ofrece ni se usa donde hacen falta** (código y agentes, bots y dots).
- **Apagado por defecto y por perfil.** Interruptor «Mostrar variantes sin filtros» en el bloque de ajustes (`InterruptorSinFiltros`). Encenderlo abre **una** explicación (`EXPLICACION_SIN_FILTROS`: qué son, calidad sin medir y pérdida de herramientas,
  responsabilidad de quien usa las respuestas) y pide confirmación; se guarda con el día de la confirmación (`variantesConfirmadoEl`). La migración (`migrarAjustes`) deja **apagado** a toda cuenta existente, ignora un `true` sin confirmación fechada
  y, apagado, descarta cualquier elección manual sobre una variante. Apagarlo (`desactivarVariantes`) las esconde y devuelve esas elecciones a «Automático» (y el modo, si no queda ninguna).
- **Nunca automática.** `candidatosPara` filtra `clase === "normal"`: «Automático» no elige una variante sin filtros en ninguna neurona, ni como alternativa, ni como reflejo, ni por la malla. Prueba: la tabla de 7 neuronas × 8 casos con y sin las variantes en el catálogo da **exactamente** las mismas recomendaciones.
- **Solo en la Biblioteca y a mano.** Aparecen únicamente en «Modelos de IA», en su sección «Variantes sin filtros» con insignia, si el interruptor está encendido. La persona elige una (botón «Usar en mis conversaciones privadas»), que se guarda como elección manual de los casos permitidos.
- **Nunca compartidas — impuesto en la función, no solo en la pantalla** (`aplicarEleccionManual`). Se usan solo con interruptor encendido **y** permitido en el perfil, contexto `privado-propio`, caso en `CASOS_SIN_FILTROS`
  (conversación, archivos privados, código y agentes si conserva herramientas, visión si la tiene), variante comprobada y que quepa. En cualquier otro caso se devuelve la recomendación **normal** y **una línea** que dice por qué
  («No se usa «X» para bots y dots: solo se usan en tus conversaciones privadas en tu neurona, no en bots, dots o asistentes de grupo…»). El contexto por defecto es `compartido` (lo que no declara su contexto se trata como si hablara con otras personas).
  Quedan fuera siempre: bots y dots, asistentes de grupo/comunidad/página, capas públicas, capas de conciencia, segundo plano y aprendizaje colectivo, voz, y servir a otra cuenta por la malla (`puedeServirseAOtraCuenta`). Prueba de propiedad sobre 7 neuronas × 8 casos × 5 contextos × 8 variantes × interruptor × disponibilidad.
- **Menores.** Se buscó en el repositorio (2026-11-10) un campo de edad, menor o control parental en el perfil de la cuenta: **no existe** (lo único con «cumpleaños» son las fichas de contactos). Gancho con nombre claro: `datosEdadDelPerfil()` en `variantes.ts` (devuelve `null` hoy);
  `variantesDisponibles()` ya desactiva el interruptor si el perfil declara `esMenor`, `edad < 18` o `controlParental`. **Abierto** (ver abajo).
- **Autoactualización.** La revisión diaria (§7) cubre la clase: lee las páginas de los publicadores de la lista cerrada (`urlPermitida` acepta `ollama.com/huihui_ai/<familia>[/tags]`, nada más), renueva `comprobado`, actualiza tamaño/contexto/herramientas con la página viva
  y **retira** la entrada cuya etiqueta desaparece (`sin-comprobar`: deja de listarse). La puntuación jamás se refresca (no hay). Un catálogo guardado antes recibe las variantes de la semilla que le falten.

**Variantes verificadas el 2026-11-10** (todas publicadas por `huihui_ai`, no por el editor del modelo; tamaño de la lista de etiquetas de Ollama —por encima de 10 GB Ollama redondea a la unidad—):

| Etiqueta | Base | Descarga | Contexto | Herramientas | Visión | Puntuación de la base |
|---|---|---|---|---|---|---|
| `huihui_ai/qwen3.5-abliterated:4B` | qwen3.5:4b | 3,3 GB | 256K | sí | sí | sin ECI |
| `huihui_ai/qwen3.5-abliterated:9b` | qwen3.5:9b | 6,6 GB | 256K | sí | sí | 139,35 |
| `huihui_ai/qwen3.5-abliterated:27b` | qwen3.5:27b | 17 GB | 256K | sí | sí | sin ECI |
| `huihui_ai/gemma-4-abliterated:12b` | gemma4:12b | 7,6 GB | 128K | sí | sí | sin ECI |
| `huihui_ai/gemma-4-abliterated:26b` | gemma4:26b | 18 GB | 256K | sí | sí | 141,70 |
| `huihui_ai/gemma-4-abliterated:31b` | gemma4:31b | 20 GB | 256K | sí | sí | 144,24 |
| `huihui_ai/deepseek-r1-abliterated:8b` | deepseek-r1:8b | 5,0 GB | 128K | **no (pierde)** | no | sin ECI |
| `huihui_ai/glm-4.7-flash-abliterated:latest` | glm-4.7-flash | 19 GB | 198K | sí | no | sin ECI |

Fuentes (leídas el 2026-11-10): `https://ollama.com/huihui_ai/qwen3.5-abliterated[/tags]`, `…/gemma-4-abliterated[/tags]`, `…/deepseek-r1-abliterated[/tags]`, `…/glm-4.7-flash-abliterated[/tags]`. La página de cada una dice «uncensored version of … created with abliteration» y trae el aviso de contenido sensible.

**Dejadas fuera, y por qué:** `huihui_ai/Qwen3.8-abliterated` (el modelo base Qwen3.8 27B no tiene ficha propia verificable aquí); `orcarouter/Qwen3.8-27B-Uncensored` (la página es de una pasarela comercial y sus afirmaciones —«0 % de rechazo», «sin pérdida medible»— no son verificables); `eriktonon/deepseek-v4.1-flash-1017` (afinado por un particular, base y
procedencia no verificables); `qwen3-next-abliterated` (48 GB) y `devstral-2-abliterated` (75 GB), `qwen3.5-abliterated:35b/122B` (24–81 GB), `gemma-4-abliterated:48b` (33 GB) y `deepseek-r1-abliterated:70b` (43 GB): fuera del alcance de una neurona normal (se pueden añadir con la misma regla); y las variantes de
cuantización/«Claude»/«Qwopus»/«OmniCoder» de la misma familia (afinados adicionales sin base verificable). La API de pago de la página de terceros: sin entrada, sin enlace y sin ruta.

**Decisión 2 — Instalar Ollama: instalación guiada que pregunta primero y enseña el tamaño** (§11).

### Siguen abiertas

1. **Menores.** No hay edad/menor/control parental en el perfil: el interruptor está disponible para todos hasta que exista el dato. Conectar `datosEdadDelPerfil()` cuando el perfil lo declare.
2. **La puerta de la malla.** `puerta.cjs`/`src/lib/malla/**` (fuera de esta ola) deja pasar el puerto de Ollama sin mirar el modelo: una variante instalada a mano **podría** servirse a otra cuenta. `puedeServirseAOtraCuenta(m)` es el gancho; falta que la puerta lo consulte (o que bloquee los modelos `*-abliterated`/`*-uncensored`). Hasta entonces la regla «jamás a otra cuenta» está impuesta al elegir, no al servir.
3. **Memoria real y disco.** El navegador no pasa de 8 GB; hace falta que la app nativa publique RAM/VRAM/disco en la ficha de la neurona (`capabilities`) para que «en tu MaggaBook cabría» sea exacto (`src/lib/neurons/neurons.ts` y `native/**`).
4. **Puente de fuentes empaquetado.** La revisión diaria usa una ruta de API del OS; confirmar que existe en Tauri/Android (si no, desde el servidor local o por el canal del enjambre, §7).
5. **Android.** Hoy solo WASM/WebGPU (sin Ollama). ¿Se quiere un runtime local real (llama.cpp nativo) para abrir modelos ≥ 4 GB?
6. **Puntuaciones que faltan.** Qwen3.5 4b/27b, Gemma 4 e4b/12b y Qwen3.8 27B no tienen ECI en Epoch: ¿medimos con una prueba propia o se aceptan «sin puntuación»? Las variantes sin filtros tampoco tienen medida propia.
7. **Privacidad por defecto.** Hoy: proveedor externo permitido en general, **no** para archivos privados. ¿Se invierte?
8. **Proveedor y servidor propio.** `recomendar` acepta `servidorPropio` y `externo`; falta decidir de dónde salen en la interfaz.
9. **Firma del instalador de Ollama.** Ollama no publica una suma de verificación junto al instalador: StarSeed solo comprueba el tamaño anunciado y el anfitrión; la firma la comprueba el sistema (Gatekeeper/SmartScreen) al abrirlo. No se verificó cuál es el certificado esperado.
10. **Detección desde el WebView.** El sondeo de Ollama (`GET 127.0.0.1:11434/api/version`) puede estar bloqueado por el navegador integrado (como pasó con el puerto 8000); si lo está, «Ya lo instalé» no lo detecta. Habría que sondear desde Rust. No se probó en un aparato real.
11. **Linux.** No se ejecuta nada: solo se muestra y copia el comando oficial. ¿Se quiere un instalador guiado con elevación explícita? (Hoy: no, por la regla de no pedir privilegios.)

## 11. Instalación guiada de Ollama (MOD1110B · 2026-11-10)

Donde el recomendador dice que falta un runtime (bloque de ajustes y cabecera de «Modelos de IA»), aparece **«Instalar Ollama»**. Nada empieza sin un «sí»: el cuadro (`preguntaOllama`) dice qué es Ollama, quién lo publica (el proyecto Ollama, ollama.com),
el tamaño de descarga **de este sistema con su fecha** («comprobado el 2026-11-10; se vuelve a comprobar justo antes de bajarlo»), dónde se instala, los requisitos, y que StarSeed baja el instalador oficial y nada más y no lo ejecuta en silencio ni pide privilegios.

**Datos verificados el 2026-11-10** (`https://ollama.com/download`, que redirige a `github.com/ollama/ollama/releases/latest/download/…` → versión v0.40.16 → CDN `release-assets.githubusercontent.com`; documentación oficial `https://docs.ollama.com/{macos,windows,linux}`):

| Sistema | Qué hace StarSeed | Descarga oficial | Tamaño | Instala en / requisitos |
|---|---|---|---|---|
| macOS | Descarga a Descargas con progreso y cancelar, y **abre** la imagen de disco (`open`); la persona arrastra Ollama a Aplicaciones | `https://ollama.com/download/Ollama.dmg` | 229.996.388 bytes (230 MB) | Aplicaciones; macOS 14 (Sonoma)+, Apple silicon o Intel |
| Windows | Descarga a Descargas con progreso y cancelar, y **abre** el instalador (`explorer.exe`); la persona lo completa | `https://ollama.com/download/OllamaSetup.exe` | 1.857.663.944 bytes (1,86 GB) | Carpeta del usuario, no pide administrador, ≥ 4 GB libres; Windows 10 22H2+ |
| Linux | **No ejecuta nada**: muestra las instrucciones oficiales y ofrece copiar el comando | — (`curl -fsSL https://ollama.com/install.sh \| sh`, de `docs.ollama.com/linux`) | — | Lo decide el instalador del editor (pide contraseña) |
| Android | Dice que Ollama no corre; ofrece las capas ligeras o la IA de otra neurona de la cuenta por la malla | — | — | — |
| Web / PWA | Igual que Android | — | — | — |

**Lo nativo** (`native/src-tauri/src/ollama_instalador.rs`, solo escritorio; los comandos existentes de descarga —`capas_descargar`— escriben a la carpeta de datos con SHA y no abren archivos, así que no servían):
`ollama_instalador_descargar(sistema)`, `ollama_instalador_cancelar()`, `ollama_instalador_abrir(ruta, revelar?)` y el evento `starseed://ollama-descarga {fase, descargado, total, porcentaje}`. Aditivo y pequeño; solo std + `curl` (como `disco.rs`); comandos concedidos solo en `desktop.json`.
Garantías (con prueba en Rust y en vitest): lista cerrada de anfitriones (`ollama.com/download/…`, `github.com/ollama/ollama/releases/…`, `release-assets.githubusercontent.com/github-production-release-asset/…`; nada con usuario, puerto, `..` ni `http`); **cada salto de redirección se comprueba antes de seguirlo**;
destino fijo `<Descargas>/Ollama.dmg|OllamaSetup.exe` y solo se abre ese archivo; solo el instalador del sistema en el que corre la app; tamaño anunciado creíble (20 MB–4 GB) y disco libre con 10 % de margen; se descarga a `.parcial` y solo si el tamaño final coincide se renombra; cancelar o fallar borra el parcial («no queda nada a medias»).

**Después.** Con el cuadro abierto y tras pedir la descarga, se mira con suavidad (cada 5 s, hasta 30 min) si Ollama responde (`vigilarOllama`); «Ya lo instalé» mira una vez. El modelo que se iba a instalar queda en `starseed.astraura.modelos.ollama-pendiente.v1` (14 días); al detectar Ollama —ahora o **en el siguiente arranque**—
la neurona pasa a tener ese runtime y el bloque ofrece «Sigamos con «X»», que vuelve al paso de siempre: pregunta con el tamaño y descarga solo con «Descargar».

**No se hizo** (y no se pudo): descargar o ejecutar el instalador (ni en el Mac ni en la nube; solo se leyeron cabeceras y tamaños), probar la apertura (`open`/`explorer`) ni la detección en un aparato real, y `next build`.
