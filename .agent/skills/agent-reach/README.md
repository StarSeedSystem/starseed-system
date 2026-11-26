# agent-reach en el flujo de trabajo del enjambre

Guía operativa de la skill `agent-reach` (v1.6.0, MIT) para los agentes de StarSeed OS.
Complementa `SKILL.md` y `references/`; no los sustituye ni cambia su contrato de solo lectura.

## 1. Cuándo usarla

1. **Primero, lo propio y gratis:** búsqueda o lectura integrada del agente, sin sesión y sin coste.
2. **Después, Reach solo para huecos:** cuando la herramienta propia no existe, falla o no trae el
   cuerpo, los comentarios o los subtítulos que hacen falta. Un fragmento o un título no es el cuerpo.
3. **Nunca para escribir:** la skill no publica, no comenta, no da «me gusta» y no envía mensajes.
4. Ante 429/402 o un proveedor agotado se releva al siguiente; no se insiste ni se agota ninguno.

## 2. Regla R1: canales permitidos en StarSeed

- Permitidos sin sesión: `web`, `github`, `youtube`, `v2ex`, `bilibili`.
- Los canales con login (`reddit`, `twitter`, `linkedin`, `facebook`, `instagram`, `xiaohongshu`,
  `boss`, `xueqiu`) no se activan ni los usan los agentes de alcance.
- Nunca se pide una contraseña ni se imprimen cookies, claves ni tokens; solo nombres de variable
  de entorno, jamás sus valores.
- Si hace falta iniciar sesión, lo hace la persona en su navegador (`agent-reach login <canal>`);
  el agente no inicia sesión por ella ni abre ventanas en bucle.

El contexto del agente (`scripts/puente/contexto_agente.py`) señala `SKILL.md`; esta guía aporta el
ejemplo operativo que faltaba para que el enjambre la use sin preguntar ni improvisar.

## 3. Comandos que puede usar el enjambre

```bash
agent-reach channels                       # acciones y parámetros por canal
agent-reach read <url>                     # elige el canal por la URL
agent-reach github search "<texto>"        # búsqueda pública en GitHub
agent-reach youtube subtitle <url>         # subtítulos de un vídeo público
```

Con `ok: true`, el contenido está en `items` (`title`, `url`, `author`, `published_at`, `text`) y los
datos de origen en `raw`. Con `ok: false`, se mira `error.code` y se sigue `error.hint`.

## 4. Ejemplo: verificar una referencia antes de proponerla

1. El agente de alcance prueba su buscador propio. Si el cuerpo no aparece, usa la skill:
   `agent-reach read <url>` y, si es un repositorio, `agent-reach github search "<texto>"`.
2. Para un vídeo público: `agent-reach youtube subtitle <url>`; se citan solo los subtítulos leídos,
   nunca una transcripción supuesta ni una imagen que la skill no ha analizado.
3. Si el resultado llega con `error.code: NEED_LOGIN`, se conserva lo público ya reunido y se avisa;
   no se cambia de cuenta ni de backend.
4. Si es `RATE_LIMITED`, `PLATFORM_BLOCKED` o `BUSY`, se detiene el intento y se espera; nunca se
   reintenta en bucle ni se cambia de backend.
5. El hallazgo se escribe en el informe con URL y fecha; sin cuerpo verificado no se afirma nada.

## 5. Reparación de la tarea CAP1119 (objeciones literales)

- **2026-11-23 02:26:39** — «devuelta de la nube: su run terminó · la nube dijo «rechazada»».
  Causa: `.agent/` estaba ignorado, así que el `README.md` declarado nunca llegaba al commit y el
  orquestador veía «no tocó ninguno de los archivos». Arreglo: una excepción en `.gitignore`
  re-incluye `.agent/skills/agent-reach/`; el archivo declarado ahora se versiona y se toca.
- **2026-11-23 16:21:16** — la misma objeción tras el segundo run. Arreglo: esta guía da los comandos
  exactos, los canales permitidos y las reglas de relevo, para que el run pueda usarla sin sesión ni
  claves y sin volver a ser rechazado por falta de instrucciones.
- **2026-11-24 23:21:02** — «otra ola ya la cerró (rechazada según progreso.json) → no la repito».
  Una tarea `rechazada` es terminal en `progreso.json`: no se repite la misma id. La reparación crea
  una sucesora (`...-usob`) con otro modelo, la objeción literal en el prompt y las puertas (tsc,
  vitest, revisión) desde `main`.

## 6. Verificación

`bash scripts/enjambre/tsc-turno.sh` y
`npx vitest run src/lib/mando/__tests__/cap-skill-agent-reach-usob.test.ts`.
Las tres objeciones tienen una prueba cada una en ese archivo.
