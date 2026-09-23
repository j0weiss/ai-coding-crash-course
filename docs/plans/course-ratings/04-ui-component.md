# 04 — UI Component: `app/components/star-rating.tsx`

## Goal

Add a single reusable `<StarRating>` component that renders a course's
average rating (read-only, for everyone) and, when the caller says the
current viewer is allowed to rate, an interactive 1-5 star control that
upserts via `POST /api/rate-course`. This doc covers **only** the component
file — no route wiring, no data fetching. It is one of 5 sibling docs under
`docs/plans/course-ratings/`.

## Depends on

- **03 — API route** (`app/routes/api.rate-course.ts`, not present yet):
  `POST /api/rate-course` accepting JSON `{ courseId: number, rating: number }`
  (rating 1-5), requiring auth, returning `{ success: true }` on 200 or a
  non-2xx status (401/400/403/404) with an error body on failure. This doc
  submits against that exact contract.
- **02 — Service layer**: not imported directly by this component; the
  average/count/user-rating values arrive as props computed by the loader in
  doc 05.

## Consumed by

- **05 — Course detail page wiring** (`app/routes/courses.$slug.tsx`): will
  import `StarRating` and render it inside the existing meta-info row
  (`courses.$slug.tsx:301-320`, the `<div className="flex items-center
  gap-4 text-sm text-muted-foreground">` block that currently holds
  instructor name / lesson count / duration), passing `average`, `count`,
  `courseId`, `canRate`, and `userRating` computed from
  `getAverageRatingForCourse` / `getUserRatingForCourse` (doc 02) and the
  existing `enrolled` / `isInstructor` locals (`canRate = enrolled &&
  !isInstructor`).

---

## Reference conventions pulled from this codebase

- **`cn()` helper**: `app/lib/utils.ts` exports `cn(...inputs: ClassValue[])`
  = `twMerge(clsx(inputs))`. Import as `import { cn } from "~/lib/utils"`.
  Used by every component in `app/components/` (see `user-avatar.tsx`,
  `app/components/ui/button.tsx`, `app/components/ui/card.tsx`) to let a
  `className` prop override/extend default classes.
- **Small display component shape**: `app/components/user-avatar.tsx` is the
  closest analog — a plain function component, inline prop type (not a
  separate exported interface, but this doc uses an exported `interface`
  since the prop list is longer and doc 05 needs to reference it), no
  external state libraries, `cn()` for class composition.
- **Icons**: `lucide-react` is a dependency (`package.json:33`,
  `"lucide-react": "^0.563.0"`) and exports `Star`. Confirmed via
  `node -e "console.log(typeof require('lucide-react').Star)"` → `"object"`
  (a valid forwardRef icon component, same shape as `BookOpen`/`Clock`
  already used in this codebase).
- **Meta-info row sizing** (`app/routes/courses.$slug.tsx:301-320`, the row
  this component sits inside):
  ```tsx
  <div className="flex items-center gap-4 text-sm text-muted-foreground">
    <span className="flex items-center gap-1.5">
      <UserAvatar name={course.instructorName} avatarUrl={course.instructorAvatarUrl} className="size-5" />
      {course.instructorName}
    </span>
    <span className="flex items-center gap-1">
      <BookOpen className="size-4" />
      {lessonCount} lessons
    </span>
    {totalDuration > 0 && (
      <span className="flex items-center gap-1">
        <Clock className="size-4" />
        {formatDuration(totalDuration, true, false, false)} total
      </span>
    )}
  </div>
  ```
  Icons here use `size-4` with `gap-1` on the wrapping `<span>`, container
  text is `text-sm text-muted-foreground`. **Match `size-4` for stars** and
  reuse `flex items-center gap-1` / `text-sm text-muted-foreground` for the
  numeric label, so `<StarRating>` sits visually consistent as one more item
  in this row (doc 05 will add it as a new `<span>`/wrapper alongside the
  existing three).
- **`useFetcher` usage**: widely used in this codebase (`app/routes/settings.tsx`,
  `app/routes/admin.categories.tsx`, `app/routes/instructor.$courseId.tsx`,
  etc.) but **every existing usage submits form-encoded data to the current
  route's own action** (`fetcher.submit({ intent: "create", name }, { method:
  "post" })` — see `app/routes/admin.categories.tsx:154`). **There is no
  existing precedent in this repo for `fetcher.submit` posting JSON to a
  different route via `action` + `encType: "application/json"`.** This doc
  designs against react-router v7's documented `useFetcher().submit(data,
  { method, action, encType })` API instead (verified against the installed
  `react-router` package's type defs, which include an `application/json`
  encType branch on the submit options). Flagged as an open question below.
- **Raw `fetch` precedent**: `app/components/youtube-player.tsx:89` posts to
  `/api/video-tracking` via plain `fetch(...)`, not `useFetcher`. This doc
  still recommends `useFetcher` (per the task's design) since it integrates
  with React Router's pending/revalidation state without manual loading-flag
  bookkeeping — but if `useFetcher`'s cross-route JSON submission proves
  awkward in practice, `fetch` is the codebase's fallback pattern.

---

## Design decision: one component, two modes

A single `StarRating` component with a `canRate` prop switches between
read-only display and interactive input, rather than two separate
components (e.g. `StarRatingDisplay` + `StarRatingInput`).

**Justification**: both modes render the same 5-star row in the same slot at
the same size, differing only in interactivity (buttons vs. static icons)
and an adjacent label. Splitting into two components would duplicate the
average→stars mapping logic (or require extracting a third shared helper),
and doc 05 would need an `if (canRate) <Input /> else <Display />` at the
call site anyway — pushing that branch inside this component keeps doc 05's
wiring to a single `<StarRating ... />` call. If the two modes diverge
significantly during implementation (e.g. interactive mode needs
substantially different layout), revisit the split — flagged as an open
question below.

---

## Prop interface

```ts
export interface StarRatingProps {
  /** Average rating (1-5, may be fractional), or null when count === 0. */
  average: number | null;
  /** Total number of ratings submitted for this course. */
  count: number;
  /** The course being rated — sent as-is in the POST body. */
  courseId: number;
  /** True when the current viewer is enrolled and not the instructor. */
  canRate: boolean;
  /** The current user's own existing rating (1-5), or null if they haven't rated yet. Ignored when canRate is false. */
  userRating: number | null;
  /** Optional className passthrough, per this codebase's convention (see user-avatar.tsx). */
  className?: string;
}
```

Notes:
- `average`/`count`/`userRating` are always passed regardless of `canRate` —
  the read-only display (average + count) renders unconditionally; only the
  clickable star row is gated on `canRate`.
- When `canRate` is `false` (not enrolled, is instructor, or logged out),
  `userRating` should be passed as `null` by the caller (doc 05) — this
  component does not itself re-derive `canRate` from `userRating`.

---

## Structural code sketch

```tsx
import { useState } from "react";
import { useFetcher } from "react-router";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

export interface StarRatingProps {
  average: number | null;
  count: number;
  courseId: number;
  canRate: boolean;
  userRating: number | null;
  className?: string;
}

export function StarRating({
  average,
  count,
  courseId,
  canRate,
  userRating,
  className,
}: StarRatingProps) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <StarDisplay average={average} count={count} />
      {canRate && (
        <StarInput courseId={courseId} userRating={userRating} />
      )}
    </span>
  );
}

// ─── Read-only average display ───

function StarDisplay({
  average,
  count,
}: {
  average: number | null;
  count: number;
}) {
  if (count === 0 || average === null) {
    return (
      <span className="flex items-center gap-1 text-sm text-muted-foreground">
        <Star className="size-4" />
        No ratings yet
      </span>
    );
  }

  // Round to nearest half star for display purposes (see "Open questions").
  const roundedHalf = Math.round(average * 2) / 2;

  return (
    <span className="flex items-center gap-1">
      <span className="flex items-center" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={cn(
              "size-4",
              star <= roundedHalf
                ? "fill-current text-primary"
                : "text-muted-foreground"
              // Note: this is whole-star-only fill logic. See "Open
              // questions" re: true half-star rendering.
            )}
          />
        ))}
      </span>
      <span className="text-sm text-muted-foreground">
        {average.toFixed(1)} ({count} rating{count === 1 ? "" : "s"})
      </span>
    </span>
  );
}

// ─── Interactive star input ───

function StarInput({
  courseId,
  userRating,
}: {
  courseId: number;
  userRating: number | null;
}) {
  const fetcher = useFetcher();
  const [hovered, setHovered] = useState<number | null>(null);
  // Optimistic selection: what the UI shows while a submission is in
  // flight / before revalidation. Falls back to the last known userRating.
  const [optimisticRating, setOptimisticRating] = useState(userRating);

  const displayed = hovered ?? optimisticRating ?? 0;
  const failed = fetcher.state === "idle" && fetcher.data?.success === false;

  function handleRate(rating: number) {
    setOptimisticRating(rating); // optimistic update, no wait for round trip
    fetcher.submit(
      { courseId, rating },
      {
        method: "post",
        action: "/api/rate-course",
        encType: "application/json",
      }
    );
  }

  return (
    <span
      role="radiogroup"
      aria-label="Course rating"
      className="flex items-center gap-0.5"
      onMouseLeave={() => setHovered(null)}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={optimisticRating === star}
          aria-label={`Rate ${star} out of 5 stars`}
          className="rounded-sm p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          onMouseEnter={() => setHovered(star)}
          onClick={() => handleRate(star)}
        >
          <Star
            className={cn(
              "size-4 transition-colors",
              star <= displayed
                ? "fill-current text-primary"
                : "text-muted-foreground"
            )}
          />
        </button>
      ))}
      {failed && (
        <span className="ml-1 text-xs text-destructive">
          Couldn't save rating
        </span>
      )}
    </span>
  );
}
```

### Key behaviors called out

- **Average → stars mapping**: `roundedHalf = Math.round(average * 2) / 2`,
  then each star fills if `star <= roundedHalf`. This produces whole-star
  fill only (a 4.5 rounds to the nearest half but the fill check `star <=
  roundedHalf` still renders star 5 as unfilled, star 4 as filled — true
  half-star *rendering* (a star half-colored) is out of scope; see "Open
  questions").
- **Hover preview**: local `hovered` state, reset via `onMouseLeave` on the
  group container (not per-button), so moving the mouse off the whole
  control reverts to the actual/optimistic selection.
- **Optimistic update**: `setOptimisticRating(rating)` happens synchronously
  in the click handler, before `fetcher.submit(...)` — the star fill updates
  immediately, independent of network latency.
- **Submission**: `fetcher.submit(data, { method: "post", action:
  "/api/rate-course", encType: "application/json" })` — sends `{ courseId,
  rating }` as a JSON body to the doc-03 route regardless of what page
  `<StarRating>` is rendered on.
- **Failure handling**: kept intentionally simple per the task scope — check
  `fetcher.data?.success === false` once the fetcher returns to `"idle"`,
  show a small inline error string. Does **not** revert `optimisticRating`
  to the pre-click value automatically; flagged as an open question below
  since the "right" UX (revert vs. leave optimistic vs. refetch truth) is a
  product call, not an implementation detail.

---

## Exact Tailwind classes (pulled from `courses.$slug.tsx`)

| Element | Classes | Source |
|---|---|---|
| Meta-info row container | `flex items-center gap-4 text-sm text-muted-foreground` | `courses.$slug.tsx:301` |
| Individual meta item wrapper | `flex items-center gap-1` (or `gap-1.5` for the avatar item) | `courses.$slug.tsx:308`, `:313` |
| Icon size (`BookOpen`, `Clock`) | `size-4` | `courses.$slug.tsx:314`, `:319` |
| Muted numeric/secondary text | `text-sm text-muted-foreground` | `courses.$slug.tsx:301` |
| Focus ring (buttons, from `ui/button.tsx`) | `outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]` | `app/components/ui/button.tsx` (`buttonVariants` base classes) — used a slightly smaller `ring-2` above for a compact per-star hit target, but align with the exact button focus-ring classes if visual QA flags a mismatch |
| Error/destructive text | `text-destructive` (also used as `bg-destructive`/`text-white` combos in `button.tsx`'s `destructive` variant, and standalone as `text-destructive` in form error states elsewhere in this codebase) | `app/components/ui/button.tsx` |

Star icon size: use `size-4` to match `BookOpen`/`Clock` exactly, both in
`StarDisplay` and `StarInput`, so the component reads as one more item in
the same meta-info row rather than a visually distinct block.

---

## TODO checklist

1. [ ] Create `app/components/star-rating.tsx` with the `StarRatingProps`
   interface and the `StarRating` / `StarDisplay` / `StarInput` structure
   above (or inline if the split feels unnecessary — see open question on
   sub-component boundaries).
2. [ ] Implement `StarDisplay` (read-only mode):
   - Empty state (`count === 0` or `average === null`) → "No ratings yet".
   - Non-empty state → 5 stars filled per the rounded-half-star logic, plus
     `"{average.toFixed(1)} ({count} rating(s)})"` label (singular/plural).
3. [ ] Implement `StarInput` (interactive mode), rendered only when
   `canRate` is true:
   - `useFetcher()` for the POST to `/api/rate-course`.
   - Click handler calls `fetcher.submit` with JSON body `{ courseId, rating }`.
4. [ ] Implement hover-preview state (`hovered`) and optimistic selection
   state (`optimisticRating`, seeded from `userRating`), with the
   `displayed = hovered ?? optimisticRating ?? 0` precedence.
5. [ ] Handle a failed submission: detect via `fetcher.state === "idle" &&
   fetcher.data?.success === false`, show inline error text. Decide (see
   open questions) whether to also revert `optimisticRating`.
6. [ ] Verify accessibility:
   - Each star is a `<button type="button">` (not a `div`/`span`) with
     `aria-label={"Rate " + star + " out of 5 stars"}`.
   - The group wrapper has `role="radiogroup"` and `aria-label="Course
     rating"`; each button has `role="radio"` and `aria-checked`.
   - Buttons are keyboard-focusable by default (native `<button>`); confirm
     `focus-visible` ring is visible and consistent with `ui/button.tsx`'s
     focus styling.
   - Decorative stars in `StarDisplay` (non-interactive) get `aria-hidden="true"`
     on their wrapping span since the adjacent text label already conveys
     the rating numerically.
7. [ ] Manual visual check in the browser once doc 05 wires this component
   in, at `/courses/:slug`, for all four viewer states:
   - Logged out → read-only display only, no interactive stars.
   - Logged in, not enrolled, not instructor → read-only display only.
   - Logged in, enrolled, not instructor → read-only display + interactive
     stars, pre-filled with existing rating if any.
   - Logged in, is the course's instructor → read-only display only (no
     interactive stars), even if `enrolled` were somehow also true.
8. [ ] Confirm `npm run typecheck` passes once doc 05 imports and renders
   this component (this doc alone has no route/loader dependency to
   typecheck against).

---

## Open questions / risks

- **True half-star rendering is out of scope for this pass.** The sketch
  above only supports whole-star fill (rounds to nearest half for the
  *numeric* label/threshold, but visually a star is either fully filled or
  fully outline — there's no CSS clip-path/gradient partial fill). There's
  no prior art for partial-fill icons anywhere in this codebase. If a
  half-filled star icon is required, it needs an `overflow-hidden` wrapper
  with a percentage-width inner `<Star>` clip, which is a bigger change —
  flag to product/design before implementing.
- **Failed-submission UX**: the sketch shows an inline "Couldn't save
  rating" string but does not revert `optimisticRating`. Options: (a) leave
  optimistic value as-is (current sketch — user sees their intended rating
  even though it didn't save, which could be misleading on reload), (b)
  revert to the pre-click value on failure, (c) refetch the true value via
  `fetcher.load` or a `key`-based revalidation. Recommend (b) for
  correctness, but flagged as a decision for implementation time since it
  needs to track a "last known good" rating separately from `userRating` if
  multiple rapid clicks are allowed.
- **Rapid re-click / debounce**: no debounce in the sketch — every click
  fires a new `fetcher.submit`. Since `rateCourse` (doc 02) is an idempotent
  upsert and `useFetcher` naturally supersedes in-flight submissions with
  the latest one, this is likely fine as-is, but worth a manual check that
  rapid clicking doesn't produce visibly janky flicker between fetcher
  states.
- **In-flight visual state**: the sketch doesn't dim/disable stars while
  `fetcher.state !== "idle"`. Consider whether stars should be
  `pointer-events-none` or show a subtle loading affordance during
  submission — left as a nice-to-have, not blocking, since the optimistic
  update already makes the UI feel instant.
- **Race: enrollment status changes mid-session.** `canRate` is computed
  server-side by doc 05's loader and passed as a static prop — if a user's
  enrollment is revoked (or they're never actually enrolled, e.g. stale
  client state) between page load and clicking a star, the doc-03 route
  will return 403. The sketch's generic `fetcher.data?.success === false`
  error path covers this by showing "Couldn't save rating", but does not
  surface the specific 403 reason to the user. Acceptable for this scope;
  revisit if product wants a more specific message (e.g. "You're no longer
  enrolled in this course").
- **`useFetcher` cross-route JSON submission has no precedent in this repo**
  (see "Reference conventions" above) — this is the biggest implementation
  risk in this doc. If `fetcher.submit(data, { action, encType:
  "application/json" })` doesn't behave as expected against a *different*
  route's action (vs. every existing usage which targets the current
  route), fall back to the `youtube-player.tsx:89`-style raw `fetch(...)`
  call, manually managing a `submitting` boolean instead of
  `fetcher.state`.
- **Sub-component boundaries** (`StarDisplay` / `StarInput` as
  non-exported helpers inside `star-rating.tsx` vs. one flat component
  with an `if (canRate)` branch inline): the split above is a suggestion
  for readability, not a hard requirement — collapse it if the
  implementer finds the split adds indirection without benefit. Only the
  exported `StarRating` / `StarRatingProps` names are locked (per doc 05's
  needs).
