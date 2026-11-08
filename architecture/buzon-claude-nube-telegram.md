# Buzón de Claude nube → Telegram y parte diario (BZN1108)

**Alex (2026-11-08)**: la «Síntesis diaria · Producción StarSeed» la escribe una tarea programada
de **Claude que corre en la NUBE**, no en la Mac, a las 07:54 de CDMX. Ese parte tiene que llegar
también al chat de Telegram vinculado a MetaGenesis y Hermes (destino de Hermes
`telegram:Maggasukha`) y cubrirse de los medidores y áreas de MetaGenesis **sin la Mac encendida**.

La sesión de Claude de la nube solo llega a **Supabase** (proyecto del OS por su conector MCP con
SQL), a Drive y a la web: no tiene llaves de nodo, ni de la puerta del A1, ni de Telegram, y NO debe
tenerlas. Por eso el camino es:

```
Claude nube (SQL) → metagenesis_buzon (Supabase) → líder de dirección → Hermes → Telegram
```

## 1. La tabla

`public.metagenesis_buzon` (migración `supabase/migrations/20261108120000_metagenesis_buzon.sql`):

| Columna | Qué |
|---|---|
| `id` | bigserial, clave |
| `t` | timestamptz, cuándo se escribió |
| `clase` | `aviso` (va a Telegram) o `parte` (lo lee Claude nube) |
| `de` | quién escribe, p. ej. `claude-sintesis-diaria` |
| `destino` | solo en avisos: `telegram:Maggasukha` |
| `asunto` | título corto (≤ 120) |
| `texto` | el contenido |
| `estado` | `pendiente` → `entregado` / `fallo` / `archivado` |
| `entregado_en`, `detalle` | lo anota el entregador |

Reglas en el propio esquema (CHECK): un `aviso` va SIEMPRE a `telegram:Maggasukha` y mide ≤ 12 000
caracteres; un `parte` no lleva destino, queda `archivado` y mide ≤ 40 000.

**Seguridad**: RLS activado y **sin políticas**: ni `anon` ni `authenticated` leen ni escriben nada.
Solo `service_role` (el conector MCP de Claude nube) y `postgres` (los nodos del líder) tocan la
tabla. Jamás una clave aquí: solo nombres de variables de entorno.

## 2. Quién escribe: Claude nube, por SQL

La tarea programada de la nube inserta directamente con su conector SQL:

```sql
-- Aviso a Telegram (una vez que termina la síntesis de la mañana):
insert into metagenesis_buzon (clase, de, destino, asunto, texto)
values ('aviso', 'claude-sintesis-diaria', 'telegram:Maggasukha',
        'Síntesis diaria 07:54', '<la síntesis, ≤ 12 000 caracteres>');

-- Parte diario para MetaGenesis (medidores, áreas y rumbos del día):
insert into metagenesis_buzon (clase, de, asunto, texto)
values ('parte', 'claude-sintesis-diaria',
        'Parte diario', '<el parte, ≤ 40 000 caracteres>');
```

## 3. Quién entrega: el líder de dirección (BZN1108B)

El entregador pregunta la cola de pendientes y los manda como el cartero ya manda a Telegram
(`scripts/puente/cartero_director.py`, `_entregar_telegram`):

```bash
hermes send -t telegram:Maggasukha -s "MetaGenesis" <texto>
```

Corre **solo si `lider_direccion.soy_lider()`** (arriendo en la puerta de datos del A1, IND1029B):
la Mac, el A1 o cualquier neurona; el primero que sea líder, y Telegram llega incluso sin la Mac. Al
entregar, marca el aviso `entregado` + `entregado_en` (o `fallo` + `detalle` si `hermes send`
devuelve error), para no repetirlo. Sondea el índice parcial de pendientes, no en bucle apretado.

## 4. El parte diario (BZN1108C)

Claude nube lo lee **al día siguiente**, antes de escribir la síntesis, para que el parte de ayer
alimente el de hoy con la memoria de qué pasó:

```sql
select texto from metagenesis_buzon
where clase='parte' order by t desc limit 1;
```

Con eso compone la síntesis de hoy con los medidores y áreas de MetaGenesis y vuelve a escribir
su aviso y su parte. La Mac nunca entra en el camino.

## 5. Límites

- **Destinos en lista blanca**: solo `telegram:Maggasukha` (validado por el CHECK). Cambiarlo es
  cambiar la migración, no un dato.
- **10 avisos al día**: tope de uso que aplica el entregador BZN1108B al sondear; más de eso,
  directamente no se entregan (se marca `fallo` con detalle, sin bombardear Telegram).
- Un `aviso` mide ≤ 12 000 caracteres (Telegram engorda el texto; el cartero corta a 3 500 si
  hace falta, como `_entregar_telegram` de siempre).

## 6. Cómo se ve en el Mando

En Genesis, la vista de Telegram/avisos muestra los avisos del buzón con su estado
(`pendiente`/`entregado`/`fallo`) y cuándo se entregaron; el parte diario no se manda a Telegram,
queda `archivado` y lo consume Claude nube al día siguiente. Si un aviso queda `fallo`, se ve con
su `detalle` para reparar. La publicación aplica la migración; nadie la corre a mano en producción.
