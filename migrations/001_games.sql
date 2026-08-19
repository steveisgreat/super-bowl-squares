-- Phase 2.1: whole-document game storage for the Postgres backend
-- (lib/store-pg.js). The document model from the fs backend is preserved
-- as-is in `doc`, so no field-by-field mapping is needed.

create table if not exists games (
  id uuid primary key,
  doc jsonb not null,
  updated_at timestamptz not null
);

create index if not exists games_updated_at_idx on games (updated_at desc);
