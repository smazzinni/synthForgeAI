-- Migration: Add Foreign Key and Unique Key Constraints
-- Date: 2026-05-26
-- Purpose: Enforce referential integrity and uniqueness across synthetic_databases, conversations, messages, and datasets

-- 1. Create or extend synthetic_databases table with user_id FK to profiles
-- (Assuming profiles table exists with id PK)
ALTER TABLE public.synthetic_databases
DROP CONSTRAINT IF EXISTS fk_synthetic_databases_user_id;
ALTER TABLE public.synthetic_databases
ADD CONSTRAINT fk_synthetic_databases_user_id
FOREIGN KEY (user_id) REFERENCES public.profiles(id)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- 2. Create unique constraint on synthetic_databases name per user
ALTER TABLE public.synthetic_databases
DROP CONSTRAINT IF EXISTS uk_synthetic_databases_user_name;
ALTER TABLE public.synthetic_databases
ADD CONSTRAINT uk_synthetic_databases_user_name
UNIQUE NULLS NOT DISTINCT (user_id, name);

-- 3. Create or extend conversations table with FK to profiles and synthetic_databases
ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS fk_conversations_user_id;
ALTER TABLE public.conversations
ADD CONSTRAINT fk_conversations_user_id
FOREIGN KEY (user_id) REFERENCES public.profiles(id)
ON DELETE SET NULL
ON UPDATE CASCADE;

ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS fk_conversations_database_id;
ALTER TABLE public.conversations
ADD CONSTRAINT fk_conversations_database_id
FOREIGN KEY (database_id) REFERENCES public.synthetic_databases(id)
ON DELETE CASCADE
ON UPDATE CASCADE;

-- 4. Create index on conversations for faster lookups
CREATE INDEX IF NOT EXISTS idx_conversations_user_id ON public.conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_database_id ON public.conversations(database_id);

-- 5. Create messages table FK to conversations
ALTER TABLE public.messages
DROP CONSTRAINT IF EXISTS fk_messages_conversation_id;
ALTER TABLE public.messages
ADD CONSTRAINT fk_messages_conversation_id
FOREIGN KEY (conversation_id) REFERENCES public.conversations(id)
ON DELETE CASCADE
ON UPDATE CASCADE;

-- 6. Create index on messages for faster lookups
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON public.messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at DESC);

-- 7. Add check constraint for valid message roles
ALTER TABLE public.messages
DROP CONSTRAINT IF EXISTS ck_messages_role;
ALTER TABLE public.messages
ADD CONSTRAINT ck_messages_role
CHECK (role IN ('user', 'assistant', 'system'));

-- 8. Add check constraint for valid conversation status
ALTER TABLE public.conversations
DROP CONSTRAINT IF EXISTS ck_conversations_status;
ALTER TABLE public.conversations
ADD CONSTRAINT ck_conversations_status
CHECK (status IN ('active', 'archived', 'deleted'));

-- 9. Add check constraint for valid synthetic_databases status
ALTER TABLE public.synthetic_databases
DROP CONSTRAINT IF EXISTS ck_synthetic_databases_status;
ALTER TABLE public.synthetic_databases
ADD CONSTRAINT ck_synthetic_databases_status
CHECK (status IN ('draft', 'generating', 'ready', 'error', 'archived'));

-- 10. Ensure row_count is non-negative
ALTER TABLE public.synthetic_databases
DROP CONSTRAINT IF EXISTS ck_synthetic_databases_row_count;
ALTER TABLE public.synthetic_databases
ADD CONSTRAINT ck_synthetic_databases_row_count
CHECK (row_count >= 0);

-- 11. Ensure quality_score is between 0 and 1
ALTER TABLE public.synthetic_databases
DROP CONSTRAINT IF EXISTS ck_synthetic_databases_quality_score;
ALTER TABLE public.synthetic_databases
ADD CONSTRAINT ck_synthetic_databases_quality_score
CHECK (quality_score IS NULL OR (quality_score >= 0 AND quality_score <= 1));

-- 12. Create datasets FK to synthetic_databases
ALTER TABLE public.datasets
DROP CONSTRAINT IF EXISTS fk_datasets_database_id;
ALTER TABLE public.datasets
ADD CONSTRAINT fk_datasets_database_id
FOREIGN KEY (database_id) REFERENCES public.synthetic_databases(id)
ON DELETE CASCADE
ON UPDATE CASCADE;

-- 13. Create index on datasets
CREATE INDEX IF NOT EXISTS idx_datasets_database_id ON public.datasets(database_id);
CREATE INDEX IF NOT EXISTS idx_datasets_created_at ON public.datasets(created_at DESC);

-- 14. Create audit timestamps - ensure updated_at is never before created_at (constraint at app level)
-- But we can create a trigger if supported:
-- (Note: This would need a trigger function, shown below for reference)

-- 15. Drop any conflicting constraints if they exist (PostgreSQL allows IF EXISTS starting from 10.0)
-- This is a safety measure for idempotent migrations

-- End of migration
