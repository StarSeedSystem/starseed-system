# Calidad de la imaginación: filtro de entrada de Astraura y carril de bajo riesgo (Ola 1102 · IMG1102A)

Medido el 01-11 en `starseed_memory_root/imaginacion/propuestas.json`: 728 propuestas (658 descartadas, 34 preguntas,
15 esperando aprobación, 19 agrupadas y **0 aprobadas**). La fuente `astraura` aporta 690 (95 %): 508 creaciones y
182 ramas, todas de solo 12 familias. Dos de ellas suman 508: «Optimización ARM NEON para <archivo>» (×290) y
«Esquema de Agente Mutado: Hephaestus-NEON» (×218). La utilidad mediana es 0. Las fuentes `agentes` y `diaria` sí
son buenas (de 0,6 a 0,83), pero se quedaban esperando a Alex por reglas mal calibradas.

## 1. Qué cambia en el OS (este commit y el siguiente)

| Pieza | Dónde | Qué hace |
|---|---|---|
| Filtro de entrada | `autodesarrollo_fuentes.filtrar_astraura` (puro) | Corre antes de crear la propuesta. Aplica tres filtros, en este orden. **Tipo de archivo**: NEON o SIMD solo entra con un archivo C, C++, Rust, Zig, ensamblador o un kernel, y nunca si apunta a .sh, .json, .md, Dockerfile o credenciales. **Familia repetida**: como mucho 1 por familia y día; si la familia sigue abierta, descartada, rechazada o agrupada en los últimos 7 días, no entra. **Tope**: 3 al día. |
| Familia | `familia_astraura(titulo)` | El título sin «[AUTORIZADO]», emojis, símbolos ni acentos, y sin el «para <archivo>» o el «: <archivo>» del final. |
| Autorización inventada | `de_astraura` y `autodesarrollo_decidir.RECLAMO` | «[AUTORIZADO]», «Permiso Concedido» o «autorizada por…» se quitan del título y del cuerpo, y la propuesta lleva `autorizacion_inventada: true`. `automatica` nunca la integra sola: queda esperando tu visto bueno. |
| Medidor | `propuestas.json → filtro_astraura` | `{fecha, vistas, entran, filtradas: {familia repetida, tipo de archivo, tope}, autorizacion_inventada}`. La cuenta es por id y por día, así que el ciclo de cada 15 min no la infla. El director también la devuelve en `ciclo()`. |
| Gasto de verdad | `autodesarrollo_decidir.GASTO` | «Pago» solo cuenta cuando hay un gasto: pagar, comprar, contratar o suscribirse, un importe, un método de pago o créditos de pago. «Acceso (libre, registro, pago)» describe una web, no un gasto. |
| Candidata al catálogo | `es_candidata_referencia` | Su dirección web (por ejemplo «github.com/vercel/ai») ya no se lee como un tema de Alex. |
| Carril de bajo riesgo | `bajo_riesgo` + `automatica` | Usa el mismo botón «aprobar». Cumple si es investigación, diseño o contenido de diaria, profunda o agentes; no publica, no gasta, no toca cuentas ni claves, no borra ni toca infraestructura; su importancia es baja o media; y, si es código, existen todos sus archivos. Desde 0,6 sale «aprobada», aunque tu umbral sea 0,75. El código de tipo «codigo» mantiene tu umbral. |
| Prioridad declarada | `importancia(p, existe)` | En un entregable de investigación, diseño o contenido (un documento), la «alta» que declara el agente es prioridad, no riesgo. «Crítica» sigue frenando, y también «otro». |
| Cola | `turno_de_las_solas` | Lo que aprueba sola la automática entra con el máximo del rango y una por archivo. Las 20 candidatas tocan el mismo JSON, así que entra una por ciclo. |

**En cifras.** Si se reproducen las 690 de Astraura por días con el filtro, **entran 8**: 303 por familia repetida,
320 por tipo de archivo y 59 por el tope. Son 4 de las 511 que el director todavía lee hoy; las demás ya las ejecuta
Astraura y se saltan desde la Ola 1025S. De las 37 de agentes y diaria que esperaban, 23 pasan a la cola: 20
candidatas al catálogo y 3 entregables (Horizon-Pulse, el guion «Trinity en movimiento» y la UI del orbe).
Siguen preguntando 9: publicar ×7, «clave» y «publicación de la Biblioteca». Siguen esperando 5: de importancia alta
porque borran o son código con «alta» declarada, o porque son borradores de alcance. `REGLAS = "1102A"` cambia la firma, así que lo
pendiente se vuelve a decidir en el próximo ciclo.

## 2. Qué cambiar en el backend de Astraura (solo leído; no se ha tocado)

Todo está en `IA 1.58 bit/backend/app/`.

- **Frecuencia.** `core/intuitive_imagination_engine.py:198` fija `cycle_frequency_minutes = 5`, así que
  `start_background_loop` (`:1622`) puede lanzar 288 ciclos al día. La elección del proceso (`_select_process_type`)
  es un sorteo con pesos según el tamaño del código, la RAM y la CPU. No mira problemas abiertos.
- **El origen del «NEON para .sh».** `_list_recent_files` (`:473`) no devuelve archivos recientes. Devuelve los
  8 primeros que encuentra `os.walk` en la raíz del workspace: install_and_run.sh, IDEA.md, Dockerfile,
  r2_credentials.local.json, vercel.backup.json, tunnel_*.sh… Después, `:1168` hace un `random.choice` entre ellos
  y `:1253` titula `f"Optimización ARM NEON para {theme.split(': ')[-1]}"`. Si el tema del modelo no lleva «: », se
  pega el tema entero. El contenido de plantilla es una función C vacía (`compute_ternary_fast`), y
  `inter_brain_evolutionary_mutation` (`:1263`) repite siempre el mismo esquema Hephaestus-NEON.
- **El prompt.** `_cognize_branch` (`:924`, temperatura 0,65, 300 tokens) le da al modelo la plantilla, el agente,
  la memoria, los «archivos recientes» y el clima. No le da tareas abiertas, bloqueadas ni medidores, ni un criterio
  de aceptación. `_cognize_creation` (`:1013`) pide una función NEON en C++, un shader o un JSON, sea cual sea el
  objetivo.
- **Las «autorizaciones».** No las inventa el modelo: las escribe el código.
  `agents/intelligent_authorization_orchestrator.py:822` antepone «⚡ [AUTORIZADO]» al tema, pone
  `requires_user_approval: false` y escribe `verification.is_verified: true` (`:847`) sin haber verificado nada.
  Lo hace cuando el propio backend se autoaprueba en modo drenaje: con `requests_embargoed`, `:1161` deja
  `requires_approval = False`. Las notificaciones «✅ Permiso Concedido» (`:2133`) y «✨ Auto-Mejora Aplicada»
  (`:1308`) acaban pegadas a títulos de ramas.
- **El modelo.** `core/cognition.py:85` pone `("bitnet-native", "ollama", "openrouter-free")`, así que la
  imaginación la escribe BitNet 2B.

### Cambios propuestos (para una ola sobre ese repo, con su visto bueno)

1. **Contexto real.** El director escribe en cada ciclo `starseed_memory_root/imaginacion/contexto-astraura.json`
   con las tareas abiertas y bloqueadas (revisor de bloqueadas), los medidores de Genesis (bloqueadas, capacidad,
   pruebas en rojo) y las familias de los últimos 7 días. `_harvest_sensory_context` lo lee y lo pliega en el
   prompt. Sin contexto, no hay ciclo.
2. **Archivos de verdad.** Cambiar `_list_recent_files` por los de `git log --name-only` de los últimos días,
   filtrados a código. `code_self_reflection_opt` solo elige C, C++, Rust, Zig o kernels (bitnet.cpp, ggml), y si
   no hay ninguno se salta el ciclo. Nunca scripts, JSON, Markdown, Dockerfile ni credenciales.
3. **Plantilla de propuesta.** El JSON obligatorio lleva `problema` (medido), `evidencia` (una cifra y su fuente),
   `archivos` (como mucho 3, que existan), `criterio_aceptacion` y `coste` (esfuerzo y llamadas). Lo que no trae
   evidencia o cita archivos que no existen no se emite. Tampoco esqueletos vacíos.
4. **Sin repetir familias.** Antes de emitir, se normaliza el título igual que `familia_astraura` y se salta si esa
   familia ya salió en los últimos 7 días. Como mucho 3 al día. Ciclo cada 60 min o por evento (cuando un medidor
   cambia), no cada 5.
5. **Sin permisos inventados.** Quitar el prefijo «⚡ [AUTORIZADO]» de `_register_background_branch` y usar un
   campo aparte, `autorizado_por: "orquestador-astraura"`. No escribir `is_verified` sin una comprobación real. No
   mezclar los títulos de las notificaciones con los de las ramas.
6. **Mejor aún: otro modelo para la imaginación del OS.** Usar un modelo gratis más capaz a través de FreeLLMAPI
   (`freellmapi/auto`, como en `architecture/metagenesis-autonoma.md`) en vez de BitNet 2B. Sería un motor
   `freellmapi` en `cognition.py`, solo con `purpose="imaginacion"` y con tope de unas 24 llamadas al día. BitNet se
   queda para el chat local. La clave sigue en FreeLLMAPI: nunca en el backend ni en el prompt.

## 3. Pendiente (fuera de estos archivos)

- Que el medidor de Genesis enseñe `filtro_astraura` (`src/lib/mando/imaginacion-*`, que ya conserva la clave al
  guardar).
- «clave» en `RESERVADOS` también significa «importante» («un paso clave»). «Arreglar el ciclo de vida del
  orquestador» sigue preguntando por eso.
- Las candidatas al catálogo piden verificar términos y robots.txt «sin inventar». Hay que vigilar que la flota no
  las dé por verificadas sin leer la web (`architecture/agente-referencias-diseno.md` §5).
