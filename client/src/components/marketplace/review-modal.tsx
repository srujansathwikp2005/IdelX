"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Textarea } from "@/components/ui/input";
import { Star } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api-client";
import { errorMessage } from "@/lib/auth";

export type ReviewTarget = { _id: string; title: string };

export function ReviewModal({
  open,
  onClose,
  booking,
  onSubmitted,
  asOwner = false,
}: {
  open: boolean;
  onClose: () => void;
  booking: ReviewTarget | null;
  onSubmitted: () => void;
  /** An owner rates the person who hired the item, not the item. The server
   *  works out the direction from who is asking; this only sets the wording. */
  asOwner?: boolean;
}) {
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setRating(0);
      setHover(0);
      setComment("");
      setError(null);
    }
  }

  const submit = async () => {
    if (!booking || rating === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/reviews", { bookingId: booking._id, rating, comment: comment.trim() });
      onSubmitted();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={asOwner ? "Rate this renter" : "Rate your rental"}
      description={
        booking
          ? asOwner
            ? `How was ${booking.title}? Did they look after it and return it on time?`
            : `How was renting “${booking.title}”?`
          : undefined
      }
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={submitting} disabled={rating === 0} onClick={submit}>
            Submit Review
          </Button>
        </div>
      }
    >
      <div className="space-y-5 pb-2">
        {error && <p className="rounded-md bg-danger-50 p-3 text-sm text-danger">{error}</p>}
        <div>
          <p className="mb-2 text-sm font-medium">Your rating</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                className="p-0.5 transition hover:scale-110"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
              >
                <Star
                  size={30}
                  className={cn(
                    "transition-colors",
                    n <= (hover || rating) ? "fill-accent-500 text-accent-500" : "fill-gray-200 text-gray-300"
                  )}
                />
              </button>
            ))}
            <span className="ml-2 text-sm font-medium text-muted-foreground">
              {rating ? `${rating} / 5` : "Select a rating"}
            </span>
          </div>
        </div>
        <Textarea
          label="Comment (optional)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={asOwner ? "Did they look after it and return it on time?" : "Smooth handover, item matched the description, deposit returned on time..."}
          rows={4}
        />
      </div>
    </Modal>
  );
}
