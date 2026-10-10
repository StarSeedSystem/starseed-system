# Contrato · Mejoras instalables por neurona (voz, sonido, audiovisual y código) · 2026-10-10

Petición de Alex del 2026-10-10: «para el sistema de voces, de generación de sonido, de contenido
audiovisual y de código: cada neurona debe saber cuándo hay mejoras en los sistemas disponibles
instalables en cada medio y usarlas automáticamente según sus ajustes».

Tarea OPM1010. Código: `src/lib/mejoras/` (núcleo puro), `src/components/mejoras/` (panel),
`scripts/puente/mejoras_neurona.py` (sondeo real). Este documento manda sobre el código: si la
lógica cambia, se cambia aquí primero.

## 0 · Lo que ya existía y se reutiliza (no se duplica)

| Pieza | Dónde | Qué aporta a las mejoras |
|---|---|---|
| Actualizaciones por capas y nivel | `src/lib/actualizaciones/` · `architecture/actualizaciones-por-capas-y-niveles.md` | Capas (`datos`…`nativa`), gesto mínimo por capa, **política por capa** (`decidirPolitica`), **momento seguro** (`puedeAplicarAhora`: llamada, directo, escritura, batería < 20 %, descarga > 50 MB sin Wi-Fi), **canaria** (`elegirCanaria`) y **máquina de estados** del despliegue (`siguienteEstado`). Las mejoras NO inventan otra política: la usan. |
| Biblioteca con versión upstream | `src/lib/library/actualizaciones.ts` · `/api/library/actualizaciones` | Lectura de último commit de GitHub y `sha` de Hugging Face, caché 6 h en memoria. El sondeo de mejoras amplía las fuentes (releases, PyPI, npm, catálogo de capas) y guarda la caché en disco. |
| Capas de Astraura con SHA | `config/capas-astraura.json` · `architecture/capas-autoadaptables.md` · `scripts/puente/capas_renovar.py` | Pesos verificados por `sha256` (`lfs.oid`). Regla §6: **una capa sin su SHA no se usa jamás**. El registro de mejoras lee de aquí los requisitos de las capas (no los copia). |
| Requisitos de hardware y encaje | `src/ai/astraura/model-requirements.ts` (`fitFor`) · `model-fit.ts` (llmfit) · `model-scout.ts` | Encaje cualitativo de LLM y voces; fórmulas de memoria/velocidad. El detector de mejoras es su generalización a las cinco familias y a los cuatro medios. |
| Voz | `src/lib/aurora/tts-oss/engine-registry.ts` · `native/astraura-voice/` (OmniVoice en `127.0.0.1:4500`, VibeASR) · `src/lib/aurora/stt-oss/vibeasr-local.ts` | Motores reales del OS. El registro de mejoras usa sus mismos ids de motor. |
| Huella de la neurona | `src/lib/neurons/huella.ts` (`normalizarGpu`, `familiaSistema`) · `maquina.ts` · `NeuronCapabilities` | Rasgos de hardware y medios de cada aparato. |
| Presencia con versión por capa | `src/lib/neurons/presencia.ts` (`PresenciaMedio.v`) | Lo que cada medio dice tener en vivo. |
| Catálogo de la Protomolécula | `src/lib/protomolecula/catalogo-herramientas.ts` | Lo escribe otro agente; **seguía sin existir** el 2026-10-10 a las 10:30 UTC (en `src/lib/protomolecula/` solo hay `dictado`, `parametros`, `permisos`, `tipos`, `vinculos-control`). Cuando exista, sus herramientas audiovisuales instalables se añaden al registro con la misma forma (tarea M8, §9). |

## 1 · Registro de SISTEMAS por familia

Una sola fuente para TypeScript y Python: `src/lib/mejoras/registro-sistemas.json`, saneado por
`registro.ts`. Cada sistema declara:

- `familia`: `voz-tts` · `voz-asr` · `sonido` · `audiovisual` · `codigo`.
- `capa`: por dónde se aplica (`modelos`, `servicios`, `nativa`; o `interfaz` si viaja con el OS).
- `canal`: `por-neurona` (se instala en cada aparato) o `con-el-os` (librería web empaquetada en
  el build: llega cuando MetaGenesis publica una versión del OS, nunca por neurona).
- `fuente` de versiones: `github-release`, `github-commit`, `huggingface`, `pypi`, `npm` o
  `catalogo-capas` (id de `config/capas-astraura.json`).
- `requisitos`: RAM, disco, núcleos, GPU (`no`/`opcional`/`recomendada`/`requerida`), VRAM,
  aceleraciones válidas (`cpu`, `wasm`, `webgpu`, `metal`, `cuda`, `rocm`, `vulkan`, `nnapi`,
  `coreml`) y sistemas admitidos; y **de dónde salen** (`requisitosFuente`: `upstream`,
  `catalogo` o `estimado`). Un requisito estimado se dice en el panel.
- `medios` donde corre, en orden de preferencia: `servidor` (servicio local de la máquina),
  `nativa` (app Tauri), `pwa` (app instalada), `web` (pestaña).
- `licencia` y `licenciaPesos` (cuando los pesos tienen otra licencia), y
  `requiereAceptarLicencia` (modelos con acceso condicionado): **nunca** se instalan solos.
- `preferencia` (1-5): orden curado de StarSeed dentro de la familia. **Propone; no decide**: lo
  que decide es la prueba de calidad medida en la canaria (§5).

Fuentes comprobadas el 2026-10-10 desde la Mac (API pública, sin claves): ver la tabla del
registro. Hallazgos que cambian decisiones:

- `rhasspy/piper` está **archivado**; el sucesor vivo es `OHF-Voice/piper1-gpl` (v1.8.0) y su
  licencia pasa de MIT a **GPL-3.0**.
- Los pesos de `Serveurperso/OmniVoice-GGUF` (el modelo del demonio de voz de la Mac) y de
  `facebook/musicgen-small` son **CC-BY-NC-4.0** (uso no comercial). Se marca en `licenciaPesos`.
- `stabilityai/stable-audio-open-small` tiene acceso condicionado (`gated: auto`).
- `comfyanonymous/ComfyUI` redirige a `Comfy-Org/ComfyUI` (v0.39.0).
- Sin clave, GitHub da **60 consultas por hora**: con ~25 fuentes el límite se agota en dos
  sondeos. Por eso la caché es de 6 h en disco y el sondeo dice «límite de GitHub» en vez de
  «sin versión» (y usa `GITHUB_TOKEN` si existe, sin imprimirlo nunca).
- Medido el 2026-10-10 a las 10:24 UTC en el **contenedor de la nube**: 13 de 26 fuentes con
  versión (Hugging Face, npm y las capas de Astraura sí); las 13 de GitHub dan **403 de un proxy,
  no de GitHub** (sin cabeceras `x-github-*`: el proxy del contenedor solo deja los repos de la
  sesión). El sondeo ya lo dice así («GitHub bloqueado en esta red… el sondeo de otra neurona sí
  llega») en vez de «HTTP 403». Por eso el sondeo vale en la Mac y en Oracle, no en el contenedor.

No entran como instalables: OpenVoice 2 (corre en un Space de la nube), xAI y las voces del
servidor StarSeed (remotos), Audiomorphic (síntesis Web Audio que ya es parte del OS).

## 2 · DETECTOR por neurona (`detector.ts`)

Entrada: la **huella del aparato** (`HuellaAparato`): sistema, RAM, disco libre, núcleos, GPU
(familia, modelo, VRAM), aceleraciones y medios disponibles. Se construye de dos formas y se
fusiona: desde `NeuronCapabilities` (navegador) y desde el sondeo de la máquina
(`mejoras_neurona.py huella`, que sí ve la RAM real, el disco, Metal y CUDA). El sondeo manda.

Reglas de medida (no se adivina):

- `navigator.deviceMemory` redondea hacia abajo a potencia de 2 y **se corta en 8 GB**. Un valor
  `v` < 8 significa RAM real en `[v, 2v)`; `v` = 8 significa «8 GB o más». El detector lo trata
  como cota: cabe seguro si `v ≥ necesita`; no cabe seguro si `v < 8` y `2v ≤ necesita`; si no,
  «sin datos» (hace falta el sondeo nativo).
- Aceleraciones por medio: `web`/`pwa` solo `wasm` y `webgpu`; `nativa` y `servidor` además `cpu`
  y las del hardware (`metal` en Apple, `cuda` con NVIDIA, `nnapi` en Android nativo…). Las que
  vienen del navegador se marcan **inferidas** («CUDA probable: se confirma con el sondeo»).
- GPU de Apple: memoria unificada; la VRAM útil se estima en 2/3 de la RAM.
- Disco: se pide `disco × 1,2` libre (la versión anterior se conserva para volver atrás).

Salida por sistema: **instalable aquí** (con el medio elegido), **no cabe aquí y por qué**
(carencias: RAM, disco, núcleos, GPU, aceleración, sistema), **sin medio** (p. ej. solo hay
navegador y el sistema necesita la app nativa o el servicio local), **sin datos**; y si no cabe,
**«mejor en otra neurona tuya»** (la que lo admite con más margen, preferiblemente en línea).

## 3 · Hallazgos (qué hay nuevo)

Para cada sistema y neurona: versión instalada (de `~/.starseed/mejoras/instaladas.json` y de los
sondeos locales: Ollama `/api/version`, ComfyUI `/system_stats`, capas de Astraura) frente a la
versión remota (sondeo). Comparación honesta: semver/fechas se ordenan; dos `sha` distintos solo
dicen «distinta» (la fuente da la última, así que es nueva); formatos que no casan → «sin dato».
Estados: `nueva-version`, `al-dia`, `instalable-nuevo` (no está instalado, cabe y su preferencia
supera a lo que la neurona usa en esa familia), `no-cabe`, `sin-dato`.

## 4 · DECISIÓN (`decision.ts`) — en este orden, el primer «no» gana

1. Al día / sin dato → nada. `con-el-os` → «llega con la próxima versión del OS» (MetaGenesis).
2. No cabe → nada, con el porqué y la neurona alternativa.
3. Ajustes de la neurona por familia: `nunca` → nada; `avisar` → avisar.
4. Sistema nuevo (no instalado) sin «instalar sistemas nuevos» activado → avisar (por defecto
   apagado: actualizar lo que ya usas sí; instalar algo nuevo, solo si lo pides).
5. Licencia condicionada o pesos sin `sha256` verificable (capa `modelos`) → avisar.
6. Canaria: si el despliegue está `pendiente`/`canaria` y esta no es la canaria → posponer
   («esperando a la canaria»); si se retiró (`revirtiendo`/`revertido`) → nada.
7. Política de la entidad por capa (`decidirPolitica` de actualizaciones): avisar o fuera de
   ventana → posponer.
8. Momento seguro (`puedeAplicarAhora`) + **la familia no está en uso** (no se cambia el oído en
   mitad de un dictado ni la voz mientras habla) → si no, posponer con el motivo.
9. Aplicar.

## 5 · APLICAR con canaria, prueba de calidad y vuelta atrás

Por capa, con el gesto mínimo de `COMO_SE_APLICA`:

- **modelos**: descargar a carpeta nueva → verificar `sha256` → prueba de calidad con la nueva
  **sin quitar la actual** → conmutar el puntero → conservar la anterior 7 días.
- **servicios**: instalar la versión junto a la actual (carpeta/venv por versión) → arrancar en
  puerto alternativo → prueba de calidad → cambiar el servicio → anterior conservada.
- **nativa**: solo la publica MetaGenesis; actualizador firmado de Tauri y relanzar en momento
  seguro.

Prueba de humo de calidad (`calidad.ts`), umbrales absolutos y de regresión frente a la versión
anterior medida en la MISMA neurona:

| Familia | Métricas | Pasa si | Regresión que revierte |
|---|---|---|---|
| voz-asr | RTF (tiempo de proceso / duración del audio), WER sobre frases fijas | RTF ≤ 0,5 (dictado en vivo con margen) y WER ≤ 15 % | WER +2 puntos o RTF +25 % |
| voz-tts | latencia al primer audio, RTF, audio no vacío | primer audio ≤ 1500 ms, RTF ≤ 1 | latencia +30 % |
| sonido | RTF de generación, RMS (no silencio), desvío de duración | RMS > 0,001, desvío ≤ 10 %, RTF ≤ 4 | RTF +50 % |
| audiovisual | segundos por unidad (imagen o segundo de vídeo), salida válida | salida válida | tiempo +50 % |
| codigo | tokens/s, latencia al primer token, aciertos en un banco fijo | ≥ 5 tok/s | aciertos −5 puntos o tok/s −25 % |

Si la canaria pasa → `propagando` a las demás neuronas (por la malla si otra ya lo tiene). Si
falla → `revirtiendo`: se repunta a la versión anterior, se avisa con el motivo medido y la
versión queda retirada para esa cuenta hasta la siguiente.

## 6 · Cómo se ve en Genesis

Genesis › **Actualizaciones**, debajo del bloque por capas: «Mejoras por neurona». Por cada
neurona: **qué hay nuevo** (de → a), **qué se aplicó** (con su medida de calidad), **qué se
pospuso y por qué** (canaria, llamada, ventana, batería, Wi-Fi, en uso), **qué no cabe y dónde sí**.
Estados vacíos honestos: sin sondeo no se pinta «al día», se dice que no hay datos y cómo
obtenerlos. Panel: `src/components/mejoras/panel-mejoras-neurona.tsx` (presentacional, sin
montar; la línea para montarlo está en §8). Probado con el informe REAL del núcleo
(`src/components/mejoras/__tests__/panel-mejoras-neurona.test.tsx`, 6 pruebas): sin informes dice
«no se dice "al día"» y da la orden del sondeo; una neurona sin sondeo lo dice en su tarjeta; las
fuentes sin dato se cuentan; «esta neurona» va primero; los sha largos se cortan a 7.

## 7 · Archivos y datos en la neurona

`~/.starseed/mejoras/` — `cache.json` (respuestas de las fuentes, 6 h; fallos 10 min),
`estado.json` (lo último del sondeo: huella, instaladas, remotas), `instaladas.json` (lo escriben
los instaladores: `{id: {version, medio, sha256}}`), `historial.jsonl` (aplicadas, pospuestas y
vueltas atrás). Nunca claves: solo nombres de variable (`GITHUB_TOKEN`).

Comandos (en la Mac, desde la carpeta del repo):

- `python3 scripts/puente/mejoras_neurona.py sondear` — consulta las fuentes (usa la caché).
- `python3 scripts/puente/mejoras_neurona.py huella` — hardware real de esta máquina.
- `python3 scripts/puente/mejoras_neurona.py estado` — sondeo + huella + instaladas → `estado.json`.
- Pruebas: `python3 -m unittest scripts/puente/test_mejoras_neurona.py`.

## 8 · Montaje en Genesis (para quien integre)

En `src/components/mando/centro-mando.tsx`, junto a la carga diferida de
`ActualizacionesMetaGenesis` (línea ~89), añadir la del panel, y dentro de
`<TabsContent value="actualizaciones">` (línea ~2354), debajo de `<ActualizacionesMetaGenesis />`:

```tsx
const MejorasNeuronas = dynamic(
    () => import("@/components/mejoras/mejoras-neuronas").then((m) => m.MejorasNeuronas),
    { ssr: false, loading: () => <p className="text-xs text-white/40">Cargando las mejoras…</p> },
);
// …dentro de <TabsContent value="actualizaciones">, debajo de <ActualizacionesMetaGenesis />:
{pestana === "actualizaciones" ? <MejorasNeuronas /> : null}
```

`MejorasNeuronas` (tarea M2) es el envoltorio que llama al gancho y pinta
`<PanelMejorasNeurona informes={…} generado={…} cargando={…} error={…} onComprobar={…} estaNeuronaId={…} />`.
Hasta que exista, montar el panel directamente con `informes={[]}` enseña el estado vacío honesto.

## 9 · Tareas para el enjambre (≤ 3 archivos, ≤ 120 líneas por archivo)

Hecho por OPM1010 (2026-10-10): contrato, núcleo puro (`src/lib/mejoras/`: registro, detector,
hallazgos, decisión, calidad, aplicación, informe; 47 pruebas), sondeo real
(`scripts/puente/mejoras_neurona.py`, 15 pruebas) y panel (6 pruebas). Lo que falta, en orden.
Cada prompt es autosuficiente; todos empiezan igual: «Lee `architecture/mejoras-por-neurona.md`
y CLAUDE.md. Sin `node:*` en código de cliente; claves solo por nombre de variable; español claro;
nada de «al día» sin dato. Pruebas solo de tus archivos (`npx vitest run <ruta>` o
`python3 -m unittest <archivo>`).»

**M1 · Lector de servidor y API local.** Archivos: `src/lib/mejoras/servidor.ts`,
`src/app/api/mejoras/estado/route.ts`, `src/lib/mejoras/__tests__/servidor.test.ts`.
`servidor.ts` (solo servidor, usa `node:fs/promises`, `node:os`, `node:path`) exporta
`leerEstadoMejoras(dir?)`: carpeta `process.env.STARSEED_MEJORAS_DIR` o `~/.starseed/mejoras`; lee
`estado.json` (forma: `{esquema, generado, huella:{sistema, ram_mb, disco_libre_mb, nucleos,
gpu:{familia, modelo, vram_mb}, aceleraciones, arquitectura, maquina}, instaladas:{id:{version,
origen}}, remotas:{id:{version, fecha, verificable, error, sha256?, cache_vieja?}}}`) y las
últimas 200 líneas de `historial.jsonl` saneadas con `sanearApunte` de `./aplicacion`. Devuelve
`{disponible: boolean, generado: string|null, huella: unknown, instaladas: Record<string,
VersionInstalada>, remotas: Record<string, VersionRemota>, historial: ApunteHistorial[]}`; sin
archivo → `disponible:false` y vacíos; JSON roto → igual, nunca lanza, nunca devuelve rutas del
disco. La ruta: `import "server-only"`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `GET`
con `const veto = await guardianMando(request); if (veto) return veto;` (de
`@/lib/mando/guardian`) y `Cache-Control: no-store`; `POST {accion:"comprobar"}` (mismo guardián)
lanza `python3 scripts/puente/mejoras_neurona.py estado` con `execFile` desde
`raizDelProyecto()` (`@/lib/mando/raiz`), plazo 180 s, y responde con el estado nuevo. La ruta
solo exporta `GET`, `POST`, `runtime` y `dynamic`. Pruebas con una carpeta temporal: sin
archivos, JSON roto, historial con líneas malas, forma buena.

**M2 · Gancho, envoltorio y montaje en Genesis › Actualizaciones** (depende de M1). Archivos:
`src/components/mejoras/use-mejoras-neuronas.ts`, `src/components/mejoras/mejoras-neuronas.tsx`,
`src/components/mando/centro-mando.tsx` (solo las dos inserciones de §8). El gancho
(`"use client"`) pide `GET /api/mejoras/estado`; arma la huella con
`fusionarHuellas(huellaDesdeCapacidades(id, await detectCapabilities()), huellaDesdeSondeo(id,
estado.huella))` (`./detector`; `detectCapabilities` y `thisDeviceId` de `@/lib/neurons/neurons`);
hallazgos con `detectarMejoras({registro: REGISTRO_SISTEMAS, huella, instaladas, remotas})`;
decisiones con `decidirMejora(h, sanearAjustes(<localStorage "starseed.mejoras.ajustes.v1" en
try/catch>), {politica: leerPoliticaSistema(idSistema("os"), "os"), ahoraH: new Date().getHours(),
esNeuronaElegida: leerNeuronaElegida() === id, momento: await medirMomento(), enUso: []})`
(`@/lib/actualizaciones/almacen-politicas` y `momento-navegador`); informe con
`construirInforme(huella, hallazgos, decisiones, estado.historial)`. Si `disponible` es false,
`informes=[]` (el panel ya dice lo honesto). Devuelve `{informes, generado, cargando, error,
comprobar, estaNeuronaId}`; `comprobar` hace el POST. `mejoras-neuronas.tsx` solo llama al gancho
y pinta `PanelMejorasNeurona`. Comprobar a mano en localhost:9002/genesis?pestana=actualizaciones.

**M3 · Sondeo periódico solo en cada neurona servidor (Mac y Oracle A1).** Archivos:
`scripts/puente/autocuracion_mando.py`, `scripts/puente/test_autocuracion_mando.py`,
`deploy/oracle/compose-a1.yml`. En la autocuración (una pasada cada 120 s): función pura
`decidir_sondeo_mejoras(generado_epoch, ahora, ultimo_intento, edad_s=21600, minimo_s=3600)` →
True si no hay `estado.json` o tiene más de 6 h y el último intento fue hace más de 1 h; si True,
lanza en segundo plano `python3 scripts/puente/mejoras_neurona.py estado` (sin esperar, salida a
`/tmp/starseed-mejoras.log`) y guarda `mejoras_ultimo` en `~/.starseed/autocuracion-mando.json`.
Pruebas de la función pura (sin estado, reciente, viejo, intento reciente). En `compose-a1.yml`
(léelo entero antes; añade SOLO un bloque): servicio `mejoras` con `python:3.12-alpine`,
`mem_limit: 128m`, `restart: unless-stopped`, `working_dir: /app`, volúmenes de solo lectura
`./scripts/puente/mejoras_neurona.py:/app/scripts/puente/mejoras_neurona.py:ro`,
`./src/lib/mejoras/registro-sistemas.json:/app/src/lib/mejoras/registro-sistemas.json:ro` y
`./config/capas-astraura.json:/app/config/capas-astraura.json:ro` (el guion busca la raíz dos
carpetas por encima de sí mismo), un volumen con nombre para `/root/.starseed/mejoras` y orden
`["sh", "-c", "while true; do python3 /app/scripts/puente/mejoras_neurona.py estado; sleep 21600; done"]`.
(No copies el montaje del servicio `orquestador`: solo monta `scripts/enjambre`.)

**M4 · Resumen de mejoras de cada neurona en su ficha (verlas desde cualquier neurona).**
Archivos: `src/lib/mejoras/resumen.ts`, `src/lib/mejoras/publicar-resumen.ts`,
`src/lib/mejoras/__tests__/resumen.test.ts`. `resumen.ts` (puro): `resumirInforme(inf, generado)`
→ objeto ≤ 4 KB (`{v:1, generado, aparato, medida, alDia, sinDato, nuevas, aplicadas, pospuestas,
noCaben}`, cada lista ≤ 8 filas y `texto` ≤ 160 caracteres) y `informeDesdeResumen(neuronaId,
nombre, x: unknown)` → `InformeNeurona | null` que sanea todo lo que llega de la red.
`publicar-resumen.ts` (cliente): guarda el resumen en `neuron_devices.capabilities.mejoras` de
ESTA neurona con el mismo patrón leer-fusionar-actualizar de `setNeuronHermioneSync`
(`src/lib/neurons/neurons.ts`), como mucho una vez por hora y solo si cambió (huella del JSON en
localStorage). Pruebas: ida y vuelta, recorte de tamaño, entrada basura → null.

**M5 · Las demás neuronas en el panel** (depende de M2 y M4). Archivos:
`src/components/mejoras/use-mejoras-neuronas.ts`, `src/components/mejoras/mejoras-neuronas.tsx`,
`src/components/mejoras/__tests__/use-mejoras-neuronas.test.tsx`. Tras construir el informe
propio, llamar a `publicarResumen`; leer `listNeurons()` y, para cada otra neurona con
`capabilities.mejoras`, `informeDesdeResumen`; las que no lo tienen salen como informe vacío con
`medida:"navegador"` y `aparato` desde `huellaDesdeCapacidades` + `describirAparato` (el panel ya
dice «aún no ha sondeado»). Pruebas con `listNeurons` y `fetch` doblados.

**M6 · Aplicador de capas de Astraura (descargar, verificar, registrar; sin conmutar).** Archivos:
`scripts/puente/mejoras_aplicar.py`, `scripts/puente/test_mejoras_aplicar.py`. Solo sistemas con
fuente `catalogo-capas` (los únicos con sha256 firmado). `plan <id>` imprime los pasos de §5;
`descargar <id> [--seco]`: comprueba disco libre ≥ tamaño × 1,2 (`shutil.disk_usage`), llama a
`descargar_espejo(config, [ref])` de `scripts/puente/capas_renovar.py` (ya verifica el sha y borra
si no casa), y si el informe dice «espejo ok» anota en `~/.starseed/mejoras/instaladas.json`
`{id: {version, medio:"servidor", sha256, desde}}` con estado `descargada` y una línea en
`historial.jsonl` con `accion:"avisada"` y `motivo:"Descargada y verificada; falta la prueba de
calidad para conmutar."` — nunca `aplicada` sin prueba. Escrituras atómicas (`.tmp` + `os.replace`).
Pruebas con `descargar_espejo` y el disco doblados.

**M7 · Prueba de calidad de voz en la canaria (oído y habla).** Archivos:
`scripts/puente/mejoras_calidad_voz.py`, `scripts/puente/test_mejoras_calidad_voz.py`. Réplica en
Python de `src/lib/mejoras/calidad.ts` para `voz-asr` (WER por Levenshtein de palabras, RTF; pasa
si RTF ≤ 0,5 y WER ≤ 15 %; revierte con WER +2 puntos o RTF +25 % frente a la anterior) y `voz-tts`
(latencia al primer audio ≤ 1500 ms, RTF ≤ 1; revierte con latencia +30 %). Medición real contra
el demonio de voz local (`/api/voz/salud` y `/api/voz/hablar` de localhost:9002; si no responde,
resultado «sin medir», nunca «pasa»). Tres frases fijas en español. Resultado en
`historial.jsonl` (`accion` `aplicada` o `revertida`, `calidad` con las cifras). Pruebas con las
respuestas HTTP dobladas y los mismos casos que `decision-calidad.test.ts`.

**M8 · Herramientas audiovisuales de la Protomolécula en el registro** (solo si ya existe
`src/lib/protomolecula/catalogo-herramientas.ts`; si no, la tarea termina sin cambios y lo dice).
Archivos: `src/lib/mejoras/registro-sistemas.json`, `src/lib/mejoras/__tests__/registro-detector.test.ts`.
Por cada herramienta instalable de código abierto con repositorio: una entrada con `familia:
"audiovisual"` (o `sonido`), su `fuente`, `requisitos` (`requisitosFuente: "estimado"` si el
proyecto no los publica), `medios`, `licencia` y `preferencia`. Prueba: ninguna entrada
descartada (`DESCARTES_REGISTRO` vacío) y ids únicos.
