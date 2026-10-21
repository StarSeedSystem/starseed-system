# Guías de introducción: todo el sistema explicado con ejemplos vivos para perfiles nuevos (Ola 1021G)

Petición de Alex (2026-10-21): «en las ventanas de introducción en las guías a perfiles nuevos del funcionamiento del
sistema debe incluir las explicaciones dinámicas también de la Protomolécula, de las redes mesh, las capas de
conciencia, las neuronas de los cerebros y los 3 pilares de la red social (las funciones principales de cada área
dentro de cada parte de política, educación y cultura), y una introducción a la Librería y Biblioteca, Genesis y
PoliGenesis y sus opciones de personalización ilimitadas con base a los principios y fundamentos y seguridad y
privacidad».

## 1. Lo que hay hoy

- **Tour de Aurora** (`src/components/onboarding/aurora-guide.tsx`): 12 pasos (`orbe`, cuatro de Trinity,
  `gestos-hibridos`, `escritorio`, `dashboard`, `astraura`, `perfil`, `cerebros`, `libreria`), cada uno con su
  demostración animada (`aurora-guide-demos.tsx` → `StepDemo`), voz opcional de Aurora, «Ir/mostrar» y «Hazlo por mí».
- **Guía de la red** (último paso del asistente, `areas-explicadas.tsx`): 15 tarjetas con «qué es · cómo funciona ·
  por dónde empezar».
- **Sin cubrir:** Protomolécula, capas de conciencia, la neurona como aparato, los tres pilares (salvo `/decisiones`
  y `/hub`), Genesis y PoliGenesis, y la personalización segura.
- **Textos que contradicen el código de hoy:** la tarjeta de Cerebros habla de «varios cerebros» y lleva a
  `/cerebros` (hoy: un cerebro por cuenta, sección `/cerebro`, pestañas Privados/Públicos); el paso y la tarjeta
  de la Librería mezclan Librería y Biblioteca; la tarjeta de la Red Mesh solo habla de LoRa.

## 2. Reglas de contenido

- **Una sola fuente de textos**, que usan a la vez el tour y las tarjetas: `src/lib/onboarding/guia-temas-sistema.ts`
  y `guia-temas-red.ts` (puros). Cada tema: `{key, titulo, cuerpo, voz, ruta, preguntaAurora, puntos[]}`.
- **Honestidad:** nada que no exista se explica como si existiera. Lo que está en camino se dice «en camino». La
  verificación biométrica de «una persona, una voz» aún no existe: no se menciona como hecho.
- **Dinámicas:** cada tema tiene su mini demostración animada (framer-motion, en bucle suave, respeta reduced-motion)
  y su «Hazlo por mí» o «Ir» a la ruta real. Se adapta al aparato (táctil, ratón, híbrido) como el resto del tour.
- **Cuentas que ya vieron la guía** reciben UNA vez el aviso «Novedades de la guía: 10 temas nuevos», que abre el
  tour en el primer tema nuevo (regla de propagación: lo nuevo llega también a las cuentas existentes).

## 3. Textos (fuente de verdad; `voz` es la versión corta que narra Aurora)

**protomolecula** · Protomolécula · `/protomolecula`
- cuerpo: «La Protomolécula es la función universal de creación: une programas abiertos de imagen, audio, vídeo, 3D,
  físicas y realidad extendida bajo un mismo panel de parámetros. Cada creación es una molécula viva hecha de átomos
  (herramientas), que puedes manejar a mano, dictando o pidiéndoselo a Astraura. Cita en vez de copiar, y su orbe 4D
  te acompaña: arrástrala al borde izquierdo para apagarla.»
- voz: «La Protomolécula une programas abiertos de imagen, audio, vídeo y 3D en un solo panel. Tus creaciones son
  moléculas vivas hechas de átomos.»
- puntos: moléculas con su ámbito (personal, perfil, grupo, pública) · átomos = herramientas, con su grado de
  integración · a mano, por dictado o con Astraura · la IA propone y tú aceptas · orbe 4D de geometría sagrada.
- preguntaAurora: «Aurora, abre la Protomolécula»

**malla** · Redes mesh · `/red-mesh`
- cuerpo: «Tus aparatos forman una malla: se vinculan solos entre sí cuando hay dos o más conectados de tu cuenta, y
  pueden hablar sin internet con un código o un QR, por Wi‑Fi o por radio LoRa (Meshtastic). Por radio viajan
  mensajes cortos, nunca audio. Con otras cuentas solo hay vínculo si las dos lo aceptan, y nada privado viaja sin
  cifrar.»
- voz: «La malla une tus aparatos y funciona incluso sin internet, por Wi‑Fi, por código QR o por radio LoRa.»
- puntos: autovínculo de tus neuronas · sin internet: QR o código · LoRa para texto corto · malla y Wi‑Fi a la vez ·
  posición apagada por defecto y tú decides qué retransmites.
- preguntaAurora: «Aurora, abre la red mesh»

**capas-conciencia** · Capas de conciencia · Ajustes → Inteligencia
- cuerpo: «Astraura piensa en cuatro capas: local (tu aparato), malla (tus otras neuronas), nube y colectiva. Puedes
  encender o apagar cada una y decir cuánto prefieres lo local; si apagas la malla, nada entra ni sale por ella. Lo
  pesado lo prestan servidores de la red cuando tu aparato no puede, y tus datos viajan con capas de seguridad:
  identidad propia, cifrado de extremo a extremo y claves que cambian solas.»
- voz: «Astraura piensa en cuatro capas: local, malla, nube y colectiva. Tú decides cuáles usa.»
- puntos: los cuatro puntos de la píldora en el chat · lo local primero · servidores que prestan capacidad · cifrado de
  extremo a extremo · la capa colectiva está en camino.
- preguntaAurora: «Aurora, enséñame mis capas de conciencia»

**neuronas-cerebro** · Neuronas y cerebro · `/cerebro`
- cuerpo: «Cada aparato donde usas StarSeed es una neurona, y cada forma de abrirlo (navegador, app) es un medio.
  Tus neuronas alimentan tu cerebro: memorias, baúles, conexiones, IA, permisos y servidores. Tienes un cerebro por
  cuenta, con su parte privada y la pública de tus grupos y páginas; puedes fusionar cerebros o vincularlos por
  telepatía sin mezclarlos.»
- voz: «Cada aparato es una neurona de tu cerebro. Tu cerebro guarda memorias, conexiones y permisos.»
- puntos: neurona = aparato, medio = forma de abrirlo · un cerebro por cuenta, privado y público · fusionar o
  telepatía · privacidad y cifrado por memoria o carpeta · Google Drive como medio de memoria.
- preguntaAurora: «Aurora, abre mi cerebro»

**pilar-politica** · Política: gobierno directo · `/network/politics`
- cuerpo: «Aquí no hay representantes: propones leyes y proyectos, los debates con enmiendas y votas. Puedes delegar
  tu voto en quien sepa de un tema y retirarlo cuando quieras. El poder se reparte en Legislativo (decisiones en vivo
  y el Consejo de Aurora), Ejecutivo (mandatos aprobados y recursos comunes) y Judicial (constitucionalidad y Círculos
  de Paz para mediar, nunca castigar).»
- voz: «En Política propones, debates y votas sin intermediarios, y puedes delegar tu voto y retirarlo cuando quieras.»
- puntos: nueva propuesta · voto líquido revocable · solo se ejecuta lo que cumple tiempo, participación y umbral ·
  votos públicos · Círculos de Paz.
- preguntaAurora: «Aurora, llévame a Política»

**pilar-educacion** · Educación: aprender juntos · `/network/education`
- cuerpo: «La red de categorías y temas y el Mapa del Conocimiento (en lista, 2D o 3D) te llevan a lo que quieres
  aprender. En Estudio con Aurora tienes guías e itinerarios, exámenes con insignias, grupos de estudio, tareas y
  proyectos, y la Biblioteca universal a un toque.»
- voz: «En Educación exploras el Mapa del Conocimiento y estudias con Aurora: itinerarios, exámenes con insignias y
  grupos de estudio.»
- puntos: mapa del conocimiento · estudio con Aurora · insignias por lo aprendido · grupos de estudio · aulas con
  agentes en camino.
- preguntaAurora: «Aurora, llévame a Educación»

**pilar-cultura** · Cultura: crear y encontrarse · `/network/culture`
- cuerpo: «Publica y crea en el Lienzo Universal o en una pizarra, mira lo que está en vivo, sigue tendencias y la
  agenda de encuentros, y entra al Multiverso inmersivo. Tu obra es una entidad única: se comparte por referencia y
  sus cambios llegan a todas partes.»
- voz: «En Cultura creas, compartes y te encuentras: publicaciones, en vivo, agenda y el Multiverso.»
- puntos: para ti, siguiendo, tendencias, explorar · en vivo y mapa global · agenda de encuentros · Multiverso ·
  crear en el Lienzo o la pizarra.
- preguntaAurora: «Aurora, llévame a Cultura»

**libreria-biblioteca** · Librería y Biblioteca · `/library`
- cuerpo: «La Librería es el catálogo en línea de toda la red: apps, repos, diseños y recursos que se actualizan solos
  desde sus fuentes. Tu Biblioteca es lo que tú (o tu página, grupo o comunidad) guardas: referencias organizadas en
  carpetas, nunca copias, así que siempre ves la última versión.»
- voz: «La Librería es el catálogo de toda la red; tu Biblioteca, lo que tú guardas de él.»
- puntos: instalar y actualizar solas · repos de la comunidad y de GitHub · biblioteca por persona o grupo ·
  referencias, no copias · versiones y comentarios.
- preguntaAurora: «Aurora, abre la Librería»

**genesis** · Genesis y PoliGenesis · `/genesis`
- cuerpo: «Genesis es tu taller del sistema: pides en tus palabras un cambio de perfil, páginas, apariencia, dock o
  widgets, o un agente nuevo, y ves la propuesta antes de aceptarla; siempre puedes deshacer. PoliGenesis hace lo
  mismo para grupos y páginas: si el grupo es democrático (lo normal), cada cambio es una propuesta que se vota.»
- voz: «En Genesis pides cambios del sistema en tus palabras; en PoliGenesis, tu grupo los decide votando.»
- puntos: Mi Genesis · vista previa y deshacer · PoliGenesis democrático o con roles · MetaGenesis es el código del OS
  (para desarrolladores).
- preguntaAurora: «Aurora, abre Genesis»

**personalizacion-segura** · Personalización ilimitada y segura · Genesis y Ajustes
- cuerpo: «Puedes rehacer tu interfaz entera con la IA, compartirla y usar la de otros, porque la interfaz es un dato,
  no un programa: nadie ejecuta código de nadie. Hay un núcleo que nada puede quitar: salida siempre, identidad
  soberana, permisos visibles, navegación fundamental, voto íntegro, datos honestos y deshacer. Lo personal es
  privado y cifrado; lo que ejerce poder público, transparente.»
- voz: «Puedes cambiarlo todo y compartirlo, con un núcleo de seguridad que nada quita.»
- puntos: la interfaz es un dato · núcleo intocable de siete reglas · lo compartido se revisa antes de instalar ·
  memoria personal › perfil › grupo › pública · tu clave no sale de tu aparato.
- preguntaAurora: «Aurora, ¿qué puedo personalizar?»

Correcciones de textos existentes: el paso y la tarjeta `cerebros` pasan a `neuronas-cerebro` (ruta `/cerebro`); el
paso y la tarjeta `libreria` usan `libreria-biblioteca`; la tarjeta `/red-mesh` usa `malla`.

## 4. Tareas del enjambre (cola `cola-guias-introduccion-1021.json`)

GUI1021A (textos del sistema), GUI1021B (textos de la red), GUI1021C (pasos nuevos en el tour), GUI1021D y GUI1021E
(demostraciones animadas), GUI1021F (las demostraciones en el tour), GUI1021G (tarjetas de la Guía de la red),
GUI1021H (aviso de novedades para cuentas que ya vieron la guía).

## 5. La guía completa sin cuenta y en cualquier medio (Alex, 2026-10-21)

«Esa guía de introducción completa debe poder ser ejecutable en cualquier medio desde la ventana de inicio de sesión
y en Ajustes y en cada ventana que solicite inicio de sesión, incluso sin tener que crear una cuenta.»

Lo que hay hoy: `AuroraGuide` está montada en el layout raíz (todas las rutas salvo `/voces`), pero su panel va en
`z-[95]` y la pantalla de acceso (`AuthGate`, z 200) y la bienvenida (`WelcomeWindow`, z 210) la tapan; Ajustes ya
tiene «Ver la guía» (`guide-button-toggle.tsx`), pero solo con sesión; y unas 30 ventanas dicen «Inicia sesión
para…» con su propio texto suelto y sin ningún acceso a la guía.

- **Una sola puerta:** `src/lib/onboarding/guia-acceso.ts` → `abrirGuia({desde, temaInicial?})` lanza el evento
  `starseed:open-guide` (el mismo de siempre) con de dónde se abre (`login`, `bienvenida`, `ajustes`, `aviso`,
  `boton`) y, si se quiere, el tema por el que empezar.
- **Sin cuenta (modo invitado):** la guía entera funciona: textos, demostraciones animadas y voz si el aparato la tiene
  (si el puente de Aurora no está cargado, va en texto y lo dice). «Ir» y «Hazlo por mí» se sustituyen por
  «Disponible al entrar» (detrás está la pantalla de acceso); lo visto se guarda en el aparato y, al entrar con una
  cuenta, se une a la marca de la cuenta. El último paso ofrece «Crear cuenta», «Entrar» y «Explorar sin cuenta».
- **Por encima de cualquier ventana de acceso:** abierta desde una de ellas, la guía se pinta por encima (z 240) y al
  cerrarla se vuelve a la misma ventana, sin perder lo escrito.
- **Dónde está el botón:** «Conoce StarSeed (sin cuenta)» en `AuthGate` (Entrar y Crear cuenta), en la bienvenida y en
  el aviso de retomar sesión; en Ajustes, «Ver la guía de introducción» con la lista de temas para empezar por
  cualquiera; y en cada aviso «Inicia sesión para…», que pasa a ser UN componente común (`AvisoSesion`: el texto, el
  botón de iniciar sesión y «Conoce StarSeed»). Una guardia impide nuevos avisos sueltos.
- **Cualquier medio:** web, PWA y app nativa (la misma interfaz), móvil y tableta (diseño adaptable, táctil, teclado,
  movimiento reducido); en XR, desde los paneles 2D del hub. En sesión inmersiva de WebXR el DOM no se ve: la guía se
  abre al salir de ella (dicho como tal, no prometido dentro).

Tareas (cola `cola-guias-sin-cuenta-1021.json`): GUI1021I (puerta común y modo invitado, puro), GUI1021J (la guía
sin cuenta y por encima del acceso), GUI1021K1 y K2 (botones en las ventanas de acceso), GUI1021L (`AvisoSesion`),
GUI1021M1–M5 (los avisos sueltos pasan al componente común), GUI1021N (guardia), GUI1021O (Ajustes con lista de temas).
