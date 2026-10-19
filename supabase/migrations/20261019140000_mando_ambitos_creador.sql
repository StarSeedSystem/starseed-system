-- Arreglo 2026-10-19 (autorizado por Alex): el creador ve su propio ámbito.
-- Motivo medido: `insert ... returning` en mando_ambitos fallaba con «new row violates row-level security
-- policy», porque la fila nueva debe pasar la política SELECT y mando_capacidad() no la ve dentro de la
-- misma sentencia. Migración ADITIVA: añade una política permisiva más; no cambia las demás.
drop policy if exists mando_ambitos_select_creador on public.mando_ambitos;
create policy mando_ambitos_select_creador on public.mando_ambitos
  for select using (creado_por = auth.uid());
