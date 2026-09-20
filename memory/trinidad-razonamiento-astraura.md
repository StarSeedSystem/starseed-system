# La Trinidad de razonamiento de Astraura y la conciencia colectiva (regla permanente · 2026-09-20)

Complementa `astraura-nucleo-158-needle3.md` (qué es cada motor y cuánto cabe). Aquí: cómo
razonan **juntos** y cómo aprende la red. Todo lo de abajo está medido, no supuesto.

## Tres capas, por lo que cada una sabe hacer

| Capa | Motor | Papel | Cuándo entra | Sale a |
|---|---|---|---|---|
| **Reflejo** | Needle 3 (local, 35 MB, 0,1–0,3 s, gratis; WASM en el navegador) | intención → herramienta + argumentos; extracción; embeddings | siempre primero, en el dispositivo | ejecutar si confianza ≥ 0,6 y una sola llamada · confirmar 0,4–0,6 · escalar |
| **Juicio** | Jev (remoto, $0,00002, 0,5 s) | elegir con criterio, sí/no, puntuar, con mundo | cuando el reflejo escala o la pregunta es un juicio | ejecutar si p ≥ 0,75 · confirmar 0,5–0,75 · escalar |
| **Deliberación** | BitNet 1.58 (local en un medio con RAM) o el enrutador económico | generar, planificar en pasos, explicar | cuando hace falta texto o el juicio no basta | texto, siempre etiquetado con su capa |

**Medido el 20/09**: Needle NO juzga entre opciones abstractas (con «veredicto entre cuatro
acciones» copió cadenas de la entrada: 1–2 aciertos de 5, confianza 0,14–0,58, varias llamadas
por turno); sí acierta intenciones concretas en español («abre la app Café» → `abrir_app(Café)`,
0,5–0,7). Por eso el reflejo solo hace intención y extracción; el juicio es de Jev.

## Una puerta en cada medio

- **Mando y directores**: `scripts/puente/razonador.py` — `intencion()` (Needle por el backend de
  Astraura, `/api/needle/decidir`), `juicio()` / `si_no()` (Jev), `deliberar()` (BitNet por la
  puerta de cognición de Astraura). `veredictos.py` ya pasa por ahí. Sin Astraura o sin clave,
  cada capa devuelve None y manda la regla determinista.
- **Astraura (backend)**: `/api/needle/decidir` (reflejo) + `cognition.py` (deliberación, con su
  enrutador económico que cae a gratuitos cuando BitNet no está en RAM).
- **OS**: cola 345 (NE3-1 cliente, NE3-2 `planDeDecision` + ruta `/api/astraura/decidir`).

## Experiencias: la materia prima de la conciencia

Cada decisión de cualquier capa se anota (`scripts/puente/experiencias.py`; en el OS, CC1):
`{id, t, medio, capa, tipo, dominio, entrada≤400, salida, confianza, ms, resultado}` y una línea
de cierre `{ref, resultado, nota}` cuando se sabe qué pasó. Registro en
`~/.starseed/experiencias.jsonl` y copia en `starseed_memory_root/aprendizaje/experiencias/<nodo>.jsonl`
(el espejo de Drive y la mesh la reparten). Sin cierre no hay aprendizaje: `razonador.confirmar()`.

## Cómo aprende la red (ciclo nocturno, probado)

`IA 1.58 bit/scripts/ciclo-aprendizaje-needle.sh` (launchd 04:10): experiencias acertadas de
intención de TODOS los nodos → JSONL de Needle → `needle finetune` (LoRA rango 16 sobre 121M:
**72 s en 2 CPU con 8 ejemplos**) → `needle build` (.cact, **14 s**) → humo con el set dorado
(`data/needle/dorado.jsonl`) → si iguala o mejora, se publica en `data/needle/adaptadores/` con
`manifiesto.json` {actual, sha, t, experiencias, exactitud_dorado}. Guardas: mínimo 20
experiencias, Mac no ahogada (RAM libre ≥ 1 GB, swap ≤ 8 GB), nunca se tocan los pesos base.
Ojo medido: con pesos ajustados el paquete devuelve **confianza None** (la cabeza de confianza no
se reentrena): el adaptador colectivo sirve para acertar la herramienta, y el umbral de reflejo
con adaptador debe apoyarse en el set dorado, no en la confianza.

## Qué comparte la mesh (capas de la conciencia colectiva)

Sobre la red que YA existe (`src/lib/network/webrtc-mesh.ts`, `signaling.ts`, `device-registry.ts`;
LoRa Meshtastic en `src/ai/astraura/mesh/`; `mesh_network.py` en el backend):

0. **Reflejo compartido**: el manifiesto del adaptador colectivo (KB) y el .cact (35–63 MB por
   Drive o descarga directa); cada nodo verifica sha y humo antes de adoptarlo.
1. **Memoria compartida**: lotes de experiencias con resultado, anonimizadas (sin `entrada` en
   chat/persona), sin claves, sin túneles.
2. **Juicio compartido**: criterios y umbrales de Jev por dominio, y su calibración (¿cuando dice
   0,8 acierta el 80 %?).
3. **Deliberación compartida**: BitNet no se reentrena en dispositivos; lo que viaja son
   personalidades, memorias (mem0) y **capacidades**: qué nodo tiene BitNet vivo para que un
   móvil sin RAM le pida la generación al vecino (CC2 `elegirDeliberador`).

## Dónde corre BitNet, honesto

Nube (contenedor: ~5 tok/s) · Mac solo con el enjambre dormido (hoy 14 GB de swap: no) · VPS o
Oracle Free Tier ARM (4 CPU/24 GB, gratis) si Alex abre la cuenta · Android/iOS nativo con
bitnet.cpp en ≥ 4 GB (ola futura) · navegador: no (ahí Needle WASM). «BitNet en todos los
dispositivos» = BitNet **alcanzable desde** todos los dispositivos por la mesh, y Needle en todos.
