-- ============================================================
-- SynthForge AI - Supabase Database Schema
-- Multi-tenant architecture with Row Level Security
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. PROFILES (extends Supabase auth.users)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- 2. ORGANIZATIONS (Multi-tenant isolation)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  logo_url TEXT,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise')),
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. ORGANIZATION MEMBERS (User-Org membership with roles)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Org members can view their org
CREATE POLICY "Members can view their organizations"
  ON public.organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = id AND user_id = auth.uid()
    )
  );

-- Org owners/admins can update their org
CREATE POLICY "Admins can update organizations"
  ON public.organizations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Members can view other members in their org
CREATE POLICY "Members can view org membership"
  ON public.organization_members FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

-- Org admins can add members
CREATE POLICY "Admins can add members"
  ON public.organization_members FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Org admins can update member roles
CREATE POLICY "Admins can update member roles"
  ON public.organization_members FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- Org owners can remove members
CREATE POLICY "Admins can remove members"
  ON public.organization_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- 4. WORKSPACES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.workspaces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  description TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, slug)
);

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace visible to org members"
  ON public.workspaces FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can create workspaces"
  ON public.workspaces FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_id AND user_id = auth.uid() AND role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Admins can update workspaces"
  ON public.workspaces FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete workspaces"
  ON public.workspaces FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- 5. PROJECTS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Projects visible to org members"
  ON public.projects FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workspace_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create projects"
  ON public.projects FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workspace_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Members can update projects"
  ON public.projects FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workspace_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Admins can delete projects"
  ON public.projects FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workspace_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- 6. SYNTHETIC DATABASES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.synthetic_databases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  db_type TEXT NOT NULL DEFAULT 'postgresql',
  schema_json JSONB NOT NULL DEFAULT '[]',
  data_json JSONB NOT NULL DEFAULT '{}',
  row_count INTEGER NOT NULL DEFAULT 0,
  quality_score REAL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generating', 'ready', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.synthetic_databases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Databases visible to org members"
  ON public.synthetic_databases FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.workspaces w ON w.id = p.workspace_id
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE p.id = project_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create databases"
  ON public.synthetic_databases FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.workspaces w ON w.id = p.workspace_id
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE p.id = project_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Members can update databases"
  ON public.synthetic_databases FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.workspaces w ON w.id = p.workspace_id
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE p.id = project_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'member')
    )
  );

CREATE POLICY "Members can delete databases"
  ON public.synthetic_databases FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.projects p
      JOIN public.workspaces w ON w.id = p.workspace_id
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE p.id = project_id AND om.user_id = auth.uid() AND om.role IN ('owner', 'admin', 'member')
    )
  );

-- ============================================================
-- 7. CONVERSATIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  database_id UUID REFERENCES public.synthetic_databases(id) ON DELETE SET NULL,
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'New Conversation',
  agent_mode TEXT NOT NULL DEFAULT 'auto' CHECK (agent_mode IN ('plan', 'execute', 'auto')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived', 'error')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Conversations visible to org members"
  ON public.conversations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workspace_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workspace_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update conversations"
  ON public.conversations FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workspace_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete conversations"
  ON public.conversations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.workspaces w
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE w.id = workspace_id AND om.user_id = auth.uid()
    )
  );

-- ============================================================
-- 8. MESSAGES
-- ============================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'agent')),
  content TEXT NOT NULL DEFAULT '',
  sql_code TEXT,
  agent_name TEXT,
  reasoning_steps JSONB DEFAULT '[]',
  options JSONB,
  tables_json JSONB,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages visible via conversation membership"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE c.id = conversation_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE c.id = conversation_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update messages"
  ON public.messages FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      JOIN public.workspaces w ON w.id = c.workspace_id
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE c.id = conversation_id AND om.user_id = auth.uid()
    )
  );

-- ============================================================
-- 9. DATASETS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.datasets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  database_id UUID NOT NULL REFERENCES public.synthetic_databases(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  format TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'csv', 'sql', 'parquet')),
  data_json JSONB NOT NULL DEFAULT '{}',
  schema_json JSONB NOT NULL DEFAULT '[]',
  row_count INTEGER NOT NULL DEFAULT 0,
  quality_score REAL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.datasets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Datasets visible to org members"
  ON public.datasets FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.synthetic_databases sd
      JOIN public.projects p ON p.id = sd.project_id
      JOIN public.workspaces w ON w.id = p.workspace_id
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE sd.id = database_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create datasets"
  ON public.datasets FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.synthetic_databases sd
      JOIN public.projects p ON p.id = sd.project_id
      JOIN public.workspaces w ON w.id = p.workspace_id
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE sd.id = database_id AND om.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete datasets"
  ON public.datasets FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.synthetic_databases sd
      JOIN public.projects p ON p.id = sd.project_id
      JOIN public.workspaces w ON w.id = p.workspace_id
      JOIN public.organization_members om ON om.organization_id = w.organization_id
      WHERE sd.id = database_id AND om.user_id = auth.uid()
    )
  );

-- ============================================================
-- 10. API KEYS
-- ============================================================
CREATE TABLE IF NOT EXISTS public.api_keys (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  permissions JSONB NOT NULL DEFAULT '["read"]',
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "API keys visible to org admins"
  ON public.api_keys FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can create API keys"
  ON public.api_keys FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Admins can delete API keys"
  ON public.api_keys FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_id AND user_id = auth.uid() AND role IN ('owner', 'admin')
    )
  );

-- ============================================================
-- 11. INDEXES for performance
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_organization_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_user ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_org ON public.workspaces(organization_id);
CREATE INDEX IF NOT EXISTS idx_projects_workspace ON public.projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_synthetic_databases_project ON public.synthetic_databases(project_id);
CREATE INDEX IF NOT EXISTS idx_conversations_workspace ON public.conversations(workspace_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_datasets_database ON public.datasets(database_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_org ON public.api_keys(organization_id);

-- ============================================================
-- 12. UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_synthetic_databases_updated_at BEFORE UPDATE ON public.synthetic_databases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
