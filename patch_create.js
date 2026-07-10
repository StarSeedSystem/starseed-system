const fs = require('fs');
const file = '/Users/alex/Documents/starseed-os-main/src/lib/profiles/profiles.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/const { data, error } = await supabase[\s\S]*?\.maybeSingle\(\);/s, `const { data, error } = await supabase
            .from("os_account_profiles")
            .insert({
                account: uid,
                name,
                handle,
                kind: input.kind ?? "personal",
                avatar_url: input.avatarUrl ?? null,
                cover_url: input.coverUrl ?? null,
                bio: input.bio ?? null,
                visibility: input.visibility ?? "public",
                is_default: input.isDefault ?? false,
            })
            .select("*")
            .maybeSingle();
        if (error) {
            console.error("createProfile error:", error);
        }`);

fs.writeFileSync(file, content);
