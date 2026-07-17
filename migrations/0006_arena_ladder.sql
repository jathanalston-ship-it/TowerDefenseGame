-- Arena ladder display names (docs/ARENA.md §ladder) — the rating rows gain the commander
-- name so the season ladder reads like the wave leaderboards ("Marrowthorn #0421"). The name
-- rides the report body (sanitizeName server-side); the designation tag never does — it is
-- derived from the STORED player_id, so it stays unforgeable (the leaderboard precedent).
ALTER TABLE arena_ratings ADD COLUMN name TEXT NOT NULL DEFAULT '';
