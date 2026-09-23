import { eq, and, sql } from "drizzle-orm";
import { db } from "~/db";
import { courseRatings } from "~/db/schema";

// ─── Rating Service ───
// Handles course rating upsert and average/lookup queries.
// Uses positional parameters (project convention).

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
