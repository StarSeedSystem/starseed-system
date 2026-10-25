# Ritmo y continuidad de una sola toma

Guía para los diseñadores de vídeo de StarSeed: cómo encadenar planos sin que la pieza se sienta como una pila
de escenas y cómo comprobarlo antes de dar nada por bueno. La idea viene de las películas de una sola toma de
onetake (nota final); aquí está reescrita con palabras propias y se ejecuta con `claude-video-studio` y
`hyperframes`, que ya tenemos con licencia comercial. Para curvas, duraciones de base y vocabulario de movimiento
manda `fundamentos-diseno.md`; este documento solo añade ritmo y continuidad entre planos.

## 1. La toma continua

Una toma continua no es un plano largo: es una cadena en la que **cada plano nace de algo que sobrevive del
anterior**. Ese elemento no desaparece ni se tapa con un fundido; se transforma.

- una barra de progreso se abre hasta ser la ventana de la app;
- una línea de horizonte se pliega y se convierte en la rejilla del panel;
- el punto del símbolo crece y pasa a ser la pupila de un rostro;
- el borde de una tarjeta se cierra y ya es el marco de la escena siguiente.

La pila de escenas encadena planos que no comparten nada y los une con fundidos: cada corte reinicia la mirada
y el conjunto se lee como una presentación. El fundido tapa el salto; la continuidad lo usa.

## 2. La regla del límite entre planos

Antes de animar nada, escribe una ficha por cada límite con tres datos:

1. **Qué sobrevive:** el elemento concreto (forma, color, posición o gesto) que ya estaba en pantalla.
2. **En qué se convierte:** la forma que toma en el plano siguiente y qué gana al cambiar.
3. **Cuánto dura:** los milisegundos del tránsito, hasta que el nuevo plano se sostiene.

Plantilla de una línea, para pegar en el guion:

> Límite 2→3 · sobrevive el borde inferior de la tarjeta · se convierte en la línea de horizonte ·
> 640 ms.

Si un límite no puede rellenar «qué sobrevive» con algo visible, no es un límite: es un corte. O se añade el
elemento que sobrevive, o se asume el corte y se justifica en el punto 5.

## 3. La cámara

La cámara no acompaña: **se adelanta al sujeto**. Llega antes que la acción y espera a que esta ocurra dentro del
encuadre. Cuatro gestos bastan para toda la pieza:

- **Anticipación:** un desplazamiento corto hacia donde aparecerá lo siguiente, para que la mirada ya esté allí.
- **Latigazo:** un giro rápido y único hacia donde caerá el siguiente objeto; una o dos veces por pieza, no más.
- **Impacto:** vibra **solo** cuando algo golpea el plano (un objeto que aterriza, un número que entra, un pulso).
- **Reposo:** tras el golpe se queda quieta para que lo demás aterrice; sin esa pausa todo se lee como ruido.

## 4. Los descansos

Tras cada golpe fuerte, deja un descanso de **400–900 ms**: silencio, plano quieto o ambos. Es el equivalente
visual de respirar antes de la frase siguiente; sin él, la pieza parece acelerada aunque cada transición sea
correcta.

- Golpe fuerte: entrada de un titular, cambio de materia, primer plano de un programa, cierre.
- Descanso corto (400–500 ms) entre dos golpes de la misma idea; largo (700–900 ms) al cerrar una idea.
- El descanso no es un fundido: la imagen puede seguir viva (respiración de 1 → 1.03), pero no entra nada nuevo.

## 5. Cortes duros solo con significado

Un corte duro se gana con un cambio de **tema**, no de decorado. Cambiar de fondo, de color o de rincón de la
misma escena justifica una transformación continua, no un corte. El corte sirve para decir «esto ya no es lo
mismo» (de la idea al producto, del problema a la propuesta, de la demostración al cierre) y se anota con su
motivo y su descanso posterior.

## 6. Cómo medirlo

Se mide sobre fotogramas reales, no sobre la intuición.

1. **Fotogramas del límite.** Con la composición en un proyecto de HyperFrames:

   ```bash
   npx hyperframes snapshot <proyecto> --at 2.4,2.6,2.8 --no-end -o stills/limite-2-3/
   ```

   Elige dos o tres instantes por límite: el último del plano que se va, el del tránsito y el primero del que
   llega.

2. **Comparación.** Para revisar un ajuste o comprobar que una reparación no rompió el aspecto, `compare` pone
   en una hoja el mismo instante de la referencia y de la candidata:

   ```bash
   npx hyperframes compare <proyecto-referencia> <proyecto-candidato> \
     --at 2.6 --labels antes,despues --out compare-limite-2-3.png --cols 2
   ```

   `compare` es una superficie de revisión, no una puerta automática: hay que mirar la hoja; lo que no se ve no
   se puede afirmar.

3. **Tabla de revisión.** Un agente la rellena antes de dar la pieza por buena; si una fila falla, no se publica:

   | Límite | Qué sobrevive | En qué se convierte | Duración | Pasa o falla |
   |---|---|---|---|---|
   | 1→2 | … | … | … ms | |
   | 2→3 | … | … | … ms | |

4. **Complemento ya instalado.** `claude-video-studio` trae `scripts/pacing_check.py` (huecos y destellos sobre
   el vídeo renderizado) y `scripts/loop_check.py` (último fotograma contra el primero). No sustituyen la tabla.

## 7. En StarSeed

- **Duraciones:** 140–350 ms en interfaz; **600–900 ms por entrada en vídeo**. Los descansos de §4 se suman.
- **Composición centrada:** el sujeto ocupa el centro de su ventana y la ventana el de la pantalla.
- **Un solo brillo multicapa por plano:** el elemento que sobrevive puede ser el protagonista luminoso; el resto
  lleva sombra simple. Nunca dos brillos compitiendo.
- **Curvas y propiedades:** `--ease-organic` y `--ease-glide`; solo `transform` y `opacity`, nada lineal salvo un bucle de fondo.
- **Herramientas:** `claude-video-studio` y `hyperframes`. El elemento compartido que viaja entre escenas ya está
  en `fundamentos-diseno.md`; aquí se añade cómo se encadena y se comprueba.
- **Movimiento reducido:** conserva los descansos y cambia las transformaciones por fundidos simples.

## 8. Lo que no se hace

- Encadenar planos que no comparten nada y tapar el salto con un fundido, o cortar solo por cambiar de decorado.
- Animar antes de escribir qué sobrevive en cada límite.
- Vibrar la cámara sin un golpe que lo cause, o hacerlo en cada plano.
- Rellenar cada silencio con música o movimiento: el descanso es parte del ritmo.
- Copiar looks, plantillas, composiciones o películas de onetake: su licencia no lo permite.

---

Idea de las películas de una sola toma (onetake, PolyForm Noncommercial 1.0.0; solo enlace, sin texto ni código copiado).
