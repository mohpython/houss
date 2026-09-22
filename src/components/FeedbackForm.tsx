import { useState } from "react";
import { useTranslation } from "react-i18next";
import { StarRating } from "@/components/StarRating";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface FeedbackFormProps {
  onSubmit: (data: { rating: number; comment?: string }) => Promise<void>;
  submitting?: boolean;
}

export function FeedbackForm({ onSubmit, submitting }: FeedbackFormProps) {
  const { t } = useTranslation();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (rating < 1) return;
        await onSubmit({ rating, comment: comment.trim() || undefined });
      }}
    >
      <div>
        <div className="mb-2 text-sm font-medium">{t("feedback.rateLabel")}</div>
        <StarRating value={rating} onChange={setRating} size="lg" />
      </div>
      <Textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder={t("feedback.commentPlaceholder")}
        maxLength={1000}
        rows={4}
      />
      <Button type="submit" disabled={rating < 1 || submitting} className="w-full">
        {submitting ? t("common.loading") : t("feedback.send")}
      </Button>
    </form>
  );
}
