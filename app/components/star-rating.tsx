import { Fragment, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import { Star } from "lucide-react";
import { cn } from "~/lib/utils";

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
      {canRate && <StarInput courseId={courseId} userRating={userRating} />}
    </span>
  );
}

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

// Radios are rendered in descending order (5→1) and laid out with
// `flex-row-reverse` so they display 1→5. That lets the fill effect use only
// the CSS general-sibling combinator (`~`, exposed here via Tailwind's
// `peer`/`peer-checked`/`peer-hover`) to light up a star and every star
// before it in the DOM (i.e. every star visually to its left) — no JS
// hover/selection state needed. See https://www.a11y-toolkit.com/accessible-rating-component
function StarInput({
  courseId,
  userRating,
}: {
  courseId: number;
  userRating: number | null;
}) {
  const fetcher = useFetcher();
  const [lastGoodRating, setLastGoodRating] = useState(userRating);
  const [selected, setSelected] = useState(userRating);

  const failed = fetcher.state === "idle" && fetcher.data?.success === false;

  function handleChange(rating: number) {
    setSelected(rating);
    fetcher.submit(
      { courseId, rating },
      {
        method: "post",
        action: "/api/rate-course",
        encType: "application/json",
      }
    );
  }

  useEffect(() => {
    if (fetcher.state !== "idle" || fetcher.data === undefined) return;
    if (fetcher.data.success) {
      setLastGoodRating(selected);
    } else {
      setSelected(lastGoodRating);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fieldset className="m-0 flex flex-row-reverse items-center gap-0.5 border-0 p-0">
      <legend className="sr-only">Rate this course</legend>
      {[5, 4, 3, 2, 1].map((star) => {
        const id = `rating-${courseId}-${star}`;
        return (
          <Fragment key={star}>
            <input
              type="radio"
              id={id}
              name={`rating-${courseId}`}
              value={star}
              checked={selected === star}
              onChange={() => handleChange(star)}
              className="peer sr-only"
            />
            <label
              htmlFor={id}
              className="peer cursor-pointer rounded-sm p-0.5 text-muted-foreground transition-colors hover:text-primary peer-checked:text-primary peer-hover:text-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50"
            >
              <Star className="size-4 fill-current" aria-hidden="true" />
              <span className="sr-only">
                {star} star{star === 1 ? "" : "s"}
              </span>
            </label>
          </Fragment>
        );
      })}
      {failed && (
        <span className="ml-1 text-xs text-destructive">
          Couldn't save rating
        </span>
      )}
    </fieldset>
  );
}
