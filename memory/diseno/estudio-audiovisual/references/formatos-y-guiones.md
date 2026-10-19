# Formatos, guiones y storyboards

Las duraciones son propuestas de partida para calibrar con los datos de cada canal; las medidas de pantalla
son las estándar de vídeo. Antes de publicar, comprueba las zonas seguras con la plantilla oficial de cada
red (cada app tapa franjas distintas con sus botones).

## 1. Medidas

| Formato | Píxeles | Uso |
|---|---|---|
| 16:9 | 1920×1080 (o 3840×2160) | YouTube, conferencias, web |
| 9:16 | 1080×1920 | shorts, reels, historias |
| 1:1 | 1080×1080 | publicaciones cuadradas |
| 4:5 | 1080×1350 | publicaciones verticales en el muro |

Frecuencia: 24 fps para lo cinematográfico, 30 o 60 fps para interfaz y pantallas.

## 2. Intro de canal (3–7 s)

Beats: siembra del símbolo (punto → dos círculos → ojo → diamante) · entrada cardinal de los tres colores
de la Trinity desde el perímetro · la línea de horizonte (jugada rara) · rótulo «StarSeed» en Rajdhani con
la sección o el canal debajo en Inter · logo sonoro de 1,5–3 s. Haz versiones 16:9 y 9:16, y una corta
(3 s) para piezas breves. Variante por registro (§6 de `adn-y-tokens.md`) para cada canal o sección.

## 3. Vídeo explicativo (60–180 s)

Gancho (0–5 s, una pregunta o una imagen que sorprenda) · situación actual con datos y fuente · el problema
en una imagen · la propuesta StarSeed mostrada con el programa real animado · cómo funciona en tres pasos ·
retos y estado («en desarrollo») · invitación clara. Subtítulos siempre.

## 4. Short o reel (15–45 s, 9:16)

Una idea, un gancho en el primer segundo, texto grande en la franja segura, subtítulos quemados, cierre con
el símbolo y una llamada a la acción.

## 5. Conferencia o presentación

Artefacto Slides desde el Design System «StarSeed OS»: una idea por diapositiva, texto de 28 px o más,
titular/cuerpo 6:1, diagramas con el perfil `starseed`, notas del orador con las fuentes. Apertura con la
intro del canal; cierre con la invitación.

## 6. Página de animación compleja (para grabar o publicar)

HTML con scroll narrativo o escenas por tiempo (HyperFrames si va a vídeo): tokens de `assets/tokens.css`,
transiciones de `transitions-dev`, fondos de `shaders` con respaldo, Three.js para 3D, versión con
movimiento reducido. Rinde a MP4 con HyperFrames para redes.

## 7. Animaciones 3D de programas del OS

Del programa real a la escena: estructura (nodos, capas, flujos) → modelo 3D sencillo y legible
(Three.js o Higgsfield `generate_3d` / `scene_builder_3d_*`) → recorrido de cámara corto (una idea por
plano) → rótulos fuera del centro sagrado. Ejemplos: la malla cristalina que se ordena en retícula; las
capas de Astraura que se adaptan al aparato; Genesis repartiendo tareas a sus agentes; una propuesta que
pasa de idea a votación y a decisión.

## 8. Gráficas y diagramas

Un acento por gráfica (zenith); el resto en neutros. Cada gráfica con fuente y fecha. Revelado animado por
orden de lectura (eje, datos, conclusión), nunca todo a la vez.

## 9. Redacción en español para pantalla

Frases cortas (15 palabras o menos en pantalla), voz activa, una idea por frase, palabras simples y siempre
las mismas para lo mismo, cifras con su unidad y fecha. Lee el texto en voz alta: si no se entiende a la
primera, reescribe.

## 10. Plantilla de guion

| Tiempo | Imagen | Texto en pantalla | Voz | Sonido | Fuente del dato |
|---|---|---|---|---|---|
| 0:00–0:03 | … | … | … | … | … |

## 11. Plantilla de storyboard (por plano)

Número · duración · registro · composición (qué ocupa cada zona de la Trinity) · movimiento (vocabulario
de §5 de `adn-y-tokens.md`) · texto · sonido · herramienta · prueba del ADN que más riesgo corre.
