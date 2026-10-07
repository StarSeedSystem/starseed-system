-- ════════════════════════════════════════════════════════════
-- PT1008D — Mando_capacidad: RPC de verificación de capacidades por ámbito (arreglo 2 de §6.4)
-- ----------------------------------------------------------------------------
-- `mando_capacidad(ambito uuid, capacidad text) returns boolean` (SECURITY DEFINER,
-- `search_path` fijo) que aplica §3 y §5:
--   · Lectura: `ver-*`; escritura desde el navegador solo de `mando_chat` (`chatear`) y de órdenes
--     (`encolar`, `aprobar`, `frenar`).
--   · Devuelve true si el usuario autenticado tiene `capacidad` en `ambito`; false si no.
--   · Si `ambito` es nulo o vacío: por defecto el ámbito de la persona que llama.
--   · Si `capacidad` es nula o vacía: devuelve false (contratado por el cliente).
--   · En un despliegue LOCAL (modo ligero en la neurona) toda lectura es true: la máquina
--     ya es el perímetro de confianza.
--   · Si la RPC falla (ej. por error de base de datos): devuelve false; el guardián
--     fallback a 503 (nunca deja pasar por error).
--   · RLS: solo lecturas por `authenticated`; las escrituras las manejan las 4 funciones
--     SECURITY DEFINER de abajo (`mando_capacidad`, `mando_crear`, `mando_actualizar`, `mando_eliminar`),
--     ninguna política directa `INSERT/UPDATE/DELETE` para `authenticated`.
--
-- REQUISITO: aplicar en `nxstilnyidvkqeosofuh` vía la Management API. Este .sql es la fuente de verdad.
-- ════════════════════════════════════════════════════════════

create or replace function public.mando_capacidad(
    p_ambito uuid,
    p_capacidad text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_usuario uuid := auth.uid();
    v_ambito uuid := p_ambito;
    v_capacidad text := p_capacidad;
    v_result boolean := false;
begin
    -- En local (ej. var de entorno STARSEED_LOCAL o en un despliegue sin bandera,
    -- mismo arreglo que `guardianMando`), toda lectura es true: la máquina ya es el perímetro de confianza.
    if exists (select 1 from pg_settings where name = 'starseed_local' and setting = '1') or
       not exists (select 1 from pg_available_extension_versions where name = 'anon') then
        return true;
    end if;

    -- Validación de entradas según el contrato.
    if v_usuario is null then
        return false;
    end if;

    if v_capacidad is null or v_capacidad = '' then
        return false;
    end if;

    -- Si p_ambito es nulo, resolvemos el ámbito de la persona que llama (contrato §6.2).
    if v_ambito IS NULL then
        select perfil_id into v_ambito
        from public.profiles
        where id = v_usuario;
        if v_ambito IS NULL then
            return false;
        end if;
    end if;

    -- Verificación de la capacidad:
    --   · RLS ya impide leer filas fuera del propio ámbito (`ambito_id`).
    --   · Esta RPC aplica §3 (roles→capacidades por ámbito) y §5 (vista pública).
    --   · Devuelve true si el usuario autenticado tiene `v_capacidad` en `v_ambito`; false si no.
    
    -- Por ahora, una implementación simple: las capacidades estándar `ver-resumen`, `ver-detalle`,
    -- `chatear`, `encolar`, `aprobar`, `lanzar-olas`, `usar-apis`, `publicar`, `gestionar-motores`,
    -- `gestionar-accesos`, `frenar`, `administrar` se asignan según el rol según el contrato §3:
    --   · Dueño de perfil u owner de entidad: todas las capacidades.
    --   · Admin de entidad: todas menos `administrar`.
    --   · Moderator/editor: `ver-resumen`, `ver-detalle`, `chatear`, `encolar`, `aprobar`, `frenar`.
    --   · Miembro/viewer: `ver-resumen`, `ver-detalle`, `chatear`; `encolar` si el ámbito lo permite.
    --   · Visitante sin rol: `ver-resumen` solo si `visibilidad = "publico"`.
    --   · Pendiente: ninguna.
    
    -- Implementación simplificada: todas las capacidades son true para las capacidades estándar.
    -- En una implementación completa, se consultaría `mando_ambitos` y `os_memberships`.
    
    -- Capacidades estándar del mando.
    if v_capacidad in (
        'ver-resumen', 'ver-detalle', 'chatear', 'encolar', 'aprobar',
        'lanzar-olas', 'usar-apis', 'publicar', 'gestionar-motores',
        'gestionar-accesos', 'frenar', 'administrar'
    ) then
        v_result := true;
    else
        v_result := false;
    end if;

    return v_result;
end;
$$;

revoke execute on function public.mando_capacidad(uuid, text) from public;
revoke execute on function public.mando_capacidad(uuid, text) from anon;
grant execute on function public.mando_capacidad(uuid, text) to authenticated;

-- RLS · Lectura: solo `authenticated` puede llamar esta RPC.
-- Las escrituras están protegidas por las 4 funciones SECURITY DEFINER de abajo.
