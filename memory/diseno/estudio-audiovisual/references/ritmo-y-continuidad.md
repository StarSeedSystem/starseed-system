# Ritmo y continuidad de una sola toma

Para los diseñadores de vídeo de StarSeed: intros, shorts y vídeos de los programas del OS. Este
documento describe el método de la **toma continua** —una pieza donde cada plano nace del anterior—
frente a la pila de escenas con fundidos. No sustituye a `fundamentos-diseno.md`: allí está el
principio del elemento compartido (un elemento viaja de una escena a la siguiente); aquí va el paso
siguiente, gobernar **todos** los límites de la pieza, no solo el salto destacado, y revisarlos con
medida. Las herramientas siguen siendo `claude-video-studio` y `hyperframes` (`herramientas.md`).

## 1. La toma continua

En la forma habitual, cada escena es una isla: aparece, vive y muere en negro, y el fundido la
cambia por la siguiente. El ojo descansa, pero la pieza no respira: acumula, no evoluciona.

En una sola toma, no hay escenas que nazcan de cero: **cada plano nace de algo que sobrevive del
anterior y se transforma**. Una barra de progreso se abre hasta ser la ventana de la escena siguiente;
una línea de horizonte se repite en rejilla para sustentar una tabla; una cifra se hincha hasta
convertirse en el titular. El sobreviviente es el hilo: si desaparece, la toma se rompió.

La consecuencia práctica: se diseña primero el **camino** —qué elemento cruza cada límite— y después
las escenas alrededor de él: la escena es el marco del elemento, no al revés.

## 2. La regla del límite

Un límite es el instante exacto en que un plano se convierte en el siguiente. Antes de animar
nada, se escribe por cada límite tres cosas:

1. **Qué sobrevive:** el elemento concreto que cruza (una barra, una línea, una cifra, un brillo).
2. **En qué se convierte:** su destino (la barra se abre en ventana; la línea se vuelve rejilla).
3. **Cuánto dura:** la transformación, en milisegundos, dentro del ADN de `adn-y-tokens.md`.

Si alguno de los tres queda en blanco, el límite está mal: se rediseña o se cambia por un corte
duro con significado (§5). Un límite sin superviviente es un fundido disfrazado.

## 3. La cámara

La cámara virtual es un personaje con intención, no un espectador pasivo. Cuatro reglas:

- **Se adelanta al sujeto:** llega antes a donde va a caer lo siguiente. El encuadre apunta al espacio
  vacío que ocupará el próximo elemento un instante antes de que llegue, y así la llegada se siente
  esperada, no sorprendida.
- **Un latigazo hacia donde caerá lo siguiente:** el barrido rápido de cámara es el gesto que une
  dos zonas del cuadro cuando el elemento que cruza aún no se leía. Uno por límite, máximo.
- **Vibra solo cuando algo golpea:** una sacudida de cámara es la reacción a un impacto que ocurre
  en pantalla (una cifra que aterriza, un sello que cae). Sin impacto, sin temblor.
- **Y después, quieta:** tras el golpe la cámara se queda quieta 0,4–0,9 s para que lo demás
  aterrice. Una cámara que nunca descansa convierte cualquier pieza en ruido.

## 4. Los descansos

Tras cada golpe fuerte —la llegada del titular, la resolución de la cifra, el cierre de una jugada—
va un **silencio visual**: un plano quieto de **400–900 ms**, sin movimiento nuevo. Es el descanso
entre frases: fija lo que acaba de pasar, deja leer y prepara el siguiente impulso. No son huecos
rellenables: se planifican igual que los límites y entran en la tabla de §6. Si una pieza necesita
más de un descanso «para leerse», es que el texto pasó de lo que el tiempo admite
(`formatos-y-guiones.md`).

## 5. Cortes duros solo con significado

La toma continua no vive de los cortes, pero tampoco los prohíbe: los **reserva** para los puntos
de giro. Un corte duro está justificado cuando cambia el **tema** —de la demostración del voto a la
réplica en la malla; de la promesa a la cifra real—, no cuando cambia de decorado. Máximo uno o dos
cortes por pieza; si hay que cortar más, el guion sigue siendo una pila de escenas y el problema
está antes que la animación.

En el corte duro valen las mismas reglas: algo sobrevive al vacío —al menos el estilo (registro del
ADN, tipografía, composición centrada) y la continuidad sonora—, y cabe el descanso después.

## 6. Cómo se mide, con lo que ya tenemos

La continuidad no se juzga a ojo: se **mide en cada límite**, con el último cuadro antes y el primero
después, y dos medidas de HyperFrames:

- **`hyperframes snapshot`**: captura el fotograma del límite, antes y después de la transformación.
- **`hyperframes compare`**: superpone los dos fotogramas y deja ver qué permanece y qué cambió; si
  la superposición no muestra nada que sobreviva, el límite falla aunque la animación parezca bonita.

Y una **tabla de revisión** que un agente rellena antes de dar la pieza por buena:

| Límite | Qué sobrevive | En qué se convierte | Duración | Pasa o falla |
|---|---|---|---|---|
| «barra → ventana» | la barra de progreso del arranque | la ventana de la escena nueva | 900 ms | pasa |

Criterios de fallo, verificables: no hay superviviente visible en `compare`; la duración se sale del
ADN de `adn-y-tokens.md`; falta el descanso tras un golpe fuerte; la cámara sigue en movimiento
durante el descanso. Un límite que falla vuelve a §2: no se parchea con efectos.

## 7. En StarSeed

- **Duraciones del ADN** (`adn-y-tokens.md`): 140–350 ms en interfaz; 600–900 ms por entrada en
  vídeo, 400–600 ms por cambio de escena (propuesta para calibrar con Alex). Los descansos de §4
  viven en la escala de vídeo; en interfaz, el aire lo dan los espacios del ADN.
- **Composición centrada** (Alex, 2026-10-19): lo que sobrevive y lo que golpea se dirige al eje;
  el límite se lee desde el centro, no llega de un borde sorpresa.
- **Una sola pieza con brillo multicapa por plano:** el elemento que sobrevive y protagoniza el límite
  puede llevar el brillo multicapa; lo demás queda con sombra simple. Dos protagónicos, no.
- **Curvas del ADN:** `--ease-organic` y `--ease-glide`; nada lineal salvo bucles de fondo. El
  latigazo de §3 es el gesto más rápido de la pieza y aun así usa curva: llega y se frena.
- **Solo `transform` y `opacity`**: la barra que se abre en ventana crece con `scale`, nunca animando
  ancho ni alto; lo que viaja entre planos, con `transform` (translate/scale) y opacidad.
- **Herramientas:** `claude-video-studio` para narración, voz y planos generados; `hyperframes` para la
  composición HTML, el render y la medida de §6 (reglas de Remotion y GSAP: `herramientas.md` §3).

## 8. Lo que no se hace

- **Fundir casi cada límite** para tapar que no hay diseño de continuidad: el fundido con desenfoque
  de `fundamentos-diseno.md` §5 vale para lo que no tiene superviviente natural, no como gesto por
  defecto.
- **Límites sin superviviente**, sin conversión ni duración por escrito.
- **Cámara que no deja de arrastrarse** o que vibra «porque sí», sin impacto en pantalla.
- **Cortes duros como estética** (ritmo de tráiler sobre una demostración del OS).
- **Duraciones fuera del ADN** «porque el timing lo pide»: se calibra con Alex y se anota.
- **Animar anchos, altos o márgenes** en vez de `transform` y `opacity`.
- **Dos piezas con brillo multicapa en el mismo plano**, o un protagónico nuevo por escena.
- **La toma continua al precio de la legibilidad:** manda que se entienda, y vuelve el corte.

---

*Idea de las películas de una sola toma (onetake, PolyForm Noncommercial 1.0.0; solo enlace, sin
texto ni código copiado).*
