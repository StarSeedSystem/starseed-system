-- Create Dashboard Tables for Customizable Layouts

-- ENUM: Widget Types (Extendable)
CREATE TYPE public.widget_type AS ENUM (
  'EXPLORE_NETWORK', 
  'MY_PAGES', 
  'POLITICAL_SUMMARY',
  'LEARNING_PATH',
  'SOCIAL_RADAR',
  'WELLNESS',
  'COLLAB_PROJECTS',
  'LIVE_DATA'
);

-- TABLE: Dashboards (e.g., "Main", "Politics")
CREATE TABLE public.dashboards (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Dashboards
ALTER TABLE public.dashboards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dashboards" 
  ON public.dashboards FOR SELECT 
  USING (auth.uid() = profile_id);

CREATE POLICY "Users can insert own dashboards" 
  ON public.dashboards FOR INSERT 
  WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Users can update own dashboards" 
  ON public.dashboards FOR UPDATE 
  USING (auth.uid() = profile_id);

CREATE POLICY "Users can delete own dashboards" 
  ON public.dashboards FOR DELETE 
  USING (auth.uid() = profile_id);

-- TABLE: Dashboard Widgets
CREATE TABLE public.dashboard_widgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  dashboard_id UUID NOT NULL REFERENCES public.dashboards(id) ON DELETE CASCADE,
  widget_type public.widget_type NOT NULL,
  -- Layout JSON: { "x": 0, "y": 0, "w": 2, "h": 2 }
  layout JSONB NOT NULL DEFAULT '{}'::JSONB,
  -- Settings JSON: { "filter": "recent", "category": "tech" }
  settings JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Dashboard Widgets
ALTER TABLE public.dashboard_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view widgets of own dashboards" 
  ON public.dashboard_widgets FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM public.dashboards 
      WHERE id = dashboard_widgets.dashboard_id 
      AND profile_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert widgets to own dashboards" 
  ON public.dashboard_widgets FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.dashboards 
      WHERE id = dashboard_widgets.dashboard_id 
      AND profile_id = auth.uid()
    )
  );

CREATE POLICY "Users can update widgets of own dashboards" 
  ON public.dashboard_widgets FOR UPDATE 
  USING (
    EXISTS (
      SELECT 1 FROM public.dashboards 
      WHERE id = dashboard_widgets.dashboard_id 
      AND profile_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete widgets of own dashboards" 
  ON public.dashboard_widgets FOR DELETE 
  USING (
    EXISTS (
      SELECT 1 FROM public.dashboards 
      WHERE id = dashboard_widgets.dashboard_id 
      AND profile_id = auth.uid()
    )
  );

-- TRIGGER: Auto-create Default Dashboard for New Users
-- We will update the handle_new_user function or add a separate trigger
CREATE OR REPLACE FUNCTION public.create_default_dashboard()
RETURNS TRIGGER AS $$
DECLARE
  new_dashboard_id UUID;
BEGIN
  -- Create "Main" dashboard
  INSERT INTO public.dashboards (profile_id, name, is_default)
  VALUES (NEW.id, 'Principal', TRUE)
  RETURNING id INTO new_dashboard_id;

  -- Add default widgets
  INSERT INTO public.dashboard_widgets (dashboard_id, widget_type, layout)
  VALUES 
    (new_dashboard_id, 'EXPLORE_NETWORK', '{"x": 0, "y": 0, "w": 12, "h": 4, "i": "explore"}'::JSONB),
    (new_dashboard_id, 'MY_PAGES', '{"x": 0, "y": 4, "w": 6, "h": 6, "i": "pages"}'::JSONB),
    (new_dashboard_id, 'POLITICAL_SUMMARY', '{"x": 6, "y": 4, "w": 6, "h": 6, "i": "politics"}'::JSONB);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger after profile creation
CREATE TRIGGER on_profile_created_create_dashboard
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.create_default_dashboard();
