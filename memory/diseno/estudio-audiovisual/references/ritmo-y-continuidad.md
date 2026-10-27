# Ritmo y continuidad de una sola toma

Guía para los diseñadores de vídeo de StarSeed: la pieza de una sola toma es una cadena en la que
cada plano nace de algo que ya estaba en pantalla. Se apoya en `fundamentos-diseno.md` §4 y §5 sin repetirlo.

## 1. La toma continua

En la pila de escenas cada plano se cierra con un fundido y el siguiente empieza de cero: el ojo
reconstruye el mundo dos veces y el fundido tapa la costura. En la toma continua hay un testigo que
sobrevive al cambio y se transforma delante del espectador. Una barra de progreso se abre y pasa a
ser la ventana del producto; una línea de horizonte se pliega y se vuelve rejilla; el punto del
símbolo se estira y es el cursor. El espectador no salta: sigue el mismo objeto mientras cambia de
papel.

No hace falta un travelling imposible: hace falta que en cada cambio **algo conocido** siga en
pantalla mientras el resto se transforma. Si nada sobrevive, es un fundido disfrazado.

## 2. La regla del límite entre planos

Antes de animar nada, escribe cada límite. Si no puedes rellenar las tres respuestas, el límite no
está pensado y se leerá como un corte disfrazado.

1. **Qué sobrevive:** un elemento concreto, visible en el último fotograma del plano anterior.
2. **En qué se convierte:** su nueva forma o su nueva función en el plano siguiente.
3. **Cuánto dura:** los milisegundos de la transformación, contados y anotados.

El testigo tiene que ser el mismo objeto, no dos parecidos colocados cerca. Cambiar de forma vale;
cambiar de identidad sin transición, no. La duración se decide aquí, no en el editor: lo que se
alarga sin motivo se convierte en espera, y lo que se acelera se convierte en parpadeo.

## 3. La cámara

La cámara de una sola toma tiene oficio de operador, no de adorno. Cuatro reglas:

- **Se adelanta al sujeto.** Empieza a moverse antes de que el sujeto arranque, para que el
  espectador llegue con él y no detrás.
- **Da el latigazo hacia donde caerá lo siguiente.** El giro rápido termina donde va a aparecer el
  próximo elemento; nunca gira hacia el vacío para volver.
- **Vibra solo cuando algo golpea.** La vibración es una consecuencia del impacto, no un estilo. Un
  temblor sin golpe se nota falso.
- **Se queda quieta para que lo demás aterrice.** Después del movimiento, la cámara se detiene y el
  elemento que entra termina de asentarse en una imagen estable.

En StarSeed la cámara respeta el centro sagrado: el sujeto pasa por el centro óptico y los
movimientos nacen y vuelven a él. En móvil y vertical se replantea la escena, no se recorta.

## 4. Los descansos

Después de cada golpe fuerte —un impacto visual, un cambio de plano, una frase que manda— deja
**entre 400 y 900 ms** de silencio o de plano quieto. Ese hueco no es tiempo perdido: es donde el
espectador entiende lo que acaba de ver y donde el siguiente movimiento puede despegar.

- El descanso puede ser imagen fija, movimiento mínimo o silencio de banda, pero no las tres cosas
  a la vez.
- Antes del descanso se cierra la acción; después empieza otra. Un descanso en mitad de un gesto
  parece un tirón.
- Si la pieza encadena tres golpes sin respirar, el ritmo se vuelve ruido y el tercero ya no se
  siente.

## 5. Cortes duros solo con significado

El corte duro —sin fundido ni testigo— se reserva para un cambio de tema o de capítulo, nunca para
cambiar el decorado. Se permite cuando la pieza pasa de un asunto a otro y conviene que el
espectador lo sienta como un escalón. No se permite para disimular que un plano no enlazaba, ni
para ahorrar el trabajo de encontrar el testigo.

Regla práctica: si al quitar el corte el mensaje no cambia, sobra; si se confunde el tema, es correcto y lleva descanso.

## 6. Cómo medirlo con lo que ya tenemos

La continuidad se comprueba en el fotograma, no de memoria. Con HyperFrames apagando la telemetría
(`HYPERFRAMES_NO_TELEMETRY=1 DO_NOT_TRACK=1`):

- **Los dos fotogramas del límite:** `npx hyperframes snapshot <dir> --at <último-antés>,<primero-después>
  --no-end -o stills/` captura el instante exacto, sin redondear al fotograma. El último fotograma
  antes de un corte en 30 fps es `(Math.ceil(corte × fps) - 1) / fps`.
- **La tira alrededor de cada corte:** `npx hyperframes snapshot <dir> --review` entrega cinco
  fotogramas por costura (`review-seam-NN.jpg`), que enseñan el salto completo y no solo el par.
- **Contra una referencia:** `--against <vídeo>` guarda el fotograma de la referencia en los mismos
  tiempos y una hoja emparejada render|referencia.
- **Variantes de la pieza:** `npx hyperframes compare <dir-a> <dir-b> --at <t> --labels a,b` junta
  las variantes en una hoja etiquetada. Compara composiciones distintas en el mismo instante, no
  dos fotogramas del mismo render: sirve para elegir entre dos cortes o dos formatos.

Antes de dar la pieza por buena, un agente rellena esta tabla con los datos medidos. Si una fila no
tiene las cuatro casillas, la pieza no se aprueba.

| Límite (s) | Qué sobrevive | Duración (ms) | Pasa o falla |
|---|---|---|---|
| | | | |

Criterio: **pasa** si el testigo se reconoce en los dos fotogramas, su transformación cae dentro del
presupuesto y no hay parpadeo en la costura; **falla** si cambia de sitio sin motivo, si aparece y
desaparece, o si el descanso posterior queda por debajo de 400 ms.

## 7. En StarSeed

- **Duraciones del ADN:** 140–350 ms para el movimiento de interfaz; 600–900 ms por cada entrada en
  vídeo. El límite entre planos no inventa una tercera escala: usa una de las dos.
- **Composición centrada:** el testigo cruza el centro óptico; el vacío alrededor es parte del
  diseño, no espacio por rellenar.
- **Una sola pieza con brillo multicapa por plano:** el testigo puede ser la pieza protagonista y
  llevar el brillo; el resto, sombra simple y contención.
- **Curvas del ADN:** `--ease-organic` y `--ease-glide`; nada lineal salvo un bucle de fondo.
- **Solo `transform` y `opacity`:** nunca ancho, alto, márgenes ni filtros animados por fotograma.
- **Herramientas:** `claude-video-studio` y `hyperframes`, ya instaladas con licencia que permite el
  uso comercial. La intro canónica de `identidades.md` manda sobre cualquier apertura o cierre.
- **Movimiento reducido:** sin desplazamiento, el testigo se conserva con opacidad y encuadre fijo.

## 8. Lo que no se hace

- No se copian ni se instalan la skill, los looks, las plantillas ni las películas de onetake; nada suyo se ejecuta.
- No se tapa un enlace roto con un fundido ni con un barrido decorativo.
- No se agita la cámara por estilo ni se vibra sin un golpe que lo justifique.
- No se encadenan golpes sin descanso ni se estira un descanso hasta que la pieza se duerme.
- No se animan dimensiones ni se usan más de tres destellos por segundo.
- No se da por buena una pieza sin la tabla del §6 rellena con fotogramas medidos.

*Idea de las películas de una sola toma (onetake, PolyForm Noncommercial 1.0.0; solo enlace, sin
texto ni código copiado).*
