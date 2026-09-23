# 01 — Schema: `course_ratings` table

## Goal / Context

Add a `course_ratings` table so students can leave a 1-5 star rating on a course
they're enrolled in, with one rating per (user, course) pair that can be
updated in place (upsert / re-rate). This doc covers **only** the Drizzle
schema change and the migration that generates it — no service, route, or UI
code. It is one of 5 sibling docs under `docs/plans/course-ratings/`; the
service layer (doc 02) and course detail page wiring (doc 05) both depend on
the exact field names defined here, so treat every name below as locked.

Reference file: `app/db/schema.ts` (~255 lines). The closest existing analog
is `enrollments` (lines 105-117) — same `userId`/`courseId` FK shape, but
`enrollments` has no composite unique index, so that part is new to this
codebase (see "Composite unique index" below).

## Locked names (do not deviate)

| Concept | Name |
|---|---|
| SQL table name | `course_ratings` |
| Drizzle export | `courseRatings` |
| Column: id | `id` (integer PK autoincrement) |
| Column: user FK | `userId` → `user_id` |
| Column: course FK | `courseId` → `course_id` |
| Column: rating | `rating` (integer, 1-5, app/zod-validated — no DB CHECK) |
| Column: created | `createdAt` → `created_at` |
| Column: updated | `updatedAt` → `updated_at` |
| Composite unique index | `course_ratings_user_id_course_id_unique` on `(userId, courseId)` |

## Exact table definition

Insert this **immediately after the `enrollments` table** (currently ends at
line 117, right before `lessonProgress` starts at line 119) — it's the
closest thematic + shape neighbor (same `userId`/`courseId` FK pair), keeping
the file's current top-to-bottom ordering clean.

```ts
export const courseRatings = sqliteTable(
  "course_ratings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    courseId: integer("course_id")
      .notNull()
      .references(() => courses.id),
    rating: integer("rating").notNull(),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
    updatedAt: text("updated_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString()),
  },
  (table) => [
    uniqueIndex("course_ratings_user_id_course_id_unique").on(
      table.userId,
      table.courseId,
    ),
  ],
);
```

### Required import change

`uniqueIndex` is not currently imported in `app/db/schema.ts`. Update the
top-of-file import (line 1) from:

```ts
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
```

to:

```ts
import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
```

### Composite unique index — verified syntax

No table in this schema currently has a composite unique index (existing
`.unique()` calls, e.g. `users.email`, `categories.slug`, `courses.slug`,
`coupons.code`, are all single-column). This was verified directly against
the installed `drizzle-orm@0.45.2` (`node_modules/drizzle-orm/sqlite-core/indexes.d.ts`
and `table.d.ts`):

- `uniqueIndex(name: string)` returns a builder; `.on(...columns)` attaches it
  to specific columns. Import from `drizzle-orm/sqlite-core`.
- The non-deprecated third argument to `sqliteTable` is a callback
  `(table) => SQLiteTableExtraConfigValue[]` — **an array**, not an object.
  (There is an older object-returning form but it's marked `@deprecated` in
  the installed types — do not use it.)
- The snippet above (`(table) => [uniqueIndex(...).on(...)]`) matches this
  current, non-deprecated signature.

## Step-by-step TODO

1. Edit `app/db/schema.ts`:
   - Add `uniqueIndex` to the `drizzle-orm/sqlite-core` import on line 1.
   - Insert the `courseRatings` table definition above, directly after the
     `enrollments` table (after line 117, before `lessonProgress`).
2. Run `npm run db:generate` (= `drizzle-kit generate`). This should produce a
   new file in `drizzle/`, e.g. `drizzle/0003_<random_name>.sql`.
3. **Inspect the generated SQL file manually before trusting it.** Specifically
   check for:
   - A `CREATE TABLE \`course_ratings\`` statement with all 6 columns
     (`id`, `user_id`, `course_id`, `rating`, `created_at`, `updated_at`),
     correct types (`integer` / `text`), and `NOT NULL` on every column except
     none (all columns here are `NOT NULL`, including `rating`,
     `created_at`, `updated_at`).
   - Two `FOREIGN KEY` clauses: `user_id` → `users(id)` and `course_id` →
     `courses(id)`, each `ON UPDATE no action ON DELETE no action` (matches
     the style of every other FK in this repo, e.g. see
     `drizzle/0002_lying_shriek.sql`'s `coupons` table).
   - A separate `CREATE UNIQUE INDEX \`course_ratings_user_id_course_id_unique\`
     ON \`course_ratings\` (\`user_id\`,\`course_id\`)` statement — this is the
     part with no precedent in this repo's migration history, so don't
     skim past it. Confirm it lists **both** columns, not just one.
4. Run `npm run db:migrate` (= `drizzle-kit migrate`) to apply it to
   `data.db`.
5. Verify against `data.db` (e.g. via `sqlite3 data.db ".schema course_ratings"`
   or the WebStorm DB tool) that:
   - The table exists with the expected columns/types.
   - The FKs are present.
   - The unique index exists and covers `(user_id, course_id)`.
   - Inserting two rows with the same `(user_id, course_id)` fails; inserting
     the same `user_id` with a different `course_id` (or vice versa) succeeds.

## Open questions / risks

- **DB-level CHECK constraint for the 1-5 range?** Considered and
  **rejected** for consistency: this schema already has several
  app-layer-only constraints with no DB enforcement (e.g. `status` /
  `role` / `questionType` columns are plain `text().$type<Enum>()` with no
  `CHECK`, relying entirely on Zod/TS at the boundary). Adding a
  `CHECK(rating BETWEEN 1 AND 5)` here would be inconsistent with that
  existing pattern and would also require a raw SQL customization in the
  generated migration (drizzle-kit doesn't emit CHECK constraints from
  plain `integer()` column config). **Recommendation: no CHECK constraint** —
  enforce range 1-5 in the API route's Zod schema (doc 03) instead.
- **No precedent for composite unique index in this repo's migration
  history** — the generated SQL for step 3 above should be manually
  eyeballed, not blindly applied. If `drizzle-kit generate` produces
  anything unexpected (e.g. splits the index into two single-column
  indexes, or omits it entirely), stop and fix the schema/config rather
  than editing the generated SQL by hand.
- **No `ON DELETE CASCADE`**: consistent with every other FK in this schema
  (none use cascade deletes), so a deleted user/course would leave orphaned
  rating rows unless handled at the application layer elsewhere. Out of
  scope for this doc; flagging for awareness only.
- **Enrollment/instructor checks are not enforced by this table.** "Only
  enrolled students can rate" and "instructors cannot rate their own course"
  are business rules, not schema constraints — they belong in the service
  layer (doc 02) / API route (doc 03), which will need to join against
  `enrollments` and `courses.instructorId`.

## Consumed by

- **Doc 02 (service layer, `app/services/ratingService.ts`)**: uses
  `courseRatings`, `userId`, `courseId`, `rating`, `createdAt`, `updatedAt`
  exactly as named above for its upsert logic (insert-or-update keyed on the
  `(userId, courseId)` unique index).
- **Doc 05 (course detail page wiring, `app/routes/courses.$slug.tsx`)**:
  reads from `courseRatings` (via the service layer) using these same field
  names to compute/display the average rating next to instructor name and
  lesson count.
