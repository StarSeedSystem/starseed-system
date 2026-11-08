# SOP · Buzón Claude nube → Telegram y parte diario (BZN1108)

> **Fecha:** 2026-11-08 · **Estado:** contrato de la tabla `public.metagenesis_buzon`
> (migración `supabase/migrations/20261108120000_metagenesis_buzon.sql` — ESCRITA,
> NO APLICADA: la aplica la publicación de siempre).

## 1 · Qué es

La «Síntesis diaria · Producción StarSeed» la escribe una tarea programada de Claude
que corre **en la NUBE, no en la Mac**, a las 07:54 CDMX. Esa sesión de nube solo llega
a **Supabase** (proyecto del OS `pqzdpmedcsgcedkvndzl`, por su conector MCP con SQL),
a **Drive** y a **la web**: no tiene llaves de nodo, ni de la puerta del A1, ni de
Telegram — y **no debe tenerlas**.

El **buzón** (`metagenesis_buzon`) es el sello del camino para que el resultado llegue
a Telegram y a la panorámica del día sin la Mac encendida:

```
Claude nube (SQL) ──insert──▶ metagenesis_buzon ──aviso──▶ líder de dirección ──hermes send──▶ Telegram
                                      │                                        (IND1029B + IND1029G)
                                      └──parte──▶ lo relee Claude nube (panorámica del día)
```

## 2 · Quién escribe

**Claude nube**, por SQL, con su conector MCP de Supabase. Aviso (va a Telegram):

```sql
insert into public.metagenesis_buzon (clase, de, destino, asunto, texto)
values ('aviso', 'claude-sintesis-diaria', 'telegram:Maggasukha',
        'Síntesis diaria · <fecha>', '<texto de ≤ 12 000 caracteres>');
```

Un parte diario (se archiva, no viaja):

```sql
insert into public.metagenesis_buzon (clase, de, asunto, texto)
values ('parte', 'creametagenesis-sintesis-diaria',
        'Parte diario · <fecha>', '<texto de ≤ 40 000 caracteres>');
```

El disparador mete cada parte como `estado = 'archivado'` y cada aviso entra
`'pendiente'` por defecto; las restricciones de la tabla cierran el resto
(destino en lista blanca solo `telegram:Maggasukha`, tamaños, `entregado_en` solo
con `'entregado'`).

## 3 · Quién entrega

**BZN1108B**: el líder de dirección (IND1029B) recoge los avisos pendientes con la
clave de servicio, los entrega como el cartero de siempre
(`scripts/puente/cartero_director.py` `_entregar_telegram` → `hermes send -t telegram:Maggasukha`,
IND1029G) y marca:

```sql
update public.metagenesis_buzon
   set estado = 'entregado', entregado_en = now()   -- o ('fallo', detalle)
 where id = <id>;
```

## 4 · El parte diario (BZN1108C)

Lo escribe Claude nube como `clase = 'parte'` y lo relee ella misma al construir la
siguiente panorámica, sin la Mac:

```sql
select texto from public.metagenesis_buzon
 where clase = 'parte' order by t desc limit 1;
```

## 5 · Límites

- **Lista blanca cerrada**: la única destinación válida de un aviso es
  `telegram:Maggasukha` (el que Hermes ya usa con Alex). Otro destino lo rechaza
  la restricción de la tabla, no cada nodo: la lista vive en una sola pieza.
- **10 avisos al día**: el tope lo mira el entregador (BZN1108B) sobre
  `count(*) where clase = 'aviso' and t > now() - interval '1 day'`; la tabla no
  lo exige porque el parte también es por día y los repetidos conviene verlos, no
  botarlos.
- Tamaños: aviso ≤ 12 000 caracteres, parte ≤ 40 000, asunto ≤ 120.
- Nada de claves ni valores por el buzón: solo textos, clases y estados. Y ninguna
  administración por aquí: RLS activada y **sin políticas** para `anon` ni
  `authenticated` — solo escriben y leen el conector de Claude y los nodos, con la
  clave de servicio.

## 6 · Cómo se ve en el Mando

Una tarjeta en el Mando de MetaGenesis (neurona de dirección) con el último aviso
entregado y el último parte: asunto, hora, `de` y estado; el estado 'fallo' enseña
el `detalle` del rechazo de entrega. Es solo lectura del Creador y de los miembros
de dirección (la tabla en sí sigue cerrada a las personas: la tarjeta la alimenta
el estado compartido de la puerta de datos, como los medidores).
