// Cloudflare Turnstile server-side verification (siteverify). Bot protection on
// the write endpoints that face real-money or shared state (checkout creation,
// leaderboard submission). When no secret is configured (local dev), the check
// is SKIPPED — deployment docs make configuring it part of the go-live checklist.

type FetchLike = typeof fetch;

export async function verifyTurnstile(
  secret: string | undefined,
  token: string | undefined,
  ip: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ ok: boolean; skipped?: boolean }> {
  if (!secret) return { ok: true, skipped: true }; // dev mode — no Turnstile configured
  if (!token || token.length > 2048) return { ok: false };
  try {
    const res = await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: ip }).toString(),
    });
    const body = (await res.json().catch(() => null)) as { success?: boolean } | null;
    return { ok: body?.success === true };
  } catch {
    return { ok: false }; // fail CLOSED — a bot check that can't run doesn't pass
  }
}
