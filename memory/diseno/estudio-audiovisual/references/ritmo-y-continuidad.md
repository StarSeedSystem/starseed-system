# Ritmo y continuidad de una sola toma

Para los diseñadores de vídeo de StarSeed. Una pieza corta (10–30 s, hasta ~60 s con narración) se
siente viva cuando no es una pila de escenas, sino **un solo movimiento que se transforma**. Esta
guía fija cómo se escribe ese movimiento, cómo se mide en cada límite y qué no se hace. El elemento
compartido que viaja entre escenas ya está en `fundamentos-diseno.md` §5; aquí se lleva un paso más
allá: no solo viaja, **se convierte** en la siguiente cosa.

## 1. La toma continua

Cada plano nace de algo que sobrevive del anterior y se transforma a la vista. La continuidad no es
un fundido: es una forma que cambia de papel sin desaparecer.

- una barra de progreso se abre y se convierte en la ventana del programa;
- una línea de horizonte se dobla y se vuelve la rejilla de la malla;
- el ojo del símbolo se abre como un círculo de luz y ese círculo descubre la escena siguiente;
- una tarjeta crece hasta ser el panel completo (con `transform`, nunca con ancho y alto);
- una partícula del fondo se acerca y resulta ser el nodo que manda.

Frente a eso, la pila de escenas con fundidos reinicia la atención en cada corte, tapa la falta de
relación y hace que la pieza se recuerde como diapositivas. Regla práctica: **de tres a seis
transformaciones** por pieza corta, no treinta. Cada una es un solo gesto con un solo reloj.

## 2. La regla del límite entre planos

Antes de animar nada, escribe una fila por cada límite. Si no sabes qué sobrevive, todavía no hay
toma continua: hay dos escenas pegadas.

| Límite | Qué sobrevive | En qué se convierte | Duración | Pasa o falla |
|---|---|---|---|---|
| 4,20 s | el borde superior de la barra | el marco de la ventana | 700 ms | pasa |
| 9,80 s | el centro del ojo | el foco de la rejilla | 600 ms | falla: el ojo se desvanece |
| 15,30 s | la dirección de la línea | el eje de la espiral | 900 ms | pasa |

- **Qué sobrevive:** una forma, un color, una posición, una luz o una dirección. Uno principal; dos
  como mucho.
- **En qué se convierte:** la forma siguiente, no un adorno nuevo.
- **Duración:** los milisegundos del gesto, contados en el reloj de la composición.
- **Pasa o falla:** se rellena mirando los fotogramas del límite (§6), nunca de memoria.

Si una fila se queda vacía, el límite no existe y no se anima. Un corte duro se anota como corte
(§5), no se disfraza de transformación.

## 3. La cámara

La cámara no sigue: **se adelanta**. Empieza a moverse antes que el sujeto, para que el sujeto
llegue a un encuadre que ya estaba yendo hacia él. Cuando el siguiente elemento va a caer, el
latigazo apunta hacia allí, no hacia atrás.

- **Vibra solo cuando algo golpea.** Un impacto, una caída, un cierre de puerta. Nunca de fondo.
- **Se queda quieta para que lo demás aterrice.** La quietud de la cámara es lo que permite leer el
  descanso (§4).
- **Movimientos grandes:** 600–900 ms, con `--ease-glide`. Movimientos de enlace: 140–350 ms en
  interfaz y 600–900 ms en vídeo, con `--ease-organic` (`adn-y-tokens.md` §5).
- Solo `transform` y `opacity`; nada de animar anchos, altos ni márgenes.

## 4. Los descansos

Después de cada golpe fuerte, **400–900 ms** de silencio o de plano quieto. Un golpe es un
impacto, una revelación o el cambio de idea que el público tiene que entender.

- Baja el sonido o cállalo; para la cámara; no entra información nueva.
- Si la pieza se ve congelada, deja una respiración mínima (escala 1 → 1,01), pero nada que compita.
- Sin descanso, todos los golpes se convierten en un solo grito y el público no sabe qué mirar.

## 5. Cortes duros solo con significado

En una sola toma, el corte duro es la excepción. Se permite cuando cambia **el tema**, no el
decorado: un salto de tiempo, un cambio de argumento o el paso a otra voz. También cuando el golpe
cae exacto sobre el corte y el silencio de después lo justifica.

No se corta para esconder una transición que no supimos resolver, para acelerar el ritmo ni para
cambiar de fondo. Si dos fotogramas se parecen, cortarlos produce un salto que distrae. Si el corte
puede ser una transformación, se hace la transformación.

## 6. Cómo medirlo con lo que ya tenemos

1. **Saca los fotogramas del límite** con `snapshot`, el último antes y el primero después
   (`t_antes = (ceil(t * fps) - 1) / fps`, `t_despues = t`):
   `npx hyperframes snapshot <proyecto> --at <t_antes,t_despues> --no-end -o stills/`
2. **Compáralos** con `hyperframes compare`, que monta una hoja etiquetada de variantes en un
   instante: `npx hyperframes compare <a> <b> --at <t> --labels antes,despues --out comparar.png`.
   Comprobado en la CLI 0.8.217; no figura en la documentación de la 0.8.172–0.8.181 que tenemos en
   `vendor/`, así que si no está, compara los dos PNG con la diferencia de píxeles de
   `loop_check.py` y dilo. Lo que se mide es lo mismo: qué sobrevive, sin saltos ni frames en negro.
3. **Rellena la tabla de revisión** (§2) con el resultado. Un agente no da la pieza por buena hasta
   que cada límite tiene su fila, sus dos fotogramas y su «pasa».
4. **Complemento:** `python3 scripts/pacing_check.py <draft.mp4>` avisa de huecos muertos y de
   destellos; `loop_check.py` comprueba el cierre si la pieza va en bucle.

## 7. En StarSeed

- **Duraciones del ADN:** 140–350 ms en interfaz; 600–900 ms por entrada en vídeo; cambio de
  escena 400–600 ms; respiración del símbolo 4–6 s por ciclo (`adn-y-tokens.md` §5).
- **Composición centrada**, con el centro sagrado libre; los controles llegan desde el borde.
- **Una sola pieza con brillo multicapa por plano**; el resto con sombra simple.
- **Curvas del ADN:** `--ease-organic` `cubic-bezier(0.22, 1, 0.36, 1)` y `--ease-glide`
  `cubic-bezier(0.16, 1, 0.3, 1)`. Nada lineal salvo bucles de fondo.
- **Herramientas:** `claude-video-studio` (galería, estilos, stills, ritmo y bucle) y `hyperframes`
  (render, snapshot, compare, lint). Nada de Remotion (licencia) ni GSAP en el editor del OS.
- La intro canónica de `identidades.md` es el ejemplo vivo: sus empalmes son cortes invisibles
  (diferencia media < 0,04/255), no fundidos.

## 8. Lo que no se hace

- Pegar escenas sin relación y tapar las juntas con fundidos.
- Encadenar transformaciones que no comparten nada: eso es una pila disfrazada.
- Mover la cámara o vibrar como adorno.
- Cortar cada uno o dos segundos para «dar energía».
- Meter información nueva durante el descanso o llenarlo de partículas.
- Copiar, instalar o ejecutar la skill, los looks, las plantillas, las películas ni el README de
  onetake: su licencia es PolyForm Noncommercial 1.0.0 y el uso comercial exige su versión de pago.
- Más de tres destellos por segundo, o animar dimensiones en vez de `transform`/`opacity`.

---

Idea de las películas de una sola toma (onetake, PolyForm Noncommercial 1.0.0; solo enlace, sin texto ni código copiado).
