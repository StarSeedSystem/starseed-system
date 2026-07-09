const fs = require('fs');
const path = '/Users/alex/Documents/starseed-os-main/src/lib/social/os-profiles.ts';
let code = fs.readFileSync(path, 'utf8');

// We want to replace the update block with a check and insert if needed.
const blockToReplace = `    try {
        const { data, error } = await supabase
            .from("os_profiles")
            .update(patch)
            .eq("user_id", user.id)
            .select("*")
            .single();
        if (error) throw error;
        return { ok: true, profile: normalizeProfile(data as ProfileRow) };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }`;

const newBlock = `    try {
        let { data, error } = await supabase
            .from("os_profiles")
            .update(patch)
            .eq("user_id", user.id)
            .select("*")
            .single();
        
        if (error && error.code === 'PGRST116') {
            // No profile exists yet, insert instead
            const insertPatch = { ...patch, user_id: user.id };
            const res = await supabase
                .from("os_profiles")
                .insert(insertPatch)
                .select("*")
                .single();
            data = res.data;
            error = res.error;
        }

        if (error) throw error;
        return { ok: true, profile: normalizeProfile(data as ProfileRow) };
    } catch (e: any) {
        return { ok: false, error: e?.message || "error" };
    }`;

code = code.replace(blockToReplace, newBlock);
fs.writeFileSync(path, code);
