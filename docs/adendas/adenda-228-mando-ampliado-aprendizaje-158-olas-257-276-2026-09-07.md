# Adenda 228 · Mando ampliado, aprendizaje continuo 1.58 y claves por medio

> **Fecha:** 2026-09-07 · **Olas:** 257–276 (Mando ampliado · aprendizaje continuo 1.58 · claves por medio · Oficina 3D · almacenamiento/Drive · commits pendientes · voces · Forja fase 4 · verificación) · **Área:** mando, aprendizaje, orquestación, voz, astraura.
> Adenda de relevo del día: lo verificado en vivo en la Mac de Alex (8 GB) el 2026-09-07 y el punto de relevo para la siguiente sesión/agente. Todo el código lo escribió el **enjambre económico** (escritores NIM kimi-k3/deepseek-v4 y xKiro; revisores kimi-k3/llm7) y **Claude supervisó en el Mando, verificó cada endpoint en la Mac y aprobó**. Reglas del área: las rutas `/api/mando/*` son SOLO locales (404 en producción); la **publicación** sale solo de la Mac con la palabra `PUBLICAR`, nunca automática; la sonda por minuto es la **ligera `GET /models`**, jamás generación; el enjambre escribe tareas de **≤ 3 archivos y ≤ 120 líneas por archivo** y se verifica cada despliegue en la Mac.

---

## 1. Resumen

Esta tanda de olas convirtió el Mando en la **sala de control honesta y ampliada** de toda la orquestación y del sistema de inteligencia 1.58. Por un lado se cerró el **aprendizaje continuo de Astraura** (planificador con cinco agentes, Curador atómico, BitNet que nunca despierta de fondo, ramificación 1.58 y pestaña «Aprendizaje»). Por otro se añadieron cuatro superficies nuevas al Mando — **Oficina 3D**, **Almacenamiento/Drive**, **Commits pendientes** y **Voces** — más una capa de **claves por medio** que deja de mentir sobre el cupo de los proveedores, y se dio por cerrada la **Forja fase 4** (clonado de voz) con la **verificación por endpoint** en la Mac.

El hilo conductor de toda la sesión fue **dejar de adivinar**: cada característica se comprobó contra la neurona real, y esa verificación destapó **nueve defectos que ningún revisor vio** (detalle en «Lecciones del proceso»). Al final, el orquestador quedó con tareas pequeñas y verificables, la publicación bajo palabra escrita y el Mando capaz de mostrar con exactitud qué proveedores tienen claves, qué commits quedan por publicar y cuánto espacio queda en disco.

### Olas previas en contexto (257–269)

La base de esta sesión ya estaba integrada: orquestador **versionado** en `scripts/enjambre/`, **puerta de alcance**, revisores con memoria, visto bueno humano por bloqueo/alcance, **escritura por trozos** y `tsc-turno`, la **Forja 1.58 fases 1–3** (perfil neuronal, pitch/seed, emociones, normalización en español, efectos ffmpeg, presets y tomas) y el **Mando al día** (alcance/revisor/motivo/bloqueadas, tarjeta «Última verificación», salud de revisores). Detalle en la adenda anterior y en `claude/plan-olas-258-265`. Las olas nuevas de este relevo se narran abajo.

## 2. Ola 270 · Aprendizaje continuo 1.58 (AP4, AP5, AP6, AP7A, M7, M8, M7B)

**Qué se pidió:** implementar la capa de **aprendizaje continuo** de Astraura 1.58 en el OS (repo `astraura` + OS), con un planificador de agentes de curación/evaluación/crónica y su reflejo en el Mando (árbol de procesos y pestaña de aprendizaje).

**Qué se integró:**

- **AP4 — planificador asíncrono** con **cinco agentes**: **Curador (30 min)**, **Evaluador (60 min)** y **Cronista (60 min)** quedan **operativos**; **Entrenador** y **Desplegador** quedan «esperando fábrica». Endpoints: **`/api/aprendizaje/agentes`** y **`/api/aprendizaje/procesos`**. Acciones de **pausar / reanudar / ejecutar**. Garantía explícita: **nunca despierta el BitNet**.
- **AP5 — Curador atómico**: `leer_mes` / `reescribir_mes` bajo **cerrojo**, con respaldo `.bak` y **temporal + `os.replace`**, y solo reescribe cuando hay duplicados. **Rotación** de `logs.md`/`cronica.md` a **2 MB**.
- **AP6 — el fondo no cae a Ollama** con el BitNet dormido o cedido: se marca `meta.omitido` como «turno de memoria»; Ollama de fondo **solo** actúa con `ASTRAURA_OLLAMA_RESPALDO=1`.
- **AP7A — supervisor honesto**: un **servidor adoptado cuenta como vivo**, y `ensure_server(marcar=False)` **no anula** el estado «dormir».
- **M7 — «Ramificación 1.58»** en Procesos del Mando: árbol **BitNet → personalidades → agentes → procesos de fondo**, con acciones.
- **M8 — pestaña «Aprendizaje»**: corpus, curación, evaluaciones, crónica, fábrica y acciones **valorar / exportar**.
- **M7B** — procesos con envoltorio **`{procesos:[…]}`**, personalidades del corpus (`astraura_prime`, `cognition`) y **corpus por HTTP**.

**Verificado en la Mac:** 5 agentes activos; corpus con **1486 turnos de `cognition`** + 1 de `astraura_prime` (**3,8 MB**); evaluaciones con puntuación **30** y **latencia 95–184 s**.

**Pendiente:** reducir la latencia de evaluación.

## 3. Ola 271 · Claves por medio (P9, P9B–P9E, M9, M9B)

**Qué se pidió:** que la orquestación **dejara de mentir sobre el cupo**: saber de verdad qué claves hay en la neurona, cuál está activa, cuándo se agota una y presentar la flota de proveedores con honestidad.

**Qué se integró:**

- **P9 — capa de claves**: `CLAVES_POR_PROVEEDOR`, `claves_de`, `clave_activa`, `agotar_clave`, `estado_claves`, con **sufijos `_2`…`_9`** para varias claves por proveedor y **huellas sha256**; solo se manejan huellas, **nunca valores**.
- **P9B — cableado** en `llamar_llm`, en las **sondas** y en el **lanzador de opencode**.
- **P9C — sin respuesta vacía** al agotar la única clave, con puerta pytest.
- **P9D — 429 → 1 h, 402/cuota → 24 h**, aviso único; introducción de la **sonda ligera `GET /models`**: la sonda de generación quemaba el cupo diario de OpenRouter/aihubmix y **tres 429 de sonda dejaban xKiro 24 h fuera**.
- **P9E — puerta pytest** que mira el **árbol de trabajo** (no solo el resultado de la prueba).
- **M9 — Flota del Mando**: proveedores **agotados → disponibles**, catálogo de **15 proveedores** con enlaces (panel de claves, API, docs) y la sección **«Por conseguir (solo Alex crea cuentas)»**.
- **M9B — clasificación honesta** con las claves realmente presentes en la neurona (`clavesPresentes`, huellas), «dato antiguo» y la **foto del bus**; **un solo contador «agotados»** compartido entre cabecera y panel.

**Verificado:** el «Por conseguir» ya no muestra proveedores con claves presentes; el contador «agotados» es único.

## 4. Ola 272 · Oficina 3D del Mando (O1, O2/O3A/O3B)

**Qué se pidió:** una **Oficina 3D** en el Mando que visualice los seres de la orquestación con genética determinista y evolución.

**Qué se integró:**

- **O1 — modelo puro `src/lib/mando/oficina.ts`**: **seres** por escritor / revisor / agente 1.58 / personalidad / proceso / BitNet, con **ADN determinista** `derivarAdn`; **7 salas** (enjambre, revisión, aprendizaje, personalidades, fondo, núcleo, espera); **xp/nivel/rasgos**; `fusionarGenoma` que **nunca baja**; `predeterminadoDe`.
- **Servidor `/api/mando/oficina`** con genomas persistidos en `starseed_memory_root/mando/oficina/genomas.json` y acción **`exportar-predeterminado`**.
- **O2/O3A/O3B — pestaña «Oficina 3D»** reutilizando **`OficinaSeres`** de génesis: **ficha del ser** (datos vivos, genoma, **Pausar/Ejecutar, Ir a la tarea, Oír, Exportar**) y tabla **«Evolución»**.

**Verificado en la Mac:** 7 salas y **28 seres**.

## 5. Ola 273 · Almacenamiento y Drive (A1, A2, A3)

**Qué se pidió:** que el Mando mostrara y gestionara el **almacenamiento** de la neurona con honestidad y un espejo a Google Drive.

**Qué se integró:**

- **A1 — `/api/mando/almacenamiento`**: `df`, **regenerables con lista blanca**, **DriveFS detectado**, espejo `rsync` **sin `--delete`** a `My Drive/StarSeed_Memory_Root/neurona-<host>`, **swap explicado con honestidad** y acción **aliviar**.
- **A2 — tarjetas «Almacenamiento», «Google Drive» y «Swap»** honestas, más **«Disco libre» en la cabecera**.
- **A3 — `POST /ceder`** del demonio de voz: dormir con **20 s** y confirmación por estado; **logs de olas** en la lista blanca de regenerables.

**Verificado en la Mac:** espejo real de **2,1 MB en Drive**; «aliviar» OK.

## 6. Ola 274 · Commits pendientes (C1, C2, C3)

**Qué se pidió:** que el Mando mostrara los **commits sin publicar** del OS y de Astraura y permitiera **publicar solo con confirmación escrita**.

**Qué se integró:**

- **C1 — `/api/mando/publicaciones`**: commits sin publicar del OS y de Astraura **por ola con diffstat**, **base remota**, **delante/detrás**, remoto movido por `ls-remote`, **árbol limpio** y si el **enjambre está escribiendo**. **Publicar** producción / vista previa **`vista-previa/mando`** / paquete **SOLO con `STARSEED_LOCAL=1` y la confirmación escrita `PUBLICAR`**; trabajo con **progreso**, **bitácora** y evento **`publicado`**.
- **C2 — pestaña «Commits pendientes»** + diálogo de confirmación con **lista de comprobación**.
- **C3 — paquete con ref**: `<desde>..<rama>` o **`refs/publicar/<id>`**, con **`enlaces.paquete`**.

**Verificado en la Mac:** **122 commits del OS** delante de `2755cd2`; **rechazo sin `PUBLICAR`** confirmado.

## 7. Ola 275 · Voces en el Mando (V1–V5B)

**Qué se pidió:** llevar las **voces** al Mando: anuncios hablados, voces por agente y un panel de estudio completo.

**Qué se integró:**

- **V1 — `voz-mando.ts`**: anuncios hablados **por prioridad y silencio**, **voces por agente** y la orden **«Léeme el estado»**.
- **V2 — `/api/mando/voces`** + **`voz-del-mando.tsx`** (provider, hook, control de cabecera, tarjeta).
- **V3 — `panel-voces.tsx`**: Demonio de voz, **Forja 1.58 al 67 %**, Voz del Mando, **Voces por agente con Oír** y el Estudio de Voces completo.
- **V4 — pestaña «Voces»** y soporte de **`?pestana=`**.
- **V5A — el catálogo `TIMBRES` pasa a `timbres-catalogo.ts` sin `"use client"`**: el build de producción había fallado por importar un módulo cliente desde una ruta de servidor.
- **V5B — test que lo impide**, con **tres rutas heredadas** en lista de deuda.

## 8. Ola 266 · Forja fase 4 (I1A, I1A2, I1B, I1C, K1)

**Qué se pidió:** cerrar la **Forja 1.58 fase 4**: clonado de voz con consentimiento y revisión de la vulnerabilidad de path traversal.

**Qué se integró:**

- **I1A — demonio `POST /clonar`**: `multipart`, **consentimiento obligatorio**, **WAV 24 kHz mono de 3–20 s**, `.rvq` opcional; **`GET /clones`**, **`DELETE`** y **`clon:true` en `/tts`** por CLI cediendo el pool.
- **I1A2 — cierre de la revisión bloqueante** (path traversal por `personality`): **`CLON_TIMBRE_RE`**, `rutaRef` y `.rvq` temporal + `rename`.
- **I1B — proxy y `clonacion.ts`**.
- **I1C — subpestaña «Clonar»**.
- **K1 — manifiesto y SOP §10**.

## 9. Ola 260 · Verificación de la neurona (Q1c, Q1d, Q1E)

**Qué se pidió:** un **comprobador de la neurona** que mida el estado del OS y de la neurona y compare contra la corrida anterior.

**Qué se integró:**

- **Q1c/Q1d — `scripts/verificar-neurona.mjs`**: checks HTTP del OS y de la neurona, **umbrales**, comparación con la corrida anterior, banderas **`--voz` / `--oido` / `--bitnet`**, y escribe `starseed_memory_root/verificaciones/ultimo.json`.
- **Q1E** — medidas ausentes marcadas **«omitido»** y soporte de **`--help`**.

**Verificado en la Mac:** primera corrida real: **92/100**.

## 10. Ola 276 · Ajustes finales (M10, P5b)

**Qué se pidió:** pulir la cabecera y cerrar los tests/documentación de P5.

**Qué se integró:**

- **M10** — cabecera **sin el contador duplicado** de «agotados».
- **P5b** — tests y README de P5.

## 11. Lecciones del proceso

- **`ESCRITURA_S` de 1500 s corta a mitad las tareas de 4–5 archivos** → se pasó a **tareas de ≤ 3 archivos y ≤ 120 líneas por archivo**, con **verificación en la Mac tras cada despliegue**.
- La **puerta pytest debe mirar el árbol de trabajo** (no solo el resultado de la prueba).
- **Una revisión bloqueante confirmada puede integrarse** si el cierre es inmediato y **antes de desplegar**.
- **Verificar cada endpoint en la Mac tras desplegar destapó 9 defectos** que ningún revisor vio: procesos con envoltorio `{procesos}`, corpus por archivo inexistente, Flota «por conseguir» con claves presentes, «aliviar» sin efecto, paquete vacío, build roto por `"use client"`, supervisor que anulaba «dormir», sonda que quemaba cupo, y claves agotadas 24 h por tres 429.
- **`pgrep -f` mata la propia shell** si el patrón aparece en la propia orden: usar `patr[o]n`.

## 12. Estado git

- **OS main = `76e7f50`** (+ lo que se integre después); la Mac quedó en **`ba3d9fd`** servida en **modo ligero** (pendiente un paquete con C3/M10/Q1E/V5B/P5b).
- **astraura main = `efcd88f2` = Mac**.
- **Producción sigue en `2755cd2`**; quedan **~127 commits del OS y 13 de Astraura sin publicar**.
- **Publicar solo con la palabra de Alex** (o desde «Commits pendientes» con `PUBLICAR`), nunca automático.

---

**Relevo: siguiente adenda 229**