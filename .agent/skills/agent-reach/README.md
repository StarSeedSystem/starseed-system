# agent-reach en StarSeed OS · guía del enjambre (CAP1119)

Skill local: `.agent/skills/agent-reach/SKILL.md` (v1.6.0, MIT). Antes de actuar, di en voz alta: «usando la skill agent-reach (canal X)». Es de **solo lectura**: nunca escribe en sitios web ni abre sesiones.

## 1. Cuándo usarla

1. Primero agota la vía gratuita del entorno: búsqueda web propia, `starseed-fuentes buscar <texto>` y las cuatro herramientas de `gitnexus` en su orden exacto (`context`, `impact`, `query`, `detect-changes`).
2. Si falta el cuerpo de una página, un vídeo o un hilo público, usa agent-reach. Nunca como sustituto de una API local ni de una clave.
3. Los canales con sesión (reddit, twitter, linkedin, facebook, instagram, xiaohongshu, boss, xueqiu) están APAGADOS en StarSeed OS (R1): **sin iniciar sesión**, sin pedir contraseñas y sin cookies de Maggasukha.
4. Para fuentes públicas, fija `--backend public-web`. La salida es JSON con `ok`, `items[]` y `raw`; `src/lib/integrations/agent-reach-comandos.ts` lo convierte en Markdown con su fuente.

## 2. Instalación y comprobación

Una sola vez, en la máquina de dirección y con permiso: `uv tool install git+https://github.com/Panniantong/Agent-Reach`. No uses `pip` ni `npx` para instalar esta skill; el repositorio es MIT v1.6.0 y se lee, no se modifica.

```bash
agent-reach channels
agent-reach doctor --text
```

Si falta permiso o el binario no responde, no insistas: continúa por la ruta gratuita y avisa en el canal común con `starseed-puente decir ...`.

## 3. Ejemplo de uso para el enjambre

Un agente que necesita el cuerpo de una página pública hace esto, en este orden:

```bash
agent-reach channels                                   # qué canales y acciones hay
agent-reach web search "StarSeed OS geometría sagrada" --limit 3 --backend public-web
agent-reach read https://starseed-os.vercel.app        # elige el canal desde la URL
agent-reach youtube subtitle "https://www.youtube.com/watch?v=..."   # solo texto público
```

Respuesta esperada (JSON de solo lectura):

```json
{ "ok": true, "items": [{ "title": "…", "url": "https://…", "text": "…" }], "raw": {} }
```

El agente convierte cada `item` en Markdown con `agent-reach-comandos.ts`, cita su URL y escribe el resultado en su tarea. Si `ok: false`, lee `error.code` y aplica la tabla siguiente; nunca publica `items` vacíos como si fueran contenido.

## 4. Errores y relevo

| Error del skill | Qué hacer |
|---|---|
| `NEED_SETUP` | Instalar con `uv tool install` y repetir `doctor`; sin permiso, seguir gratis. |
| `NEED_LOGIN` | Canal con sesión: APAGADO en StarSeed OS. No iniciar sesión; elegir fuente pública. |
| `UPSTREAM_BROKEN`, `TIMEOUT`, `PLATFORM_BLOCKED` | Una sola vez con otro proveedor; si vuelve, relevo sin bucle. |
| `RATE_LIMITED` | Esperar el relevo; nunca agotar créditos. En OpenRouter solo ids `:free`. |
| `BUSY` | Otra tarea está usando el binario: encolar, no lanzar un segundo proceso. |
| `NOT_FOUND`, `BAD_INPUT` | Corregir la URL o el argumento; no reintentar lo mismo. |

Ante `429` o `402` en la nube: relevo automático. Orden: `ASTRAURA_CLOUD_URL` → túnel local → fuentes libres. Gratis primero; Jev decide en la duda con `python3 scripts/puente/decidir.py si-no ...` y solo con p ≥ 0,8 o ≤ 0,2.

## 5. Reparación CAP1119 · las tres objeciones literales

Cada nota se resolvió escribiendo este archivo y añadiendo su prueba en `src/lib/mando/__tests__/reapertura-skill.test.ts`. La decisión la toma `decidirVuelta` en `src/lib/mando/reapertura-skill.ts`.

| Fecha | Objeción literal | Corrección aplicada |
|---|---|---|
| 2026-11-23 02:26:39 | `reabierta por el director: devuelta de la nube: su run terminó · la nube dijo «rechazada»` | `corregir-y-verificar`: leer la nota, escribir el archivo declarado, pasar `tsc` y `vitest`; **no la relanzo igual**. |
| 2026-11-23 16:21:16 | `reabierta por el director: devuelta de la nube: su run terminó · la nube dijo «rechazada»` | Nota idéntica: `yaSeReabrioPorRechazo` la detecta y no autoriza otra reapertura; aviso en el canal común. |
| 2026-11-24 23:21:02 | `otra ola ya la cerró (rechazada según progreso.json) → no la repito` | `no-repetir`: estado cerrado en `progreso.json`, dejar la tarea cerrada y dar constancia. |

`en_curso` NO es estado cerrado: ahí sí manda la regla de la nube. Ninguna de estas notas se resuelve diciendo «ya estaba hecha»: el archivo declarado se escribe de verdad, por trozos (≤60 líneas el esqueleto, ≤80 por edición, ≤120 por archivo).

## 6. Reglas del área

- Las rutas `/api/mando/*` son SOLO locales: devuelven `404` en producción. Nunca las uses como fuente de agent-reach: el validador bloquea hosts locales y privados.
- Sin claves en el repo, en documentos ni en logs: solo NOMBRES de variables de entorno. Las rutas del disco tampoco se publican en el bus.
- La síntesis y el mando usan el canal común `starseed-puente decir`; los avances del enjambre entran solos por `eco-enjambre.py`. No repetir lo que ya está en el canal.
- Estética del área: una sola idea por pantalla, ritmo con proporción áurea (φ ≈ 1,618) y escala 1,25; sin emojis como iconos; `cursor-pointer` en lo clicable; transiciones de 150 a 300 ms.

## 7. Verificación

```bash
npm run typecheck
npx vitest run src/lib/mando/__tests__/reapertura-skill.test.ts
```

La prueba debe terminar con `Test Files 1 passed` y al menos `Tests 10 passed` (una por objeción, más las de la guía). Nada está hecho hasta que se vea en Genesis; `tsc` en verde es solo un paso intermedio.
