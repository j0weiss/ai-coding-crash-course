import { describe, it, expect, beforeEach, vi } from "vitest";
import { eq, and } from "drizzle-orm";
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

  describe("rateCourse", () => {
    it("creates a rating row on first rate", () => {
      const rating = rateCourse(base.user.id, base.course.id, 4);

      expect(rating).toBeDefined();
      expect(rating.userId).toBe(base.user.id);
      expect(rating.courseId).toBe(base.course.id);
      expect(rating.rating).toBe(4);
      expect(rating.createdAt).toBeDefined();
      expect(rating.updatedAt).toBeDefined();
    });

    it("updates instead of duplicating when re-rating", () => {
      rateCourse(base.user.id, base.course.id, 4);
      const second = rateCourse(base.user.id, base.course.id, 2);

      expect(second.rating).toBe(2);

      const rows = testDb
        .select()
        .from(schema.courseRatings)
        .where(
          and(
            eq(schema.courseRatings.userId, base.user.id),
            eq(schema.courseRatings.courseId, base.course.id)
          )
        )
        .all();

      expect(rows).toHaveLength(1);
    });

    it("preserves createdAt but updates updatedAt on re-rate", () => {
      const first = rateCourse(base.user.id, base.course.id, 4);
      const second = rateCourse(base.user.id, base.course.id, 2);

      expect(second.createdAt).toBe(first.createdAt);
      expect(second.updatedAt).toBeDefined();
    });
  });

  describe("getAverageRatingForCourse", () => {
    it("returns null average and 0 count when no ratings exist", () => {
      expect(getAverageRatingForCourse(base.course.id)).toEqual({
        average: null,
        count: 0,
      });
    });

    it("computes the correct average across multiple users' ratings", () => {
      const student2 = testDb
        .insert(schema.users)
        .values({
          name: "Student Two",
          email: "student2@example.com",
          role: schema.UserRole.Student,
        })
        .returning()
        .get();

      rateCourse(base.user.id, base.course.id, 5);
      rateCourse(student2.id, base.course.id, 3);

      expect(getAverageRatingForCourse(base.course.id)).toEqual({
        average: 4,
        count: 2,
      });
    });

    it("only counts ratings for the given courseId", () => {
      const course2 = testDb
        .insert(schema.courses)
        .values({
          title: "Second Course",
          slug: "second-course",
          description: "Another course",
          instructorId: base.instructor.id,
          categoryId: base.category.id,
          status: schema.CourseStatus.Published,
        })
        .returning()
        .get();

      rateCourse(base.user.id, base.course.id, 5);
      rateCourse(base.user.id, course2.id, 1);

      expect(getAverageRatingForCourse(base.course.id)).toEqual({
        average: 5,
        count: 1,
      });
    });
  });

  describe("getUserRatingForCourse", () => {
    it("returns null when the user hasn't rated the course", () => {
      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBeNull();
    });

    it("returns the correct number after rateCourse has been called", () => {
      rateCourse(base.user.id, base.course.id, 4);

      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBe(4);
    });

    it("returns the updated number after a re-rate", () => {
      rateCourse(base.user.id, base.course.id, 4);
      rateCourse(base.user.id, base.course.id, 2);

      expect(getUserRatingForCourse(base.user.id, base.course.id)).toBe(2);
    });
  });
});
