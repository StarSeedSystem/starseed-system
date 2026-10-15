# Voz fusionada de Astraura: un oído, una voz y una plática en directo para todo StarSeed

> **Petición de Alex (2026-10-15):** «fusiona este sistema de voz desde su código y programa completo al de voz de
> Astraura de todo StarSeed, incluyendo todos los mensajes automáticos de ventanas, guías e introducciones, mezclado
> con los demás sistemas de voz, pero debe ser mejor la fusión que cada uno individualmente […] cualquier cosa que se
> le pida debe contestar directamente con la voz mientras desarrolla cualquier petición del usuario o grupo o llamada
> grupal en tiempo real con los bots en servidores personalizables […] fusionando las capacidades de todos los medios
> de las neuronas como servidor mesh autogestionable […] para todos los usuarios activos en la sesión como para el
> resto de la red». Sistema traído: **Phonon-2** de Fermion Research (fermionresearch.com/models/phonon-2).

Contratos que este amplía (no reemplaza): `aurora-voz-motores.md` (registro de voces y «Aurora SIEMPRE habla»),
`astraura-voces-y-robots.md` (≤ 0,8 s al primer sonido, interrupción, capas de medios, licencias),
`coherencia-persona-voz.md` (persona y `langMode`), `forja-voz-158.md` (programa único de voz, VibeASR como oído).

## 1. Qué es Phonon-2 (comprobado el 2026-10-15)

- **Qué es:** un modelo de **reconocimiento de voz** (audio → texto con puntuación). No sintetiza voz ni hace voz a voz.
- **Origen:** destilado de NVIDIA Parakeet TDT 0.6B v3.
  - 0,6 B de parámetros y 164 MB de descarga, frente a los 2,5 GB del maestro.
  - El codificador guarda cada peso en unos 2,1 bits: cero o ± una de dos magnitudes, empaquetado en base 3. Es la misma idea ternaria que Astraura 1.58.
- **Licencias:** pesos CC-BY-4.0, que piden atribución (§7). Código y línea de órdenes, Apache-2.0.
- **Instalación:** `pip install fermion-research`.
  - Órdenes: `phonon transcribe` y `fermion serve phonon-2`.
  - `fermion listen` (micrófono en vivo) solo funciona en Apple silicon.
- **Servidor:** `fermion serve phonon-2 --host 127.0.0.1 --port <p> --threads <n> [--api-key …]` expone dos rutas.
  - `POST /v1/audio/transcriptions`: compatible con la API Whisper de OpenAI (multipart `file` + `model`).
  - `GET /v1/audio/stream`: WebSocket. Entran tramas PCM de 16 kHz mono y salen JSON `partial`, `final` y `done`. Solo atiende **un flujo a la vez**.
  - Opción `--hotwords "Astraura, StarSeed"` para nombres propios.
- **Motores por plataforma:**
  - Apple silicon: MLX (GPU) o Core ML (Neural Engine). Fermion publica 174× y 606× tiempo real en un MacBook Air M5.
  - Linux y Windows: motor de CPU int8 (x86-64 y Arm con NEON).
  - NVIDIA: CUDA.
- **Idiomas:** Fermion lo anuncia **solo para inglés**.

**Medido por nosotros en el Oracle A1** (2 OCPU Ampere, solo CPU, `fermion serve`, 2 hilos):

| Audio | Duración | Tiempo de respuesta | Tiempo real | Texto |
|---|---|---|---|---|
| JFK (habla real, inglés) | 11,0 s | 1,60 s | 6,9× | perfecto |
| Voz Samantha (inglés) | 6,9 s | 0,97 s | 7,1× | «Astraura» → «Estora» |
| Voz Paulina (**español**) | 12,2 s | 1,90 s | 6,4× | 2 fallos en 38 palabras: «StarSeed» → «Star Sed» y «cuando» → «quando» |

- **Español:** aunque se anuncie solo para inglés, entiende español bastante bien, porque su maestro es multilingüe. Con `--hotwords` «Star Sed» pasa a «StarSead». «Quando» sigue.
- **Arranque en frío:** con el modelo cargado una vez (servidor), cada petición tarda menos de 2 s en el A1.
- **Instalación en aarch64:** pip trae el torch con CUDA y el entorno pesa 5,6 GB. El propio programa recomienda el torch de CPU (`--index-url https://download.pytorch.org/whl/cpu`), y el instalador debe usarlo.

**Su maestro, Parakeet TDT 0.6B v3** (CC-BY-4.0):
- Reconoce 25 idiomas europeos, entre ellos **español**, y detecta solo el idioma.
- Hay exportación ONNX int8 (`pip install onnx-asr[cpu,hub]`, `onnx_asr.load_model("nemo-parakeet-tdt-0.6b-v3", quantization="int8")`).

**Medido en el mismo A1**, con el modelo cargado en el proceso (sin HTTP) y 640 MB en disco:

| Audio | Tiempo | Tiempo real | Texto |
|---|---|---|---|
| JFK | 1,01 s | 10,9× | perfecto |
| Samantha (inglés) | 0,62 s | 11,1× | «Astraura» → «Astora» |
| Paulina (español) | 1,06 s | 11,5× | **1 fallo**: «StarSeed» → «Star Said». «Cuando» sale bien |

- La carga en frío fue de 21 s, descarga incluida.
- **Comparación no idéntica:** Phonon se midió por HTTP y Parakeet dentro del proceso.

**Lo que decide la fusión:**
- **Parakeet:** en CPU, el oído de **calidad**. Es mejor en español y más rápido en el A1.
- **Phonon-2:** el oído **ligero y en flujo**:
  - 164 MB, de modo que cabe en móviles y en la PWA (≤ 1 GB);
  - WebSocket con parciales;
  - `hotwords`;
  - en Apple silicon corre en MLX o Neural Engine (cientos de veces tiempo real según Fermion; falta medirlo en la Mac de Alex).
- **Nombres propios:** a los dos hay que enseñarles «StarSeed» y «Astraura» (`hotwords` en Phonon, y corrección por glosario después del texto en ambos).

## 2. Qué había (mapa del 2026-10-15)

- **Oído:** un solo camino vivo, el `SpeechRecognition` del navegador (`engine.ts`).
  - Whisper en el navegador (`stt-oss/oss-stt.ts`) y VibeASR 1.58 (`stt-oss/vibeasr-local.ts`, `POST /asr` del demonio) existen, pero Aurora **nunca** los usa.
  - No hay registro de motores de oído ni elección por idioma del AUDIO.
  - No hay cliente de `/v1/audio/transcriptions`.
- **Voz:** **cuatro puertas en paralelo**.
  - A. `engine.speak`
  - B. `engine.speakQueued`
  - C. `hablarStarSeed`
  - D. `hablarRito`

  Además hay unos diez puntos que hablan por su cuenta: `actions.ts` `speakOnceAdHoc`, `ai-overlay.tsx`, `voice-note-bar.tsx`… También seis mapas de «qué voz tiene cada persona» sin coordinar.
  - La narración de ventanas y la guía van por A. La bienvenida va por D. Genesis y Señales van por C.
  - `callarRito` no calla a `vozRT`.
- **Plática:** solo semidúplex.
  - Se interrumpe tocando la orbe, no al hablar.
  - El audio sale por frases enteras, no en flujo.
  - Mientras un agente trabaja, la voz calla: solo la orbe se anima.
- **Llamadas y malla:**
  - La llamada (`llamadas/motor.ts`, malla WebRTC de hasta 8 personas) no tiene oído ni voz de Astraura.
  - Ninguna neurona anuncia capacidades de voz (`FichaDispositivo`, `CapacidadesNodo`).
  - No existe relé de voz ni de oído. Las plantillas que sirven son `ia-por-malla.ts` y `archivos-malla.ts`.

## 3. Principio de la fusión: mejor que cada uno por separado

Cada motor aporta lo que mejor hace, y el conjunto decide en cada frase con datos **medidos en esa neurona**, nunca
con supuestos:

| Pieza | Qué aporta a la fusión |
|---|---|
| Phonon-2 | El oído más rápido y pequeño (164 MB); flujo con parciales; sirve en CPU de cualquier neurona y en el A1 |
| Parakeet v3 | Español y 24 idiomas más, con detección del idioma: el oído de calidad |
| VibeASR 1.58 | El oído 1.58 propio, ya instalado en el demonio |
| Reconocimiento del navegador | Cero instalación y parciales inmediatos: el suelo que siempre está |
| Supertonic (`voz-rt`) | La voz de conversación más rápida (voz F1 de Alex) |
| OmniVoice / OpenVoice2 / Kokoro / Chatterbox | Timbre, emoción, clonación con consentimiento, idiomas |

**Reglas de fusión del oído:**
1. **Parcial del más rápido y final del más preciso.**
   - El texto parcial que se ve mientras hablas sale del motor de menor latencia medida, sea el navegador o el flujo de Phonon.
   - El texto final de cada tramo lo da el motor más preciso para el idioma de ese tramo: Phonon en inglés, Parakeet en español y otros idiomas. Si el final llega después y difiere, corrige el parcial.
2. **El idioma se decide por el AUDIO, no por la configuración.**
   - Lo dan la detección de Parakeet o el `idioma` del motor.
   - Con el idioma de la persona como pista, nunca como imposición. Un tramo en inglés dentro de una charla en español va a Phonon.
3. **Las palabras propias se enseñan.**
   - «Astraura», «StarSeed», «MetaGenesis», «PoliGenesis», «Genesis», el nombre del usuario, de sus bots y de su grupo van como `hotwords` en cada petición.
   - Después, un **corrector por glosario** cambia las formas cercanas medidas («Star Sed», «Star Said», «StarSead» → «StarSeed»; «Estora», «Astora» → «Astraura») solo cuando la distancia es pequeña y la palabra no existe en el idioma.
4. **Privacidad.**
   - El audio de una persona no sale de su neurona salvo que lo permita, y entonces solo hacia sus otras neuronas o hacia el servidor de voz de la sesión de su grupo (§5).
   - Al resto de la red viaja **texto**, no audio.

**Reglas de fusión de la voz:**
1. **Una sola puerta para todo lo que se dice:** `hablar(texto, { contexto, persona, prioridad })`.
   - Los contextos son `conversacion`, `aviso`, `ventana`, `guia`, `rito` (introducciones), `lectura`, `mando` y `llamada`.
   - Ventanas, guías, bienvenidas, Genesis, Señales, notas de voz y avisos pasan por ella.
   - Un mismo **callar** para todo.
2. **Una sola identidad por persona.** Un único resolutor (agente › personalidad › cerebro › neurona › cuenta) da timbre, motor y voz rápida, y alimenta a `vozDePersona`, `timbreEfectivo` y el pin del registro.
3. **Prioridad:**
   - La conversación manda.
   - Un aviso no la corta: espera al silencio o se resume.
   - La guía y las introducciones van en cola.
   - Nunca se parte un mensaje entre dos motores, como ya manda `speak-router`.

## 4. Plática en directo: contesta mientras trabaja

- **Acuse ≤ 0,8 s.**
  - Al recibir una petición hablada, Astraura contesta al momento con una frase corta y ya sintetizada («Voy», «Lo miro»), cacheada por persona y motor.
  - La respuesta de verdad empieza en cuanto llega el primer trozo del modelo.
- **Voz del trabajo.**
  - Mientras un agente o una tarea trabaja (eventos `aurora:bg-tasks`, pasos del enjambre, Genesis), la voz narra en frases cortas: «empiezo», «llevo 3 de 5», «listo», «necesito tu visto bueno».
  - Como mucho una frase cada 8 s, nunca encima de la persona, y en silencio si la persona lo pide.
- **Interrupción por voz.** Si la persona habla más de 250 ms mientras Astraura habla, Astraura calla al instante.
  - Para eso: cancelación de eco del navegador (`echoCancellation`), `esEcoPropio` y un detector de voz por energía con histéresis.
- **Flujo de audio.**
  - El oído en flujo usa el WebSocket de Phonon donde haya Phonon, y si no, tramos con el detector de voz de `oss-stt.ts`.
  - La voz sale por frases desde el primer trozo, como hoy, con el colchón de `colchon-voz.ts`.
- **Medidas por neurona y motor** (no por navegador):
  - primer sonido;
  - tiempo real del oído y de la voz;
  - aciertos corregidos por la persona.

  El elector de motores aprende de ellas, como el enrutador económico aprende de los proveedores.

## 5. Servidor de voz en malla, autogestionado

- **Anuncio.** Cada neurona publica en su ficha (`FichaDispositivo`, `CapacidadesNodo`), con lo **medido**, nunca lo declarado:
  - `voz.oido`: `[{ motor, idiomas, tiempoReal, flujo }]`;
  - `voz.habla`: `[{ motor, primerSonidoMs, timbres }]`.
- **Relé de voz.** `voz-por-malla.ts` lleva los mensajes `oido.pedir/trozo/fin/error` y `voz.pedir/trozo/fin/error`.
  - Toma el modelo de `ia-por-malla.ts`.
  - Audio en trozos de 16 KB con sha256, como `archivos-malla.ts`.
  - Una petición en vuelo por par y con posibilidad de cancelar.
  - Pasa por el permiso de `capaMeshCompartiendo()`.
- **Elección del servidor de la sesión.** Para cada sesión (tú solo, tu grupo o una llamada) se elige la neurona que mejor oye y habla. Cuenta:
  - menor latencia medida;
  - RAM libre suficiente;
  - que esté encendida y sea de confianza: tus neuronas, o las de los miembros de la sesión.

  Tiene histéresis para no saltar en cada frase. Si se apaga, la siguiente toma el relevo sola. El Oracle A1 (24/7) es servidor de oído para quien no tenga motor propio.
- **Llamadas grupales con bots.**
  - Cada participante transcribe su voz en su propia neurona (o en su servidor de sesión) y comparte el **texto** por el canal de datos de la llamada.
  - Los bots escuchan ese texto. Su respuesta la sintetiza el servidor de voz de la sesión y entra como pista de audio en la llamada, con `omnivoice-mixer`.
  - Turnos: un solo bot habla a la vez, espera al silencio, y una persona siempre puede cortarlo.
- **«Una sola corriente a la vez»** del WebSocket de Phonon: el servidor de sesión tiene una cola y abre una instancia por flujo si le cabe en RAM. Si no le cabe, pasa a tramos por `POST`.

## 6. Conciencia individual, colectiva y del sistema

- **Voz y oído de cada persona.** Los pines de voz y de oído se toman de las capas que ya existen: agente › personalidad › cerebro › neurona › cuenta. Se añade el sentido **«oído»** junto a «voz» en `AuroraSense` y en `neuron-persona-store.ts`.
- **Palabras propias.** Los `hotwords` salen de lo que esa conciencia conoce:
  - la memoria del cerebro;
  - los nombres del grupo;
  - el glosario de StarSeed.
- **Voz del grupo.** Un grupo puede tener su propia voz de bot y su servidor de voz preferido. Se configura en sus ajustes y pasa por las mismas reglas de permisos universales.

## 7. Licencias y atribución

- **Phonon-2:** pesos CC-BY-4.0, código Apache-2.0. Atribución obligatoria donde se use o se describa (ficha de la Biblioteca, créditos de Ajustes › Voz, `config/capas-astraura.json`): «Phonon-2 © Fermion Research, CC-BY-4.0, derivado de NVIDIA Parakeet TDT 0.6B v3».
- **Parakeet TDT 0.6B v3:** CC-BY-4.0, con atribución a NVIDIA.
- **onnx-asr y onnxruntime:** licencias permisivas. Se comprueban al integrar y se anotan en la ficha.
- **Capas:** ninguna capa sin su SHA en `config/capas-astraura.json`. El de Phonon-2 lo da el servidor al arrancar (`sha 98125795…`); el completo sale de la API de Hugging Face.

## 8. Tareas (Ola 1015V, `cola-voz-fusionada-1015.json`)

| Bloque | Tareas |
|---|---|
| Oído | A registro y elector de motores de oído · B cliente `/v1/audio/transcriptions` · C `/asr` del demonio con `motor`, `lang` e `idioma` (y las rutas de clonar que dan 404) · D servidor Parakeet compatible con OpenAI · E instalador del oído (torch de CPU, medidas) · F fichas de la Biblioteca y capas con SHA · G Aurora escucha por el elector · H flujo de Phonon (WebSocket) con parciales · V corrector por glosario de nombres propios |
| Una voz | I puerta única `hablar()` · J ventanas, guía e introducciones · K Genesis, acciones y superposición de Hermes · L notas de voz, Señales y guardia «una sola voz» · M resolutor único de identidad de voz |
| Plática | N interrupción por voz · O acuse y voz del trabajo · P medidas por neurona y motor |
| Malla | Q anuncio de capacidades de voz · R protocolo `voz-por-malla` · S elección del servidor de voz de la sesión · T bots en llamadas grupales · U el A1 como servidor de oído |

Cada tarea toca como mucho 3 archivos y 120 líneas por archivo. Las escribe el enjambre; Claude dirige y verifica en
localhost (Genesis › Voces y `/voces`) y en el A1.
