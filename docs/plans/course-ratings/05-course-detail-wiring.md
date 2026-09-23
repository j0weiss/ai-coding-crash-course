# 05 — Course Detail Page Wiring: `app/routes/courses.$slug.tsx`

## Goal

Wire the 5-star rating feature into the existing course detail page: fetch
average rating + the current user's own rating in the loader, derive whether
the current user is allowed to rate, and render `<StarRating>` next to the
existing instructor/lesson-count/duration meta info in the hero section.

**Implement this doc LAST.** It depends on all four other docs (schema,
service, API route, UI component) already existing in the repo — it wires
them together but adds no new schema, service, or API code itself.

---

## Depends on

- **01 — Schema**: `courseRatings` table in `app/db/schema.ts`.
- **02 — Service layer**: `app/services/ratingService.ts` exporting
  `getAverageRatingForCourse(courseId: number)` →
  `{ average: number | null, count: number }` and
  `getUserRatingForCourse(userId: number, courseId: number)` → `number | null`.
- **03 — API route**: `app/routes/api.rate-course.ts` (POST endpoint the
  `StarRating` component's fetcher submits to). This wiring doc does not call
  the API route directly — `StarRating` owns that.
- **04 — UI component**: `app/components/star-rating.tsx` exporting
  `StarRating`, assumed props: `{ average: number | null; count: number;
  courseId: number; canRate: boolean; userRating: number | null }`.

## Consumed by

Nobody — this is the final integration step. No other doc depends on this one.

---

## ⚠️ Reconciliation step — do this FIRST, before writing any code

Docs 02 and 04 were authored in parallel by different agents working from the
same upstream spec as this doc, but naming may have drifted in the actual
implementation. Before touching `courses.$slug.tsx`:

1. Open the real `app/services/ratingService.ts` and confirm the exported
   names and return shapes of `getAverageRatingForCourse` and
   `getUserRatingForCourse` exactly match what's written above. If they
   differ (e.g. different param order, different return key names), use the
   real signatures — this doc's snippets are the design intent, not a
   guarantee.
2. Open the real `app/components/star-rating.tsx` and confirm the actual
   prop names of `StarRating`. The prop shape above is an assumption
   inherited from the upstream task spec; doc 04's author may have refined
   it (e.g. renamed `average`/`count` to a single `rating: { average, count
   }` object, or renamed `userRating` to `currentUserRating`). Match the JSX
   below to whatever `StarRating` actually accepts.
3. If either signature changed, update the loader return shape and/or JSX
   props accordingly — the diffs below assume the names have NOT drifted,
   but treat that as unverified until step 1 and 2 are done.

---

## Current file state (for orientation)

`app/routes/courses.$slug.tsx` is 629 lines. Relevant existing pieces:

- **Loader** (lines ~54–117): fetches `getCourseBySlug`, `getCourseWithDetails`,
  `getLessonCountForCourse`, `getCurrentUserId`, then conditionally computes
  `enrolled` / `progress` / `lessonProgressMap` / `nextLessonId` only `if
  (currentUserId)`. Also renders sales copy markdown and computes PPP
  pricing. Returns a single flat object.
- **Component** (line ~185): `const isInstructor = currentUserId ===
  course.instructorId;` — this is the existing convention for
  instructor-check; mirror it rather than inventing a new pattern.
- **Hero meta-info row** (lines ~304–323): a `flex items-center gap-4
  text-sm text-muted-foreground` div containing three `<span
  className="flex items-center gap-1...">` siblings: instructor
  avatar+name, lesson count (`BookOpen` icon), and duration (`Clock` icon,
  conditionally rendered `if (totalDuration > 0)`). **This is the primary
  insertion point for `<StarRating>`.**
- **Sidebar card** (lines ~420–444): a `space-y-2` block inside the sticky
  `Card` that repeats lesson count, duration, and instructor info in a
  narrower single-column layout. See "Sidebar duplication" open question
  below — default recommendation is to **not** duplicate `StarRating` here.
- Import alias: this file already uses `~/components/...` and
  `~/services/...` (see existing imports at the top, e.g. `~/components/course-image`,
  `~/components/user-avatar`, `~/services/courseService`). `tsconfig.json`
  maps `~/*` → `./app/*`. So the new imports are:
  ```ts
  import { getAverageRatingForCourse, getUserRatingForCourse } from "~/services/ratingService";
  import { StarRating } from "~/components/star-rating";
  ```

---

## Loader diff

### Before (lines ~54–117)

```ts
export async function loader({ params, request }: Route.LoaderArgs) {
  const slug = params.slug;
  const course = getCourseBySlug(slug);

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const courseWithDetails = getCourseWithDetails(course.id);
  if (!courseWithDetails) {
    throw data("Course not found", { status: 404 });
  }

  const lessonCount = getLessonCountForCourse(course.id);
  const currentUserId = await getCurrentUserId(request);

  let enrolled = false;
  let progress = 0;
  let lessonProgressMap: Record<number, string> = {};
  let nextLessonId: number | null = null;

  if (currentUserId) {
    enrolled = isUserEnrolled(currentUserId, course.id);

    if (enrolled) {
      progress = calculateProgress(currentUserId, course.id, false, false);

      const progressRecords = getLessonProgressForCourse(
        currentUserId,
        course.id
      );
      for (const record of progressRecords) {
        lessonProgressMap[record.lessonId] = record.status;
      }

      const nextLesson = getNextIncompleteLesson(currentUserId, course.id);
      nextLessonId = nextLesson?.id ?? null;
    }
  }

  // Render sales copy from Markdown to HTML server-side
  const salesCopyHtml = courseWithDetails.salesCopy
    ? await renderMarkdown(courseWithDetails.salesCopy)
    : null;

  const country = await resolveCountry(request);
  const pppPrice = courseWithDetails.pppEnabled
    ? calculatePppPrice(courseWithDetails.price, country)
    : courseWithDetails.price;
  const tierInfo = getCountryTierInfo(country);

  return {
    course: courseWithDetails,
    salesCopyHtml,
    lessonCount,
    enrolled,
    progress,
    lessonProgressMap,
    nextLessonId,
    currentUserId,
    pppPrice,
    tierInfo,
  };
}
```

### After

```ts
export async function loader({ params, request }: Route.LoaderArgs) {
  const slug = params.slug;
  const course = getCourseBySlug(slug);

  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  const courseWithDetails = getCourseWithDetails(course.id);
  if (!courseWithDetails) {
    throw data("Course not found", { status: 404 });
  }

  const lessonCount = getLessonCountForCourse(course.id);
  const currentUserId = await getCurrentUserId(request);

  let enrolled = false;
  let progress = 0;
  let lessonProgressMap: Record<number, string> = {};
  let nextLessonId: number | null = null;

  if (currentUserId) {
    enrolled = isUserEnrolled(currentUserId, course.id);

    if (enrolled) {
      progress = calculateProgress(currentUserId, course.id, false, false);

      const progressRecords = getLessonProgressForCourse(
        currentUserId,
        course.id
      );
      for (const record of progressRecords) {
        lessonProgressMap[record.lessonId] = record.status;
      }

      const nextLesson = getNextIncompleteLesson(currentUserId, course.id);
      nextLessonId = nextLesson?.id ?? null;
    }
  }

  // Rating summary is public — always fetch regardless of auth state.
  const { average: averageRating, count: ratingCount } =
    getAverageRatingForCourse(course.id);

  // A user's own rating only exists/matters if they're logged in — mirror
  // the `enrolled` guard above rather than calling the service with a
  // null/undefined userId.
  const userRating = currentUserId
    ? getUserRatingForCourse(currentUserId, course.id)
    : null;

  // Render sales copy from Markdown to HTML server-side
  const salesCopyHtml = courseWithDetails.salesCopy
    ? await renderMarkdown(courseWithDetails.salesCopy)
    : null;

  const country = await resolveCountry(request);
  const pppPrice = courseWithDetails.pppEnabled
    ? calculatePppPrice(courseWithDetails.price, country)
    : courseWithDetails.price;
  const tierInfo = getCountryTierInfo(country);

  return {
    course: courseWithDetails,
    salesCopyHtml,
    lessonCount,
    enrolled,
    progress,
    lessonProgressMap,
    nextLessonId,
    currentUserId,
    pppPrice,
    tierInfo,
    averageRating,
    ratingCount,
    userRating,
  };
}
```

Notes:
- `averageRating`/`ratingCount` names are this doc's proposal, chosen to
  read naturally as loader fields (`loaderData.averageRating`). If doc 04's
  `StarRating` expects a nested shape instead (e.g. a single `rating` prop),
  either keep these two flat fields and pass them as
  `average={averageRating} count={ratingCount}` (no loader shape change
  needed), or restructure the return object — flat fields are recommended
  since they require no extra reshaping in the component body.
- `getAverageRatingForCourse` is called unconditionally (ratings are public
  info, shown to logged-out visitors too).
- `getUserRatingForCourse` is guarded on `currentUserId` truthiness — same
  pattern as the existing `if (currentUserId) { enrolled = ... }` block.
  **Do not call it with a null/undefined userId.**

---

## Component: `canRate` derivation

### Before (line ~185)

```ts
  const isInstructor = currentUserId === course.instructorId;
```

### After

```ts
  const isInstructor = currentUserId === course.instructorId;
  const canRate = enrolled && !isInstructor;
```

Placed immediately after the existing `isInstructor` line, inside
`CourseDetail`, before it's used in JSX. `enrolled` and `isInstructor` are
already destructured/derived above this point, so no new loader fields are
needed for this derivation.

Also update the destructuring at the top of `CourseDetail` (~lines 173–184)
to pull in the three new loader fields:

```ts
  const {
    course,
    salesCopyHtml,
    lessonCount,
    enrolled,
    progress,
    lessonProgressMap,
    nextLessonId,
    currentUserId,
    pppPrice,
    tierInfo,
    averageRating,
    ratingCount,
    userRating,
  } = loaderData;
```

---

## JSX diff — hero meta-info row (lines ~304–323)

### Before

```tsx
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <UserAvatar
              name={course.instructorName}
              avatarUrl={course.instructorAvatarUrl}
              className="size-5"
            />
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

### After

```tsx
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <UserAvatar
              name={course.instructorName}
              avatarUrl={course.instructorAvatarUrl}
              className="size-5"
            />
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
          <StarRating
            average={averageRating}
            count={ratingCount}
            courseId={course.id}
            canRate={canRate}
            userRating={userRating}
          />
        </div>
```

`StarRating` is added as a fourth sibling inside the existing flex row — no
wrapper `<span>` needed unless doc 04's component doesn't already handle its
own internal layout/spacing (check the actual component; if it renders a bare
row of star icons with no padding, wrapping in `<span className="flex
items-center gap-1">…</span>` may be needed to match the sibling spacing
convention — use judgment based on the real component's rendered output).

Add the import near the top of the file, alongside the other `~/components/*`
imports (after `import { CourseImage } from "~/components/course-image";` /
`import { UserAvatar } from "~/components/user-avatar";`, ~line 38–39):

```ts
import { StarRating } from "~/components/star-rating";
```

And alongside the other `~/services/*` imports (~line 6–10):

```ts
import {
  getAverageRatingForCourse,
  getUserRatingForCourse,
} from "~/services/ratingService";
```

---

## Open question: sidebar duplication (lines ~420–444)

The sticky sidebar card repeats a subset of hero meta info (lesson count,
duration, instructor) in a narrower `space-y-2` list. It's tempting to also
drop `StarRating` there for symmetry, but:

- The original ask was "next to the meta infos... like name of instructor,
  amount of lessons" — that's the hero section, not the sidebar.
- If `canRate={true}`, `StarRating` is an **interactive** input widget (not
  a static readout). Having two independent interactive rating widgets on
  the same page (hero + sidebar) risks confusing UX (which one reflects the
  submitted state? do both need to stay in sync after a fetcher submission?)
  and doubles the surface area for bugs.

**Default recommendation: hero only.** Do not add `StarRating` to the
sidebar in this pass. If a future request wants a compact rating badge in
the sidebar too, that should be a deliberate follow-up (likely a read-only
variant, not the full interactive component) — flag it to the user rather
than silently adding it here.

---

## TODO checklist

1. Re-verify actual signatures of `getAverageRatingForCourse` /
   `getUserRatingForCourse` in `app/services/ratingService.ts` and actual
   props of `StarRating` in `app/components/star-rating.tsx` (see
   Reconciliation section above) — adjust names below if they've drifted.
2. Import `getAverageRatingForCourse` and `getUserRatingForCourse` from
   `~/services/ratingService` at the top of `courses.$slug.tsx`.
3. In the loader, call `getAverageRatingForCourse(course.id)`
   unconditionally; call `getUserRatingForCourse(currentUserId, course.id)`
   only when `currentUserId` is truthy, else default to `null`.
4. Add `averageRating`, `ratingCount`, `userRating` to the loader's returned
   object.
5. In `CourseDetail`, add the three new fields to the destructured
   `loaderData`.
6. Add `const canRate = enrolled && !isInstructor;` immediately after the
   existing `isInstructor` line.
7. Import `StarRating` from `~/components/star-rating`.
8. Insert `<StarRating average={averageRating} count={ratingCount}
   courseId={course.id} canRate={canRate} userRating={userRating} />` as a
   new sibling inside the hero meta-info row (lines ~304–323), after the
   duration span.
9. Do **not** add `StarRating` to the sidebar card (~420–444) — see open
   question above.
10. Run the app locally and manually test in browser via the DevUI
    user-switcher (or however this repo's dev auth works) as each of:
    - (a) **Logged-out visitor** — expect: read-only average/count shown
      (or nothing if `ratingCount === 0`), no interactive stars, `canRate`
      effectively `false` (component receives `userRating: null`,
      `canRate: false`).
    - (b) **Enrolled student who hasn't rated** — expect: interactive
      5-star input, no pre-filled rating (`userRating: null`,
      `canRate: true`).
    - (c) **Enrolled student who has already rated** — expect: interactive
      stars pre-filled with their existing rating (`userRating: <1-5>`,
      `canRate: true`), and re-submitting changes it (upsert via doc 03's
      API route).
    - (d) **The course's own instructor** — expect: read-only display only
      (`canRate: false` because `isInstructor` is true), even though the
      instructor is not "enrolled" in their own course by definition.
    - (e) **Logged-in user who is neither enrolled nor the instructor** —
      expect: read-only display only (`canRate: false` because `enrolled`
      is false).
    Verify for (a), (d), (e) that no interactive star-click submits a
    rating (i.e. `canRate` is correctly `false` and the component honors
    it — this is doc 04's responsibility to enforce, but confirm the prop
    is wired correctly from this page).

---

## Risks / open questions

- **Prop/return-shape drift**: docs 02 and 04 were written in parallel;
  their real signatures may not match the assumptions in this doc. See
  Reconciliation section — treat as mandatory pre-work, not optional.
- **Null userId guard**: `getUserRatingForCourse` must never be called with
  a null/undefined `userId` — mirror the existing `if (currentUserId) {
  enrolled = ... }` guard pattern used for `enrolled`/`progress` elsewhere
  in this loader. Calling it unconditionally with `currentUserId` (which
  can be `null`) would either throw or silently return wrong data depending
  on how doc 02 implemented the query — don't rely on the service to guard
  this itself.
- **Sidebar duplication**: intentionally not wired in this pass (see above)
  — flag to the user if they expected it there too.
- **Zero ratings state**: `averageRating` will be `null` and `ratingCount`
  will be `0` for a brand-new course. Confirm `StarRating` (doc 04) handles
  `average: null` gracefully (e.g. shows "No ratings yet" or empty stars)
  rather than rendering `null` or `NaN` — this doc only passes the value
  through, it doesn't control that rendering.
- **This is the last doc in the sequence** — once this lands, the feature
  is fully wired end-to-end. No further integration doc follows.
