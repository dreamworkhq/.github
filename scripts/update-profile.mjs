#!/usr/bin/env node
/**
 * Regenerates profile/README.md and the banner tagline from live data, so the
 * org profile never carries a hand-typed job count or board list.
 *
 * Zero dependencies: runs on a bare actions/setup-node runner.
 */

import { readFileSync, writeFileSync } from "node:fs";

const API_BASE = "https://api.dreamworkhq.com";
const SITE = "https://www.dreamworkhq.com";
const ORG = "dreamworkhq";
const NOT_BOARDS = new Set([".github", "mcp"]);
const UTM = "utm_source=github&utm_medium=org_profile";

/** Rounds down so the claim is never larger than the live count: 1,498,263 -> "1.4M+". */
function formatActiveJobs(count) {
  if (count >= 1_000_000) return `${Math.floor(count / 100_000) / 10}M+`;
  if (count >= 1_000) return `${Math.floor(count / 1_000)}K+`;
  return `${count}`;
}

/**
 * The count the site hero shows. The route fails closed when its observation
 * is stale; the profile then renders without a number rather than a stale one.
 */
async function activeJobsLabel() {
  try {
    const res = await fetch(`${API_BASE}/public/listing-stats`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const { activeJobs } = await res.json();
    return Number.isSafeInteger(activeJobs) && activeJobs > 0 ? formatActiveJobs(activeJobs) : null;
  } catch {
    return null;
  }
}

async function boards() {
  const headers = { accept: "application/vnd.github+json" };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/orgs/${ORG}/repos?type=public&per_page=100`, { headers });
  if (!res.ok) throw new Error(`GitHub repo list failed: ${res.status}`);
  const repos = (await res.json()).filter((repo) => !repo.archived && !NOT_BOARDS.has(repo.name));
  if (repos.length === 0) throw new Error("No public boards found; refusing to publish an empty list.");
  return repos.sort((a, b) => a.name.localeCompare(b.name));
}

const label = await activeJobsLabel();
const list = await boards();
const tagline = `${label ? `${label} live jobs` : "Live jobs"}, crawled daily. Matched to your resume. Applied for you.`;
const listings = label ? `${label} live listings` : "live listings";

const readme = `<a href="${SITE}/?${UTM}"><img src="./banner.svg" alt="Dreamwork. ${tagline}" width="100%"></a>

<p align="center">
  Dreamwork is an autonomous job-application agent. It crawls ${listings} directly from company career pages, matches them against your resume, and can tailor and submit applications for you.
</p>

<p align="center">
  <a href="${SITE}/?${UTM}">dreamworkhq.com</a>
  ·
  <a href="${SITE}/blog?${UTM}">Blog</a>
  ·
  <a href="${SITE}/how-to?${UTM}">How-to guides</a>
  ·
  <a href="${SITE}/research?${UTM}">Hiring research</a>
  ·
  <a href="https://www.npmjs.com/package/@dreamworkhq/mcp">MCP server</a>
</p>

### Daily job lists

Each repo updates once a day from Dreamwork's public listings API:

${list.map((repo) => `- [${repo.name}](${repo.html_url})${repo.description ? `: ${repo.description}` : ""}`).join("\n")}
`;

const bannerPath = new URL("../profile/banner.svg", import.meta.url);
const banner = readFileSync(bannerPath, "utf8");
const taglinePattern = />[^<]*crawled daily\. Matched to your resume\. Applied for you\.</;
if (!taglinePattern.test(banner)) throw new Error("banner.svg tagline not found; update taglinePattern.");

writeFileSync(bannerPath, banner.replace(taglinePattern, `>${tagline}<`));
writeFileSync(new URL("../profile/README.md", import.meta.url), readme);
console.log(`profile: ${label ?? "no count"}, ${list.length} boards`);
