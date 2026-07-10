const fs = require('fs');
const file = '/Users/alex/Documents/starseed-os-main/src/app/(app)/profile/[username]/page.tsx';
let content = fs.readFileSync(file, 'utf8');

// Add import
if (!content.includes('import { resolveProfileData, type ResolvedProfileData }')) {
    content = content.replace('import { useAccount } from "@/context/account-context";', 
        'import { useAccount } from "@/context/account-context";\nimport { resolveProfileData, type ResolvedProfileData } from "@/lib/social/profile-resolver";\nimport { useEffect } from "react";\nimport { Loader2 } from "lucide-react";');
}

// Replace static data resolving with state and useEffect
const targetStr = `    const derivedName = pageHandle === 'me'
        ? 'Mi Perfil'
        : username.charAt(0).toUpperCase() + username.slice(1).replace(/-/g, ' ');
    const accountName = str(accountProfile?.display_name) || str(accountProfile?.full_name);
    const accountAvatar = str(accountProfile?.avatar_url);
    const accountCover = str(accountProfile?.cover_url) || str(accountProfile?.banner_url);
    const accountBio = str(accountProfile?.bio) || str(accountProfile?.about);

    const profileData = pageData[username] || {
        // Datos REALES de la cuenta soberana cuando el perfil es propio;
        // si no, derivados del slug (sin imágenes falsas: iniciales).
        name: (isOwner && accountName) || derivedName,
        handle: \`@\${pageHandle}\`,
        bio: isOwner ? accountBio : \`Página de \${username.replace(/-/g, ' ')}.\`,
        avatar: isOwner ? accountAvatar : "",
        cover: isOwner ? accountCover : "",
        dataAiHint: "profile avatar",
        coverHint: "abstract pattern",
        isUser: isOwner,
        pageType: 'personal',
    };`;

const replacementStr = `    const [resolvedData, setResolvedData] = useState<ResolvedProfileData | null>(null);
    const [loadingProfile, setLoadingProfile] = useState(true);

    useEffect(() => {
        let alive = true;
        setLoadingProfile(true);
        // Viewer ID is user?.id if logged in
        resolveProfileData(pageHandle, user?.id).then(data => {
            if (alive) {
                setResolvedData(data);
                setLoadingProfile(false);
            }
        });
        return () => { alive = false; };
    }, [pageHandle, user?.id]);

    const profileData = {
        name: resolvedData?.name || pageHandle,
        handle: \`@\${resolvedData?.handle || pageHandle}\`,
        bio: resolvedData?.bio || "",
        avatar: resolvedData?.avatar || "",
        cover: resolvedData?.cover || "",
        dataAiHint: "profile avatar",
        coverHint: "abstract pattern",
        isUser: resolvedData?.isOwner || false,
        pageType: 'personal',
    };`;

content = content.replace(targetStr, replacementStr);

// Also need to handle the loading state
const activeTabStr = `const [activeTab, setActiveTab] = useState("dashboard");`;
const activeTabReplacement = `const [activeTab, setActiveTab] = useState("dashboard");
    
    if (loadingProfile) {
        return (
            <div className="flex flex-1 items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="Cargando perfil" />
            </div>
        );
    }`;

content = content.replace(activeTabStr, activeTabReplacement);

// Fix `isOwner` usage lower down by using `profileData.isUser` or `resolvedData?.isOwner`
content = content.replace(/isOwner/g, "(resolvedData?.isOwner || false)");

fs.writeFileSync(file, content);
console.log("Patched Profile Page!");
