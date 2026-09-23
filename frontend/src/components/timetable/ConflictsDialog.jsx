import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import { resolveEntry } from "@/lib/schedule";
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
import { StatusBadge } from "@/components/StatusBadge";

/**
 * Lists timetable conflicts passed entirely via props and, when `canResolve`
 * is set, lets the viewer attach a note and call `onResolve(index, note)`.
 *
 * There is no PATCH /:id/conflicts/:index/resolve endpoint yet (that's U4) —
 * this component never calls it. It only invokes the callback; the caller
 * decides what (if anything) happens with it.
 *
 * Props:
 *  - open, onOpenChange
 *  - conflicts:  array of strings, or objects shaped roughly like
 *                { type, severity, message/description/reason, day,
 *                  timeSlot/slot, courseId, facultyId, roomId, resolved }
 *  - canResolve: boolean
 *  - onResolve:  (index, note) => void
 *  - maps:       { courses, faculty, rooms } — anything `lib/schedule`'s
 *                `resolveEntry` accepts (an array of docs, a Map<id, doc>, or
 *                a plain { [id]: doc }), used only to turn ids referenced by a
 *                conflict into readable names
 */

function entityName(entity, id) {
  if (!id) return null;
  if (!entity) return String(id);
  return entity.name || entity.title || entity.code || String(id);
}

function describeConflict(conflict, maps) {
  if (typeof conflict === "string") {
    return { message: conflict, meta: [] };
  }

  const message =
    conflict?.message || conflict?.description || conflict?.reason || "Unspecified conflict";

  const meta = [];
  if (conflict?.day) meta.push(conflict.day);
  if (conflict?.timeSlot || conflict?.slot) meta.push(conflict.timeSlot || conflict.slot);
  // Same lookup path as every other component in this set, so pages can pass
  // the arrays they already fetched instead of pre-built Maps.
  const { course, faculty, room } = resolveEntry(
    {
      courseId: conflict?.courseId,
      facultyId: conflict?.facultyId,
      roomId: conflict?.roomId,
    },
    maps
  );

  const courseName = entityName(course, conflict?.courseId);
  if (courseName) meta.push(courseName);
  const facultyName = entityName(faculty, conflict?.facultyId);
  if (facultyName) meta.push(facultyName);
  const roomName = entityName(room, conflict?.roomId);
  if (roomName) meta.push(roomName);

  return { message, meta, type: conflict?.type, severity: conflict?.severity, resolved: conflict?.resolved };
}

export function ConflictsDialog({ open, onOpenChange, conflicts, canResolve, onResolve, maps }) {
  const [notes, setNotes] = useState({});

  const list = Array.isArray(conflicts) ? conflicts : [];

  const handleResolve = (index) => {
    onResolve?.(index, notes[index] || "");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-destructive" />
            Conflicts
          </DialogTitle>
          <DialogDescription>
            {list.length === 0
              ? "No conflicts to review."
              : `${list.length} conflict${list.length === 1 ? "" : "s"} found in this timetable.`}
          </DialogDescription>
        </DialogHeader>

        {list.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <CheckCircle2 className="size-8 text-success" />
            <p className="text-sm text-muted-foreground">
              Nothing needs attention here.
            </p>
          </div>
        ) : (
          // A plain overflow container, not <ScrollArea>: ScrollArea's viewport
          // is `size-full`, so it needs a *definite* height and would force the
          // dialog to 60vh even for a single conflict.
          <div className="max-h-[60vh] overflow-y-auto pr-3">
            <ul className="flex flex-col gap-3">
              {list.map((conflict, index) => {
                const info = describeConflict(conflict, maps);
                return (
                  <li
                    key={index}
                    className={cn(
                      "rounded-lg border border-border bg-card p-3",
                      info.resolved && "opacity-60"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2">
                        {info.resolved ? (
                          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
                        ) : (
                          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
                        )}
                        <p className="text-sm text-foreground">{info.message}</p>
                      </div>
                      {info.type && <StatusBadge variant="neutral">{info.type}</StatusBadge>}
                    </div>

                    {info.meta.length > 0 && (
                      <p className="mt-1.5 pl-6 text-xs text-muted-foreground">
                        {info.meta.join(" · ")}
                      </p>
                    )}

                    {canResolve && !info.resolved && (
                      <div className="mt-3 flex flex-col gap-2 pl-6">
                        <Textarea
                          placeholder="Add a note (optional)"
                          value={notes[index] || ""}
                          onChange={(event) =>
                            setNotes((prev) => ({ ...prev, [index]: event.target.value }))
                          }
                          className="min-h-16 text-sm"
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="self-end"
                          onClick={() => handleResolve(index)}
                        >
                          Mark resolved
                        </Button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

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

export default ConflictsDialog;
