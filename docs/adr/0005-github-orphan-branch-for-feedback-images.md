# ADR 0005 — GitHub orphan branch as image host for feedback screenshots

## Status
Proposed

## Context
Feedback submissions can include up to 3 screenshots. These images must be embedded inline in GitHub Issues (via `![](url)` markdown) so triage requires no additional steps. Three hosting options were evaluated:

1. **S3 presigned URLs** — expire after a configurable TTL; the embedded image breaks in the issue once the URL expires.
2. **Public S3 objects** — permanent URLs, but every GitHub Issue page load triggers an S3 GET billed to us. Also stores two copies of the same file indefinitely (S3 + GitHub).
3. **GitHub Contents API commit to an orphan branch** — the image is committed as a binary file to a `feedback-assets` orphan branch. The resulting `raw.githubusercontent.com` URL is permanent, free, and served from GitHub's CDN. S3 is used only as a temporary staging area and deleted after the commit succeeds.

## Decision
Commit feedback images to the `feedback-assets` orphan branch via the GitHub Contents API. The S3 object is deleted immediately after the commit succeeds.

**Why orphan branch:** an orphan branch has no parent commit and no shared history with `main` — binary feedback assets never appear in `git log` on development branches and do not affect repository clone size for developers.

## Consequences
- Feedback images are permanently hosted at `raw.githubusercontent.com/{owner}/{repo}/feedback-assets/{path}` at zero marginal cost.
- If the GitHub repo is deleted or made private, all previously created issue images break. Acceptable given this is a personal project.
- Partial submissions (one image commit fails) are tolerated — the issue is created with whatever images succeeded; the DB records which are missing.
- S3 is a pure staging area — no lifecycle cleanup policy needed beyond a short TTL (e.g. 1 hour) as a safety net for orphaned objects from failed Lambda executions.
