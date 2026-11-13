# SOP · Buzón MetaGenesis: avisos de Claude nube → Telegram y parte diario (BZN1108A, 2026-11-08)

Contrato: `architecture/metagenesis-autonoma.md` · Requiere: migración
`supabase/migrations/20261108120000_metagenesis_buzon.sql` (la aplica el director al publicar).

## Qué es

Una tabla `public.metagenesis_buzon` en Supabase (proyecto del OS `pqzdpmedcsgcedkvndzl`) que sirve de
buzón unidireccional:

- **Avisos** (`clase='aviso'`): los escribe la sesión programada de **Claude en la NUBE** (07:54
  CDMX, «Síntesis diaria · Producción StarSeed») y llegan al chat de Telegram vinculado a
  MetaGenesis y Hermes (`telegram:Maggasukha`).
- **Parte diario** (`clase='parte'`): lo escribe la misma sesión de Claude nube al final; lo lee
  Claude nube al día siguiente para tener contexto (`select texto from metagenesis_buzon where
  clase='parte' order by t desc limit 1`).

La NUBE **no tiene** llaves de nodo, ni la puerta del A1, ni claves de Telegram. Solo llega a
Supabase (conector MCP con SQL), Drive y web. Por eso el camino es:

```
Claude nube (SQL insert) → Supabase (metagenesis_buzon)
  → líder de dirección (IND1029B, lider_direccion.soy_lider())
  → Hermes en el líder (IND1029G, hermes send -t telegram:Maggasukha)
  → Telegram
```

## Tabla

`public.metagenesis_buzon` (ver migración):
- `id bigserial`, `t timestamptz default now()`
- `clase text` — `'aviso'` o `'parte'`
- `de text` — origen (p. ej. `'claude-sintesis-diaria'`)
- `destino text` — **solo** `'telegram:Maggasukha'` para avisos; `NULL` para parte
- `asunto text` — ≤ 120 chars
- `texto text` — ≤ 12 000 chars (aviso) / ≤ 40 000 chars (parte)
- `estado text` — `'pendiente' | 'entregado' | 'fallo' | 'archivado'`
- `entregado_en timestamptz`, `detalle text`
- **RLS ACTIVADA, SIN políticas** para `anon` ni `authenticated`: solo `service_role` / `postgres`
  (la clave de servicio de la nube y los nodos) leen y escriben.
- Índice parcial `(clase, t) WHERE estado='pendiente'` para la entrega (BZN1108B).
- Índice `(clase, t DESC) WHERE clase='parte'` para leer el parte (BZN1108C).
- Guardia: máx. 10 avisos/día por `de`.

## Quién escribe (Claude nube, por SQL)

```sql
INSERT INTO metagenesis_buzon (clase, de, destino, asunto, texto)
VALUES ('aviso', 'claude-sintesis-diaria', 'telegram:Maggasukha', 'Síntesis 07:54', '…');
```

- La sesión programada de Claude nube corre a las 07:54 CDMX.
- Usa su conector MCP a Supabase (SQL directo, clave de servicio del proyecto OS).
- Un aviso por síntesis; el parte diario va con `clase='parte'`, `destino=NULL`, `estado='archivado'`.

## Quién entrega (BZN1108B — tarea aparte, corre en el líder)

- El líder de dirección (arriendo en la puerta de datos del A1, `lider_direccion.soy_lider()`)
  escanea `WHERE clase='aviso' AND estado='pendiente' ORDER BY t`.
- Para cada fila: llama a Hermes en el líder (`hermes send -t telegram:Maggasukha -s Genesis "texto"`).
- Marca `estado='entregado'`, `entregado_en=now()` o `estado='fallo'`, `detalle=…`.
- Límites: un solo destino en lista blanca (`telegram:Maggasukha`), 10 avisos/día por origen.

## El parte diario (BZN1108C — lo lee Claude nube)

```sql
SELECT texto FROM metagenesis_buzon WHERE clase='parte' ORDER BY t DESC LIMIT 1;
```

- Lo escribe Claude nube al final de su síntesis (contexto del día, medidores, áreas de
  MetaGenesis, decisiones).
- Lo lee al día siguiente para tener continuidad sin la Mac encendida.
- `estado='archivado'` desde la inserción; no se entrega a Telegram.

## Límites

| Límite | Valor |
|---|---|
| Destinos permitidos | Solo `telegram:Maggasukha` (lista blanca en CHECK) |
| Avisos/día por `de` | 10 (guardia `metagenesis_buzon_guardia`) |
| Chars aviso | ≤ 12 000 |
| Chars parte | ≤ 40 000 |
| Chars asunto | ≤ 120 |

## Cómo se ve en el Mando (Genesis → /mando → pestaña MetaGenesis)

- Se añade una sección «Buzón MetaGenesis» en la consola de dirección.
- Muestra: últimos 20 avisos (estado, `t`, `asunto`, primer línea de `texto`).
- Botón «Reintentar fallos» (solo líder) → vuelve a poner `estado='pendiente'`.
- El parte diario no se lista aquí (es interno de Claude nube).

## Seguridad (lo que se garantiza)

- **Ningún secreto en el repo, logs, bus ni mensajes**: solo nombres de variables de entorno.
- La NUBE nunca toca Telegram, Hermes, A1 ni claves de nodo.
- Solo `service_role` / `postgres` acceden a la tabla (RLS sin políticas para roles públicos).
- La entrega la hace el líder (que ya tiene Hermes y Telegram configurados en su entorno).
- Lista blanca de destino impuesta en BD: inyección imposible.

## Operación (la aplica el director al publicar)

```bash
# 1) Aplicar la migración (director):
#    supabase/migrations/20261108120000_metagenesis_buzon.sql
# 2) Verificar (con clave de servicio):
psql "$SUPABASE_DB_URL" -c "
  INSERT INTO metagenesis_buzon (clase, de, destino, asunto, texto)
  VALUES ('aviso', 'test-bzn1108', 'telegram:Maggasukha', 'Prueba BZN1108A', 'Llegó el buzón');
  SELECT * FROM metagenesis_buzon WHERE de='test-bzn1108';
"
```

## Pruebas

- Migración: `psql` contra Supabase local / staging (idempotente).
- Guardia: intentar insertar 11 avisos con mismo `de` en un día → 11.º falla con `54000`.
- CHECKs: `destino` distinto de `telegram:Maggasukha` en aviso → falla; `parte` con `destino` no NULL → falla.
- RLS: `anon` / `authenticated` no ven la tabla (0 filas); `service_role` ve y escribe.

## Pendiente (fuera de este encargo)

- BZN1108B: tarea de entrega (corre en el líder, usa `hermes send`). ✅ Hecho (`9339e035`, `scripts/puente/buzon_telegram.py`) — ciclo cada 120 s, solo si líder (`lider_direccion.soy_lider()`), valida tope 10/día, lista blanca `telegram:Maggasukha`, parte en trozos ≤ 3500 chars, marca `entregado`/`fallo`.
- BZN1108C: lectura del parte por Claude nube (SQL ya documentado arriba). ✅ Hecho (`9339e035`, `scripts/puente/parte_diario_metagenesis.py`) — líder a las 07:30 CDMX, arma JSON ≤ 38k chars (medidores, colas, referencias imaginación, informes, áreas, neuronas, proveedores), inserta en `metagenesis_buzon` clase `parte` estado `archivado`, destino `NULL`.
- Integración en la consola `/mando` (pestaña MetaGenesis → sección Buzón). (a medias: pestañas `accesos` y `tunel-metagenesis` existen en `centro-mando.tsx:2800-2809`; falta sección «Buzón MetaGenesis» con últimos 20 avisos y botón «Reintentar fallos»).
- Programar la síntesis diaria en la NUBE (Alex: conector MCP + cron de la nube). (fuera del repo: infraestructura de Alex).

Revisado el 2026-11-13 contra main (`9339e035`): 2 hechos, 1 a medias, 1 pendiente (fuera del repo).