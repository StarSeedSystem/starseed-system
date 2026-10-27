# Ritmo y continuidad: una sola toma

Para los diseñadores de vídeo de StarSeed. Se inspira en la idea de las películas de una sola toma, reescrita con nuestras palabras (sin copiar texto ni código del proyecto referenciado).

## 1) La toma continua
- **Todo fluye.** Cada plano nace de algo que sobrevive del anterior y se transforma (una barra que se abre en una ventana, una línea que se vuelve rejilla...).
- **Una pieza, no un montaje.** Frente a la pila de escenas con fundidos, buscamos continuidad: lo que cambia es la lectura, no necesariamente el corte.
- **Elemento compartido.** Hereda el principio de `fundamentos-diseno.md`: el elemento que viaja entre escenas mantiene identidad visual mientras se adapta.

## 2) Límite entre planos
Antes de animar, escribe por cada límite:
- **Qué sobrevive:** ¿Qué forma, línea o elemento sigue presente?
- **En qué se convierte:** ¿Cómo se transforma para dar paso al siguiente significado?
- **Cuánto dura:** ¿Qué tiempo necesita para leerse sin prisa?

## 3) Cámara
- **Anticipa.** La cámara se adelanta al sujeto, con un latigazo hacia donde caerá lo siguiente.
- **Respuesta controlada.** Solo vibra cuando algo golpea; se queda quieta para que lo demás aterrice.
- **Centro sagrado.** Mantén la composición centrada cuando busques equilibrio; usa el movimiento con intención.

## 4) Descansos
- **Silencio útil.** Tras cada golpe fuerte, deja un silencio o un plano quieto de **400–900 ms**.
- **Respirar.** Esos descansos dan peso al golpe siguiente y evitan fatiga visual.

## 5) Cortes duros con significado
- **Solo con propósito.** Usa cortes duros solo cuando hay un cambio de tema, no de decorado.
- **Invísibles cuando convenga.** Si puedes lograr la transición por transformación, priorízala sobre el corte.

## 6) Medición
Usa `hyperframes snapshot` y `hyperframes compare` sobre los fotogramas de cada límite.
Rellena esta tabla antes de dar la pieza por buena:

| Límite | Qué sobrevive | Duración | Pasa o falla |
|---|---|---|---|
| (definir) | (definir) | (ms) | (pasa/falla) |

## 7) En StarSeed
- **Duraciones:** 140–350 ms en interfaz; 600–900 ms por entrada en vídeo.
- **Composición:** centrada, una sola pieza con brillo multicapa por plano.
- **Movimiento:** curvas del ADN, solo `transform` y `opacity`.
- **Herramientas:** `claude-video-studio` y `hyperframes`.

## 8) Lo que no se hace
- **Sin montaje por acumulación.** No añadas escenas solo para «rellenar»; cada plano debe tener razón de existir.
- **Sin movimiento gratuito.** Nada de giros o desplazamientos sin propósito.
- **Sin copiar.** No copies plantillas, looks ni movimientos del proyecto referenciado; usa la idea.

Idea de las películas de una sola toma (onetake, PolyForm Noncommercial 1.0.0; solo enlace, sin texto ni código copiado)
