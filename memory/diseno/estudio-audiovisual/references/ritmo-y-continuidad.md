# Ritmo y continuidad de una sola toma

Guía de ritmo para los vídeos de los proyectos de StarSeed: cómo sostener una pieza como una sola
toma continua, medida en cada límite entre planos. La idea se reescribe aquí con nuestras palabras
(ver la cita del final); las herramientas son las del estudio (`herramientas.md`): `claude-video-studio`
y `hyperframes`. Completa, sin repetir, lo que `fundamentos-diseno.md` ya dice del movimiento y de las
transiciones: el elemento compartido que viaja entre escenas (§4) y el elemento que crece hasta ser la
ventana (§5).

## 1. La toma continua

- **El plano nace del anterior.** Algo que ya está en pantalla sobrevive y se transforma en lo que
  viene: una barra de acciones que se abre en la ventana siguiente, una línea que se vuelve rejilla,
  una tarjeta que crece hasta ocupar el cuadro, una esfera que se aplana y se convierte en el suelo
  de la escena. El ojo no pierde nunca su sujeto porque no hay vacío entre plano y plano.
- **No es una pila de escenas con fundidos.** La pila corta, limpia el cuadro con un fundido y monta
  la escena nueva encima: cada fundido apaga la atención que el plano anterior había encendido. En la
  toma continua nada desaparece para aparecer otra vez: lo mismo muta. La diferencia se ve a simple
  vista, y también se mide (§6).
- **Una escena, una mutación.** En cada escena hay una sola transformación protagonista, centrada
  (regla de composición del ADN); lo demás acompaña con opacidad pequeña.

## 2. La regla del límite entre planos

Antes de animar, se escribe una línea por cada límite entre planos, con tres datos:

1. **Qué sobrevive:** el elemento concreto que pasa de un plano al siguiente.
2. **En qué se convierte:** su forma o papel al aterrizar en el plano nuevo.
3. **Cuánto dura:** el tiempo del cambio en milisegundos.

Ejemplo: «límite 2 → 3: la barra del dock sobrevive; se convierte en la ventana del chat que se abre
desde abajo; dura 800 ms». Si un límite no responde a las tres preguntas, no es continuidad: es un
corte de escena disfrazado, y la pieza dejó de ser una sola toma en ese punto. Reescribir el límite
cuesta menos que renderizar la pieza entera dos veces.

## 3. La cámara

- **Se adelanta al sujeto.** El movimiento de cámara empieza justo antes de que se mueva lo que
  importa: un pequeño desplazamiento que insinúa hacia dónde va la escena. Quien mira percibe
  dirección, no sorpresa.
- **Latigazo hacia donde caerá lo siguiente.** El giro rápido (pan o zoom con freno) apunta al lugar
  del cuadro donde aterrizará el siguiente elemento, para que la mirada llegue antes que él.
- **Vibra solo cuando algo golpea.** La sacudida es un dato físico: hay impacto, hay vibración. Sin
  impacto no hay temblor; una cámara que vive temblando miente y marea.
- **Se queda quieta.** Tras cada llegada, la cámara para y sostiene el plano: lo que ha aterrizado
  necesita unos instantes de silencio para verse. La pausa es parte del movimiento, no su ausencia.

## 4. Los descansos

- Tras cada golpe fuerte (un aterrizaje, una cifra que se compacta, el símbolo que se completa) se
  entra en descanso: **400–900 ms** en que nada se mueve o solo queda la respiración del fondo.
- Sin descanso el golpe no aterriza: dos golpes seguidos se funden en ruido. El descanso es lo que
  da el peso: un vídeo de 30 s lleva de tres a cinco, colocados donde hubo impacto y no por relleno.

## 5. Los cortes duros

- Un corte duro solo entra con significado: **cambio de tema**, no de decorado. De «cómo vota el
  grupo» a «cómo se sostiene sin internet» se corta; de «la ventana del chat» a «la ventana del chat
  vista desde otro ángulo» no: eso es una mutación (§1).
- Como mucho dos cortes duros por pieza corta, y telegrafiados: un instante antes se ha retirado el
  énfasis (el sujeto se aquieta o la cámara avanza hacia el borde del cuadro) para que el corte no
  choque contra una mirada en movimiento.

## 6. Cómo se mide

- **Cada límite se revisa en los fotogramas que lo rodean**, no en algún punto dentro de cada plano:
  con `hyperframes snapshot` se capturan el último fotograma antes del límite y el primero después
  (en un render de 30 fps con límite en el segundo 23: `--at 22.9667,23` con `--no-end`), y se miran
  uno junto al otro. Con `hyperframes compare` se contrasta lo capturado contra la versión corregida
  cuando un límite falla y se rehace.
- **Tabla de revisión del límite** (la rellena el agente que escribe la pieza antes de darla por
  buena; se pega bajo el guion):

| Límite | Qué sobrevive | A qué se convierte | Duración | Pasa o falla |
|---|---|---|---|---|
| | | | | |

Un límite «falla» si el elemento sobreviviente no aparece en los dos fotogramas, si la mutación es
otra de la escrita en §2, o si la duración del render no cuadra con la de la tabla.

## 7. Los detalles StarSeed

- **Duraciones del ADN** (`adn-y-tokens.md` §5): 140–350 ms en interfaz; 600–900 ms por entrada en
  vídeo; el descanso de §4 es la excepción deliberada: 400–900 ms de quietud, no de movimiento lento.
- **Composición centrada:** la mutación protagonista va al centro óptico del cuadro; los rótulos, al
  tercio inferior sin tapar nada (§7b del ADN).
- **Una sola pieza con brillo multicapa por plano** (por escena, no por pantalla): si el plano
  anterior ya usó su pieza destacada, la del plano nuevo la sustituye en el mismo hueco visual.
- **Solo curvas del ADN y solo `transform`/`opacity`:** `--ease-organic` y `--ease-glide` (y la curva
  de Genesis en piezas del registro técnico); nada de animar anchos, altos ni márgenes, y el latigazo
  de §3 también se construye así.
- **Herramientas:** se escribe y se mide con `claude-video-studio` y `hyperframes` (con su telemetría
  apagada, `herramientas.md` §2). El medidor de continuidad del proyecto original no se usa: su
  licencia no lo permite (véase la fila nueva de `licencias-y-guardas.md`).

## 8. Lo que no se hace

- Pila de escenas unidas por fundidos (§1), ni el fundido con desenfoque como jugada omnívora: sirve
  para cambiar de escena sin corte, no para disimular que nada sobrevive entre planos.
- Un límite «de continuidad» donde solo cambia el decorado, o un corte duro para ahorrar animación.
- Cámara que vive temblando o que sigue empujando al sujeto cuando ya llegó; descansos que cortan el
  hilo (van donde hubo golpe, no cada diez segundos).
- Texto cinético que se lee mientras se transforma: el texto entra, se asienta en el descanso y solo
  entonces muta (como mucho tres tamaños por escena, «fundamentos-diseno.md» §3).
- Brillo multicapa en más de un elemento por plano, o en la interfaz de trabajo del OS.
- Conseguir todo esto con la skill original copiada ni instalada: PolyForm Noncommercial 1.0.0; su
  método está aquí reescrito y se ejecuta con `claude-video-studio` y `hyperframes`, de licencia que
  permite el uso comercial.

---

*Idea de las películas de una sola toma (onetake, PolyForm Noncommercial 1.0.0; solo enlace, sin texto ni código copiado).*
