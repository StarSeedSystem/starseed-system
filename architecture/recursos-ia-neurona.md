# Recursos de IA por neurona · almacenamiento y procesadores (SOP · 2026-10-23)

> Alex (2026-10-23): «cada neurona debe poder seleccionar el medio de almacenamiento, así como para
> cada archivo y folder y memoria, para los modelos de IA que lo soporten… en su Biblioteca, en algún
> folder vinculado a algún cerebro con servidores propios, en almacenamientos locales de cada neurona
> o en almacenamientos externos… y de igual manera para los procesadores. Todo debe autodetectarse
> para sugerir las mejores opciones con base a sus capacidades, neuronas y medios disponibles,
> considerando los tamaños de almacenamiento, preguntando antes de asumir los tamaños de los modelos
> seleccionados y verificando que todo sea compatible… priorizando el 1.58 bits y lo más potente y
> eficiente local disponible». Y añadir **drumih/turbo-fieldfare** a los modelos descargables.

## 1. Qué resuelve

Hasta hoy cada planificador decidía por su lado (capas, imágenes, Protomolécula, colmena) y nadie
guardaba «este modelo / carpeta / archivo / memoria → se ALMACENA en X y se PROCESA en Y». Este
módulo es esa capa común, nativa del OS y por neurona:

1. **Inventario** de lo que hay: neuronas de la cuenta con sus procesadores (CPU, GPU, NPU, WebGPU)
   y almacenes (disco interno, discos externos, navegador), más Biblioteca, carpetas de cerebros,
   servidores propios/externos y nube. Autodetectado; lo que no se detecta se declara a mano.
2. **Catálogo de modelos** con sus requisitos (bits, formato, runtime, disco, RAM, VRAM, sistema,
   aceleradores, modo de lectura de pesos), con los 1.58-bit primero.
3. **Compatibilidad** modelo ↔ procesador ↔ almacén con motivos y arreglos legibles.
4. **Sugerencias** por capacidad (texto, razón, decisión, voz, oído, imagen, visión, memoria…) y
   **topología** (cómo se reparte la IA del perfil, grupo o comunidad).
5. **Asignaciones** por elemento, que viajan con la cuenta.

## 2. Topologías (lo que la persona elige; el OS sugiere)

| Topología | Qué es | Cuándo la sugiere el OS |
|---|---|---|
| `cada-neurona` | cada neurona usa sus modelos y su procesador | una sola neurona, o todas capaces |
| `servidor-propio` | UNA neurona de la cuenta procesa la IA de todas, por malla local, red de StarSeed o antena | hay una neurona claramente más capaz y online |
| `almacen-externo` | los modelos viven en un disco o servidor externo; procesa la neurona donde se conecta | poco disco interno y un almacén externo rápido |
| `fragmentada` | cada capacidad (o capa) en la neurona/servidor que mejor la hace | varias neuronas con fuerzas distintas (una con GPU, otra con disco) |
| `comunal` | servidores del grupo o la comunidad, públicos o privados | alcance de grupo/comunidad |

**Vías** (`Via`): `local` · `malla-local` (P2P, LAN, Reticulum por IP) · `red-starseed` (relé de la
red) · `antena` (LoRa/radio: solo mensajes y decisiones, **nunca pesos**) · `internet`.

## 3. Reglas duras

- **Preguntar antes de asumir tamaños.** Un modelo con `disco.gb === null` o variantes (cuantización)
  genera una `Pregunta` `tamano-modelo`/`elegir-variante`; la respuesta se guarda en
  `tamanosConfirmados`. Toda descarga pide confirmación con tamaño y destino.
- **Privacidad.** Alcance privado ⇒ solo almacenes `privado: true` y procesadores propios o del grupo
  dueño. Nada personal pasa a un servidor público o comunal sin elegirlo.
- **Pesos que se leen en cada token** (`almacenamiento.modo === "streaming-ssd"`, TurboFieldfare) ⇒
  solo disco local rápido de la neurona que procesa (interno o externo USB-C/Thunderbolt con lectura ≥
  el mínimo). Nunca nube ni red.
- **Antena** no transporta pesos ni archivos grandes (`VIA_REFERENCIA.antena`).
- **1.58-bit primero** a igual capacidad y compatibilidad; después lo más potente que cabe con holgura.
- **Honestidad.** Lo que no se puede medir se marca `fuente: "estimado"`; un modelo que no corre en
  ninguna neurona sale como «sin opción» con su motivo, nunca como sugerencia.
- Módulos puros (`tipos`, `catalogo`, `compatibilidad`, `sugerencias`, `asignaciones`) sin `node:*`;
  la detección de la máquina vive en `deteccion-servidor.ts` (solo servidor) y su ruta es solo local.

## 4. Piezas

| Archivo | Qué hace |
|---|---|
| `src/lib/recursos-ia/tipos.ts` | contrato: tipos, constantes, clave `starseed.recursos-ia.v1` |
| `src/lib/recursos-ia/catalogo.ts` | catálogo unificado (capas de `config/capas-astraura.json`, especificaciones locales, extras como TurboFieldfare), 1.58 primero |
| `src/lib/recursos-ia/compatibilidad.ts` | `verificar()` y `estimarTokS()` |
| `src/lib/recursos-ia/sugerencias.ts` | `sugerirPlan()` y `topologiaSugerida()` |
| `src/lib/recursos-ia/deteccion.ts` | inventario en el navegador (`inventarioDesde`, `detectarInventario`) |
| `src/lib/recursos-ia/deteccion-servidor.ts` + `/api/recursos-ia/detectar` | la máquina por dentro: volúmenes (también externos), chip, RAM, GPU, sistema, herramientas y servidores de IA locales |
| `src/lib/recursos-ia/asignaciones.ts` + `use-recursos-ia.ts` | asignaciones por elemento con herencia de carpeta, topologías, tamaños confirmados, almacenes declarados |
| `src/components/recursos-ia/*` | panel «Recursos de IA» (constelación, topología, por capacidad, catálogo, preguntas) y diálogo «Dónde se guarda y se procesa» para cualquier elemento |

Superficies: `/agent` → «Enrutamiento de Almacenamiento & Medios» → **Recursos de IA**
(`?tab=recursos-ia`); resumen en el panel de cada neurona; «Dónde se guarda…» en el menú contextual
del Explorador. La ficha de TurboFieldfare vive en la Biblioteca (`kind: "ai-source"`).

## 5. TurboFieldfare (drumih/turbo-fieldfare)

Runtime propio en Swift + Metal 4 para **Gemma 4 26B-A4B** (MoE, 4-bit MLX, router 8-bit) en Apple
Silicon: mantiene el núcleo y la caché KV en memoria (~2 GB) y **lee del SSD solo los expertos de cada
token**. Necesita macOS 26+, Metal 4, Xcode 26 / Swift 6.2, ~15 GB de descarga y ~14,3 GB instalado.
Medido por su autor: 5,1–6,3 tok/s en M2 Air de 8 GB; 31–35 tok/s en M5 Pro. Servidor
OpenAI-compatible experimental en `127.0.0.1:8080/v1` (solo bucle local, sin TLS), solo texto, un
proceso dueño del modelo a la vez. Licencia Apache-2.0 (pesos con su licencia de origen).

Encaja como la capa **profunda** de una neurona Apple Silicon de poca RAM cuando hay disco rápido:
es lo más potente que cabe en 8 GB. No sustituye a los 1.58-bit (BitNet, Bonsai ternario) para el
reflejo, la palabra y la razón de cada día; se sugiere solo donde corre.

## 6. Servidor propio de IA (Hono · `servicios/servidor-ia`)

Plano de datos de la topología `servidor-propio`: la neurona que procesa une sus motores locales —
BitNet 1.58 (`:8790`), TurboFieldfare (`:8080`), Ollama (`:11434`), LM Studio (`:1234`) y Laya
(`:4470`, decisiones)— tras UNA API compatible con OpenAI (`GET /v1/models` con ids
`<motor>/<modelo>`, `POST /v1/chat/completions` con flujo, `POST /v1/systemone`), y las demás
neuronas de la cuenta la usan por la malla local o la red de StarSeed. Hono porque el mismo código
corre en Node, Bun, Deno y Workers (Mac, A1, Raspberry, borde). Sin token solo escucha en
`127.0.0.1`; fuera de la máquina exige `STARSEED_SERVIDOR_IA_TOKEN` (Bearer). Arranque:
`node servicios/servidor-ia/bin/servidor-ia.mjs` (puerto 4480).

## 7. Lo que sigue (cola del enjambre · ola 1023R)

`starseed_memory_root/olas/cola-recursos-ia-1023.json`, 10 tareas (≤ 3 archivos cada una):

| Id | Qué |
|---|---|
| RIA1023A | servicio launchd del servidor propio de IA (Mac), apagado por defecto, con guion encender/apagar/estado |
| RIA1023B | unidad systemd de usuario (A1 y Linux) |
| RIA1023C | `destinoDeIA`: a qué servidor va cada capacidad según la topología (puro) |
| RIA1023D | con la topología «servidor propio», Astraura lo registra como modelo propio (depende de C) |
| RIA1023E | `capaEnPropio` real en `src/lib/astraura/capas/repartir.ts` |
| RIA1023F | publicar la `OfertaNeurona` (`src/lib/recursos/oferta.ts`) desde las asignaciones |
| RIA1023G | mover pesos entre almacenes con verificación SHA-256 (ruta solo local) |
| RIA1023H | lanzar y vigilar TurboFieldfare como servidor local cuando esté instalado |
| RIA1023I | discos y NPU desde la app nativa (`native/src-tauri`) en la detección |
| RIA1023J | Jev por `/v1/decisions` (GPT-6 Luna, gratis hasta el 14-nov) solo si su forma está documentada |
