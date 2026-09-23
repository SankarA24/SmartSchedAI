import { useState } from "react";
import { MessageSquare, Send } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

/**
 * Lists timetable comments passed entirely via props and lets the viewer
 * draft a new one. There is no POST /:id/comments endpoint yet (that's
 * U4) — this component never posts anywhere, it only calls `onAdd(text)`
 * and clears the draft; the caller decides what happens with it.
 *
 * Props:
 *  - open, onOpenChange
 *  - comments: array of { id, author/authorName, text/body, createdAt } | undefined
 *  - onAdd:    (text) => void
 *  - busy:     boolean — disables the composer while a submission is pending
 */

function formatTimestamp(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CommentsDialog({ open, onOpenChange, comments, onAdd, busy }) {
  const [draft, setDraft] = useState("");

  const list = Array.isArray(comments) ? comments : [];

  const handleSubmit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    onAdd?.(text);
    setDraft("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="size-4 text-muted-foreground" />
            Comments
          </DialogTitle>
          <DialogDescription>
            {list.length === 0
              ? "No comments yet."
              : `${list.length} comment${list.length === 1 ? "" : "s"}.`}
          </DialogDescription>
        </DialogHeader>

        {list.length > 0 && (
          // A plain overflow container, not <ScrollArea>: ScrollArea's viewport
          // is `size-full`, so it needs a *definite* height and would force the
          // dialog to 45vh even for a single comment.
          <div className="max-h-[45vh] overflow-y-auto pr-3">
            <ul className="flex flex-col gap-3">
              {list.map((comment, index) => {
                const author = comment?.author || comment?.authorName || "Unknown";
                const text = comment?.text || comment?.body || "";
                const timestamp = formatTimestamp(comment?.createdAt);
                return (
                  <li
                    key={comment?.id ?? index}
                    className="rounded-lg border border-border bg-card p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{author}</span>
                      {timestamp && (
                        <span className="text-xs text-muted-foreground">{timestamp}</span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{text}</p>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-2 pt-1">
          <Textarea
            placeholder="Write a comment…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            disabled={busy}
            className="min-h-20 text-sm"
          />
          <Button
            type="button"
            size="sm"
            className="self-end"
            disabled={busy || !draft.trim()}
            onClick={handleSubmit}
          >
            <Send className="size-3.5" />
            Post
          </Button>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default CommentsDialog;
