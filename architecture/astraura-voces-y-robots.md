# Voces locales fluidas y robots para bots y agentes de Astraura · contrato (VZR1011)

> Fecha: 2026-10-11 · Pedido por Alex · Se apoya en lo que YA existe (no se duplica):
> `architecture/aurora-voz-motores.md` y `src/lib/aurora/tts-oss/engine-registry.ts` (cadena de motores,
> OpenVoice V2 ya es el motor principal por defecto), `architecture/forja-voz-158.md` (§4 licencias),
> `src/lib/aurora/voz-starseed/` (motor único por niveles, Supertonic), `src/lib/voces/` (clonación con
> consentimiento, trocear, perfil neuronal), `src/lib/astraura/needle3-client.ts` y `decision-hibrida.ts`
> (capa Needle), `architecture/astraura-bots.md` (cuerpos y acciones de los bots).
> Preferencia de Alex que manda: la voz de Astraura que le gusta es Supertonic 3 (voz F1); se sigue desarrollando.

## §0 · Qué pidió Alex

Voces locales para bots, agentes y chats de toda Astraura, autoadaptables al contexto, con pláticas fluidas
y naturales en cualquier neurona (local + malla + capas de conciencia colectiva), usando OpenVoice V2,
F5-TTS, XTTS-v2, Chatterbox y ChatTTS; y Open Duck Mini y needle-duck para los bots y agentes.

## §1 · Lo verificado el 2026-10-11

| Proyecto | Licencia | ¿Producto? | Español | Notas |
|---|---|---|---|---|
| **OpenVoice V2** (MyShell) | **MIT, uso comercial libre** (su README) | **Sí — ya integrado** (motor principal) | Sí (nativo, con en/fr/zh/ja/ko) | El registro decía «CC-BY-NC (checkpoints)»: **error a corregir**, V2 es MIT. |
| **Chatterbox** (Resemble AI) | **MIT** | **Sí — nuevo** | **Sí**: Multilingual V3 (23+ idiomas) y paquetes dedicados de español latino y de España | Turbo 350M (inglés, baja latencia, 1 paso), Nano 110M (inglés, CPU ~3× tiempo real en 8 núcleos); control de exageración; **marca de agua Perth en todo lo generado**; CUDA, CPU y MPS. |
| **F5-TTS** (SWivid) | Código MIT · **pesos CC-BY-NC** | No en producto; **opcional personal no comercial** | No oficial (zh/en) | RTF 0,04–0,15 en GPU L20; puerto MLX y ONNX de la comunidad. Ya figuraba en la forja como «solo referencia». |
| **XTTS-v2** (Coqui) | Código MPL-2.0 · **modelo Coqui Public Model License (no comercial)** | No en producto; **opcional personal no comercial** | Sí (16 idiomas) | Coqui cerró: no hay licencia comercial que comprar. Afirma streaming < 200 ms. |
| **ChatTTS** (2noise) | Código AGPLv3+ · **modelo CC BY-NC 4.0, «solo académico»** | **No** | **No** (solo inglés y chino) | Ruido añadido a propósito contra el mal uso. Solo ficha en el catálogo. |
| **Open Duck Mini v2** (apirrone) | **Apache-2.0** | Sí | — | Robot bípedo de ~42 cm inspirado en el BDX de Disney, materiales < 400 USD, Raspberry Pi Zero 2W, política de caminar en ONNX; **sin cámara, micrófono ni altavoz** en v2; 4,2k estrellas. |
| **needle-duck** (andrisgauracs) | **Apache-2.0** | Sí | — | El Open Duck Mini **simulado** (MuJoCo) movido por **Needle 3** (Cactus Compute, Apache-2.0) afinado para elegir entre 5 herramientas (caminar, girar, emoción, bailar, negar con la cabeza) y obedecer solo peticiones educadas: 84 % frente a 27 % del Needle base. Afinar pide NVIDIA; trae modelos ya afinados. |

Regla de licencias (la de la forja §4, más la de imágenes): en el producto y en todo uso comercial solo
MIT/Apache; F5-TTS y XTTS-v2 quedan como **motores opcionales de uso personal no comercial** que la persona
instala a mano, nunca por defecto, nunca en páginas o grupos con fines comerciales.

## §2 · Plática fluida en cualquier neurona

1. **Presupuesto de latencia por contexto**: en conversación, el primer sonido debe salir en ≤ 0,8 s; en lectura
   o narración manda la calidad. El motor se elige por la **latencia medida** en esa neurona (primer audio y
   factor de tiempo real), no por la teórica; las medidas se guardan por neurona y motor.
2. **Por trozos y en paralelo**: la voz empieza con la primera frase mientras el modelo de lenguaje sigue
   escribiendo (`trocear`), y la siguiente frase se sintetiza mientras suena la anterior.
3. **Interrumpir**: si la persona habla, la voz se calla al instante y escucha.
4. **Capas**: aparato › otra neurona tuya en la red local › malla del grupo › motores web gratis (los Spaces que
   ya descubre `openvoice-discovery`) › voz del sistema. Lo que no llega al presupuesto pasa al siguiente sin
   silencios.
5. **La misma voz en todas partes**: la identidad de voz de Astraura y de cada bot (timbre, motor preferido,
   emociones) viaja con las capas de memoria compartida, así suena igual en el móvil, en el PC o en XR.

## §3 · Voz propia de cada bot

Cada bot tiene su perfil de voz: timbre (semilla sintética, voz de catálogo o la voz propia de su dueño con
consentimiento), motor preferido y mapa de emociones. Clonar la voz de alguien exige su consentimiento
explícito (ya lo exige `clonacion.ts`) y **nunca** se imita a una persona real sin él; con Chatterbox lo
generado lleva siempre su marca de agua.

## §4 · Robots: el pato como cuerpo de un bot

- **Simulado (sin hardware)**: el Open Duck Mini en MuJoCo dentro del navegador o de una escena XR, con su
  política de caminar en ONNX: un bot puede tener cuerpo de pato que camina, gira, baila y expresa emociones.
- **Real**: un Open Duck Mini v2 en la red local como cuerpo físico de un bot. Moverlo es una acción de
  **riesgo medio** (algo físico): con el nivel por defecto del bot se propone y la persona confirma; siempre hay
  un **alto** inmediato. Como v2 no tiene micrófono ni altavoz, la voz sale de la neurona más cercana.
- **Needle** elige la herramienta (caminar, girar, emoción, bailar, negar) desde lo que se dice, con el modelo
  ya afinado de needle-duck dentro de la capa Needle que Astraura ya tiene; si no está seguro, decide la capa
  híbrida de siempre.

## §5 · Cola `cola-voces-robots-1011.json`

Estado real a 2026-10-31 (no lo que se pretendía, sino lo que hay montado y probado):

| | Tarea | Estado real | Dónde y con qué se comprobó |
|---|---|---|---|
| A | Motor Chatterbox local | **Hecho.** Servidor HTTP local en 4505, cede memoria y no descarga nada solo; el cliente prefiere local y cae a Spaces. En AUTO va detrás de OmniVoice/OpenVoice y antes de Kokoro. | `native/astraura-voice/chatterbox/servidor.py`, `src/lib/aurora/tts-oss/chatterbox.ts`, `engine-registry.ts` (`AUTO_ENDPOINT_ORDER`). `pytest`: 24/24; `chatterbox.test.ts`: 25/25. |
| B | Chatterbox en Spaces públicos | **Hecho.** Respaldo al Space público cuando el backend local no responde; probado sin red con dobles. | `chatterbox.ts` + `chatterbox.test.ts` (25 tests). |
| C | Registro y licencias | **Hecho.** Fichas MIT/Apache en producto (Chatterbox, OpenVoice V2, Kokoro) y F5/XTTS solo personales; ChatTTS solo ficha. Verdad de licencia en panel de inteligencia y ahora también en el Estudio de Voces. | `voces-no-comerciales.ts`, `voz-licencias.tsx`, pestaña «Opcionales» de `estudio-voces.tsx`. `voces-no-comerciales.test.ts`: 21; `-integrado`: 4. |
| D | Plática fluida | **Parcial.** El presupuesto del primer sonido y el reordenamiento por latencia MEDIDA ya deciden en `speak-router`; el troceo por cláusulas y el crossfade existen. El planificador puro (trozos + relevo + interrupción) está probado pero **aún no sustituye** el troceo de `streaming-voice.ts`. | `conversacion-fluida.ts` (14 tests), `speak-router.ts` (`reordenarCadenaPorLatenciaMedida`), `streaming-voice.ts`, `omnivoice-mixer.ts`. |
| E | Voz propia de cada bot | **Hecho.** El editor guarda motor/origen/timbre, se sincroniza entre dispositivos y los invitados conservan su voz; un motor sin licencia para ese contexto no se aplica. | `voz-bot.ts`, `editor-voz-bot.tsx`, `sincronia-bots*`, `voz-bot.test.ts` (11). |
| F | Robot real (Open Duck Mini) | **Parcial y honesto.** Acciones y `META` con riesgo medio listos, pero **no hay transporte al pato físico**: el ejecutor aún responde «próximamente» y el simulador es el único camino real disponible. | `robot-pato.ts` (10 tests), `acciones.ts`, `ejecutor-acciones.ts`. |
| G | Pato simulado en navegador y XR | **Hecho para el cuerpo del bot.** El cuerpo `robot` ya no se pierde al recargar y `CuerpoBot` monta el pato simulado; avisa si el navegador no puede y no descarga recursos solo. En el panel personal el orbe sigue siendo el avatar por defecto hasta elegir `robot`. | `pato-simulado.ts` (38 tests), `cuerpo-bot.tsx`, `predeterminado.ts` + test de migración (10). |
| H | Needle con las herramientas del pato | **Hecho.** La capa Needle propone caminar/girar/emoción/bailar/negar desde el texto; si duda, decide la híbrida de siempre. El modelo afinado se busca en disco y, si no está, se usa la base sin inventar. | `needle-pato.ts` (12 tests), cableado en `src/app/api/astraura/decidir/route.ts` y `needle3-client`. |
| I | Integración y verificación | **Hecho.** Barrel único del panel, pato en el cuerpo, cuerpo `robot` persistente y pestaña de opcionales en el Estudio. `tsc` en verde; 120 archivos / 1586 tests de vitest; 24 de pytest. | `src/components/astraura-bots/index.ts`, `cuerpo-bot.tsx`, `predeterminado.ts`, `estudio-voces.tsx`; `bash scripts/enjambre/tsc-turno.sh`; `npx vitest run …`; `python3 -m pytest native/astraura-voice/chatterbox -q`. |

Lo que **no** está hecho y no se debe contar como tal: transporte al pato físico (F), cableado del
planificador de diálogo al streaming real (D) y descarga/uso de pesos afinados de pato por defecto (H).

