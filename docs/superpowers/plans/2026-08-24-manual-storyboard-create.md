# Manual Storyboard Create Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Allow manual empty storyboard creation with append / insert-before / insert-after.

**Architecture:** Extend `POST /storyboards` with optional position ids and renumber; wire episode.vue empty state + list footer + shot card actions.

**Tech Stack:** Hono + Drizzle (MySQL), Vue 3 episode workbench.

## Tasks

- [x] Backend: resolve insert number, shift subsequent numbers, create empty shot, refresh episode duration
- [x] Frontend: `addStoryboard` helper + empty/list/card UI
