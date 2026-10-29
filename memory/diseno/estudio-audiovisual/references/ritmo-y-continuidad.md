# Ritmo y continuidad: la pieza de una sola toma

Guía de ritmo para los diseñadores de vídeo de StarSeed: cómo encadenar planos para que una pieza
corta (10–30 s) se sienta continua en vez de una pila de escenas con fundidos. Complementa
`fundamentos-diseno.md` (§4–5 ya traen el vocabulario de movimiento y las transiciones del ADN):
aquí se decide **cuándo** ocurre cada cosa y **qué atraviesa** el límite entre un plano y el
siguiente. No repite lo que ya dice ese documento.

## 1. La toma continua: cada plano nace del anterior

Una pila de escenas se construye por acumulación: escena A termina, fundido, escena B empieza de
cero. La toma continua se construye por transformación: en cada límite entre planos, **algo que ya
estaba en pantalla sobrevive y se convierte en lo siguiente**.

- Una barra de progreso que alcanza el 100 % se abre para ser la ventana del siguiente plano.
- Una línea del horizonte se vuelve la rejilla sobre la que aparecen las tarjetas.
- El símbolo del final del plano 2 es el punto de origen del plano 3: no desaparece, cambia de papel.

El detalle importa: no basta con que dos planos compartan algo fuera de pantalla (el mismo color,
la misma posición). El elemento que sobrevive lo hace **en cámara, visible**, y su transformación
ES el corte. Si el espectador puede señalar «aquí pasó de A a B por esto», el límite está bien.

## 2. La regla del límite entre planos

Antes de animar, se escribe una frase por cada límite. Sin tabla, no se anima un segundo más:

- **Qué sobrevive:** el elemento concreto (no «el estilo»: un nodo, una línea, una cifra, el símbolo).
- **En qué se convierte:** su papel en el plano siguiente (una barra → ventana; un punto → rejilla).
- **Cuánto dura:** la transformación, en milisegundos, con su curva.

Ese texto va junto al guion (`formatos-y-guiones.md`) y desemboca en la tabla de revisión de §6: si
un límite no tiene escrito su «qué sobrevive», el plano siguiente aún no tiene motivo para existir.

## 3. La cámara

La cámara de una toma continua no acompaña: **conduce**.

- **Se adelanta al sujeto:** el plano donde caerá lo siguiente ya está insinuado antes de que llegue
  (un hueco en la rejilla, el borde por donde entrará). La mirada aterriza donde la cámara la puso.
- **Un latigazo hacia donde caerá lo siguiente:** en el instante del cambio, un movimiento rápido y
  corto de cámara en la dirección del nuevo plano. Es lo que disimula la transformación: el ojo
  pierde un fotograma y lo que sobrevive ya cambió de papel.
- **Vibra solo cuando algo golpea:** el temblor de cámara es consecuencia de un impacto dentro de la
  escena (un caer, un sello, un latido del símbolo), nunca un adorno.
- **Y luego se queda quieta:** tras cada movimiento fuerte, la cámara se detiene y deja que lo
  demás aterrice. El reposo es lo que hace legible lo que acaba de pasar.

## 4. Los descansos

Un golpe fuerte seguido de otro golpe fuerte no es ritmo: es ruido. Tras cada impacto, un silencio
o un plano quieto de **400–900 ms**. Ese descanso es donde el espectador lee lo que acaba de ver y
el oído prepara el siguiente golpe. Duración orientativa: 400 ms si la pieza corre (shorts, redes),
700–900 ms si hay texto que leer o cierre de sección. En interfaz se traduce en pausa de movimiento:
no todo el cuadro respira a la vez.

## 5. Cortes duros solo con significado

El corte duro sin transformación (el plano cambia de golpe, sin elemento que sobreviva) es un arma,
no la herramienta por defecto. Se usa cuando el cambio es de **tema, no de decorado**: «y esto es
otra cosa distinta». Ejemplos válidos: del manifiesto al producto, del problema a la solución, la
voz en off que cambia de pregunta. Ejemplos inválidos: saltar al plano siguiente «porque toca», o
recortar porque la animación de continuidad costó más trabajo. Si lo único que cambia es el
decorado, el corte es un error: falta escribir el límite de §2.

## 6. Cómo medirlo con lo que ya tenemos

El juicio del ojo se apoya en un control por fotogramas con HyperFrames (Apache-2.0, telemetría
apagada: `HYPERFRAMES_NO_TELEMETRY=1` y `DO_NOT_TRACK=1`, ver `herramientas.md`):

- **`hyperframes snapshot`** sobre los fotogramas raíz de cada límite: un fotograma antes de la
  transformación, otro justo en ella y otro después. Quedan como imágenes comparables.
- **`hyperframes compare`** entre esos fotogramas: comprueba que lo que sobrevive de verdad es el
  mismo elemento (posición/color/tamaño cercanos entre el fotograma final de un plano y el inicial
  del siguiente) y que la pieza se comporta igual en dos renders de la misma composición.

Y la prueba humana, en una tabla que un agente rellena **antes de dar la pieza por buena** (y que va
pegada al documento de la pieza):

| Límite | Qué sobrevive | En qué se convierte | Duración | Pasa o falla |
|---|---|---|---|---|
| 1 | punto del símbolo | línea de horizonte | 600 ms | pasa |
| 2 | barra 100 % | ventana del panel | 800 ms | falla: se corta antes de asentar |

Un límite sin fila, o con la fila vacía, falla por definición.

## 7. En StarSeed: cómo se materializa con el ADN

- **Duraciones del ADN (`adn-y-tokens.md` §5):** 140–350 ms en interfaz y micro-acciones dentro
  del plano; 600–900 ms por entrada de elemento en vídeo; las transformaciones de límite (§2)
  viven en el rango de cambio de escena, 400–600 ms.
- **Curvas, solo las del ADN:** `--ease-organic`, `--ease-glide` y la curva de Genesis. Nada lineal
  salvo bucles de fondo; el latigazo de §3 es aceleración fuerte con frenado largo.
- **Solo `transform` y `opacity`:** ni anchos, ni altos, ni márgenes; la barra que se abre en
  ventana es `scale`/`translate` + desenfoque si toca.
- **Composición centrada (`adn-y-tokens.md` §7b):** en 16:9, título y sujeto en el centro óptico;
  en 9:16, banda central. La transformación de continuidad mantiene el centro sagrado libre.
- **Una sola pieza con brillo multicapa por plano:** el elemento que sobrevive es el protagonista;
  el resplandor viaja con él y el resto del plano usa sombra simple.
- **Herramientas:** se escribe con `claude-video-studio` y se refuerza/renderiza con `hyperframes`
  (ambas con licencia comercial, ver `herramientas.md` y `licencias-y-guardas.md`).

## 8. Lo que no se hace

- Fundido a negro (o a blanco) entre planos que conectan: es la renuncia escrita de la continuidad.
- Dos transformaciones en un mismo límite (dos elementos que sobreviven a la vez): el ojo elige
  una; la segunda es ruido.
- Cámara en movimiento constante para «dar vida»: sin reposo, nada aterriza y el ritmo se diluye.
- Vibración de cámara como entrada o salida de plano: vibra por impacto, no por transición.
- Cortes duros por falta de tiempo o de guion, no por significado.
- Rellenar el límite con destellos o partículas de adorno: el elemento que sobrevive ya es la jugada.
- Medir la pieza solo «a ojo»: sin la tabla de §6, la pieza no queda dada por buena.

---

Idea de las películas de una sola toma (onetake, PolyForm Noncommercial 1.0.0; solo enlace, sin texto ni código copiado).

