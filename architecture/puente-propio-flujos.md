# Flujos y conocimiento propios: aprender de n8n y Dify y no depender de ellos

> Petición de Alex (2026-10-05): aprovechar las pruebas gratuitas de n8n Cloud (vence el
> **2026-10-18**) y Dify Cloud Sandbox (200 créditos de mensajes) para mejorar nuestros sistemas lo más
> posible; replicar el funcionamiento de esos servicios de pago **en nuestro propio Genesis y
> workflow**, aprendiendo de cada uno en el proceso, para no depender de servicios externos antes de que
> se acaben sus créditos gratuitos. Antes de cada vencimiento hay que trasladar los workflows completos.

## 1. Principio

Los externos son **aulas, no cimientos**. Mientras dura su gratuidad:

- **Se usan** como puentes, según §10 de `director-produccion.md`.
- **Se estudian:** cada capacidad útil se apunta en un inventario.
- **Se vacían:** todo flujo, plantilla, prompt o base de conocimiento que creemos allí se exporta al
  repo el mismo día.

Lo que se aprende se construye en casa con el enjambre. El objetivo es que el día que vence la prueba,
apagar el externo no cambie nada.

## 2. Inventarios de aprendizaje (`memory/aprendizaje-externos/`)

Hay un archivo por servicio: `n8n.md` y `dify.md`. Cada capacidad ocupa una fila con estos campos:

- qué hace;
- cómo lo hace ellos (modelo de datos y experiencia de uso);
- qué tenemos ya (archivo y función);
- qué falta;
- prioridad (techo del sistema primero);
- la tarea que la construye.

Fuentes:

- la documentación pública;
- la propia instancia de Alex: nodos disponibles, plantillas, ejecuciones, estructura del JSON exportado;
- el código abierto (n8n Community y Dify Community son públicos).

Nunca se copia código con licencia restrictiva: se aprende el **diseño**.

## 3. Motor de flujos propio («Flujos de Genesis»)

Lo que replica de n8n, en Python puro dentro de `scripts/puente/flujos/` y sin servidor nuevo:

- **Flujo:** un grafo de nodos con conexiones. Se guarda como JSON en
  `starseed_memory_root/flujos/<id>.json` y va versionado en git.
- **Disparadores:**
  - webhook en Genesis: `/api/flujos/gancho/[ruta]`, con firma HMAC;
  - cron;
  - eventos del bus del enjambre: `commit`, `rechazada`, `publicada`…;
  - mensaje del Chat Director;
  - manual.
- **Nodos de acción:**
  - HTTP;
  - ntfy;
  - Telegram (por `telegram-puente.py`);
  - Chat Director;
  - Drive (por la conexión que ya existe);
  - modelo de IA, por las pasarelas gratuitas con Jev para las decisiones tipadas;
  - conocimiento (§4);
  - condición, bucle, fusión y transformación con expresiones seguras sin `eval`.
- **Ejecución:**
  - cada ejecución guarda la entrada y salida de cada nodo y su tiempo;
  - reintentos con espera creciente;
  - un flujo de error por flujo;
  - durable al estilo Temporal (§9 de producción): un reinicio retoma el flujo en el nodo donde iba.
- **Credenciales:** el flujo solo guarda **referencias** a nombres de variables de
  `~/.starseed/env`, nunca valores.
- **Importador de n8n:** lee el JSON exportado de n8n y lo traduce a nuestros nodos. Cubre webhook,
  schedule, httpRequest, if, switch, set, merge, code (solo si es traducible), telegram, googleDrive y
  respondToWebhook. Lo que no sabe traducir lo marca y lo informa, nunca lo ignora en silencio. Es lo
  que permite trasladar los workflows completos antes del vencimiento.
- **Editor en Genesis:**
  - lienzo de nodos con `@dnd-kit/core`, que ya es dependencia: nada nuevo;
  - panel de cada nodo;
  - historial de ejecuciones con entrada y salida;
  - botones Ejecutar, Activar y Duplicar;
  - plantillas propias.

## 4. Conocimiento y apps de IA propios (lo que replica de Dify)

- **Bases de conocimiento:**
  - crear base, añadir documentos (markdown, PDF, URL) y trocearlos;
  - recuperación BM25, con la misma interfaz de `produccion_memoria.py` (PRD1005M), y embeddings
    opcionales por pasarela gratuita.
  - API compatible con el subconjunto de Dify que usamos (`/datasets`, `/documents`, `/retrieve`). Así
    lo que hoy habla con Dify cambia de URL y sigue funcionando.
- **Apps de IA:** un prompt con variables, una base de conocimiento, un modelo con enrutado gratuito y
  publicación como API de Genesis con su clave. Cada app lleva un registro de conversaciones y
  anotaciones, como en Dify, para mejorar respuestas.
- **Exportador desde Dify:** el DSL de cada app y los documentos de cada base, al repo, en
  `memory/aprendizaje-externos/dify-export/`.

## 5. Calendario de traslado (avisos programados)

| Fecha (CST) | Qué se hace |
|---|---|
| **2026-10-11** | Revisión a mitad de la prueba. Inventarios al día, flujos de n8n Cloud exportados al repo y avance del motor propio. |
| **2026-10-14** | Inicio del traslado. Se exportan todos los workflows y ejecuciones útiles de n8n Cloud. El importador los convierte y el motor propio los ejecuta en paralelo, en sombra, comparando resultados. |
| **2026-10-17** | Último traslado. Exportación final. El enrutador de §10 apaga n8n Cloud y los mismos flujos corren en casa. Se exportan también las apps y los documentos de Dify. |
| Cuando los créditos de Dify pasen del 70 % | El enrutador lo avisa y se adelanta el traslado de Dify. |

## 6. Exportar sin API

La prueba de n8n Cloud no tiene API pública. La exportación se hace desde el navegador integrado con la
sesión de Alex:

- la propia interfaz descarga el JSON de cada flujo;
- o la página llama a sus rutas internas `/rest/workflows` con la sesión ya abierta.

Claude nunca escribe contraseñas ni claves en esos formularios. Las credenciales de cada flujo no se
exportan: solo sus nombres.
