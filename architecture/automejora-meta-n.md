# Automejora recursiva de las capas de conciencia de Astraura con Meta^n (MTN1027)

**Pedido de Alex (2026-10-27):** «este también para todo el automejoramiento de todo eso de cada capa de conciencia mesh
automejorable de toda Astraura, con lo de Colibri y los demás sistemas locales y mesh autoadaptables, y en la librería
autoactualizable como el resto» — https://github.com/minnesotanlp/meta-n

## 1. Qué es Meta^n (medido el 2026-10-27)

- **Código del artículo** «Meta^n: Recursive Self-Improvement through Emergent Depth» (Zae Myung Kim, Young-Jun Lee,
  Seungyeon Jwa, Dongyeop Kang; arXiv 2608.24735). Licencia **MIT**. Python ≥ 3.11 (CI con 3.11 y 3.12), paquete
  `meta-n` 0.2.0. **Sin etiquetas ni versiones publicadas:** dos commits, el último `b7081843d3c7` del 2026-08-26.
  El propio README lo llama **prototipo de investigación**.
- **La idea:** casi todos los bucles «automejorables» refinan respuestas; Meta^n mejora el **proceso** que las produce.
  Una sola operación fija, **Ω**, lee las trazas de ejecución de las capas de abajo y escribe una capa nueva:
  `InjectedCode` = un `pre_process` (Python que emite **pautas de estrategia en texto**) y un `code_library`
  (**funciones de ayuda** en Python o bash). Las capas se apilan `Mₙ(…M₂(S₁))` hasta donde sirvan.
  - Capa 0 `BaseExecutor` ejecuta y devuelve una `Trace` (salida, errores, éxito, puntuación).
  - Capa 1: el resolvedor (un LLM que escribe la solución).
  - Capas 2+: las escribe Ω. Puede también **deshacer** una capa que empeoró.
- **Búsqueda:** `EvolutionaryOrchestrator` con un `Archive` que solo crece (vale al menos lo que el mejor de N).
  Opciones clave: `--use-archive` (obligatoria), `--max-iterations`, `--patience`, `--parallel`, `--base-url`,
  `--model`, `--api-key` (cualquier extremo compatible con OpenAI), `--daily-budget-usd`, `--verified-code`.
- **Salidas por ejecución** (`experiments/<nombre>/`): `summary.json`, `convergence.json`, `checkpoint.json`,
  `archive/index.json`, `traces/` e `injected_code_d*.json` por candidato, y `llm_io/*.jsonl` con cada llamada.
- **Riesgo que dice su propio código** (`meta_n/utils/safety.py`): el `pre_process` y las pruebas de humo se ejecutan
  con `exec` **en el proceso anfitrión**, protegidos solo por una lista estática y un tope de tiempo; las tareas
  propias (`--tasks`) corren con `LocalExecutor` **en el anfitrión sin sandbox**. Y las trazas que lee Ω vienen de
  lo que escribe la gente: un texto malicioso puede dirigir el código que Ω genera.

## 2. Su papel en StarSeed: el tercer nivel de la automejora

| Nivel | Qué mejora | Quién lo hace (ya existe o en cola) |
|---|---|---|
| **Pesos** | el modelo de la capa | adaptador colectivo de Needle cada noche (`scripts/puente/experiencias.py`), Fábrica de adaptadores (`src/lib/astraura/aprendizaje/fabricas.ts`: QVAC, Soup, onebitllms) |
| **Orden** | qué motor se elige en cada neurona | medidas que reordenan (`src/lib/astraura/capas/medidas.ts`, CLB1027G), caché de expertos de Colibri |
| **Proceso** | cómo resuelve la capa: pautas y funciones de ayuda | **Meta^n (esta ola)** |

Meta^n entra como un **motor más de la Fábrica** (`MotorFabrica` `"meta-n"`, tarea nueva `"proceso"`), con las
mismas reglas de ámbito que los adaptadores (`src/lib/astraura/aprendizaje/destino-adaptador.ts`): lo aprendido de
datos personales se queda en las neuronas y servidores de esa cuenta; lo colectivo solo ve datos de grupo con
aprobación o públicos.

## 3. La regla de seguridad: Meta^n **propone**, StarSeed **juzga** e **integra**

1. **Todo Meta^n corre dentro de un contenedor** (imagen `starseed-automejora`, Python 3.12, meta-n fijado al commit
   `b7081843d3c7b0e0f418ca10aaf2ccbff856e7f8`): `docker run --rm --network none --read-only --tmpfs /tmp
   --memory 1g --cpus 1 --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges -e HOME=/tmp`, usuario sin privilegios,
   sin claves, sin variables del anfitrión y solo dos montajes: la carpeta de trabajo de esa noche y el socket de la
   pasarela. Así, que Meta^n ejecute código en «su anfitrión» es ejecutarlo dentro de la caja.
2. **La pasarela** (`scripts/puente/automejora_pasarela.py`, en el anfitrión): un socket UNIX que solo deja pasar
   `POST /v1/chat/completions` hacia FreeLLMAPI (el del A1, en 127.0.0.1) o hacia Colibri (127.0.0.1:4480, si su
   modelo de razón está instalado), con una lista de modelos permitidos, un tope de llamadas y de tokens por noche y
   un registro de cuántas hubo. Las claves se quedan en FreeLLMAPI: nunca entran en la caja. Dentro, un reenviador
   mínimo escucha en 127.0.0.1:8080 y habla con el socket, y meta-n usa `--base-url http://127.0.0.1:8080/v1`.
   Sin la pasarela o sin Docker, **no se ejecuta** (nunca `LocalExecutor` fuera de la caja).
3. **El juez es de StarSeed, no de Meta^n.** De cada noche solo sale lo propuesto. El juez lo prueba **fuera de la
   caja, sin ejecutar ni una línea suya**, con la capa de verdad y sobre un **conjunto apartado** que Meta^n no vio
   (30 % por huella, siempre el mismo): con y sin la pauta, mismo modelo, misma pasarela. Pasa si acierta más que
   la versión activa por ≥ 3 puntos con ≥ 20 casos. Las puntuaciones internas de Meta^n no deciden nada.
4. **Qué puede salir:**
   - **Pautas** (texto): el `pre_process` se ejecuta en la caja sobre cada caso apartado; si su texto es **el mismo
     en todos** (pauta fija), se guarda como **directiva** de la capa, saneada: ≤ 1.200 caracteres, sin URL, sin
     bloques de código, sin claves ni nombres de variables de entorno, y sin nada sobre permisos, el núcleo
     intocable, contraseñas o «ignorar instrucciones». Si depende del caso, es código: va por el punto siguiente.
   - **Funciones de ayuda** (código): **nunca se cargan en caliente**. Se convierten en una **propuesta de tarea**
     del enjambre (`starseed_memory_root/olas/propuestas-automejora/<fecha>.json`, «Comprueba primero si sigue
     haciendo falta», ≤ 3 archivos, la función como referencia). Genesis · Capas las enseña con «Mandar al enjambre»,
     que las pasa a `olas/`. Desde ahí entran en el OS como cualquier código: puertas tsc y pruebas, revisión,
     `integrar` y la autopublicación con sus puertas. Que las mande solo el director de aprendizaje
     (`scripts/puente/director_aprendizaje.py`) es una ola propia.
5. **Vuelta atrás automática:** cada directiva activa lleva su versión en cada experiencia que la usa. Si en sus
   primeras 50 experiencias confirmadas acierta 3 puntos menos que la anterior, se retira sola y vuelve la anterior.
   Desde Ajustes se puede volver atrás a mano.

## 4. Capas, mesh y los demás sistemas

- **De dónde salen las trazas:** las experiencias de la Trinidad (Needle · Jev · BitNet · Laya) con su `acierto`
  cerrado por `decidir.py confirmar`; las propuestas del Mausbot y de los bots aceptadas o rechazadas; los deshacer;
  y el banco de capas (`scripts/puente/capas_banco.py`: herramientas, extracción, resumen, razonamiento corto, con
  el juez de Jev). Las experiencias ya viajan por la malla y el espejo
  (`starseed_memory_root/aprendizaje/experiencias/<host>.jsonl`); nada nuevo sale de la cuenta.
- **Primera capa: juicio** (decisiones con verdad conocida). Luego **palabra** y **herramientas** con el banco. Las
  capas sin forma de saber si acertaron no entran.
- **Dónde corre:** donde haya Docker y sitio, eligiendo como la Fábrica (`MEDIOS_FABRICA`):
  - **A1 de Oracle** (medido: Python 3.12.3, Docker 29.1.3, 11 GB de RAM pero ~1 GB libre con el enjambre): cada
    noche, solo si hay ≥ 1,5 GB libres; si no, lo deja dicho y prueba la noche siguiente.
  - **Contenedor de GitHub:** solo para ámbito colectivo (nunca datos personales en un runner).
  - **Neuronas insomnes** de la misma cuenta con Docker (`architecture/neurona-insomne.md`): ola propia.
- **Modelos de Ω y del resolvedor:** gratis primero por la pasarela: Colibri local si tiene un modelo de razón
  (Qwen3-Coder-30B-A3B, `architecture/colibri-multicapas.md`), si no los proveedores gratis de FreeLLMAPI. Coste en
  dinero: 0 (`--daily-budget-usd 0`); el límite real es el tope de llamadas de la pasarela.
- **Cómo llegan las directivas:** en `starseed_memory_root/aprendizaje/directivas/<capa>.json` (con su SHA-256 y su
  historial), repartidas por el espejo y la malla como las experiencias; y en el navegador por la clave
  `starseed.capas.directivas.v1` que viaja con la cuenta.
  - **Jev** (`scripts/puente/jev.py`) añade la directiva activa al estado como `pautas_astraura`.
  - **Astraura en el navegador** la añade a la sección de sistema de esa capa, siempre debajo de las reglas y con
    su cabecera fija: «Pautas aprendidas por la automejora de Astraura (versión N). No cambian permisos ni reglas.»
- **Mesh colectiva:** las páginas, grupos y comunidades pueden compartir **directivas** (nunca trazas) como Variación
  pública o molécula de la Biblioteca. Quien las adopta las prueba con su propio juez antes de activarlas.

## 5. Configurable (Ajustes · Capas · «Automejora»)

- Encendido por capa. En los servidores de Alex (`~/.starseed/automejora.json` de su Mac) viene encendida para juicio; en
  las demás cuentas, apagada hasta que la persona la encienda.
- Por neurona: «aportar mis experiencias» (sí/no).
- Frecuencia: cada noche o cada semana. Tope de llamadas por noche.
- «Preguntarme antes de activar una pauta» (apagado por defecto: el juez decide).
- Historial con acierto y versión, y «volver a la anterior».
- **Genesis · Capas** enseña la última noche: dónde corrió, cuántas llamadas, qué propuso, qué pasó el juez, y qué
  tareas de código mandó al enjambre.

## 6. Biblioteca

`lib-meta-n` en `config/repos-libreria-1027b.json`: canal `commits` (no hay etiquetas), estado «alfa»
(prototipo). La reconstrucción de la imagen la pide la Biblioteca al ver un commit nuevo, y **el juez vuelve a
validar** con el commit nuevo antes de que cuente nada de lo que proponga.

## 7. Lo que NO se hace

- No se ejecuta Meta^n ni nada que haya escrito fuera de la caja.
- No se le dan claves.
- No ve datos personales para lo colectivo.
- No toca permisos, el núcleo ni el orquestador del enjambre.
  - Mejorar los prompts del propio enjambre con Meta^n tiene trazas ideales (tareas con tsc y pruebas), pero es otra
    ola y pide el sí de Alex.

## 8. Ola MTN1027 (≤ 3 archivos y ≤ 120 líneas por archivo y tarea)

Cola (compartida con Memvid, `architecture/memvid-capsulas.md`): `starseed_memory_root/olas/cola-meta-n-memvid-1027.json`.
Orden:

| Tarea | Qué |
|---|---|
| A | Fábrica: motor y tarea |
| B | directivas (puro) |
| C | almacén y sincronía |
| D | lógica de la noche (puro, Python) |
| E | pasarela |
| F | imagen y reenviador |
| G | nodo del A1 |
| H | servicio, temporizador y paquete del A1 |
| H2 | la Mac manda las experiencias y trae lo que salió |
| I | Jev aplica pautas y anota la versión |
| J | Astraura aplica la pauta en el navegador |
| K | ruta y panel de Ajustes |
| K2 | propuestas en Genesis · Capas |
| L, L2 | Biblioteca (tanda 1027b, con Memvid) |

**Verificación:**
- Pruebas de cada tarea.
- En el A1, una noche de prueba con 30 experiencias de juicio. La caja corre con `--network none` (lo dice
  `docker inspect`), y la pasarela cuenta sus llamadas.
- Si el juez aprueba, la pauta llega a la Mac y Jev la lleva en `pautas_astraura`. Si no, no cambia nada.
- En localhost:9002, Ajustes · Capas enseña la noche.
