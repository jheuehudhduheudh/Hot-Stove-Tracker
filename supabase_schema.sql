-- ============================================================================
-- HOT STOVE TRACKER: SUPABASE DATABASE SCHEMA
-- Paste this entire script into your Supabase SQL Editor and click "Run".
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'REPORTED' CHECK (status IN ('REPORTED', 'OFFICIAL', 'VOIDED')),
  move_type TEXT NOT NULL DEFAULT 'SIGNING' CHECK (move_type IN ('SIGNING', 'TRADE', 'EXTENSION', 'DFA_WAIVER')),
  is_major_league BOOLEAN NOT NULL DEFAULT true,
  headline TEXT NOT NULL,
  source_name TEXT,
  source_url TEXT,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  official_date DATE,

  -- Signing / Extension / DFA primary fields
  player_id INTEGER,
  player_name TEXT,
  position TEXT,
  from_team TEXT,
  to_team TEXT,
  stat_line TEXT,

  -- Contract terms
  contract_years INTEGER,
  total_value_millions NUMERIC(10, 2),
  aav_millions NUMERIC(10, 2),
  contract_notes TEXT,

  -- Multi-player trade breakdown (JSON arrays of {playerId, playerName, position, level, statLine})
  team_a TEXT,
  team_a_receives JSONB DEFAULT '[]'::jsonb,
  team_b TEXT,
  team_b_receives JSONB DEFAULT '[]'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.sync_metadata (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_synced_at TIMESTAMPTZ,
  last_sync_summary TEXT
);

INSERT INTO public.sync_metadata (id, last_synced_at, last_sync_summary)
VALUES (1, NULL, 'Ready for first sync')
ON CONFLICT (id) DO NOTHING;

-- Indexes for fast filtering
CREATE INDEX IF NOT EXISTS idx_transactions_reported_at ON public.transactions (reported_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions (status);
CREATE INDEX IF NOT EXISTS idx_transactions_to_team ON public.transactions (to_team);

-- Enable Row Level Security (Public Read, Server-Only Write via service_role / secret key)
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_metadata ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read transactions" ON public.transactions;
CREATE POLICY "Public read transactions"
  ON public.transactions FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Public read sync_metadata" ON public.sync_metadata;
CREATE POLICY "Public read sync_metadata"
  ON public.sync_metadata FOR SELECT
  USING (true);
