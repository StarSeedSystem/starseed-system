# Contrato · Agentes de seguridad ligeros y autoaprendibles de Astraura

> **Tarea:** SEG1119C · **Ola:** SEG1119 · **Fecha:** 2026-11-19 · **Estado:** contrato y cola; esta tarea no escribe código de producto.
> **Base:** `starseed_memory_root/fundamentos/resiliencia-seguridad-y-respaldos.md` (19-11), `metagenesis.md` §8, §11 y 💠,
> `architecture/astraura-158-sistema-primario.md`, `memory/orquestacion-economica.md` y `memory/diseno/{identidades,armonia,referencias}.md`.
> **Nota honesta:** el fundamento de resiliencia no está en esta copia (la memoria viva no se versiona); sus reglas llegan por el encargo y por `AGENTS.md`. No se inventa lo que ese documento dice.

## 1 · Qué se pide

Se pide un antivirus **por contexto**, no un motor único: agentes pequeños y baratos que vigilan cinco superficies, proponen con su confianza y **aprenden de cada incidente**. Deciden con reglas deterministas primero y con Jev/Laya solo en la duda; nada crítico se ejecuta solo.

## 2 · Reglas duras (mandan sobre cualquier diseño posterior)

1. **Las claves no se tocan.** Ningún agente lee, imprime, copia, mueve ni descifra claves, tokens, cookies ni `refresh_token`. Solo ve nombres de variable, huellas no reversibles y metadatos; el material secreto vive en `~/.starseed/env` y `~/.hermes/.env` (600) y nunca entra al repo, al bus, a un prompt, a un informe ni a un log.
2. **Nada de secretos en claro fuera de la Mac.** Un dato sensible se queda en el aparato; si viaja, viaja cifrado y con la llave del destinatario. Los modelos reciben texto saneado (`redactarSecretos`, `sanear`), nunca el original.
3. **Nada se concede, acepta ni instala por la persona.** Un agente puede **recomendar** y **bloquear por regla**, pero conceder un acceso, aceptar una entrada en cuarentena o instalar una receta son actos de su dueño (o del voto de la comunidad, §7). La cuarentena solo retiene; no destruye.
4. **Lógica pura y con pruebas.** Cada agente recibe hechos y devuelve un veredicto: sin red, sin disco, sin reloj propio. Pruebas con `vitest` (imports explícitos, `globals: false`), sin `any`.
5. **Gratis primero y relevo.** Local ligero (Needle/Jev/BitNet) → flota gratuita → `ASTRAURA_CLOUD_URL` → túnel → fuentes libres. Ante 429/402 se releva al siguiente sin insistir; ningún proveedor agota sus créditos.
6. **Pocos eventos y gruesos.** Un incidente se agrupa y se registra una vez; nada de sondeos en bucle. Presupuesto diario y freno al 100 %, como el resto de Astraura.

## 3 · Lo que ya existe (grep verificado en este árbol)

| Capacidad | Dónde está ya | Qué se reutiliza |
|---|---|---|
| Análisis de lo recibido | `src/lib/malla/cristal/centinela-archivos.ts` (`decidirEntrada`), `resonancias.ts` (`decisionPorResonancia`), `recepcion-sellada.ts`, `archivo-seguro.ts`, `src/lib/network/archivos-malla.ts` | Niveles limpio/sospechoso/peligroso, cuarentena por consenso, apertura cifrada antes del motor |
| Revisor de secretos de la autopublicación | `scripts/puente/autopublicar.py` (`escanear_secretos`), `scripts/enjambre/puerta_degenerados.py` (`secretos_en_cambios`), `scripts/puente/produccion_puertas.py` (`escanear_secretos`) | Bloqueo por tipo y archivo sin imprimir el valor |
| Escáner de secretos y PII del OS | `src/lib/security/scanner.ts` (`scanText`, `scanDeep`, `redactText`, `maskSecret`), `eventos-seguridad.ts` (lista blanca) | Patrones y redacción; eventos saneados que pueden salir sin filtrar a nadie |
| Sanador | `scripts/puente/sanador_sesiones.py`, `sanador_nodos.py`, `sanador_recetas.py`, `sanador_token.py`, `src/lib/mando/autocuracion-pagina.ts` | Registro en `salud/sesiones.jsonl`, recetas ordenadas y escalado autoservicio |
| Guardias de nodos | `scripts/puente/guardia-memoria.py`, `scripts/puente/guardia_pruebas.py`, `scripts/enjambre/guardia_disco.py`, `src/lib/mando/guardia-fetch.ts`, `src/lib/security/{rate-limit,ssrf}.ts` | Turnos de RAM, red solo local en pruebas, tope de disco, lecturas acotadas, antabuso y antissrf |
| Permisos | `src/lib/mando/permisos.ts` (`rolDe`, `puede`), `src/lib/sharing/access.ts` (ámbito y rol, RLS en `os_spaces`) | Roles dueño/desarrollador/invitado/servicio, grants por recurso y comprobación en servidor |
| Decisiones democráticas | `src/lib/mando/votacion-desarrolladores.ts`, `resonancias.ts`, `scripts/puente/veredictos.py`, `jev.py` | Mayoría con quórum, un voto por cuenta, caducidad, Jev con umbral y sin voto propio |
| Aprendizaje de olas e incidentes | `scripts/puente/aprendizaje_ola.py`, `aprendizaje_sintesis.py`, `memory/aprendizaje-olas.md`, `scripts/puente/importancia.py` | Hechos con número, no opiniones; destilado que se relee y prioriza |

**Hueco real:** esas piezas no comparten un contrato de veredicto, no cubren la integridad de los respaldos y no cierran el bucle incidente → aprendizaje → propuesta. Tampoco hay una política única que distinga un aparato personal (solo su dueño) de un recurso de comunidad (voto).

## 4 · Contrato común de un agente

Todos viven en `src/lib/security/agentes/` y son módulos puros:

```ts
export type Nivel = "limpio" | "aviso" | "cuarentena";
export interface Veredicto {
  agente: string; nivel: Nivel; confianza: number;   // 0..1; < 0,4 solo se anota
  motivos: string[]; evidencias: string[];           // frases sin datos; huellas no reversibles
  acciones: string[];                                // avisar | retener | revisar | proponer
  caducaMs?: number;
}
export function evaluar(entrada: unknown, contexto: Contexto): Veredicto;
```

Reglas: (a) nunca lanza —una entrada rara da `confianza: 0`, `nivel: "limpio"` y «sin datos suficientes»; (b) nunca devuelve el contenido original en `motivos` ni `evidencias`; (c) misma entrada y contexto, mismo veredicto (el tiempo entra por `contexto.ahoraMs`); (d) ejecutar es decisión de la capa que llama, nunca del agente; (e) «aceptar» no es una acción automática.

## 5 · Los cinco agentes, por contexto

| Agente (`agentes/…`) | Vigila | Señales que ya existen | Qué devuelve | Lo que NO hace |
|---|---|---|---|---|
| `recepcion.ts` | Archivos recibidos y sincronizaciones de cerebros | `centinela-archivos`, resonancia de la red, cifrado de la oferta | Aviso, retención o propuesta de cuarentena | No abre claves ni descifra; no borra; no acepta solo |
| `claves.ts` | Claves y accesos anómalos | Presencia (sí/no), huella no reversible, hora, medio y rol (`permisos.ts`) | Aviso por acceso raro; propuesta de rotación o de retirar acceso | No lee, imprime ni mueve el valor; no revoca solo |
| `respaldos.ts` | Integridad de los respaldos | Huellas y fechas de Mac, A1, Maggabox y Drive; última restauración | Aviso si falta una copia o dos lecturas no cuadran | No descifra copias; no sustituye a `SEG1119D`/`SEG1119B` |
| `secretos.ts` | Secretos en el código y en lo que se comparte | `scanText`/`scanDeep` y `escanear_secretos` | Bloqueo de publicación por regla y aviso con el tipo de hallazgo | No imprime el hallazgo completo; no reescribe archivos |
| `nodos.ts` | Salud de nodos públicos y privados | Latido, presencia, errores, cupo y sesiones (`salud_*`, sanador) | Aviso de nodo degradado; propuesta de receta existente | No reinicia nada solo; no instala recetas |

Cada agente se prueba con casos límite (entrada vacía, ciclos, datos falsos, confianza baja) y con **un caso real copiado del módulo que reutiliza**. Un agente que no aporta un caso distinto al módulo existente no se escribe.

## 6 · Aprendizaje de cada incidente (Jev y Laya)

1. **Hecho, no opinión.** Se guarda `{tipo, contexto, huella, veredicto, resultado}`; el resultado es lo que pasó de verdad (confirmado, falso positivo, sin seguimiento).
2. **Destilado.** `aprendizaje.ts` agrupa por tipo y contexto y produce una **propuesta** de umbral o de regla nueva; nace en sombra y no cambia el comportamiento.
3. **Jev decide la duda, no el oráculo.** Con ≥ 5 casos y una regla determinista, solo confirma con `p ≥ 0,8` (niega con `p ≤ 0,2`); si calla, se mantiene la regla. Se anota `jev: p=…`.
4. **Laya recuerda.** Lo cerrado se escribe en su libreta para que otro agente no aprenda lo mismo; solo hechos con número y fecha, sin secretos.
5. **Promoción con evidencia.** Pasa a regla activa tras N incidentes confirmados y cero falsos positivos en la ventana acordada, siempre con revisión humana. Nunca se instala ni se despliega sola.

## 7 · Políticas: comunidad por voto, aparato personal por su dueño

`politicas.ts` recibe `{ambito, recurso, votos, padron, rol, dueno, ahoraMs}` y devuelve `{estado, motivo}`.
- **Aparato personal** (una neurona, un perfil, una bóveda local): decide **solo su dueño**. Ningún voto de la comunidad abre, acepta ni instala nada en él; como mucho, la comunidad **avisa** al dueño.
- **Recurso de comunidad** (nodo público, cuarentena compartida, espacio común): mayoría con quórum, misma regla que `votacion-desarrolladores.ts` (mitad + 1, sin voto propio, caducidad 14 días). Empate o falta de quórum mantiene el estado actual; nunca gana la opción permisiva por inacción.
- **Conflicto de interés:** quien propone no vota; quien administra una clave no vota sobre ella.
- **Irreversible:** borrar, revocar o instalar exige confirmación explícita del dueño del ámbito, aunque el voto sea favorable. El voto autoriza; la persona ejecuta.

## 8 · Modelos locales ligeros primero

La regla determinista resuelve la mayoría. Solo la duda (confianza entre 0,4 y 0,8, o caso nuevo) sube a la pirámide: reflejo local (Needle 3) → juicio local (Jev, 0,12 s) → BitNet/Astraura local → flota gratuita → `ASTRAURA_CLOUD_URL` → túnel → fuentes libres. Ante 429/402 se releva y se anota; nunca se insiste. El contexto que viaja va saneado: nombres, huellas y fechas, jamás el secreto. Un agente de seguridad **no** gasta cuota para vigilar: si no hay motor gratis, se queda en su regla y lo deja dicho.

## 9 · Superficies y diseño (área de diseño)

- **Identidad:** Astraura, cian `#00F0FF` sobre `--aw-shell`/`--aw-surface` y tintas `--aw-ink/--aw-muted`; escala compacta (hint 10, cuerpo 11, título 12, valor 13). Sin emojis: Lucide (`ShieldCheck`, `Radar`, `KeyRound`, `DatabaseBackup`, `Network`).
- **Armonía:** escala φ en tablet/escritorio/TV y 1,25 en móvil/plegable; espaciado Fibonacci (`fib-8/13/21/34`); una sola familia de radios por componente. La geometría sagrada (vesica, flor, espiral) solo como capa `aria-hidden`, opacidad baja, sin competir con el veredicto.
- **Accesibilidad:** estados «vigilando», «sin datos», «aviso», «retenido», «propuesta pendiente»; contraste ≥ 4,5:1, foco visible, dianas ≥ 44 px, `cursor-pointer` en lo clicable y solo `transform`/`opacity` con `prefers-reduced-motion`.
- **Matriz:** 280, 360×780, 430×932, 768×1024, 1024×1366, 1280×800, 1920×1080 y 3840×2160; tacto y puntero; claro/oscuro; texto largo; vacío, error y alto contraste; sin desbordamiento ni texto cortado.

## 10 · Criterios de aceptación

1. Cola de 3–6 tareas, cada una ≤ 3 archivos y ≤ 120 líneas por archivo, con prueba propia; todo módulo puro, sin `any`, sin red/disco/reloj y sin imprimir jamás un secreto.
2. Cada agente reutiliza un módulo existente y aporta un caso que ese módulo no cubría.
3. El aprendizaje no activa nada solo: propuesta en sombra, Jev con umbral y promoción con revisión humana.
4. La política distingue aparato personal (dueño) de recurso de comunidad (voto) y falla hacia el estado actual.
5. Nada de este contrato autoriza a leer, mover, descifrar ni conceder: solo a observar, avisar y proponer.

## 11 · Cola de trabajo

`starseed_memory_root/olas/cola-agentes-seguridad-1119.json` · ola `SEG1119`, ids `SEG19A`–`SEG19F` (únicos: esta tarea es `SEG1119C`, ya en la cola viva). El contrato va primero; los agentes dependen de él. Cada tarea sigue rojo → verde: **primero la prueba que falla**, luego el módulo mínimo que la pasa.

`SEG19A` contrato común · `SEG19B` recepción de archivos y cerebros · `SEG19C` claves/accesos + secretos en el código · `SEG19D` integridad de respaldos · `SEG19E` salud de nodos · `SEG19F` aprendizaje con Jev/Laya + políticas por ámbito. Un módulo que encoge más de la mitad de lo que ya existe no se integra: se reutiliza el existente.
