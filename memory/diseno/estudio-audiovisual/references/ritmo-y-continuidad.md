# Ritmo y continuidad de una sola toma

Guía para los diseñadores de vídeo de StarSeed. Una pieza de una sola toma no es un plano largo sin más:
es una cadena en la que cada plano nace del anterior, lo transforma y prepara el siguiente. El elemento
compartido ya está descrito en [fundamentos-diseno.md](fundamentos-diseno.md) §4 y §5; aquí se trata el
ritmo que lo sostiene y la forma de comprobarlo antes de dar la pieza por buena.

## 1. La toma continua

- **Cada plano nace de algo que sobrevive.** Una barra horizontal se ensancha y su borde se abre en la
  ventana siguiente; una línea fina se dobla hasta formar la rejilla; un círculo de luz se contrae y queda
  como el ojo del símbolo; una tarjeta crece hasta ocupar la pantalla entera. El espectador no ve un
  cambio de escena: ve que lo que ya miraba se ha convertido en otra cosa.
- **La pila de escenas con fundido hace lo contrario.** Cada fundido reinicia la atención y dice, sin
  palabras, que lo anterior ya no tiene que ver con lo que viene. Sirve para un salto de tiempo o para
  cerrar; como pegamento por defecto rompe la causalidad y obliga a empezar de cero en cada plano.
- **La pregunta que decide.** Si congelas el fotograma del límite, ¿el elemento que entra tiene un padre
  visible en el que sale? Si la respuesta es no, no hay continuidad: hay dos piezas juntas.

## 2. La regla del límite entre planos

Antes de animar nada, escribe por cada límite tres datos y solo tres:

| Límite (t) | Qué sobrevive | En qué se convierte | Cuánto dura |
|---|---|---|---|
| 0:03,2 | la barra de horizonte | el marco superior de la ventana | 600 ms |
| 0:07,8 | el punto de luz | la pupila del símbolo | 900 ms |

- **Qué sobrevive:** el elemento con nombre y posición; no vale «el ambiente».
- **En qué se convierte:** forma, materia o función nueva; si no cambia de papel, es un adorno que se mueve.
- **Cuánto dura:** la transformación y el momento en que se asienta, en milisegundos.

Un límite al que le falta uno de los tres datos es un corte por cansancio, no por diseño. La tabla vive
junto al guion y al storyboard, se escribe antes de tocar el HTML y se corrige cuando la pieza cambia.

## 3. La cámara

- **Se adelanta al sujeto.** Empieza a moverse hacia donde va a aparecer lo siguiente, de modo que cuando
  aparece ya está dentro del encuadre. La cámara no persigue: espera y recibe.
- **El latigazo tiene destino.** Un giro rápido sirve para unir dos zonas alejadas cuando el espectador ya
  sabe que la segunda existe y hacia dónde cae. El barrido es parte del movimiento, no una cortina para
  tapar un corte.
- **Vibra solo cuando algo golpea.** Un impacto, un aterrizaje o una ignición justifican una vibración de
  pocos fotogramas con amplitud que decae. Si todo tiembla, nada golpea.
- **Se queda quieta para que lo demás aterrice.** Después de un movimiento fuerte, la cámara se detiene y
  deja que el ojo termine el recorrido. Una deriva constante impide que el nuevo elemento llegue a posarse.

## 4. Los descansos

- Tras cada golpe fuerte, deja **400–900 ms** sin un acontecimiento nuevo: un plano quieto, un silencio o
  las dos cosas. No es tiempo muerto; es el instante en que el oído y el ojo aterrizan.
- El descanso no congela la cola del golpe: el brillo, el eco o la vibración pueden apagarse solos. Lo que
  no ocurre es otro acontecimiento encima.
- Cuenta los descansos en la línea de tiempo. Si no hay ninguno, o no hay golpes de verdad o la pieza
  agota a quien la mira. En vídeo, la entrada de un elemento tarda 600–900 ms; el descanso es lo que viene
  después de que esa entrada termine, no una pausa a mitad de ella.

## 5. Los cortes duros

- **Solo con significado.** Un corte duro marca un cambio de tema, de tiempo o de lugar en el argumento, o
  una puntuación deliberada (un antes y un después). Nunca porque cambió el decorado ni porque el autor se
  aburrió de la toma.
- **Si solo cambia el fondo, se transforma.** Un cambio de color, de textura o de escenario se resuelve
  dentro de la toma; el corte se reserva para lo que de verdad empieza otra cosa.
- **Cada corte se justifica en una frase.** En una pieza de 10–30 s, cero a dos cortes duros es una
  propuesta sana; más de dos exige una razón por cada uno. Si no puedes escribirla, no lo cortes.

## 6. Cómo medirlo con lo que ya tenemos

- **Fotogramas exactos:** `npx hyperframes snapshot <dir> --at t1,t2,t3 --no-end -o stills/` (verificado en
  la referencia de `claude-video-studio`, versión fijada 0.8.181). Por cada límite, toma un fotograma
  antes, uno en el límite y uno después (por ejemplo, −80 ms, 0 y +80 ms).
- **Comparación:** `hyperframes compare` es la orden prevista para contrastar esos fotogramas. En la
  versión instalada en esta máquina no he podido verificar que exista ese subcomando: si no está, se
  comparan los PNG con `_media.gray_frames` y `_media.diff_stats` de `claude-video-studio`, o con ffmpeg.
  Se dice cuál se usó; no se supone.
- **Qué cuenta como pasa:** el elemento superviviente se reconoce en los dos fotogramas; la diferencia
  medida corresponde a la transformación escrita; no hay saltos de centro, escala o luminancia que el
  guion no explique; y no aparece un parpadeo sin contenido nuevo.
- **Tabla de revisión que rellena el agente antes de aprobar:**

| Límite | Qué sobrevive | En qué se convierte | Duración | Pasa o falla |
|---|---|---|---|---|
| 0:03,2 | barra de horizonte | marco de la ventana | 600 ms | pasa |

Sin la tabla completa no hay aprobación. «Se ve bien» no es una medida; el fotograma y su diferencia, sí.

## 7. En StarSeed

- **Duraciones del ADN:** 140–350 ms en interfaz; 600–900 ms por entrada en vídeo; cambio de escena
  400–600 ms y respiración del símbolo de 4–6 s por ciclo (propuestas ya anotadas en `adn-y-tokens.md`).
- **Composición centrada:** el centro es sagrado y cada ventana se centra en su pantalla. Los controles
  persistentes, si existen, llegan desde los bordes; nunca ocupan el centro.
- **Brillo:** una sola pieza protagonista por plano con brillo multicapa; el resto, sombra simple. Nunca
  sobre texto denso ni en más de un elemento a la vez.
- **Curvas del ADN:** `--ease-organic` (`cubic-bezier(0.22, 1, 0.36, 1)`), `--ease-glide`
  (`cubic-bezier(0.16, 1, 0.3, 1)`) y la curva de Genesis (`cubic-bezier(0.22, 0.9, 0.3, 1)`). En vídeo se
  usan las mismas curvas con duraciones de escena; nada lineal salvo un bucle de fondo.
- **Solo `transform` y `opacity`.** Nada de animar ancho, alto, márgenes ni sombras.
- **Herramientas:** `claude-video-studio` para el look, el storyboard y el render; `hyperframes` para
  componer en HTML y sacar fotogramas. Cuando el ADN y la lista de la skill choquen (brillo, composición
  centrada), manda el ADN, como ya dice el `STARSEED.md` de la skill.
- **Referencia de continuidad:** la intro canónica de `identidades.md` une sus planos por corte invisible
  (diferencia media menor que 0,04/255), no por fundido, y cierra rimando con el primer fotograma.
- **Movimiento reducido:** versión con fundidos simples, sin latigazos ni vibración, y sin más de tres
  destellos por segundo.

## 8. Lo que no se hace

- No se instala, copia ni ejecuta onetake: ni su skill, ni sus looks, ni sus plantillas, ni sus películas.
  De ahí solo se toma la idea, reescrita con palabras propias.
- No se tapa la falta de continuidad con una cadena de fundidos.
- No hay deriva de cámara decorativa, vibración sin golpe ni latigazo sin destino.
- No se corta en duro porque cambió el decorado.
- No se rellena el descanso con otro acontecimiento.
- No se animan dimensiones ni márgenes; no se acumulan brillos ni se pone brillo multicapa en cada plano.
- No se inventan datos, cifras ni citas en pantalla; lo que está en desarrollo se dice en desarrollo.
- No se usan fuentes de pago ni se gastan créditos sin storyboard, coste y un sí claro.

Idea de las películas de una sola toma (onetake, PolyForm Noncommercial 1.0.0; solo enlace, sin texto ni código copiado).
