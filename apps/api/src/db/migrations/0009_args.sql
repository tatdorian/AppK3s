-- Migration 0009: add args column to applications (container CMD override)
ALTER TABLE "applications" ADD COLUMN IF NOT EXISTS "args" json;
