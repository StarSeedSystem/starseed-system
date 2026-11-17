# El bot del chat de producción vuelve a dirigir bien con MetaGenesis (ola PET1116)

## 1. Pedido de Maggasukha (2026-11-16, 19:17 México)

> De nuevo falló con lo que le solicité en el chat. No se ha autorreparado, ni está siendo dirigido correctamente a
> través de MetaGenesis con las herramientas y capacidades activas.

## 2. Qué pasó (A1, 2026-11-17, de 00:14 a 01:15 UTC)

**00:14 · lo que pidió:** analizar el vídeo https://youtu.be/kM7lnhS_uE8 («Something strange is happening to the
internet right now», Nick Saraev) y los demás vídeos del canal, transcribirlos, investigar sus métodos de contacto y
redactar un mensaje que ofrezca StarSeed OS. El formato de investigación debe guardarse para las próximas síntesis
y quedar en MetaGenesis.

**Lo que hizo el bot:** el plan salió por reglas («modelo no dio JSON»):
`{"tipo":"notebooklm","fuente":"ultima_sintesis","artefactos":[{"tipo":"video"}]}`. Generó **un vídeo de la última
síntesis** e ignoró el enlace. Ese vídeo arrastró un tema ajeno, la «lección del rallador» de una cocina comunitaria
de El Sinaí.
- El tema vino de una de las 109 fuentes que importó la investigación profunda (`--import-all`) en el cuaderno de la
  síntesis del 16.

**00:31 · lo que pidió:** «Descarta lo del tema del rallador de carne humana…».

**Lo que hizo el bot:** quedó **fallida** tras 3 intentos con «los modelos gratuitos no respondieron».
- `llm()` (`peticiones_telegram.py:350`) solo recorre la lista fija
  `MODELOS = ["gemini-flash", "qwen3.8-max", "gemini-3.5-flash", "glm-5.3-flash", "qwen3.6-plus"]` de FreeLLMAPI.
- Ese día gemini tenía la cuota agotada (unas 7 h) y qwen3.x estaba «not found or removed upstream» (catálogo
  caducado).
- NIM respondía (el sanador lo marcaba vivo), pero el bot no lo usa.

**Causas:**
- El despachador del repo perdió el tipo «encargo» y la planificación por frentes de la herramienta provisional.
  `INSTRUCCION` solo conoce «notebooklm» y «respuesta».
- `por_reglas` toma «video» como «haz un vídeo de NotebookLM» aunque haya un enlace que analizar.
- Nada convierte una petición fallida en reparación: ni los directores ni el sanador miran la cola del bot.

**Puntual (Claude, 01:20 UTC):** `~/.starseed/peticiones/alcance_canal.py` en el A1.
- Quita del cuaderno del 16 las fuentes del «rallador», guarda la regla en `preferencias.json` y reenvía la tabla
  y las tarjetas sin ese tema.
- Encargo `ALC-NICK-1116`:
  - un cuaderno con el vídeo de YouTube como fuente (con su transcripción) y la investigación profunda del canal;
  - un informe de análisis, la ficha de contacto y dos variantes de mensaje **PENDIENTES DE APROBACIÓN**;
  - el **«Método de investigación de un canal para alcance»** como plantilla para MetaGenesis.

## 3. Diseño

### 3.1 Enrutador de modelos que no se cae (PET1116A)

- **Catálogo vivo:** `GET /v1/models` de FreeLLMAPI cada 30 min. No se pide un modelo que no esté.
- **Rutas, en orden:**
  1. FreeLLMAPI, con los modelos vivos y con nombre (nunca «auto» ni Claude);
  2. NIM directo (`minimax-m3.1-flash` y `nemotron-3.5-lightning`, con max_tokens alto);
  3. OpenRouter `:free`;
  4. Hermes, la pasarela de la Mac, si está viva.
- **Memoria de salud compartida con el sanador** (`salud/estado.json`): espera tras un fallo, último éxito primero
  y nunca dos veces seguidas un modelo con cuota agotada.
- **Una petición nunca queda «fallida» por los modelos.** Con NIM vivo se responde. Si no hay ninguno:
  - interpretación por reglas;
  - mensaje «recibido; sin modelos ahora, reintento a las HH:MM por <ruta>»;
  - escalado al director.

### 3.2 Despacho con todas las capacidades de MetaGenesis (PET1116B)

- **Tipos de petición:**
  - **«encargo»:** trabajo de varios pasos con planificación por frentes, la productora, Drive, panel y avances. Es lo
    que ya hacía la herramienta provisional; se porta lo que falte de `peticiones_productor` y `peticiones_encargos`;
  - **«alcance»:** un creador, canal o vídeo para analizar y contactar;
  - **«descartar»:** un tema o fuente que hay que quitar;
  - **«notebooklm»:** un formato concreto de una fuente concreta;
  - **«respuesta»**.
- **Una URL en el mensaje es una FUENTE que se usa**, nunca se ignora:
  - YouTube va como fuente de NotebookLM, con su transcripción;
  - Drive va con `add-drive`;
  - una web va con `add`.
- **«video» solo significa «haz un vídeo»** si se pide producir uno. «Analiza el vídeo» es análisis.
- **Registro de capacidades activas** (`capacidades.json`), generado del repo y del sanador:
  - NotebookLM (cuadernos, investigación profunda, 9 formatos);
  - Drive y Docs;
  - el YouTube de NotebookLM;
  - Higgsfield (solo proponer);
  - los agentes de alcance (ALC1113);
  - Blender y HyperFrames en la Mac;
  - las olas del enjambre (para código);
  - el Mando.

  El planificador recibe ese registro y elige con él; lo caído no se ofrece.
- **Alcance:** la plantilla de `ALC-NICK-1116` se convierte en el procedimiento estándar.
  - Investigación: el vídeo y otros vídeos del canal, investigación profunda, Codex y red de resonancia.
  - Entregables: informe, ficha y mensaje **pendiente de aprobación**.
  - Va en `starseed_memory_root/alcance/metodos/canal-youtube.md` y la usan los agentes de alcance y de la síntesis.
- **Descartar:** quita las fuentes que lo contienen (`source search`) de los cuadernos afectados, guarda la regla y
  rehace los formatos afectados.

### 3.3 Autorreparación dirigida (PET1116C)

- **Cuando una petición falla** (fallida, o dos fallos seguidos): `salud_directores` abre en el acto
  `cola-auto-salud` con la traza saneada y el texto de la petición, y el bot dice en el chat qué pasa y cuándo
  reintenta. No se queda en silencio.
- **La investigación profunda importa con criterio:**
  - solo las fuentes citadas y relevantes al tema (título y guía frente al tema y a StarSeed), con un máximo de 25;
  - limpieza (`source clean`);
  - lo descartado nunca vuelve a entrar.
- **Pruebas con los textos reales** del 2026-11-17 00:14 y 00:31.

### 3.4 Prioridad

Las tareas PET1116 llevan `adelantar` («orden de Maggasukha») y van delante de todo, igual que SIN1116A–C.

## 4. Cola PET1116

La cola está en `starseed_memory_root/olas/cola-pet1116.json`.
