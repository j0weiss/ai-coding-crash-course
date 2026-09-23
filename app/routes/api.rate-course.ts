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
