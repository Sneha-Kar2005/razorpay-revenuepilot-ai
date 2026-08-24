# Pitch video — production notes

`revenuepilot_pitch.mp4` — 1920×1080, ~4:44, H.264/AAC.

Full honesty about how this was produced, since the submission rules
require it:

## What's real

- **Every screen-recorded segment (product demo, failure/safety demo,
  analytics) is a genuine Playwright recording of the actual running
  application** (`backend` + `frontend`, `npm run dev` on both) against the
  real seeded SQLite database — not a mockup, not edited footage of static
  screenshots. The AI diagnosis, policy decisions, recovery actions, and
  audit trail entries visible in the video are exactly what the running
  system produced.
- The specific cases shown were selected deterministically ahead of time
  (see `backend/src/demo/predictForVideo.ts` — a read-only script that
  replicates the app's own decision/policy/simulation logic to preview
  outcomes without mutating the database) so the recording could reliably
  land on one full-recovery case, one API-failure-with-bounded-retry case,
  and one high-value human-approval case — the three flows the brief asks
  a pitch to demonstrate. Nothing about the underlying system was changed
  or special-cased for the video; the same code path any judge running the
  app will use produced these results.
- The metrics shown in the "measured impact" segment come from an actual
  batch run across the full 120-case seeded dataset in this repository.

## What's synthetic, clearly

- **Narration is Windows OneCore text-to-speech** (`Microsoft David`, via
  `Windows.Media.SpeechSynthesis`), not a human voiceover or a commercial
  AI voice API — no such service was available in the build environment.
  It is functional and intelligible but audibly robotic; this is disclosed
  here rather than presented as something it isn't.
- The four title/explainer slides are custom HTML/CSS pages rendered and
  screenshotted with Playwright, then animated with a simple ffmpeg
  Ken Burns zoom — not a slide deck tool.
- Captions are auto-generated per-sentence from the narration script with
  proportional timing (see `gen_srt.js` in the production scripts, not
  committed to this repo — see below), burned in with ffmpeg/libass.

## Tooling used

- **Recording**: Playwright (Chromium) `context.recordVideo`.
- **TTS**: Windows OneCore `Windows.Media.SpeechSynthesis` via PowerShell.
- **Assembly**: ffmpeg (zoompan for slides, `subtitles` filter for
  captions, `concat` for final assembly) — a full static ffmpeg build
  (`@ffmpeg-installer/ffmpeg`), used only as a local production tool, not
  a runtime dependency of the shipped application.

The one-off video-production helper scripts (`predictForVideo.ts`,
`fastForwardBatch.ts`, `resetCase.ts` in `backend/src/demo/`, and the
Playwright/ffmpeg orchestration scripts) are kept out of the main
application flow — each carries a comment saying so — since they exist
only to prepare deterministic camera subjects and are not part of the
product.

See [`script.md`](script.md) for the full narration script with segment
timings.
