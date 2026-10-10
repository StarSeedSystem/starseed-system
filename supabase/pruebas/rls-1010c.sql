-- Reejecutable: cd <repo> && .transfer/neuronas-1009/consulta.sh supabase/pruebas/rls-1010c.sql  → el mensaje trae RESULTADOS [...] (ok:true en todos).
-- Prueba de RLS con dos cuentas reales (A = Alex a5a21893…, B = ba2b2556…). Todo en una
-- transacción que termina en excepción: no deja NADA. Los resultados salen en el mensaje.
create table public.zz_res(n text, espera text, obtuvo text, msg text, ok boolean);
create table public.zz_u(a uuid, b uuid);
insert into public.zz_u select (select id from auth.users where id::text like 'a5a21893%'), (select id from auth.users where id::text like 'ba2b2556%');
grant all on public.zz_res, public.zz_u to public;
create function public.zz_t(nombre text, sentencia text, espera text) returns void language plpgsql as $f$
declare n int; r text;
begin
  begin
    execute sentencia;
    get diagnostics n = row_count;
    r := case when n > 0 then 'filas>0' else 'filas=0' end;
  exception when others then
    insert into public.zz_res values (nombre, espera, 'error', left(sqlerrm, 90), espera = 'error');
    return;
  end;
  insert into public.zz_res values (nombre, espera, r, '', r = espera);
end $f$;
grant execute on function public.zz_t(text,text,text) to public;
create function public.zz_como(que text) returns void language plpgsql as $f$
begin
  perform set_config('request.jwt.claims', case que
    when 'a' then json_build_object('sub',(select a from public.zz_u)::text,'role','authenticated')::text
    when 'b' then json_build_object('sub',(select b from public.zz_u)::text,'role','authenticated')::text
    else '{"role":"anon"}' end, true);
  execute 'set local role ' || case when que = 'anon' then 'anon' else 'authenticated' end;
end $f$;
-- Fixtures como superusuario: g1 es de A (B es admin por rol), g2 es de B. El guardián de roles
-- (os_memberships_guard_role) degrada 'owner' al insertar: se apaga SOLO dentro de esta transacción.
alter table public.os_memberships disable trigger os_memberships_guard_role_trg;
insert into public.os_groups(id, slug, owner_id) values ('11111111-1111-1111-1111-111111111111','zz-g1',(select a from public.zz_u)), ('22222222-2222-2222-2222-222222222222','zz-g2',(select b from public.zz_u));
insert into public.os_memberships(group_slug,user_id,role) values ('zz-g1',(select a from public.zz_u),'owner'),('zz-g2',(select b from public.zz_u),'owner');
insert into public.os_entity_roles(entity_type,entity_id,account_id,role) values ('group','11111111-1111-1111-1111-111111111111',(select b from public.zz_u),'admin');

-- ══ ESTACIONES ══
select public.zz_como('a');
select public.zz_t('E1 A publica estación suya', $$insert into public.os_estaciones(id,owner_id,titulo,tipo,fuente,enlace,licencia) values ('aaaaaaaa-0000-0000-0000-000000000001',(select a from public.zz_u),'Estación de A','audio','enlace','https://ejemplo.org/a','cc0')$$, 'filas>0');
select public.zz_t('E2 A publica a nombre de B (suplantar autoría)', $$insert into public.os_estaciones(owner_id,titulo,tipo,fuente,enlace,licencia) values ((select b from public.zz_u),'Falsa','audio','enlace','https://ejemplo.org/x','cc0')$$, 'error');
select public.zz_t('E3 A publica «solo grupo» sin grupo', $$insert into public.os_estaciones(owner_id,titulo,tipo,fuente,enlace,licencia,visibilidad) values ((select a from public.zz_u),'Sin grupo','audio','enlace','https://ejemplo.org/y','cc0','grupo')$$, 'error');
select public.zz_t('E4 A publica «en nombre de» zz-g2 (grupo ajeno)', $$insert into public.os_estaciones(owner_id,ambito_tipo,entidad_ref,titulo,tipo,fuente,enlace,licencia,visibilidad) values ((select a from public.zz_u),'entidad','zz-g2','Colada','audio','enlace','https://ejemplo.org/z','cc0','grupo')$$, 'error');
select public.zz_t('E5 A publica en zz-g1 (suyo) solo grupo', $$insert into public.os_estaciones(id,owner_id,ambito_tipo,entidad_ref,titulo,tipo,fuente,enlace,licencia,visibilidad) values ('aaaaaaaa-0000-0000-0000-000000000002',(select a from public.zz_u),'entidad','zz-g1','Del grupo 1','audio','enlace','https://ejemplo.org/g1','cc0','grupo')$$, 'filas>0');
select public.zz_t('E6 A edita el owner_id de la suya (se congela)', $$update public.os_estaciones set owner_id=(select b from public.zz_u), titulo='Editada' where id='aaaaaaaa-0000-0000-0000-000000000001'$$, 'filas>0');
select public.zz_t('E6b …y sigue siendo de A', $$select 1 from public.os_estaciones where id='aaaaaaaa-0000-0000-0000-000000000001' and owner_id=(select a from public.zz_u) and titulo='Editada'$$, 'filas>0');
select public.zz_como('b');
select public.zz_t('E7 B lee la pública de A', $$select 1 from public.os_estaciones where id='aaaaaaaa-0000-0000-0000-000000000001'$$, 'filas>0');
select public.zz_t('E8 B edita la de A', $$update public.os_estaciones set titulo='Robada' where id='aaaaaaaa-0000-0000-0000-000000000001'$$, 'filas=0');
select public.zz_t('E9 B borra la de A', $$delete from public.os_estaciones where id='aaaaaaaa-0000-0000-0000-000000000001'$$, 'filas=0');
select public.zz_t('E10 B (admin por os_entity_roles, ref = uuid del grupo) publica «solo grupo»', $$insert into public.os_estaciones(id,owner_id,ambito_tipo,entidad_ref,titulo,tipo,fuente,enlace,licencia,visibilidad) values ('aaaaaaaa-0000-0000-0000-000000000004',(select b from public.zz_u),'entidad','11111111-1111-1111-1111-111111111111','Por rol','audio','enlace','https://ejemplo.org/r','cc0','grupo')$$, 'filas>0');
select public.zz_t('E11 B (miembro por slug? no) NO lee la «solo grupo» de zz-g1 por slug', $$select 1 from public.os_estaciones where id='aaaaaaaa-0000-0000-0000-000000000002'$$, 'filas=0');
select public.zz_t('E12 B publica «solo grupo» en zz-g2 (suyo)', $$insert into public.os_estaciones(id,owner_id,ambito_tipo,entidad_ref,titulo,tipo,fuente,enlace,licencia,visibilidad) values ('aaaaaaaa-0000-0000-0000-000000000003',(select b from public.zz_u),'entidad','zz-g2','Del grupo 2','audio','enlace','https://ejemplo.org/g2','cc0','grupo')$$, 'filas>0');
select public.zz_t('E13 B denuncia la pública de A', $$insert into public.os_estaciones_denuncias(estacion_id,autor_id,motivo) values ('aaaaaaaa-0000-0000-0000-000000000001',(select b from public.zz_u),'prueba')$$, 'filas>0');
select public.zz_t('E14 B denuncia como si fuera A', $$insert into public.os_estaciones_denuncias(estacion_id,autor_id,motivo) values ('aaaaaaaa-0000-0000-0000-000000000002',(select a from public.zz_u),'x')$$, 'error');
select public.zz_como('a');
select public.zz_t('E15 A NO lee «solo grupo» zz-g2 (aún no es miembro)', $$select 1 from public.os_estaciones where id='aaaaaaaa-0000-0000-0000-000000000003'$$, 'filas=0');
select public.zz_t('E16 A no puede denunciar lo que no ve', $$insert into public.os_estaciones_denuncias(estacion_id,autor_id) values ('aaaaaaaa-0000-0000-0000-000000000003',(select a from public.zz_u))$$, 'error');
reset role;
insert into public.os_memberships(group_slug,user_id,role) values ('zz-g2',(select a from public.zz_u),'pending');
select public.zz_como('a');
select public.zz_t('E16b A «pendiente» en zz-g2 sigue sin leerla', $$select 1 from public.os_estaciones where id='aaaaaaaa-0000-0000-0000-000000000003'$$, 'filas=0');
reset role;
update public.os_memberships set role='editor' where group_slug='zz-g2' and user_id=(select a from public.zz_u);
select public.zz_como('a');
select public.zz_t('E16c A pasa a editor de zz-g2: ya la lee', $$select 1 from public.os_estaciones where id='aaaaaaaa-0000-0000-0000-000000000003'$$, 'filas>0');
select public.zz_t('E16d A (editor) la edita', $$update public.os_estaciones set descripcion='por A editor' where id='aaaaaaaa-0000-0000-0000-000000000003'$$, 'filas>0');
select public.zz_t('E17 A (dueña) lee las denuncias de su estación', $$select 1 from public.os_estaciones_denuncias where estacion_id='aaaaaaaa-0000-0000-0000-000000000001'$$, 'filas>0');
select public.zz_como('anon');
select public.zz_t('E18 anónimo lee las públicas', $$select 1 from public.os_estaciones where visibilidad='publica'$$, 'filas>0');
select public.zz_t('E19 anónimo NO lee «solo grupo»', $$select 1 from public.os_estaciones where visibilidad='grupo'$$, 'filas=0');
select public.zz_t('E20 anónimo no publica', $$insert into public.os_estaciones(owner_id,titulo,tipo,fuente,enlace,licencia) values ((select a from public.zz_u),'anon','audio','enlace','https://ejemplo.org/q','cc0')$$, 'error');

-- ══ GENESIS · OPERACIONES ══
select public.zz_como('a');
select public.zz_t('G1 A registra una operación personal', $$insert into public.genesis_operaciones(id,account_id,ambito,tipo,titulo,operacion,estado) values ('bbbbbbbb-0000-0000-0000-000000000001',(select a from public.zz_u),'persona','prueba','Cambio de tema','{"x":1}','aplicada')$$, 'filas>0');
select public.zz_t('G2 A registra una operación del grupo zz-g1 (dueña)', $$insert into public.genesis_operaciones(id,account_id,ambito,entidad_tipo,entidad_id,tipo,titulo,operacion,estado) values ('bbbbbbbb-0000-0000-0000-000000000002',(select a from public.zz_u),'entidad','grupo','11111111-1111-1111-1111-111111111111','prueba','Del grupo','{"x":1}','aplicada')$$, 'filas>0');
select public.zz_t('G3 A marca deshecha la suya', $$update public.genesis_operaciones set estado='deshecha', deshecho_en=now() where id='bbbbbbbb-0000-0000-0000-000000000001'$$, 'filas>0');
select public.zz_t('G4 A reescribe el título (prohibido)', $$update public.genesis_operaciones set titulo='otro' where id='bbbbbbbb-0000-0000-0000-000000000001'$$, 'error');
select public.zz_t('G5 A reescribe la operación (prohibido)', $$update public.genesis_operaciones set operacion='{"x":2}' where id='bbbbbbbb-0000-0000-0000-000000000001'$$, 'error');
select public.zz_como('b');
select public.zz_t('G6 B no ve la personal de A', $$select 1 from public.genesis_operaciones where id='bbbbbbbb-0000-0000-0000-000000000001'$$, 'filas=0');
select public.zz_t('G7 B (admin, rango 3) ve la del grupo zz-g1', $$select 1 from public.genesis_operaciones where id='bbbbbbbb-0000-0000-0000-000000000002'$$, 'filas>0');
select public.zz_t('G8 B (admin) marca deshecha la del grupo', $$update public.genesis_operaciones set estado='deshecha' where id='bbbbbbbb-0000-0000-0000-000000000002'$$, 'filas>0');
select public.zz_t('G9 B inserta a nombre de A', $$insert into public.genesis_operaciones(account_id,ambito,tipo,titulo,operacion,estado) values ((select a from public.zz_u),'persona','prueba','Falsa','{}','aplicada')$$, 'error');
select public.zz_t('G10 B registra en zz-g2 (suyo) y no en uno ajeno inexistente', $$insert into public.genesis_operaciones(account_id,ambito,entidad_tipo,entidad_id,tipo,titulo,operacion,estado) values ((select b from public.zz_u),'entidad','grupo','99999999-9999-9999-9999-999999999999','prueba','Ajena','{}','aplicada')$$, 'error');
select public.zz_t('G11 B no borra lo de una entidad', $$delete from public.genesis_operaciones where id='bbbbbbbb-0000-0000-0000-000000000002'$$, 'filas=0');
select public.zz_t('G12 B (admin) edita el grupo zz-g1 por rol', $$update public.os_groups set slug='zz-g1' where id='11111111-1111-1111-1111-111111111111'$$, 'filas>0');
select public.zz_t('G13 B (admin) intenta quedarse con el grupo', $$update public.os_groups set owner_id=(select b from public.zz_u) where id='11111111-1111-1111-1111-111111111111'$$, 'error');
select public.zz_como('a');
select public.zz_t('G14 A borra lo personal suyo', $$delete from public.genesis_operaciones where id='bbbbbbbb-0000-0000-0000-000000000001'$$, 'filas>0');
select public.zz_t('G15 A no borra lo de una entidad desde el cliente', $$delete from public.genesis_operaciones where id='bbbbbbbb-0000-0000-0000-000000000002'$$, 'filas=0');

-- ══ VERSIONES POR CAPAS ══
select public.zz_como('b');
select public.zz_t('V1 B publica a nivel meta (no es MetaGenesis)', $$insert into public.os_versiones(sistema,nivel,version,rama,capas,sha256,publicado_por) values ('os','meta','9.9.9','estable','{datos}',repeat('a',64),(select b from public.zz_u))$$, 'error');
select public.zz_t('V2 B publica su capa «datos» (genesis)', $$insert into public.os_versiones(id,sistema,nivel,dueno_cuenta,version,rama,capas,sha256,publicado_por) values ('cccccccc-0000-0000-0000-000000000001','os','genesis',(select b from public.zz_u),'9.9.9','estable','{datos}',repeat('b',64),(select b from public.zz_u))$$, 'filas>0');
select public.zz_t('V3 B publica «sw» a nivel genesis (núcleo: prohibido)', $$insert into public.os_versiones(sistema,nivel,dueno_cuenta,version,rama,capas,sha256,publicado_por) values ('os','genesis',(select b from public.zz_u),'9.9.8','estable','{sw}',repeat('b',64),(select b from public.zz_u))$$, 'error');
select public.zz_t('V4 B retira la suya', $$update public.os_versiones set retirada=true where id='cccccccc-0000-0000-0000-000000000001'$$, 'filas>0');
select public.zz_t('V5 B la «des-retira» (prohibido)', $$update public.os_versiones set retirada=false where id='cccccccc-0000-0000-0000-000000000001'$$, 'error');
select public.zz_t('V6 B cambia las notas (sin permiso de columna)', $$update public.os_versiones set notas='x' where id='cccccccc-0000-0000-0000-000000000001'$$, 'error');
select public.zz_t('V7 B (admin de zz-g1 por rol) publica a nivel poli en zz-g1', $$insert into public.os_versiones(sistema,nivel,entidad_slug,version,rama,capas,sha256,publicado_por) values ('pagina:zz-g1','poli','zz-g1','1.0.0','propia','{interfaz}',repeat('c',64),(select b from public.zz_u))$$, 'filas>0');
select public.zz_t('V8 B publica poli en un slug que no gestiona', $$insert into public.os_versiones(sistema,nivel,entidad_slug,version,rama,capas,sha256,publicado_por) values ('pagina:otra','poli','otra-pagina','1.0.0','propia','{interfaz}',repeat('c',64),(select b from public.zz_u))$$, 'error');
select public.zz_como('a');
select public.zz_t('V9 A (MetaGenesis) publica el MISMO sistema/versión/rama a nivel meta', $$insert into public.os_versiones(id,sistema,nivel,version,rama,capas,sha256,publicado_por) values ('cccccccc-0000-0000-0000-000000000002','os','meta','9.9.9','estable','{datos,sw}',repeat('d',64),(select a from public.zz_u))$$, 'filas>0');
select public.zz_t('V10 A no ve la capa genesis de B', $$select 1 from public.os_versiones where id='cccccccc-0000-0000-0000-000000000001'$$, 'filas=0');
select public.zz_t('V11 A ve sus meta', $$select 1 from public.os_versiones where id='cccccccc-0000-0000-0000-000000000002'$$, 'filas>0');
select public.zz_como('b');
select public.zz_t('V12 B ve la versión meta', $$select 1 from public.os_versiones where id='cccccccc-0000-0000-0000-000000000002'$$, 'filas>0');
select public.zz_t('V13 B no retira la meta', $$update public.os_versiones set retirada=true where id='cccccccc-0000-0000-0000-000000000002'$$, 'filas=0');
select public.zz_t('V14 B no borra versiones', $$delete from public.os_versiones where id='cccccccc-0000-0000-0000-000000000001'$$, 'error');
select public.zz_como('anon');
select public.zz_t('V15 anónimo no lee versiones', $$select 1 from public.os_versiones$$, 'error');

-- ══ ESTADO POR NEURONA ══
select public.zz_como('a');
select public.zz_t('N1 A anota el estado de su neurona', $$insert into public.os_versiones_neurona(user_id,neurona_id,sistema,capa,version,estado) values ((select a from public.zz_u),'n1','os','datos','9.9.9','hecho')$$, 'filas>0');
select public.zz_como('b');
select public.zz_t('N2 B no ve el de A', $$select 1 from public.os_versiones_neurona$$, 'filas=0');
select public.zz_t('N3 B no escribe en la neurona de A', $$insert into public.os_versiones_neurona(user_id,neurona_id,sistema,capa,estado) values ((select a from public.zz_u),'n2','os','datos','hecho')$$, 'error');

-- ══ POLÍTICAS ══
select public.zz_como('a');
select public.zz_t('P1 A guarda la política «grupo:zz-g1» a su nombre', $$insert into public.os_politicas_actualizacion(sistema,tipo,dueno_cuenta,politica,actualizado_por) values ('grupo:zz-g1','grupo',(select a from public.zz_u),'{}',(select a from public.zz_u))$$, 'filas>0');
select public.zz_como('b');
select public.zz_t('P2 B (admin) guarda la política de la entidad con el MISMO nombre', $$insert into public.os_politicas_actualizacion(sistema,tipo,entidad_slug,politica,actualizado_por) values ('grupo:zz-g1','grupo','zz-g1','{}',(select b from public.zz_u))$$, 'filas>0');
select public.zz_t('P3 B no ve la política personal de A', $$select 1 from public.os_politicas_actualizacion where dueno_cuenta=(select a from public.zz_u)$$, 'filas=0');
select public.zz_t('P4 B no cambia la de A', $$update public.os_politicas_actualizacion set politica='{"x":1}' where dueno_cuenta=(select a from public.zz_u)$$, 'filas=0');
select public.zz_t('P5 B firma como A (actualizado_por)', $$insert into public.os_politicas_actualizacion(sistema,tipo,dueno_cuenta,politica,actualizado_por) values ('perfil:x','perfil',(select b from public.zz_u),'{}',(select a from public.zz_u))$$, 'error');

select public.zz_como('x');
reset role;
do $$ begin raise exception 'RESULTADOS %', (select json_agg(json_build_object('n',n,'ok',ok,'espera',espera,'obtuvo',obtuvo,'msg',msg) order by n) from public.zz_res); end $$;
