# Fundamentos de diseño profesional, aplicados a StarSeed

Cada fundamento trae qué es, cómo se aplica con la marca y un ejemplo desarrollado. Los valores con «propuesta»
son puntos de partida para calibrar; los demás vienen del ADN o de estándares (WCAG).

## 1. Composición

- **Jerarquía:** una cosa manda por vista. Ejemplo: diapositiva «Una persona, una voz»: titular Satoshi 168 px
  centrado, una línea de cuerpo Inter 28 px debajo, el símbolo pequeño abajo; nada más.
- **Centro y perímetro:** el contenido se centra en su ventana; los controles llegan desde los bordes
  (`adn-y-tokens.md` §7b). Ejemplo: una ventana de Genesis abre centrada; la barra de agentes entra desde la
  derecha (control) y el chat desde abajo (raíz).
- **Proporción áurea (1:1.618):** reparte el espacio que rodea al bloque central. Ejemplo: en 1920 px de ancho,
  bloque central de 1186 px y márgenes laterales de 367 px.
- **Rejilla:** base de 4 px; huecos `space-md` a `space-3xl`. En vídeo 16:9, rejilla de 12 columnas con margen de
  seguridad `space-2xl`.
- **Gestalt:** proximidad (lo que va junto, junto), semejanza (mismo papel, mismo estilo), cierre (la vesica
  piscis se lee completa aunque falte un arco), continuidad (la línea de horizonte guía la mirada).
- **Aire:** el vacío es parte del diseño; la densidad del ADN es 6 de 10, no 10.

## 2. Color

- **Cobertura del ADN:** zenith 25 %, horizonte 25 %, lógica 20 %, anchor 10 %, neutro 20 %; el acento total entre
  20 % y 30 % del cuadro (p1).
- **Contraste:** 4.5:1 para texto, 3:1 para texto grande y marcas; tabla medida en `adn-y-tokens.md` §3.
- **Temperatura y sentido:** azul guía y conocimiento, verde creación y vida, ámbar control y valor, carmesí raíz
  y alerta; nunca un mensaje solo por color.
- **Ejemplo desarrollado (gráfica de votación):** fondo noche; barras en `horizonte` (a favor) y `anchor`
  (en contra) con su etiqueta y cifra escritas, porque rojo y verde no se distinguen por igual en todas las
  personas; el total en `logica` como única cifra destacada.

## 3. Tipografía

- **Emparejar por contraste de papel:** Satoshi (display editorial) o Rajdhani (técnico) con Inter (cuerpo).
- **Escala:** titular/cuerpo de 6 o más; como mucho 3 tamaños por escena.
- **Medida:** 45–65 caracteres por línea en cuerpo; interlineado 1.4–1.6 en cuerpo, 0.9–1.05 en display.
- **Ejemplo:** portada de conferencia: «StarSeed» Satoshi 900 a 192 px, interlineado 0.95; subtítulo Inter 400 a
  32 px con 60 caracteres de medida; fecha en Rajdhani 600 a 32 px.

## 4. Movimiento (los principios clásicos de la animación, llevados a interfaz y vídeo)

| Principio | En StarSeed |
|---|---|
| Tiempo y ritmo | 140–240 ms en interfaz; 600–900 ms por entrada en vídeo; pausas para leer (1 s por cada 3–4 palabras en pantalla, propuesta) |
| Aceleración y frenado | curvas `--ease-organic` y `--ease-glide`; nada lineal salvo bucles de fondo |
| Anticipación | el panel retrocede 2 % antes de salir; el símbolo se contrae antes de germinar |
| Continuación y superposición | lo que entra se asienta con un pequeño rebote amortiguado; los elementos de un grupo entran escalonados 40–80 ms (propuesta) |
| Puesta en escena | una sola acción principal a la vez, en el centro |
| Arcos | lo orgánico se mueve en curva; lo técnico (Genesis) en línea recta |
| Acción secundaria | partículas o brillo que acompañan sin robar la atención |
| Exageración | solo en intros y momentos de celebración |
| Estirar y encoger | mínimo y solo en lo orgánico (gotas, semillas) |
| Continuidad | el mismo elemento viaja de una escena a otra (transición de elemento compartido) |
| Accesibilidad | versión con movimiento reducido: fundidos simples sin desplazamiento; nada de más de 3 destellos por segundo |

**Ejemplo desarrollado:** `examples/siembra.html`: la siembra del símbolo con CSS (punto, dos círculos,
ojo, diamante) en 2,4 s y su versión de movimiento reducido.

## 5. Transiciones

- **Entrada cardinal:** desde el borde de su punto de la Trinity, 24 px de recorrido y opacidad 0 → 1.
- **Fundido con desenfoque:** 8 px → 0 de desenfoque y opacidad, para cambiar de escena sin corte.
- **Elemento compartido:** una tarjeta crece hasta ser la ventana (con `transform`, nunca con ancho y alto).
- **Barrido de horizonte:** la línea de horizonte cruza y revela la escena siguiente (jugada rara: una vez).
- **Ejemplo desarrollado:** `examples/transiciones.html` con las cuatro y un botón para repetirlas.

## 6. Elementos 3D animados

- **Forma:** formas de la marca: retícula cristalina (malla), octaedro facetado (diamante), dos anillos que se
  cruzan (vesica piscis), esfera de nodos (red).
- **Luz:** tres puntos (clave, relleno, contra) con el color del registro en la luz de contra.
- **Material:** cristal con transmisión y un poco de rugosidad; metal oro para la alquimia; nunca texturas de
  ruido decorativo.
- **Cámara:** movimientos lentos y con intención (órbita de 10–20 s por vuelta, propuesta); el sujeto en el
  centro.
- **Rendimiento:** pocas mallas y geometría instanciada; en móvil, menos nodos y sin sombras en tiempo real.
- **Ejemplo desarrollado:** `examples/cristal-3d.html` con Three.js (MIT): retícula de nodos que se cristaliza
  alrededor de un diamante que respira; con movimiento reducido queda quieta.

## 7. Iconos, imagen y sonido

- **Iconos:** Lucide, trazo 1.5–2 px, extremos redondeados, 16/20/24 px.
- **Imagen:** luz natural o de estudio limpia; sin clichés de «IA» (cerebros brillantes, circuitos azules
  genéricos); personas reales solo con permiso.
- **Sonido:** logo sonoro de 1,5–3 s con tres notas (una por color de la Trinity) y un acorde que resuelve;
  música sin letras bajo la voz; voz cálida y pausada.

## 8. Accesibilidad e inclusión

Subtítulos siempre; contraste medido; textos alternativos; movimiento reducido; dianas de 44 px; lenguaje
claro; nunca solo color.
