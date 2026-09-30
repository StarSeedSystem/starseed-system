# Protocolo común de los agentes — un mismo contexto y una misma puerta de decisión (2026-09-30)

> **Por qué.** Alex: «hace falta que se usen más las habilidades, herramientas y conectores del
> Puente de Mando, como el uso de Jev en todos los agentes y subagentes para optimizar y mejorar
> los procesos con el mismo workflow y contextos de memorias y entendimientos completos y las
> mejores decisiones con los sistemas Jev y las demás herramientas».
>
> **Qué resuelve.** Hasta hoy cada agente sabía cosas distintas: el escritor del enjambre leía
> `contexto_inteligente()`, el analista de los sueños solo la «casa» del prompt, un subagente de
> Claude en la terminal no sabía que existía Jev, y Jev solo decidía en cuatro puntos del Mando.
> Ahora hay **dos piezas comunes** y todos los agentes las usan:
>
> 1. `scripts/puente/contexto_agente.py`: **lo que carga** cada agente (reglas, protocolo,
>    herramientas, área, relevo), el mismo texto para el mismo rol, venga de donde venga.
> 2. `scripts/puente/decidir.py`: **cómo decide** cada agente en la duda (Jev con la regla de
>    quien pregunta como respaldo), con la experiencia anotada para que el colectivo aprenda.

## 1. Lo que carga cada agente (`contexto_agente.py`)

```bash
python3 scripts/puente/contexto_agente.py --rol escritor|revisor|analista|supervisor|subagente \
        [--area mando] [--tarea "…"] [--max 6000] [--excluir relevo,herramientas] [--json]
```

Secciones, en el orden de cada rol (lo que no cabe en `--max` se recorta por el final; bajo
2.500 caracteres va **compacto**: reglas sin fuente, protocolo en un párrafo):

| sección | qué lleva | de dónde sale |
|---|---|---|
| Reglas permanentes | las del rol primero y luego las de todos, cada una con su fuente | `REGLAS` (curadas de CLAUDE.md, `memory/orquestacion-economica.md` §0/§9/§15/§16, `memory/workflow-actual.md`); la prueba de deriva exige que cada fuente exista |
| Cómo se decide (Jev) | el protocolo de la §2 | `PROTOCOLO` |
| Herramientas | la orden exacta: `decidir.py`, `contexto_agente.py`, `suenos.py`, `latido_externo.py`, `gitnexus`, `starseed-fuentes`, `starseed-puente decir`, `starseed-relevo`, `hermes send` | solo las que existen (las de la Mac van marcadas «Mac») |
| Tu área | nombre, descripción, documentos que mandan (solo los que existen), rutas de la app y dónde vive el código | `src/lib/mando/areas.ts` + `suenos_areas.AREAS_EXTRA`/`RAICES`; se deduce de la tarea si nombra una ruta |
| Dónde vamos | la cabeza de `starseed_memory_root/relevo/relevo.md` | solo si existe (la nube no la tiene) |

Quién lo recibe y cómo:

| agente | cómo le llega | tope |
|---|---|---|
| escritor del enjambre | al final de `contexto_inteligente()` (sin área ni relevo: ya van arriba) | 2.200 compacto |
| revisor del enjambre | al principio del prompt de `revisar()`, solo reglas | 900 compacto |
| analista de los sueños | en el prompt de la síntesis, sin herramientas (es un modelo por HTTP) | 1.400 compacto |
| supervisor Claude | primera orden de cada pasada (`supervisor_suenos.md` paso 0) | 6.000 |
| subagente de Claude en la terminal de la Mac, Hermes, IDE | primera orden de su trabajo (plantilla en §4) | 6.000 |

Nunca lleva claves: todo pasa por `sanear` (sk-, gsk_, gh*_, AIza, xox, nvapi-, hf_, JWT, Bearer).

## 2. Cómo decide cada agente (`decidir.py`)

```bash
python3 scripts/puente/decidir.py si-no   --estado '<json|@archivo|@->' --pregunta "¿…?" --regla si|no --quien <agente> [--codigo] [--json]
python3 scripts/puente/decidir.py elegir  --estado … --pregunta "…" --opciones a,b,c [--regla b]
python3 scripts/puente/decidir.py puntuar --estado … --pregunta "…" --niveles bajo,medio,alto [--regla medio]
python3 scripts/puente/decidir.py confirmar <experiencia> --acierto si|no [--nota "…"]
python3 scripts/puente/decidir.py uso
```

El protocolo, igual para todos:

1. **Primero la regla** determinista (la del código o la del SOP). Si es clara, decide ella.
2. **En la zona de duda**, `decidir.py` con un estado BREVE (se recorta a 6.000 caracteres y se
   tachan las claves) y `--regla` = lo que harías sin Jev.
3. **Umbrales**: se sigue a Jev con p ≥ 0,8 (≤ 0,2 para el no); entre medias manda la regla. Jev
   puede **vetar** una acción cara; nunca convierte en «sí» un «no» de la regla.
4. **Anotar**: «jev: p=0,83 (medio)» junto a la decisión, y `confirmar <exp>` cuando se sabe si
   acertó. Cada consulta deja una experiencia (`experiencias.py`: `~/.starseed/experiencias.jsonl`
   y copia en `starseed_memory_root/aprendizaje/experiencias/<host>.jsonl`) con `quien`: de ahí
   sale la calibración de Jev y el aprendizaje colectivo.
5. **Nunca esperar a Jev**: si calla («medio: regla» — sin motor, sin crédito, sin red,
   `STARSEED_JEV=0`), la respuesta es la regla y se sigue.

Por debajo es la pirámide de `jev.py`: BitNet local (gratis) → Laya → OpenRouter
`~typesafe/jev-latest` (≈ $0,00002 por decisión, techo 0,20 $/día y 2 $/mes) → la regla. La
caché de 6 h hace que la misma pregunta no se pague dos veces («medio: cache»). En un mismo
proceso las preguntas van de una en una (el motor local atiende de una en una y `jev.py` guarda
caché y contabilidad en archivos, ahora con temporales únicos por hilo). `consultar_lote` hace
varias preguntas sobre el mismo estado en UNA llamada (el estado se paga una vez).

## 3. Dónde decide hoy Jev (además de la §9 de la orquestación)

| punto | regla (manda y es el respaldo) | Jev (zona de duda) | dónde |
|---|---|---|---|
| triaje de observaciones de un sueño | todas pasan a la síntesis | lotes de 8: ¿accionable? p · valor; cae p < 0,25 (nunca > 60 %), el resto va ordenado por peso con `p_jev` a la vista | `analista.triar` |
| modelo de la síntesis/contraste (y 2 lecturas) | por turnos, el menos usado con cupo | si hay ≥ 2 proveedores sanos con cupo, elige con la ficha de éxitos/fallos/sin-formato de la sesión (confianza ≥ 0,5); cada apuesta se confirma con lo que pasó | `analista.Llamador._ruta_jev` |
| qué modelo reintenta una tarea de código que ya falló | los que fallaron al final, orden rotado | elige entre los 4 primeros de proveedores distintos (≥ 0,5) | `consejo_enjambre.ordenar_escritores` |
| aceptar «sin cambios» antes del tope de intentos | seguir hasta `TOPE_INTENTOS_ESCRITURA` | tras 2 intentos sin cambios de proveedores distintos, para si p ≥ 0,85 (el director aún le da otra oportunidad) | `consejo_enjambre.parar_sin_cambios` |
| qué revisor primero | el último que respondió | solo si no hay último: elige (≥ 0,5) | `consejo_enjambre.ordenar_revisores` |
| relanzar sueños fallidos | relanzar | segunda opinión anotada; veta con p ≤ 0,2 | `supervisor_suenos.md` paso 2 |
| cada hallazgo que verifica un supervisor | la lectura del código por Claude | segunda opinión anotada en la nota («jev: p=…»), confirmada con el veredicto final | `supervisor_suenos.md` paso 3 |
| accionable/prioridad de la propuesta de un sueño | reglas de `director_suenos.regla_consejo` | veto p < 0,2, prioridad con confianza ≥ 0,6 | `director_suenos.consejero_jev` |

**No** van por Jev (auditado): reintentar o apartar tras un fallo del PROVEEDOR (429, 5xx,
«database is locked», modelo retirado). La señal es inequívoca y la regla ya acierta.

## 4. Un subagente de Claude (o Hermes, o un IDE) en la terminal de la Mac

Plantilla para el prompt de un subagente que vaya a trabajar sobre el repo:

```text
Antes de nada, en ~/Documents/starseed-os-main:
  python3 scripts/puente/contexto_agente.py --rol subagente --tarea "<tu tarea en una línea>"
Léelo: sus reglas mandan. En cualquier decisión dudosa (qué archivo tocar, si algo ya está hecho,
qué opción elegir), pregunta antes de actuar:
  python3 scripts/puente/decidir.py si-no --quien <tu-nombre> --estado '<json breve>' --pregunta "¿…?" --regla <lo que harías>
y anota «jev: p=…» en tu informe. Aparece en el Mando con latido_externo.py y deja tu relevo.
```

## 5. Coste y límites honestos

- **Coste**: un sueño hace como mucho 6 llamadas de triaje y 4 de ruta (≈ $0,0001 cada una por
  OpenRouter con el estado de un lote; gratis en local). 84 sueños ≈ $0,05 si todo va a
  OpenRouter, dentro del techo de 0,20 $/día. `decidir.py uso` lo dice en cada momento.
- **El motor local está congelado mientras el enjambre escribe** (Mac de 8 GB): en esas horas
  Jev es OpenRouter con techo o nada. Tras 3 silencios seguidos, los sueños dejan de preguntar
  10 min (circuito de sesión).
- **Jev decide con lo que le cuentas**: el triaje ve el texto de la observación, no el código;
  por eso solo cae el ruido claro y nunca más del 60 %, y el contraste sigue leyendo el código.
- El «sin cambios» aceptado por Jev deja `jev_experiencia` en progreso.json, pero nadie la
  confirma todavía cuando el reintento del director sí escribe: queda como siguiente paso.
- El triaje de los sueños no se confirma aún contra el contraste (la relación hallazgo ↔
  observación no es uno a uno).

## 6. Añadir un punto de decisión nuevo

1. Escribe la regla determinista primero y déjala como está.
2. Envuelve la duda en una función PURA que reciba `consultar` (la forma de
   `decidir.consultar`) y devuelva la decisión de la regla si `consultar` es None, lanza o calla.
3. Umbral explícito; Jev nunca convierte un «no» de la regla en «sí».
4. Anota la experiencia y, si puedes saber luego si acertó, llama a `confirmar`.
5. Prueba con un doble de Jev: respondiendo, en silencio, lanzando y por encima del techo.
6. Añade la fila a la tabla de la §3.
