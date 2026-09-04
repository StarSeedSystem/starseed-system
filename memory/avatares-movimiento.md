# Avatares y movimiento — «Vida StarSeed»

> Fuente de verdad de la Ola 229 (motor) + Ola 232 (sincronía voz↔movimiento) + Ola 234 (mundo de los avatares). Documenta el sistema de movimiento de los avatares del OS y lo que falta por hacer.

---

## 1. Kimodo: el motor de movimiento (texto → movimiento)

**Kimodo** (`kimodo.cpp`) es la herramienta de generación de movimiento de NVIDIA: convierte una **frase de texto en inglés** en una secuencia de rotaciones por articulación (con traslación de raíz), compilada en **C++ con GGML** y liberada bajo **Apache-2.0**. Se ejecuta como un **proceso local** (daemon) gestionado por el usuario en su neurona y produce esqueletos estándar:

| Esqueleto | Articulaciones | Uso |
|---|---|---|
| `smplx22` | 22 | SMPL-X (nivel procedural y por defecto ligero) |
| `soma30` | 30 | SOMA (niveles «Vivo» y «Fluido» con el demonio) |
| `g1-34` | 34 | Unitree G1 (admitido por el demonio) |

Puntos clave:

- **Solo CPU o Vulkan**: no requiere GPU dedicada; los pesos van en formato **GGUF**.
- El daemon escucha en `127.0.0.1:4600` y expone `GET /health` y `POST /motion` (ver `src/lib/avatares/movimiento/daemon.ts`, `PUERTO_MOVIMIENTO = 4600`).
- **Nunca acepta una URL externa**: el OS solo habla con el bucle local.
- Hay una **caché en memoria del servidor** (tope de 200 entradas, 30 min de vida) que devuelve el mismo clip para el mismo `(prompt, esqueleto, segundos, semilla)`.

## 2. Los cuatro niveles del motor

Un único motor para todos los avatares, con cuatro niveles que se adaptan al hardware **sin cambiar la identidad del gesto** (el carácter es el mismo; cambia la precisión del backend). Definidos en `src/lib/avatares/movimiento/niveles.ts`.

| Nivel | Motor interno | Requisitos | RAM | Articulaciones |
|---|---|---|---|---|
| `vivo` | Kimodo local en directo | Demonio local + 8 GB RAM | ~900 MB | 30 |
| `fluido` | Kimodo con lote precalculado + mezcla de clips | Demonio local | ~600 MB | 30 |
| `ligero` | Clips procedurales en navegador (seno/ruido) | WebGPU o WASM SIMD (escritorio) | 0 | 22 |
| `quieto` | Micro-movimiento CSS (respiración) | Ninguno | 0 | 0 |

- La elección la hace `nivelMovimientoPara(capacidades, reducirMovimiento)` y siempre mandan dos cosas por encima de todo: `prefers-reduced-motion` fuerza `quieto`, y la cadena de descenso `vivo → fluido → ligero → quieto` nunca lanza excepciones al UI.
- La cadena de degradación vive en `moverAvatar` (`src/lib/avatares/movimiento/motor.ts`): si un nivel falla, baja al siguiente **manteniendo el mismo gesto**, avisando por `alDegradar`.

## 3. Asignación de avatar a una personalidad

- Cada personalidad de Aurora (`PersonalityProfile`, en `src/lib/aurora/personalities.ts`) tiene un **avatar procedural determinista**: un SVG de orbe de cristal líquido generado a partir de su nombre y rasgos (`src/lib/aurora/persona-avatar.ts`, funciones `proceduralAvatarSvg` / `proceduralAvatarDataUrl`).
- El mismo perfil produce **siempre** el mismo avatar; la paleta (tono, saturación, luz) la marcan sus rasgos (calidez→ámbar, serenidad→azul, creatividad→violeta, análisis→cian).
- Además hay una vía **generada con IA** (Pollinations, gratis y sin clave) vía `generatedAvatarUrl`, con caída honesta al procedural si no hay red.
- El componente universal es `AvatarVivo` (`src/components/avatares/avatar-vivo.tsx`), que acepta tres fuentes: `glb` (model-viewer), `imagen` o `procedural`. Se le pasa `personalidadId` para teñir el gesto con el estilo de esa personalidad.

## 4. Cómo se activa el acompañante en pantalla

- El punto de entrada del OS es `moverAvatar(gesto, opciones)` (`src/lib/avatares/movimiento/motor.ts`), y el puente React es el hook `useMovimiento` (`src/components/avatares/usar-movimiento.ts`), que genera el clip, lo reproduce con `requestAnimationFrame` y expone fotograma a fotograma el estado (`clip`, `nivel`, `fotograma`).
- `AvatarVivo` consume `useMovimiento` y destila el clip al movimiento **2,5D** (balanceo, respiración, énfasis, parpadeo) que un contenedor 2D puede renderizar honestamente — así el mismo avatar "respira" igual en perfil, publicaciones, biblioteca o chat.
- Con `activo:false` el clip se congela sin tirarse (p. ej. chat en pausa) y se reanuda exactamente donde estaba.

## 5. Sincronización del gesto con la voz

En `src/lib/avatares/movimiento/sincronia-voz.ts`:

- La voz emite el evento del puente `starseed:gesto` por `window.dispatchEvent`; el avatar dueño del turno lo escucha y se mueve con lo que se está diciendo.
- `gestoDesdeTexto(texto, opciones)` traduce el texto en español a una frase de movimiento en inglés para Kimodo, detectando la intención (pregunta, saludo, explicación, despedida) y midiendo el énfasis.
- `trocearParaGestos` parte discursos largos en frases de 2–8 s y `anclarAlAudio` re-muestrea el clip para que dure **exactamente** lo que la voz (ni antes ni después).
- La duración del audio se estima a ~170 palabras/minuto con un suelo de 400 ms (`estimarDuracionAudioMs`).

## 6. Aprendizaje del perfil de movimiento

En `src/lib/avatares/movimiento/aprendizaje.ts`:

- Cada señal del usuario (`gustado`, `interrumpido`, `ignorado`, `repetido`) actualiza, por personalidad, un perfil con tres escalas topadas (0,4–1,6): `amplitud`, `ritmo` y `expresividad`, más un mapa de `preferencias` por gesto (rango -10…10).
- Usa una **media móvil suave** con paso que decrece al crecer las muestras (mínimo 5 %), de modo que aprende rápido al principio y se estabiliza después.
- `aplicarPerfil(gesto, perfil)` modula el gesto **antes** de pedirlo al motor, y `sugerirGesto(texto, personalidadId)` pide una frase de movimiento al sistema primario Astraura 1.58-bit con tope de 1,5 s, cayendo a la derivación local `gestoDesdeTexto` si no responde.
- `resumenParaModelo` devuelve el estilo aprendido en una frase lista para usarse como contexto del modelo.

## 7. El mundo de los avatares y su simulación en segundo plano

- Ruta `/mundo-avatares` → `src/app/(app)/mundo-avatares/page.tsx`, que carga dinámicamente (`ssr:false`) `MundoAvatares` (`src/components/avatares/mundo-avatares.tsx`), una escena 3D con React-Three-Fiber.
- La simulación vive en `src/lib/avatares/mundo/simulacion.ts`: genera un mundo inicial de **habitantes** (uno por personalidad, hasta 24) con posición, energía, humor y ocupación, y lo **avanza por ticks** (`mundoInicial` / `avanzar`). Cada habitante explora, conversa, crea obras o descansa; se registran **encuentros** (con tema y vínculo creciente) y **creaciones**.
- La escena avanza la simulación con un `setInterval` de ~1,1 s (velocidad 1×/2×/4×) que se limpia al desmontar y **no anima si la pestaña está oculta**.
- Sin WebGL o con `prefers-reduced-motion`, `MundoAvatares` se degrada a la **crónica** (`CronicaMundo`, `src/components/avatares/cronica-mundo.tsx`): un relato en texto de quién hace qué, encuentros y creaciones.
- Cada habitante usa `AvatarVivo` procedural y su gesto se deriva de la ocupación con `gestoParaOcupacion`, respetando la misma forma `Gesto` del motor único.

## 8. Qué guarda cada clave de localStorage

| Clave | Contenido |
|---|---|
| `starseed.movimiento.nivel` | Preferencia de nivel del usuario (`"auto"`, `"vivo"`, `"fluido"`, `"ligero"` o `"quieto"`) — `motor.ts` |
| `starseed.movimiento.perfil.v1` | Mapa `personalidadId → PerfilMovimiento` (amplitud, ritmo, expresividad, preferencias, muestras, actualizado) — `aprendizaje.ts` |
| `starseed.mundo.avatares.v1` | Estado del mundo `{ estado, timestamp }` (tick, habitantes, creaciones, encuentros) — `simulacion.ts` |

> El propio dock (`starseed.dock.items.v2` y folders asociados) documenta sus claves en `dock-config.ts` / `dock-defaults.ts`; aquí solo se listan las claves propias del movimiento y el mundo.

## 9. Pendiente (falta por hacer)

- **Expresión facial**: el motor genera rotaciones corporales + raíz, pero aún no hay trazado de expresión facial por articulación.
- **Esqueletos con manos**: la animación fina de dedos/muñecas no está resuelta (los esqueletos actuales llegan a 22/30/34 articulaciones corporales, no a dedos individuales).
- **Exportar clips**: no existe todavía un exportador de clips de movimiento a archivo (FBX/GLB/JSON) para reutilizarlos fuera del OS.
- **Precalentado real de Kimodo**: `precalentarMovimiento()` mide el hardware y decide el nivel, pero el precalentado del backend quedó cableado "para la Ola M2" (ver comentario en `motor.ts`); falta confirmarlo contra `/api/movimiento/generar`.
- **Sincronía por audio real**: la duración de la voz se estima por palabras (`estimarDuracionAudioMs`); aún no se lee la duración real del audio sintetizado antes de emitir el gesto.