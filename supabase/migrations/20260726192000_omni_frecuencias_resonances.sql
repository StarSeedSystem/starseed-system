-- Migration para el sistema de "Resonancias" (Seguidores) en Omni-Frecuencias Holográficas

CREATE TABLE IF NOT EXISTS public.omni_resonances (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    follower_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(follower_id, following_id)
);

-- Habilitar RLS
ALTER TABLE public.omni_resonances ENABLE ROW LEVEL SECURITY;

-- Políticas de Seguridad (RLS)
CREATE POLICY "Las resonancias son visibles públicamente."
    ON public.omni_resonances FOR SELECT
    USING (true);

CREATE POLICY "Un usuario puede resonar con otros."
    ON public.omni_resonances FOR INSERT
    WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Un usuario puede dejar de resonar con otros."
    ON public.omni_resonances FOR DELETE
    USING (auth.uid() = follower_id);
