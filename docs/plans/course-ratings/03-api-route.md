# 03 — API Route: `app/routes/api.rate-course.ts`

## Goal

Add a POST resource route that lets an enrolled, non-instructor user submit or
update (upsert) a 1–5 star rating for a course. This route is the only entry
point for writing ratings — it owns all auth/authorization checks and
delegates the actual write to `rateCourse` in the service layer, which does
**no** auth checks itself.

## Depends on

- **01 — Schema**: `courseRatings` table in `app/db/schema.ts` (not present yet).
- **02 — Service layer**: `app/services/ratingService.ts` exporting `rateCourse(userId, courseId, rating)` (not present yet).

This doc can be implemented once both land — it imports from both but adds
no new schema/service code itself.

## Consumed by

- **04 — UI component** (`app/components/star-rating.tsx`) will POST to
  `/api/rate-course` via React Router's `useFetcher`, sending
  `{ courseId, rating }` as a JSON body.

---

## Reference template

This route directly mirrors `app/routes/api.video-tracking.ts` — same
imports, same `data(...)` error-throwing pattern, same `parseJsonBody` usage,
same action shape. Do not deviate from this structure.

## File to create: `app/routes/api.rate-course.ts`

```ts
import { data } from "react-router";
import { z } from "zod";
import type { Route } from "./+types/api.rate-course";
import { getCurrentUserId } from "~/lib/session";
import { getCourseById } from "~/services/courseService";
import { isUserEnrolled } from "~/services/enrollmentService";
import { rateCourse } from "~/services/ratingService";
import { parseJsonBody } from "~/lib/validation";

const rateCourseSchema = z.object({
  courseId: z.number(),
  rating: z.number().int().min(1).max(5),
});

export async function action({ request }: Route.ActionArgs) {
  const currentUserId = await getCurrentUserId(request);
  if (!currentUserId) {
    throw data("Unauthorized", { status: 401 });
  }

  const parsed = await parseJsonBody(request, rateCourseSchema);

  if (!parsed.success) {
    throw data("Invalid parameters", { status: 400 });
  }

  const { courseId, rating } = parsed.data;

  const course = getCourseById(courseId);
  if (!course) {
    throw data("Course not found", { status: 404 });
  }

  if (currentUserId === course.instructorId) {
    throw data("Instructors cannot rate their own course", { status: 403 });
  }

  if (!isUserEnrolled(currentUserId, courseId)) {
    throw data("You must be enrolled to rate this course", { status: 403 });
  }

  rateCourse(currentUserId, courseId, rating);

  return { success: true };
}
```

### Action logic, in order (do not reorder)

| # | Check | Failure response |
|---|-------|-------------------|
| 1 | `getCurrentUserId(request)` — falsy? | `throw data("Unauthorized", { status: 401 })` |
| 2 | `parseJsonBody(request, rateCourseSchema)` — `!parsed.success`? | `throw data("Invalid parameters", { status: 400 })` |
| 3 | `getCourseById(courseId)` — not found? | `throw data("Course not found", { status: 404 })` |
| 4 | `currentUserId === course.instructorId`? | `throw data("Instructors cannot rate their own course", { status: 403 })` |
| 5 | `isUserEnrolled(currentUserId, courseId)` — false? | `throw data("You must be enrolled to rate this course", { status: 403 })` |
| 6 | `rateCourse(currentUserId, courseId, rating)` | (upsert, no return value used) |
| 7 | Return `{ success: true }` | — |

Notes:
- `getCourseById` is the existing function in `app/services/courseService.ts`
  (`export function getCourseById(id: number)`) — use this, not
  `getCourseBySlug` or `getCourseWithDetails`.
- Step 4 replicates the exact comparison style already used in
  `app/routes/courses.$slug.tsx` (`currentUserId === course.instructorId`)
  rather than introducing a new "is instructor" helper.
- `isUserEnrolled(userId, courseId)` is exported from
  `app/services/enrollmentService.ts` and returns a plain `boolean`.

---

## Route registration: `app/routes.ts`

Add one line alongside the other `route("api/...")` entries at the bottom of
the file (after the layout block, in the flat list of top-level routes):

```ts
route("api/rate-course", "routes/api.rate-course.ts"),
```

Current bottom-of-file block for reference (add the new line after
`api/video-tracking` or `api/set-dev-country`, matching existing order/style):

```ts
  route("signup", "routes/signup.tsx"),
  route("login", "routes/login.tsx"),
  route("api/switch-user", "routes/api.switch-user.ts"),
  route("api/logout", "routes/api.logout.ts"),
  route("api/video-tracking", "routes/api.video-tracking.ts"),
  route("api/set-dev-country", "routes/api.set-dev-country.ts"),
  route("api/rate-course", "routes/api.rate-course.ts"),
] satisfies RouteConfig;
```

---

## TODO checklist

1. [ ] Create `app/routes/api.rate-course.ts` with the code above.
2. [ ] Implement step 1 (auth check, 401).
3. [ ] Implement step 2 (`parseJsonBody` + zod schema, 400).
4. [ ] Implement step 3 (`getCourseById` lookup, 404).
5. [ ] Implement step 4 (instructor-ownership check, 403).
6. [ ] Implement step 5 (`isUserEnrolled` check, 403).
7. [ ] Implement step 6 (call `rateCourse`).
8. [ ] Implement step 7 (return `{ success: true }`).
9. [ ] Add the `route("api/rate-course", ...)` line to `app/routes.ts`.
10. [ ] Run `npm run typecheck` (or equivalent) to confirm route types resolve (`./+types/api.rate-course` is generated by React Router's typegen).
11. [ ] Start the dev server (`npm run dev`) and manually test with curl, using a logged-in session cookie (see below).
12. [ ] Confirm each rejection path returns the documented status code (see verification checklist below).

### Example curl test

Requires a valid `cadence_session` cookie from a logged-in browser session
(copy it from devtools after logging in locally, e.g. via the dev
switch-user flow). Replace `<SESSION_COOKIE>`, `<COURSE_ID>`.

```bash
curl -i -X POST http://localhost:5173/api/rate-course \
  -H "Content-Type: application/json" \
  -H "Cookie: cadence_session=<SESSION_COOKIE>" \
  -d '{"courseId": <COURSE_ID>, "rating": 5}'
```

Expect `200 {"success":true}` for an enrolled, non-instructor user rating a
course they're enrolled in.

---

## Verification checklist

Manual (no session cookie / wrong role / bad payload), run against a local
dev server:

- [ ] No cookie sent → `401 Unauthorized`.
- [ ] Body missing `rating` or `courseId` → `400 Invalid parameters`.
- [ ] `rating` out of range (`0`, `6`, `-1`) or non-integer (`3.5`) → `400 Invalid parameters`.
- [ ] `courseId` pointing at a nonexistent course → `404 Course not found`.
- [ ] Logged in as the course's instructor, rating their own course → `403 Instructors cannot rate their own course`.
- [ ] Logged in as a user not enrolled in the course → `403 You must be enrolled to rate this course`.
- [ ] Logged in as an enrolled, non-instructor user → `200 { success: true }`; a `course_ratings` row is created for that `(userId, courseId)` pair.
- [ ] Submitting a second rating for the same `(userId, courseId)` → `200`, existing row is **updated** (same row id, new `rating`/`updatedAt`), not duplicated. Verify via the service's upsert (unique constraint on `userId`+`courseId` from doc 01) rather than by inspecting this route's code — the route just calls `rateCourse`.

## Automated tests: none exist for routes today

Searched `app/routes/**` and the whole repo for `*.test.ts` files
co-located with route modules — there are none. Existing tests only cover
the service layer (e.g. `app/services/enrollmentService.test.ts`,
`app/services/courseService.test.ts`) using `createTestDb` /
`seedBaseData` from `app/test/setup` with `vi.mock("~/db", ...)`.

There is no established pattern in this codebase for testing a route
`action` function directly (e.g. via `createRoutesStub` or calling `action()`
with a mock `Request`). **Fallback: manual verification** via the curl
commands and checklist above. If automated route-action tests are desired
later, that would be a separate, explicitly-scoped effort — not assumed here.

## Open questions / risks

- **`courseId` type coercion**: the zod schema uses `z.number()`, so a
  `courseId` sent as a JSON string (`"5"` instead of `5`) will fail
  validation and return 400. This matches `api.video-tracking.ts`'s
  handling of `lessonId` — no special coercion added. The UI component (doc
  04) must send `courseId` as a JSON number.
- **Rate limiting / spam**: out of scope for this doc. No rate limiting is
  applied to repeated rating submissions; only revisit if explicitly
  requested.
- **`rateCourse` error handling**: this doc assumes `rateCourse` (from doc
  02) does not throw under normal conditions once all upstream checks pass
  (course exists, user enrolled). If `rateCourse` can throw (e.g. DB
  constraint violation), this route does not currently catch it — it will
  propagate as an unhandled 500. Flag to doc 02's author if a specific error
  contract is needed here.
- **Course status**: this route does not check `course.status` (e.g. rating
  a draft/unpublished course). Not specified in the feature brief — left
  as-is unless the enrollment check already precludes it (a user generally
  can't be enrolled in a non-published course, so this may be moot).
