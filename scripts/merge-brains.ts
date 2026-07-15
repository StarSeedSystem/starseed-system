import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) throw new Error("Missing Supabase config");
const supabase = createClient(supabaseUrl, supabaseKey);

async function mergeBrains() {
  console.log("Fetching all brains...");
  const { data: brains, error } = await supabase.from('brains').select('*').order('created_at', { ascending: true });
  if (error) throw error;

  // Group by owner
  const brainsByOwner = {};
  for (const b of brains) {
    if (!brainsByOwner[b.owner]) brainsByOwner[b.owner] = [];
    brainsByOwner[b.owner].push(b);
  }

  for (const [owner, userBrains] of Object.entries(brainsByOwner)) {
    // Only looking at default StarSeed brains (scope = account, scope_ref = null)
    const accountBrains = userBrains.filter(b => b.scope === 'account' && !b.scope_ref);
    if (accountBrains.length <= 1) continue;

    console.log(`Found ${accountBrains.length} account brains for owner ${owner}. Merging into the oldest one...`);
    
    // Sort by created_at just in case
    accountBrains.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    
    const primaryBrain = accountBrains[0];
    const duplicates = accountBrains.slice(1);
    
    let mergedIncludes = { ...primaryBrain.includes };
    if (!mergedIncludes.personalities) mergedIncludes.personalities = [];
    
    for (const dup of duplicates) {
      if (dup.includes && dup.includes.personalities) {
        mergedIncludes.personalities.push(...dup.includes.personalities);
      }
    }
    
    // Deduplicate personalities
    mergedIncludes.personalities = [...new Set(mergedIncludes.personalities)];
    
    // Update primary brain
    console.log(`Updating primary brain ${primaryBrain.id}...`);
    await supabase.from('brains').update({ includes: mergedIncludes }).eq('id', primaryBrain.id);
    
    // Delete duplicates
    for (const dup of duplicates) {
      console.log(`Deleting duplicate brain ${dup.id}...`);
      await supabase.from('brains').delete().eq('id', dup.id);
    }
    console.log(`Merged ${duplicates.length} duplicates for owner ${owner}.`);
  }
}

mergeBrains().then(() => console.log("Done")).catch(console.error);
