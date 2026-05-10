import Link from "next/link";
import { Star, GitFork } from "lucide-react";

const REPO = "9trocode/Cairn";
const REPO_URL = `https://github.com/${REPO}`;

type RepoData = {
  stars: number | null;
  forks: number | null;
  lastPushIso: string | null;
};

/**
 * Inline GitHub octocat. lucide-react doesn't ship a GitHub icon; the
 * SVG is small enough to inline once here rather than pull in a second
 * icon package just for it.
 */
function GitHubIcon({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
      fill="currentColor"
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.54-3.87-1.54-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.24 3.34.95.1-.74.4-1.24.73-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .96-.31 3.15 1.18a10.96 10.96 0 0 1 5.74 0c2.18-1.49 3.14-1.18 3.14-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

async function fetchRepo(): Promise<RepoData> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      // 1-hour revalidate. GitHub's unauthenticated rate limit is 60
      // req/hr per IP — even on a hot landing page we only burn ~24
      // calls/day with this cache. No GH token needed.
      next: { revalidate: 3600 },
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!res.ok) {
      return { stars: null, forks: null, lastPushIso: null };
    }
    const data = (await res.json()) as {
      stargazers_count?: number;
      forks_count?: number;
      pushed_at?: string;
    };
    return {
      stars: typeof data.stargazers_count === "number" ? data.stargazers_count : null,
      forks: typeof data.forks_count === "number" ? data.forks_count : null,
      lastPushIso: data.pushed_at ?? null,
    };
  } catch {
    return { stars: null, forks: null, lastPushIso: null };
  }
}

function formatNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`;
  return `${Math.round(n / 1000)}k`;
}

function relativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return null;
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

/**
 * Server component — fetches GitHub stats at render time with hourly
 * revalidation. Always renders the "View on GitHub" link; the stat
 * pills only render when the API succeeded so a failed fetch doesn't
 * leave dashes on the page.
 */
export async function GitHubStats() {
  const data = await fetchRepo();
  const lastPush = relativeTime(data.lastPushIso);
  return (
    <Link
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-1.5 text-xs font-mono text-muted-foreground hover:border-foreground/30 hover:text-foreground hover:bg-card transition-colors"
      aria-label={`Cairn on GitHub${data.stars != null ? ` — ${data.stars} stars, ${data.forks ?? 0} forks` : ""}`}
    >
      <GitHubIcon size={14} className="shrink-0" />
      <span className="text-foreground/90">9trocode/Cairn</span>
      {data.stars != null ? (
        <>
          <span className="text-border">·</span>
          <span className="inline-flex items-center gap-1">
            <Star className="size-3" />
            {formatNumber(data.stars)}
          </span>
        </>
      ) : null}
      {data.forks != null ? (
        <>
          <span className="text-border">·</span>
          <span className="inline-flex items-center gap-1">
            <GitFork className="size-3" />
            {formatNumber(data.forks)}
          </span>
        </>
      ) : null}
      {lastPush ? (
        <>
          <span className="text-border">·</span>
          <span className="text-muted-foreground/70">updated {lastPush}</span>
        </>
      ) : null}
    </Link>
  );
}

/**
 * Plain "View on GitHub" button without the live stats — for places
 * where we don't want a network fetch (e.g. a footer, a 404 page).
 */
export function GitHubButton({ className }: { className?: string }) {
  return (
    <Link
      href={REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "inline-flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
      }
    >
      <GitHubIcon size={12} />
      View on GitHub
    </Link>
  );
}
