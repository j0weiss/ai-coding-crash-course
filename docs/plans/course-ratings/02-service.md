# 02 — Service Layer: `app/services/ratingService.ts`

## Goal

Add a pure data-access layer for course ratings: upsert a user's rating, compute
a course's average rating + count, and look up a single user's rating for a
course. This is **data layer only** — no authorization, enrollment, or
instructor checks live here. This codebase does auth checks inline in routes
(e.g. `app/routes/courses.$slug.tsx:185` — `const isInstructor = currentUserId
=== course.instructorId`), and the API route doc (03) is responsible for
verifying the caller is enrolled and is not the course's instructor before
calling `rateCourse`.

## Depends on

Schema doc (01) defines `app/db/schema.ts` export `courseRatings` with exactly
these fields: `id`, `userId`, `courseId`, `rating`, `createdAt`, `updatedAt`,
plus a composite unique index on `(userId, courseId)`. This doc assumes those
exact names exist. If the schema doc changes a field name, update the code
below to match.

## Consumed by

API route doc (03) — `app/routes/api.rate-course.ts` will call `rateCourse`,
`getAverageRatingForCourse`, and `getUserRatingForCourse` directly by name.
Treat the three signatures below as a stable contract.

---

## File: `app/services/ratingService.ts`

### Imports / header

```ts
import { eq, and, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

// ─── Rating Service ───
// Handles course rating upsert and average/lookup queries.
// Uses positional parameters (project convention).
```

### `rateCourse`

Upsert: insert a new rating row, or if a row already exists for
`(userId, courseId)` (enforced by the composite unique index from the schema
doc), update `rating` and `updatedAt` instead of inserting a duplicate.

Drizzle's sqlite `.onConflictDoUpdate()` target accepts the column list that
maps to the unique index/constraint being conflicted on — pass the two
columns, not the index name:

```ts
export function rateCourse(userId: number, courseId: number, rating: number) {
  const now = new Date().toISOString();

  return db
    .insert(courseRatings)
    .values({ userId, courseId, rating, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [courseRatings.userId, courseRatings.courseId],
      set: { rating, updatedAt: now },
    })
    .returning()
    .get();
}
```

Notes:
- `target` must reference the exact columns that make up the composite unique
  index defined in the schema doc. If the schema doc instead names the index
  (e.g. `uniqueIndex("course_ratings_user_id_course_id_unique")`), the
  column-array form above still works — drizzle-orm resolves the conflict
  target by columns, not by index name.
- `createdAt` is only used on the insert branch; `set` intentionally omits it
  so re-rating never changes the original `createdAt`.
- Returns the full inserted/updated row via `.returning().get()`, matching
  `enrollUser`'s pattern in `enrollmentService.ts`.

### `getAverageRatingForCourse`

Same aggregate pattern as `getEnrollmentCountForCourse` in
`enrollmentService.ts`, but computing both `avg()` and `count()` in one query.
`average` must be `null` when there are zero ratings — don't let `avg()` on an
empty set surface as `0` (SQLite already returns `NULL` for `avg()` over zero
rows, but we gate explicitly on `count` for a defensive, self-documenting
return value).

```ts
export function getAverageRatingForCourse(courseId: number) {
  const result = db
    .select({
      average: sql<number | null>`avg(${courseRatings.rating})`,
      count: sql<number>`count(*)`,
    })
    .from(courseRatings)
    .where(eq(courseRatings.courseId, courseId))
    .get();

  const count = result?.count ?? 0;

  return {
    average: count > 0 ? (result!.average as number) : null,
    count,
  };
}
```

Return type: `{ average: number | null; count: number }`.

### `getUserRatingForCourse`

Single `.get()` lookup, mirrors `findEnrollment`'s shape in
`enrollmentService.ts`.

```ts
export function getUserRatingForCourse(userId: number, courseId: number) {
  const result = db
    .select({ rating: courseRatings.rating })
    .from(courseRatings)
    .where(
      and(eq(courseRatings.userId, userId), eq(courseRatings.courseId, courseId))
    )
    .get();

  return result?.rating ?? null;
}
```

Return type: `number | null`.

---

## TODO checklist

1. Create `app/services/ratingService.ts` with the header/imports above.
2. Implement `rateCourse(userId, courseId, rating)`.
3. Implement `getAverageRatingForCourse(courseId)`.
4. Implement `getUserRatingForCourse(userId, courseId)`.
5. Create `app/services/ratingService.test.ts` following
   `enrollmentService.test.ts`'s structure (`vi.mock("~/db", ...)`,
   `createTestDb()` / `seedBaseData()` from `~/test/setup`, import the
   service functions *after* the mock).
6. Write the test cases below.

---

## Test file scaffold

Match `enrollmentService.test.ts` exactly:

```ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { createTestDb, seedBaseData } from "~/test/setup";
import * as schema from "~/db/schema";

let testDb: ReturnType<typeof createTestDb>;
let base: ReturnType<typeof seedBaseData>;

vi.mock("~/db", () => ({
  get db() {
    return testDb;
  },
}));

// Import after mock so the module picks up our test db
import {
  rateCourse,
  getAverageRatingForCourse,
  getUserRatingForCourse,
} from "./ratingService";

describe("ratingService", () => {
  beforeEach(() => {
    testDb = createTestDb();
    base = seedBaseData(testDb);
  });

  // ...
});
```

`seedBaseData()` (see `app/test/setup.ts`) provides `{ user, instructor,
category, course }` — one student (`base.user`), one instructor
(`base.instructor`), one category, one published course (`base.course`). It
does **not** provide a second student, which is needed to test multi-user
averaging. Insert an extra student directly via `testDb.insert(schema.users)`
inside the relevant test, following the pattern already used in
`enrollmentService.test.ts`'s `getEnrollmentsByCourse` test (`student2`
insert).

## Test cases to write

`rateCourse`:
- Rating a course for the first time creates a row: call
  `rateCourse(base.user.id, base.course.id, 4)`, assert the returned row has
  `userId`, `courseId`, `rating: 4`, non-null `createdAt`/`updatedAt`.
- Re-rating updates instead of duplicating: call `rateCourse` twice with the
  same `(userId, courseId)` but different `rating` values (e.g. 4 then 2).
  Assert the second call's returned `rating` is `2`, and assert there is
  still exactly one row for that `(userId, courseId)` pair — query
  `testDb.select().from(schema.courseRatings).where(...)` (or use
  `getUserRatingForCourse`) and check the count/array length is 1, not 2.
- Re-rating updates `updatedAt` but not `createdAt`: rate once, capture
  `createdAt`, rate again, assert `createdAt` is unchanged and `updatedAt`
  reflects the second call (loosely — e.g. both defined, or just assert
  `createdAt` equality across the two calls).

`getAverageRatingForCourse`:
- Returns `{ average: null, count: 0 }` when no ratings exist for the course.
- Computes the correct average across multiple users' ratings: insert a
  second student (see scaffold note above), have `base.user` rate 5 and the
  second student rate 3, assert `{ average: 4, count: 2 }`.
- Only counts ratings for the given `courseId` (create a second course,
  rate it separately, assert the first course's average/count is unaffected)
  — optional but recommended given this is an aggregate query with a `WHERE`.

`getUserRatingForCourse`:
- Returns `null` when the user hasn't rated the course.
- Returns the correct number after `rateCourse` has been called.
- Returns the updated number after a re-rate (reflects upsert, not the
  original value).

---

## Open questions / risks

- **Should `rating` be validated as an integer 1-5 inside the service?**
  Recommendation: **no** — keep this service a trusting data layer, per this
  codebase's existing convention (`enrollmentService.ts` and
  `courseService.ts` do not re-validate inputs already validated upstream;
  e.g. `enrollUser` trusts `userId`/`courseId` and only checks *business*
  invariants like "already enrolled", not primitive shape). Range/type
  validation (1-5, integer) belongs in the zod schema in the API route (doc
  03), matching how this codebase separates route-level validation from
  service-level business logic. If schema doc 01 adds a SQLite `CHECK`
  constraint on `rating`, that's an acceptable defense-in-depth backstop at
  the DB layer — but this service should not duplicate range-checking logic.
- **`onConflictDoUpdate` target column order**: pass
  `[courseRatings.userId, courseRatings.courseId]` in the same order the
  schema doc declares the composite unique index, to avoid any ambiguity if
  drizzle-orm's sqlite dialect is sensitive to column order when resolving
  the conflict target (it generally isn't, since SQLite matches by the set
  of columns in the unique constraint, but keeping order consistent with the
  schema avoids any doubt during review).
- **Concurrent double-submit**: `onConflictDoUpdate` handles the race at the
  DB level (atomic upsert), so no extra locking/transaction is needed in this
  service.
