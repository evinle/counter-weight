---
name: explain-tech
description: Explains a named technology both conceptually and in the context of this codebase. Scans source files, CLAUDE.md, and external docs to produce a high-level → low-level walkthrough with code snippets. Use when user names a technology and wants to understand how it works and how it's used here (e.g. "explain Dexie", "how does Zustand work in this project", "explain PWA service workers").
---

# explain-tech

## Workflow

1. **Identify the technology** from the user's message (e.g. Dexie, Zustand, Vite, PWA Workers, AWS CDK).

2. **Research high-level concepts** — before reading the codebase, fetch the official docs or a reputable reference (MDN, official site, GitHub README) using WebFetch or WebSearch. Understand:
   - What problem this technology solves
   - Its core mental model and key abstractions
   - The most important API surface or configuration points

3. **Gather codebase context**
   - Read `CLAUDE.md` for any documented usage of this tech.
   - Search for imports, config files, and usage sites:
     ```
     grep -r "<tech-name>" src/ --include="*.ts" --include="*.tsx" -l
     ```
   - Read the most relevant files in full (entry points, config, key hooks/modules).

4. **Produce the explanation** in this order:
   - **What it is** — one or two sentences + link to official docs
   - **How it works** — core mental model and key concepts drawn from your research; stay high-level before going into mechanics
   - **How it's used here** — walk through actual usage in this codebase, referencing file paths and quoting relevant snippets
   - **Observations** *(optional, at most 1–2)* — only surface if there's something genuinely worth noting (e.g. a subtle footgun, a feature being underused in a way that matters). Skip entirely if nothing stands out.

## Style

- Technical and concise. No filler.
- High-level concepts before implementation details.
- Prefer `file:line` references over vague descriptions.
- Inline code snippets preferred over long block dumps — quote just enough to make the point.
- Observations should feel like a colleague's aside, not a review comment.
