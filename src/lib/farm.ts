// Build-time data for the self-demonstrating farm surfaces: the hero stats
// strip, the Operations receipts, live gem versions on /open-source, and the
// footer build stamp.
//
// Every fetcher returns null on any failure (timeout, rate limit, bad JSON) —
// a flaky API must never break the build. Callers fall back to the static
// copy in src/data/*. Results are memoized per process so `astro dev`, which
// re-runs frontmatter on every request, doesn't hammer the APIs.

const TIMEOUT_MS = 8000;
const ORG = "rarebit-one";

const memo = new Map<string, Promise<unknown>>();
function memoized<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!memo.has(key)) memo.set(key, fn());
  return memo.get(key) as Promise<T>;
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "rarebit-one-site-build", ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

const GITHUB_ACCEPT = { Accept: "application/vnd.github+json" };

// The client-work replay feed (nightly pipeline → DO Spaces). The site reads
// this at build for the SSR digest line; the client-side 24h-delayed reveal
// UI is a follow-up. Channel is baked at build via PUBLIC_FARM_FEED_CHANNEL
// (default "staging" until the pipeline is trusted; flip to "live" in prod).
const FARM_FEED_CHANNEL = import.meta.env.PUBLIC_FARM_FEED_CHANNEL ?? "staging";
export const FARM_FEED_URL = `https://rarebit-farm-feed.sgp1.digitaloceanspaces.com/${FARM_FEED_CHANNEL}/farm-replay.json`;

export type FarmReplay = {
  generated: string;
  window: string;
  digest: string;
  events: Array<{ at: string; kind: string; text: string; ok: boolean }>;
};

/** The replay artifact, fetched at build time for the SSR digest line.
    Returns null until the pipeline publishes to the bucket. */
export function farmReplay(): Promise<FarmReplay | null> {
  return memoized("farm-replay", () => fetchJson<FarmReplay>(FARM_FEED_URL));
}

/** Merged PRs across the org's public repos in the last `days` days. */
export function mergedPrCount(days = 30): Promise<number | null> {
  return memoized(`prs:${days}`, async () => {
    const since = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const query = encodeURIComponent(`org:${ORG} is:pr is:merged merged:>=${since}`);
    const data = await fetchJson<{ total_count?: number }>(
      `https://api.github.com/search/issues?q=${query}&per_page=1`,
      GITHUB_ACCEPT
    );
    return typeof data?.total_count === "number" ? data.total_count : null;
  });
}

export type Merge = {
  repo: string;
  number: number;
  title: string;
  mergedAt: string;
  url: string;
};

/** Most recently merged PRs across the org's public repos. */
export function recentMerges(limit = 3): Promise<Merge[] | null> {
  return memoized(`merges:${limit}`, async () => {
    // The search API can't sort by merge time, only `updated` — fetch a
    // wider window and re-sort by merged_at so a stale-but-recently-touched
    // PR can't outrank an actual recent merge.
    const query = encodeURIComponent(`org:${ORG} is:pr is:merged`);
    const data = await fetchJson<{
      items?: Array<{
        repository_url?: string;
        number?: number;
        title?: string;
        closed_at?: string;
        html_url?: string;
        pull_request?: { merged_at?: string };
      }>;
    }>(
      `https://api.github.com/search/issues?q=${query}&sort=updated&order=desc&per_page=${Math.max(limit * 3, 10)}`,
      GITHUB_ACCEPT
    );
    if (!Array.isArray(data?.items) || data.items.length === 0) return null;
    return data.items
      .map((item) => ({
        repo: String(item.repository_url ?? "").split("/").pop() ?? "",
        number: item.number ?? 0,
        title: String(item.title ?? "").slice(0, 90),
        mergedAt: item.pull_request?.merged_at ?? item.closed_at ?? "",
        url: item.html_url ?? `https://github.com/${ORG}`,
      }))
      .sort((a, b) => b.mergedAt.localeCompare(a.mergedAt))
      .slice(0, limit);
  });
}

export type GemInfo = { version: string; downloads: number };

/** Live version + total downloads for a published gem. */
export function gemInfo(name: string): Promise<GemInfo | null> {
  return memoized(`gem:${name}`, async () => {
    const data = await fetchJson<{ version?: string; downloads?: number }>(
      `https://rubygems.org/api/v1/gems/${encodeURIComponent(name)}.json`
    );
    return data?.version ? { version: data.version, downloads: data.downloads ?? 0 } : null;
  });
}

/** Sum of downloads across gems — all-or-nothing: a partial sum would be a
 *  quietly under-counted "real" number, so any miss falls back entirely. */
export async function totalGemDownloads(names: string[]): Promise<number | null> {
  const infos = await Promise.all(names.map((name) => gemInfo(name)));
  if (infos.some((info) => info === null)) return null;
  return (infos as GemInfo[]).reduce((sum, info) => sum + info.downloads, 0);
}

export const compactNumber = (value: number): string =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const shortDate = (iso: string): string => {
  const date = new Date(iso);
  // Guard the build: format(Invalid Date) throws RangeError, and the input
  // comes from the (un-try/catch'd) API mapping path.
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore",
  }).format(date);
};

/** The moment this build ran, in farm-local time. */
export const buildStamp = (): string =>
  `${new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Singapore",
  }).format(new Date())} SGT`;
