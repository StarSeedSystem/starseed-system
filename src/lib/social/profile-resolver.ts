import { createClient } from "@/utils/supabase/client";

export type ResolvedProfileData = {
    isOwner: boolean;
    name: string;
    handle: string;
    bio: string;
    avatar: string;
    cover: string;
    type: "sovereign" | "facet" | "not_found";
    id: string | null;
    /** (Adenda 219) Forma y encuadre de la foto de perfil, si el perfil lo definió. */
    avatarMarco?: Record<string, unknown> | null;
    /** (Adenda 219) Avatar 3D opcional (GLB/glTF + cámara, luz, animación). */
    avatar3d?: Record<string, unknown> | null;
};

export async function resolveProfileData(handle: string, viewerId?: string | null): Promise<ResolvedProfileData> {
    const supabase = createClient();
    const cleanHandle = handle.replace(/^@/, '');

    // 1. Try Sovereign Identity (os_profiles)
    const { data: sovData } = await supabase
        .from("os_profiles")
        .select("*")
        .or(`handle.eq.${cleanHandle},username.eq.${cleanHandle}`)
        .maybeSingle();

    if (sovData) {
        return {
            isOwner: viewerId === sovData.user_id,
            name: sovData.display_name || sovData.full_name || sovData.username || cleanHandle,
            handle: sovData.handle || sovData.username || cleanHandle,
            bio: sovData.bio || sovData.about || "",
            avatar: sovData.avatar_url || "",
            cover: sovData.cover_url || sovData.banner_url || "",
            // (Adenda 219) Forma/encuadre de la foto y avatar 3D, si los hay.
            avatarMarco: (sovData as { avatar_marco?: Record<string, unknown> | null }).avatar_marco ?? null,
            avatar3d: (sovData as { avatar_3d?: Record<string, unknown> | null }).avatar_3d ?? null,
            type: "sovereign",
            id: sovData.user_id,
        };
    }

    // 2. Try Facets (os_account_profiles)
    const { data: facetData } = await supabase
        .from("os_account_profiles")
        .select("*")
        .eq("handle", cleanHandle)
        .maybeSingle();

    if (facetData) {
        return {
            isOwner: viewerId === facetData.account,
            name: facetData.name || cleanHandle,
            handle: facetData.handle || cleanHandle,
            bio: facetData.bio || "",
            avatar: facetData.avatar_url || "",
            cover: facetData.cover_url || "",
            type: "facet",
            id: facetData.id,
        };
    }

    // 3. (Adenda 194) Red de seguridad: `public.profiles` — la tabla que
    // escriben el alta de cuenta y el rito de iniciación. Antes solo se miraba
    // en os_profiles/os_account_profiles, así que TODA cuenta nueva veía
    // «Perfil no encontrado» aunque su perfil existiera.
    const { data: baseData } = await supabase
        .from("profiles")
        .select("user_id,handle,display_name,bio,avatar_url,cover_url")
        .ilike("handle", cleanHandle)
        .maybeSingle();

    if (baseData) {
        const b = baseData as {
            user_id: string; handle?: string; display_name?: string;
            bio?: string; avatar_url?: string; cover_url?: string;
        };
        return {
            isOwner: viewerId === b.user_id,
            name: b.display_name || b.handle || cleanHandle,
            handle: b.handle || cleanHandle,
            bio: b.bio || "",
            avatar: b.avatar_url || "",
            cover: b.cover_url || "",
            type: "sovereign",
            id: b.user_id,
        };
    }

    return {
        isOwner: false,
        name: cleanHandle,
        handle: cleanHandle,
        bio: "Perfil no encontrado.",
        avatar: "",
        cover: "",
        type: "not_found",
        id: null,
    };
}
