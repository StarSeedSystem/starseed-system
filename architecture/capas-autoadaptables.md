# Capas autoadaptables de Astraura (contrato · 2026-10-07)

> Alex (2026-10-07): «mejora las integraciones autoadaptables de las capas de la IA de Astraura de
> todo StarSeed, los modelos Bonsai 1.58 bits, BitNet y Cactus Needle 3 o superiores en sus últimas
> versiones siempre actualizadas, autoadaptando la capacidad de cargar las capas de modelos más
> óptimas y eficientes para cada tarea, incluyendo los procesos en 2.º plano y todos los agentes y
> conciencias colectivas … para cada medio de cada dispositivo. En apps descargadas debería poder
> almacenar y cargar más capas que si se visita desde un sitio web … desde cualquier medio las capas
> se sincronicen y se descarguen en línea aun sin la app instalada … usando la misma red mesh P2P
> con Reticulum y Meshtastic … Jev y toda la librería … para cada perfil, cuenta, página, grupo,
> comunidad y contexto, con autoaprendizaje y mejoramiento colectivo continuo usando los servidores
> de StarSeed OS y los privados y propios».

Fuente de verdad para todo lo que toque modelos locales, capas y su reparto. Lo que no esté aquí no
se inventa. Construye sobre lo que ya existe (§2); no lo duplica.

## 1. Los modelos de hoy (comprobado el 2026-10-07)

| Familia | Modelos vigentes | Tamaño de pesos | Formatos | Dónde corre |
|---|---|---|---|---|
| **Cactus Needle 3** (`Cactus-Compute/needle3`) | 121 M parámetros, **profundidad variable de 2 a 20 capas** | 8–29 MB (CQ2, ~2,1 bits) | `.cact` | Navegador (`needle.js` + `needle.wasm`), WASI, macOS, Linux, Windows, Android, iOS. Llamada a herramientas, extracción, clasificación y embeddings. En la Mac: paquete 3.1.2, pesos del 2026-10-05. No hay Needle 4 todavía. |
| **Ternary Bonsai** (PrismML, 1,58 bits) | 1,7 B · 4 B · 8 B · 27 B · **Ternary Bonsai 2 27B** (2026-09-25) | 0,37 · 0,86 · 1,75 · 7,15 · 5,93 GB | GGUF, MLX y ONNX (`onnx-community/Ternary-Bonsai-{1.7B,4B,8B}-ONNX`, WebGPU) | llama.cpp/MLX en escritorio y servidor; WebGPU en el navegador; iOS con MLX |
| **Bonsai 1-bit** (PrismML) | 1,7 B · 4 B · 8 B · 27 B | 0,25 · 0,57 · 1,16 · 3,9 GB | GGUF, MLX y ONNX (`onnx-community/Bonsai-*-ONNX`) | igual |
| **BitNet** (Microsoft) | b1.58-2B-4T · **BitNet-embedding-270M y 0.6B** (2026-07-20) · VibeASR.cpp (voz, 2026-07-23) | ~1,1 GB (i2_s) | GGUF i2_s | CPU x86 y ARM (bitnet.cpp), núcleo GPU oficial. Sin navegador ni móvil oficial. |

Bonsai Image 4B (MLX/gemlite) existe, pero solo en Mac y servidor, y es opcional.

## 2. Lo que ya existe y se reutiliza

- **Interruptores de capas** (`capas-conciencia.ts`, `capas-entidad.ts`): local / mesh / nube /
  colectiva, más el nivelador; con sobrescritura por personalidad y agente. **Hoy son interruptores
  de fuente, no de modelo**: este contrato los convierte en el «dónde», y añade el «qué capa».
- **Medición del equipo:** `perfil-hardware.ts` (`medirPerfil`, `dondeRazona`) y `neurons.ts`
  (`detectCapabilities`).
- **Router por tarea:** `src/ai/astraura/router.ts` (`classifyTask`, `estimateDifficulty`,
  `rankCandidates`). Cálculo de memoria y velocidad en `model-fit.ts`.
- **Decisión:** `decision-hibrida.ts` (Needle → Laya → Jev → LLM) y `needle3-client.ts`.
- **Malla:** `webrtc-mesh.ts`, `archivos-malla.ts` (trozos con SHA-256 y reanudación),
  `meshtastic-adapter.ts`, `synaptic-router.ts`, `conciencia-colectiva.ts`, y el servidor de malla
  propio (`docs/examples/starseed-mesh-server`).
- **Integración Bonsai** (`src/ai/astraura/integrations/bonsai.ts`), manifiesto viejo
  `config/astraura-models.json` y los servicios `com.starseed.bitnet.renovar`, `needle.renovar` y
  `needle.aprendizaje` del repo de Astraura.

**Huecos que este contrato cierra:**

1. `needle-wasm.ts` es un stub.
2. `CapacidadesNodo` se fabrica en el panel y `publicarCapacidades` no se llama.
3. `/api/bitnet/candidatos` no existe.
4. No hay catálogo de capas por tarea y medio.
5. No se distribuyen modelos por P2P.
6. No hay diferencia entre web y app instalada.
7. No hay contexto por página o comunidad.
8. El aprendizaje no está cableado en el cliente.

## 3. Las capas (papeles, no modelos)

Cada capa es un papel. El catálogo dice qué modelo lo cumple en cada medio, de mejor a más ligero.

| Capa | Para qué | Candidatos (mejor → más ligero) |
|---|---|---|
| **reflejo** | Siempre encendida, también en 2.º plano: llamar herramientas, clasificar, enrutar, decidir el siguiente paso, extraer datos | Needle 3 con 20 capas → 12 → 6 → 2 |
| **memoria** | Embeddings para recuerdos, búsqueda y RAG | BitNet-embedding-0.6B → 270M → embeddings de Needle 3 |
| **palabra** | Conversación corta, resúmenes, respuestas del día a día | Ternary Bonsai 4B → Ternary 1.7B → Bonsai 1-bit 1.7B |
| **razón** | Razonamiento, código y planes de varios pasos | Ternary Bonsai 8B → BitNet b1.58 2B4T → Ternary 4B |
| **profunda** | Lo más difícil, visión y contexto largo | Ternary Bonsai 2 27B → Bonsai 27B 1-bit → Ternary 8B |
| **voz** | Dictado y transcripción | VibeASR.cpp (nativo y servidor) → API del navegador |
| **adaptador** | Lo aprendido por un ámbito (§8) | Adaptador de Needle por ámbito; LoRA de Bonsai |

## 4. El medio decide cuánto se guarda

`perfil-medio.ts` amplía `perfil-hardware.ts` con:

- WebGPU y sus límites;
- WASM con SIMD e hilos (`crossOriginIsolated`);
- `navigator.storage.estimate()` y `persist()`;
- plataforma (web, PWA, Tauri, Android, iOS, servidor);
- batería, `saveData` y tipo de conexión;
- si la pestaña está visible.

Con eso da un **presupuesto** de disco y memoria. Valores por defecto, editables en Ajustes:

| Medio | Guarda | Carga bajo demanda |
|---|---|---|
| Web, visita | Reflejo con Needle de 2 a 6 capas (≤ 12 MB, caché del navegador) | Palabra 1,7B por WebGPU solo si hay ≥ 4 GB y la persona acepta. Lo demás va a pares o servidores. |
| PWA instalada | Reflejo completo, memoria 270M y palabra 1,7B (≤ 1 GB, almacenamiento persistente) | Razón y profunda en pares o servidores |
| App nativa (Tauri, Android, iOS) | Hasta el 15 % del disco libre (tope de 8 GB): reflejo completo, memoria, palabra 4B y razón si caben | Profunda en el servidor |
| Servidor (Oracle, propios) | Todo lo que quepa en RAM | — |

En 2.º plano (pestaña oculta, batería < 20 %, `saveData`) solo corre el reflejo. Lo demás va a un
dispositivo propio o a un servidor.

## 5. El planificador por tarea

`planificador-capas.ts` es puro: misma entrada, misma salida.

**Entrada:**

- la tarea (`classifyTask` y `estimateDifficulty`);
- la latencia deseada;
- la privacidad (privada, del ámbito o pública);
- si es de 2.º plano;
- el ámbito;
- el perfil del medio y las capas instaladas;
- los nodos disponibles (§7): pares de la cuenta, servidores StarSeed, servidores propios y APIs gratuitas del router;
- las preferencias de capas (local, mesh, nube, colectiva y el nivelador).

**Salida:** un plan con capa, modelo, profundidad de Needle y dónde corre, más una cadena de
respaldo de hasta 4 pasos y el motivo en una línea.

**Reglas que no se saltan:**

- Lo **privado nunca** sale a un servidor público ni a una API externa. Solo va a dispositivos de la misma cuenta o a servidores propios de la persona.
- **Sin conexión**, solo lo local.
- Una capa **apagada** por la persona o por su ámbito no se usa.
- El **reflejo** decide primero: si Needle resuelve la tarea con confianza ≥ 0,6 (`decision-hibrida`), no se despierta un modelo mayor.

## 6. Almacén y distribución de capas

- **Almacén** (`almacen-capas.ts`):
  - OPFS en navegador, PWA y Tauri; Cache API como respaldo.
  - Verificación SHA-256 por trozo y del archivo entero.
  - Expulsa la capa menos usada (LRU) según el presupuesto. «Fijar» una capa la protege.
  - Descargas reanudables.
- **Fuentes, en orden:**
  1. un dispositivo propio (WebRTC);
  2. un par de la malla que anuncie el mismo SHA;
  3. el espejo StarSeed en Oracle (`capas.<host>`);
  4. un servidor propio;
  5. la fuente oficial (Hugging Face).

  **Una capa solo se usa si su SHA está en el catálogo firmado**, venga de donde venga.
- **Por P2P:** `archivos-malla.ts` pasa a trozos binarios (ArrayBuffer, no base64) y a peticiones
  por contenido («¿quién tiene `sha`?»). Se comparte solo entre dispositivos de la misma cuenta y,
  si la persona lo permite, con pares públicos (solo capas oficiales).
- **Meshtastic (LoRa):** unos cientos de bytes por paquete. **Nunca lleva pesos.** Lleva anuncios
  (`capa@versión#sha8`, ≤ 200 B) y preguntas y respuestas cortas del reflejo.
- **Reticulum:** lleva enlaces y recursos troceados. Por TCP o WebSocket mueve capas; por LoRa,
  solo anuncios. Existe `@reticulum/core` 0.9.7 (JavaScript, apto para navegador, licencia
  EUPL-1.2). **Añadirlo es decisión de Alex** (dependencia y licencia nuevas). Hasta entonces,
  Reticulum llega por el puente del servidor (`scripts/red/camr_agente.py`).

## 7. Anuncio de capacidades (lo que hoy se fabrica)

Cada dispositivo y servidor publica su ficha:

- capas instaladas (`id@versión`);
- tok/s medidos por capa;
- RAM libre y batería;
- si está en 2.º plano;
- qué ámbitos sirve (propio, cuenta o público).

**Por dónde viaja la ficha:**

- a los pares: por la malla, cada 20 min o al cambiar;
- a la malla general: por el servidor de malla;
- por Meshtastic: comprimida a ≤ 200 B.

**Nunca va a Supabase en cada latido**: el presupuesto de Supabase manda.

`/api/astraura/nodos` sustituye a la inexistente `/api/bitnet/candidatos` y da los candidatos para
una tarea, ya filtrados por privacidad.

## 8. Contexto por ámbito y aprendizaje colectivo

**Ámbitos:** perfil, cuenta, página, grupo, comunidad y cualquier entidad de los 9 tipos.

`capas-ambito.ts` guarda para cada ámbito:

- qué capas y modelos prefiere;
- su colección de memoria;
- su adaptador;
- si aprende y con quién comparte.

**Precedencia:** agente > personalidad > ámbito > cuenta, como hoy.

En grupos y comunidades lo deciden sus administradores. Si el grupo es democrático, pasa por
votación, salvo apagar el aprendizaje, que cualquiera puede hacer para sí.

**Aprender:**

- **Qué se recoge:** valoraciones (👍/👎), correcciones y si una herramienta acertó. Va a las
  experiencias locales (IDB).
- **Cuándo se sube:** solo con `aprendizaje_colectivo` encendido y el ámbito de acuerdo.
- **Adónde:** al corpus del ámbito en su servidor. El de StarSeed es Oracle; uno propio, si el
  ámbito lo tiene.
- **Lo privado nunca sale** del dispositivo ni de los servidores propios.

**Mejorar:**

- **Cada noche**, en el servidor del ámbito, se afina un **adaptador de Needle 3**. Es pequeño y
  viable en CPU. Amplía el ciclo que ya existe (`com.starseed.needle.aprendizaje`, adaptador
  colectivo con lo acertado, `memory/trinidad-razonamiento-astraura.md`) a un adaptador por ámbito.
- **Cada semana**, si se quiere, LoRA de Bonsai en una GPU gratuita.
- Un adaptador **solo se promueve** si gana en el banco de pruebas del ámbito y Jev no lo frena.
  Entonces entra al catálogo como capa `adaptador` con su SHA y viaja como cualquier capa.
- **Federación:** entre servidores viajan adaptadores y métricas, nunca turnos crudos de otro
  ámbito.

## 9. Siempre al día

`scripts/puente/capas_renovar.py` (diario, en la Mac y en Oracle) mira las familias oficiales en
la API de Hugging Face:

- `Cactus-Compute/needle*`, para detectar Needle 4;
- `prism-ml/*`;
- `microsoft/BitNet*`;
- `onnx-community/*Bonsai*`.

**Cuando sale algo nuevo:**

1. lo descarga al espejo de Oracle;
2. calcula el SHA;
3. corre el banco (`capas_banco.py`: latencia, tok/s y calidad sobre un juego fijo, con Jev de juez);
4. **solo si gana o empata** con menos coste, lo pone en el catálogo como `recomendado`.

El anterior se queda como `respaldo` 14 días. Los dispositivos se actualizan solos dentro de su
presupuesto, y sin datos móviles si `saveData`. Nada se sustituye sin pasar el banco.

## 10. Genesis

**Pestaña «Capas»** (grupo Infraestructura):

- el catálogo con versiones y estado (recomendado, respaldo o nuevo en banco);
- qué dispositivos y servidores tienen cada capa;
- el estado de los espejos;
- los resultados del banco;
- los ciclos de aprendizaje por ámbito;
- botones «Comprobar versiones» y «Correr banco».

`/api/mando/capas` está detrás del mismo guardián de Genesis.

## 11. Lo que NUNCA

- Usar una capa cuyo SHA no esté en el catálogo.
- Pesos por LoRa.
- Datos privados a servidores públicos o APIs externas.
- Descargar más de 50 MB sin el presupuesto del medio o sin `persist()` aceptado.
- Despertar un modelo grande en 2.º plano con batería baja.
- Prometer reentrenar BitNet o Bonsai en CPU.
- Dependencias nuevas sin la palabra de Alex, salvo los motores oficiales que se cargan desde su
  fuente (Needle WASM, transformers.js desde CDN, como hoy).
