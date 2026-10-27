# Ritmo y continuidad de la toma única

Documento de trabajo para los diseñadores de vídeo de StarSeed: cómo construir una pieza en la que la
cámara no corta y cada plano nace del anterior. Es el método de ritmo del estudio audiovisual. El
vocabulario visual (paleta, tipografía, cristal, movimiento) manda en `adn-y-tokens.md`; el elemento
compartido entre escenas ya está en §4 y §5 de `fundamentos-diseno.md`: aquí no se repite, se aplica a
la pieza completa.

## 1. La toma continua

- **El plano nace de lo anterior.** Cada plano toma algo que sobrevive del anterior y lo transforma: una
  barra que se abre en la ventana siguiente, una línea que se vuelve rejilla, una tarjeta que crece hasta
  ser el panel. El ojo nunca pierde el hilo porque siempre hay una cosa que se está convirtiendo en otra.
- **Frente a la pila de escenas:** la forma de siempre (escena, fundido, escena nueva desde cero) rompe el
  hilo y obliga al espectador a reconstruir el contexto en cada corte. En una toma continua, la historia
  fluye y la atención no se suelta.

## 2. La regla del límite entre planos

Antes de animar, se escribe por cada límite de la pieza:

- **Qué sobrevive:** el elemento concreto (geometría, color, posición) que atraviesa el límite.
- **En qué se convierte:** su forma en el plano siguiente (la barra → ventana; la línea → rejilla).
- **Cuánto dura:** la duración de la transformación, en milisegundos y con su curva del ADN.

Si un límite no tiene las tres respuestas, ese límite no está diseñado: es un fundido disfrazado. La
tabla de revisión del §6 solo rellena lo que este paso ya escribió.

## 3. La cámara

- **Se adelanta al sujeto:** la cámara ya vuela hacia donde va a estar la acción, antes de que ocurra:
  prepara el sitio donde el siguiente plano va a aterrizarse.
- **Latigazo hacia lo que cae:** al terminar un golpe de contenido, la cámara gira rápido hacia donde va a
  aparecer lo siguiente; el propio giro deja el escenario listo y evita el corte.
- **Vibra solo cuando algo golpea:** sacudida de cámara solo como respuesta a un impacto (un titular que
  aterriza, una cifra que cae); nunca vibración por ornamento.
- **Se queda quieta para aterrizar:** tras el golpe y el latigazo, la cámara se detiene y el resto del
  movimiento (partículas, brillo, texto secundario) aterriza sobre un encuadre estable. El silencio de
  cámara es el molde en el que el detalle se lee.

## 4. Descansos

Tras cada golpe fuerte (el titular, la cifra, la revelación) va un silencio: **400–900 ms** de plano
quieto, sin movimiento de cámara ni entrada nueva. Sin descanso, dos golpes seguidos se tapan y el
espectador no procesa ninguno. El descanso no es tiempo muerto: es lo que hace que la fuerza del golpe
se quede.

## 5. Cortes duros solo con significado

Un corte seco solo cuando cambia el significado: un cambio de tema, de pregunta o de pronóstico, no de
decorado. Si lo que vienen después pertenece al mismo pensamiento, es transformación (§2), no corte. Un
corte duro sin motivo se siente como un error de montaje; con motivo, se siente como decisión.
## 6. Cómo se mide

Con la cadena que ya usamos en el estudio (`herramientas.md`): sobre la composición HTML de la pieza se
renderiza y se miden los fotogramas de cada límite:

1. `hyperframes snapshot` al último fotograma del plano anterior y al primero del plano siguiente de cada
   límite de la tabla del §2.
2. `hyperframes compare` entre esos fotogramas: se comprueba que lo que debía sobrevivir no salta de
   posición, color o escala más allá del margen acordado (cero desajuste en el elemento compartido si el
   límite tiene querido el punto fijo).
3. Se rellena la **tabla de revisión** por límite: `límite | qué sobrevive | duración | pasa o falla`. Un
   agente la rellena y la pega en el documento de la pieza antes de darla por buena; un límite que falla
   devuelve la pieza al paso §2, no se arregla a mano en el montaje final.
## 7. En StarSeed

- **Duraciones del ADN:** 140–350 ms en animaciones de interfaz; 600–900 ms por cada entrada de elemento
  en vídeo (`adn-y-tokens.md` §5). La duración de cada límite del §2 se elige dentro de esos rangos y se
  anota con su curva.
- **Curvas del ADN:** `--ease-organic` para lo orgánico, `--ease-glide` para lo técnico; la cámara también
  con lenta-fácil-rápida (nada lineal salvo bucles de fondo).
- **Solo `transform` y `opacity`:** ni anchos, ni altos, ni márgenes animados; en composición HTML de
  `hyperframes` vale la misma regla que en interfaz.
- **Composición centrada:** el sujeto en el centro óptico y los controles en el perímetro (§7b de
  `adn-y-tokens.md`); el centro del plano nunca lo ocupa un elemento de control.
- **Una sola pieza con brillo multicapa por plano:** el resplandor ambiente + sombra direccional + brillo
  especular en UN elemento por plano (el titular, la tarjeta protagonista); nada de más de una por vista
  ni de brillo multicapa sobre texto denso.
- **Herramientas:** `claude-video-studio` para lo narrado y el material generado, `hyperframes` para la
  composición determinista y las medidas del §6; nada de la herramienta de la referencia original (ver
  `licencias-y-guardas.md`).

## 8. Lo que no se hace

- Pilas de escenas con fundido genérico para disfrazar un hilo que no tiene continuidad diseñada.
- Cambiar de plano para «refrescar» sin que nada sobreviva: cada cambio de escena necesita su elemento que
  cruza el límite, o un corte duro con significado (§5).
- Cámara que nunca se queda quieta, o que vibra sin que nada golpee.
- Golpes seguidos sin descanso de 400–900 ms; el ritmo se mide en silencios tanto como en golpes.
- Más de una pieza con brillo multicapa en el mismo plano, o brillo sobre bloques de texto denso.
- Duraciones fuera de los rangos del ADN, curvas inventadas o `ease: linear` por defecto.
- Copiar texto, plantillas o películas de la referencia con licencia no comercial: se usa solo este
  método, escrito y ejecutado con nuestras herramientas.

Referencia del método: `fundamentos-diseno.md` (§4 «Continuidad» y §5 «Elemento compartido»); el token y
las curvas: `adn-y-tokens.md` (§5); la licencia que obliga a reescribir esta idea en vez de copiarla:
`licencias-y-guardas.md` (fila «onetake»).

> Idea de las películas de una sola toma (onetake, PolyForm Noncommercial 1.0.0; solo enlace, sin texto
> ni código copiado)
