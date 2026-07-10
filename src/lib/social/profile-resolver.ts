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
