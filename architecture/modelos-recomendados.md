# Modelos locales recomendados por neurona (MOD1110A · 2026-11-10)

> Astraura y la Biblioteca recomiendan modelos locales a cada neurona con un método común: **encaje por
> hardware, puntuación comparable, rasgos, ruta y datos con fecha que se revisan solos**. Extiende lo que
> ya había (`perfil-hardware.ts`, `auto-actualizar-modelos.ts`, `capas/catalogo.ts`, `src/ai/astraura/model-scout.ts`);
> no lo sustituye. Código: `src/lib/astraura/modelos/*`.

## 1. De dónde viene el método (y qué NO se tomó)

Alex compartió una página pública de terceros, un «selector de modelos». Se tomó solo **el método**:
encaje por memoria/VRAM/disco, puntuación comparable del Epoch Capabilities Index (ECI) expresada como «tan
bueno como el mejor modelo cerrado de <fecha>», rasgos (contexto, herramientas, visión), una ruta
(local u otro sitio) y cifras con fecha que se vuelven a comprobar.

No se tomó: su código ni sus textos; sus instrucciones de instalación de otras herramientas; su eje principal
(variantes «abliterated» —sin rechazos— y una API de pago que las aloja): **el catálogo solo trae builds
normales de los editores**, el esquema exige `clase: "normal"` (cualquier otra se descarta al leer) y no hay
ruta ni URL hacia esa API (`urlPermitida` lo impide y hay prueba). Y **no se tomaron sus cifras a ciegas**:
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
  malla ya los conoce (`native/servidor-local/puerta.cjs`, `PUERTOS_IA_LOCAL`). **StarSeed no instala ni arranca Ollama**: solo lo detecta.
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

## 10. Decisiones abiertas para Alex

1. **Variantes «abliterated».** ¿Se listan alguna vez? Hechos: la página fuente reconoce que nadie midió esas variantes (sus cifras repiten las del modelo base) y su propia lista muestra una (`deepseek-r1-abliterated:8b`) que **pierde el soporte de herramientas**. Hoy: ninguna en el catálogo, ninguna ruta a esa API. Si se aceptan, haría falta una clase separada, opt-in, con su propia medición.
2. **Instalar Ollama.** StarSeed solo lo detecta. ¿Se ofrece un instalador guiado (con pregunta y tamaño) o se deja como «instala Ollama desde ollama.com»? Sin Ollama solo se recomiendan capas.
3. **Memoria real y disco.** El navegador no pasa de 8 GB; hace falta que la app nativa publique RAM/VRAM/disco en la ficha de la neurona (`capabilities`) para que «en tu MaggaBook cabría» sea exacto. Tocaría `src/lib/neurons/neurons.ts` y `native/**` (fuera de esta ola).
4. **Puente de fuentes empaquetado.** La revisión diaria usa una ruta de API del OS; confirmar que existe en Tauri/Android (si no, la revisión se hará desde el servidor local o por el canal del enjambre, §7).
5. **Android.** Hoy solo WASM/WebGPU. ¿Se quiere un runtime local real en Android (llama.cpp nativo) para abrir modelos ≥ 4 GB?
6. **Puntuaciones que faltan.** Qwen3.5 4b/27b, Gemma 4 e4b/12b y Qwen3.8 27B no tienen ECI en Epoch: ¿medimos con una prueba propia o se aceptan «sin puntuación»?
7. **Privacidad por defecto.** Hoy: proveedor externo permitido en general, **no** para archivos privados. ¿Se invierte (externo apagado salvo permiso)?
8. **Proveedor y servidor propio.** `recomendar` acepta `servidorPropio` y `externo` como entorno; falta decidir de dónde salen en la interfaz (hoy el bloque no los rellena, así que solo actúa la ruta por malla).
