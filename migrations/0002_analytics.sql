-- Privacy-friendly aggregate analytics (docs/WEBSITE.md §analytics): per-UTC-day
-- counters, nothing else. No user ids, no sessions, no IPs — retention/DAU-style
-- questions are answered from counts alone; page analytics stays with Cloudflare
-- Web Analytics. Purchase counters are written server-side by the webhook/claim
-- handlers (client-independent truth).
CREATE TABLE analytics_counters (
  day   TEXT NOT NULL,
  kind  TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (day, kind)
);
