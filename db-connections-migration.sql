-- SynthForge AI — External DB Connections
--
-- Run this against your Supabase project to enable persistent storage of
-- user-supplied external database connections. If the table does not exist,
-- the app falls back to an in-memory store (per-process, not durable).

CREATE TABLE IF NOT EXISTS public.db_connections (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  dialect         TEXT NOT NULL CHECK (dialect IN ('postgres', 'mysql')),
  host            TEXT NOT NULL,
  port            INTEGER NOT NULL,
  username        TEXT NOT NULL,
  password        TEXT NOT NULL,
  database        TEXT NOT NULL,
  schema          TEXT,
  ssl             BOOLEAN NOT NULL DEFAULT false,
  status          TEXT NOT NULL DEFAULT 'untested' CHECK (status IN ('untested', 'connected', 'failed')),
  last_connected_at  TIMESTAMPTZ,
  error_message      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Row-level security: a user can only see / modify their own connections.
ALTER TABLE public.db_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own db_connections"
  ON public.db_connections
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own db_connections"
  ON public.db_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own db_connections"
  ON public.db_connections
  FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own db_connections"
  ON public.db_connections
  FOR DELETE
  USING (auth.uid() = user_id);

-- Index for listing a user's connections ordered by recency.
CREATE INDEX IF NOT EXISTS idx_db_connections_user_created
  ON public.db_connections (user_id, created_at DESC);

-- Useful updated_at trigger (Supabase convention).
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_db_connections_touch ON public.db_connections;
CREATE TRIGGER trg_db_connections_touch
  BEFORE UPDATE ON public.db_connections
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
