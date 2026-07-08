-- R1 replay verification (docs/SECURITY-AUDIT.md): the daily submission stores its
-- recorded input log; the operator command re-simulates and stamps the verdict.
--   verified: 0 = unverified (default) · 1 = replay matched · -1 = FAILED (hidden from /top)
ALTER TABLE leaderboard ADD COLUMN replay TEXT;
ALTER TABLE leaderboard ADD COLUMN verified INTEGER NOT NULL DEFAULT 0;
