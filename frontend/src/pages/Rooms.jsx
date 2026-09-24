import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CalendarCheck,
  Clock,
  DoorOpen,
  FlaskConical,
  Home,
  Layers,
  Plus,
  RefreshCw,
  Users,
  X,
} from "lucide-react";

import api from "@/lib/api";
import { cn } from "@/lib/utils";
import { navForRole } from "@/lib/nav";
import { AppShell, PageHeader } from "@/components/AppShell";
import { StatCard } from "@/components/common/StatCard";
import { SectionCard } from "@/components/common/SectionCard";
import { Callout } from "@/components/common/Callout";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { DataTable } from "@/components/Data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

// =====================================================
// /rooms — admin room management (U9)
//
// Data flow is unchanged: rooms are read from `GET /api/rooms` and written
// back with `POST /api/rooms` / `PUT /api/rooms/:id` / `DELETE /api/rooms/:id`,
// with the same payload shape (capacity and floor coerced to numbers,
// equipment split on commas, availability kept as the lowercase
// day -> [{start,end}] map the Mongoose schema expects — see
// `backend/models/Room.js`).
//
// The layout is the bento Dashboard.jsx establishes, at the same rhythm
// (space-y-5 page, gap-5 between cells, gap-4 inside a cell):
//   Band 1 — capacity by room type (7/12) | four stat tiles + bookability (5/12)
//   Band 2 — the add/edit form, only while it is open
//   Band 3 — the room table, full width, in its own card
//
// Colour is semantic only. The stat tiles all carry the default primary tile
// because a seat count is not a status; success and warning appear once each,
// on the bookability cell, where "every room has availability" and "n rooms
// have none" genuinely mean healthy and needs-attention. Equipment chips are
// neutral — they are categories, not statuses.
// =====================================================

const ROOM_TYPES = [
  { value: "lecture_hall", label: "Lecture Hall" },
  { value: "lab", label: "Laboratory" },
  { value: "seminar_room", label: "Seminar Room" },
  { value: "auditorium", label: "Auditorium" },
];

const WEEK_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

/** Empty availability map — one key per day, as the Room schema expects. */
function emptyAvailability() {
  return WEEK_DAYS.reduce((acc, day) => ({ ...acc, [day]: [] }), {});
}

function emptyForm() {
  return {
    name: "",
    building: "",
    floor: "",
    capacity: "",
    type: "",
    equipment: "",
    availability: emptyAvailability(),
  };
}

/** "lecture_hall" -> "Lecture Hall" */
function prettyType(type) {
  return String(type || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

/** "monday" -> "Monday" */
function prettyDay(day) {
  return day.charAt(0).toUpperCase() + day.slice(1);
}

/** Days on which a room carries at least one availability window. */
function availableDays(room) {
  const availability = room?.availability || {};
  return WEEK_DAYS.filter((day) => (availability[day]?.length || 0) > 0);
}

export default function RoomPage() {
  const { brand, nav, quickActions } = navForRole("admin");

  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [editingRoom, setEditingRoom] = useState(null);
  const [formData, setFormData] = useState(emptyForm);

  const [newTimeSlot, setNewTimeSlot] = useState({
    day: "monday",
    start: "",
    end: "",
  });

  const [roomToDelete, setRoomToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const resetForm = () => {
    setFormData(emptyForm());
    setEditingRoom(null);
  };

  const fetchRooms = async () => {
    setLoading(true);
    try {
      const res = await api.get("/rooms");
      setRooms(Array.isArray(res.data) ? res.data : []);
      setError("");
    } catch (requestError) {
      console.error("Error fetching rooms:", requestError);
      setRooms([]);
      setError("Unable to load rooms.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const handleEditRoom = (room) => {
    setFormData({
      name: room.name || "",
      building: room.building || "",
      floor: room.floor?.toString() || "",
      capacity: room.capacity?.toString() || "",
      type: room.type || "",
      equipment: room.equipment?.join(", ") || "",
      availability: { ...emptyAvailability(), ...(room.availability || {}) },
    });
    setEditingRoom(room);
    setShowForm(true);
  };

  const handleSubmitRoom = async (event) => {
    event.preventDefault();
    setFormLoading(true);

    try {
      const payload = {
        ...formData,
        capacity: Number(formData.capacity),
        floor: Number(formData.floor),
        equipment: formData.equipment
          ? formData.equipment
              .split(",")
              .map((item) => item.trim())
              .filter((item) => item)
          : [],
      };

      if (editingRoom) {
        await api.put(`/rooms/${editingRoom._id}`, payload);
      } else {
        await api.post("/rooms", payload);
      }

      resetForm();
      setShowForm(false);
      setError("");
      fetchRooms();
    } catch (requestError) {
      console.error("Error saving room:", requestError);
      setError(
        requestError?.response?.data?.error || "Unable to save that room."
      );
    } finally {
      setFormLoading(false);
    }
  };

  const confirmDeleteRoom = async () => {
    if (!roomToDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/rooms/${roomToDelete._id}`);
      if (editingRoom && editingRoom._id === roomToDelete._id) {
        resetForm();
        setShowForm(false);
      }
      setError("");
      await fetchRooms();
      setRoomToDelete(null);
    } catch (requestError) {
      console.error("Error deleting room:", requestError);
      setError(
        requestError?.response?.data?.error || "Unable to delete that room."
      );
      setRoomToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const addTimeSlot = () => {
    if (!newTimeSlot.start || !newTimeSlot.end) return;

    setFormData((prev) => ({
      ...prev,
      availability: {
        ...prev.availability,
        [newTimeSlot.day]: [
          ...(prev.availability[newTimeSlot.day] || []),
          { start: newTimeSlot.start, end: newTimeSlot.end },
        ],
      },
    }));

    setNewTimeSlot({ day: newTimeSlot.day, start: "", end: "" });
  };

  const removeTimeSlot = (day, index) => {
    setFormData((prev) => ({
      ...prev,
      availability: {
        ...prev.availability,
        [day]: prev.availability[day].filter((_, i) => i !== index),
      },
    }));
  };

  /**
   * Every summary figure on the page, derived from the one `/rooms`
   * response — nothing here is fetched separately and nothing is invented.
   * `byType` always lists all four schema types, including the ones with no
   * rooms yet, because "no lab" is exactly what an admin needs to see: lab
   * courses cannot be placed without one.
   */
  const summary = useMemo(() => {
    const seats = rooms.reduce(
      (total, room) => total + (Number(room.capacity) || 0),
      0
    );
    const labs = rooms.filter((room) => room.type === "lab").length;
    const buildings = new Set(
      rooms.map((room) => room.building).filter(Boolean)
    ).size;
    const bookable = rooms.filter((room) => availableDays(room).length > 0).length;

    const byType = ROOM_TYPES.map((type) => {
      const matching = rooms.filter((room) => room.type === type.value);
      const typeSeats = matching.reduce(
        (total, room) => total + (Number(room.capacity) || 0),
        0
      );
      return {
        ...type,
        count: matching.length,
        seats: typeSeats,
        share: seats > 0 ? Math.round((typeSeats / seats) * 100) : 0,
      };
    });

    return {
      seats,
      labs,
      buildings,
      bookable,
      missing: rooms.length - bookable,
      bookableShare:
        rooms.length > 0 ? Math.round((bookable / rooms.length) * 100) : 0,
      byType,
    };
  }, [rooms]);

  const showSkeletons = loading && rooms.length === 0;

  const columns = [
    {
      key: "name",
      label: "Room",
      sortable: true,
      render: (room) => (
        <div className="min-w-0 space-y-1">
          <div className="font-medium text-foreground">{room.name}</div>
          <div className="text-sm text-muted-foreground">
            {room.building}
            {room.floor !== undefined && room.floor !== null
              ? `, Floor ${room.floor}`
              : ""}
          </div>
        </div>
      ),
    },
    {
      key: "type",
      label: "Type",
      sortable: true,
      render: (room) => (
        <StatusBadge variant="neutral">{prettyType(room.type)}</StatusBadge>
      ),
    },
    {
      key: "capacity",
      label: "Capacity",
      sortable: true,
      render: (room) => (
        <div className="flex items-baseline gap-1.5">
          <span className="font-medium text-foreground tabular-nums">
            {room.capacity}
          </span>
          <span className="text-xs text-muted-foreground">seats</span>
        </div>
      ),
    },
    {
      key: "equipment",
      label: "Equipment",
      render: (room) => {
        const equipment = room.equipment || [];
        if (equipment.length === 0) {
          return <span className="text-sm text-muted-foreground">None</span>;
        }
        return (
          <div className="flex max-w-40 flex-wrap gap-1">
            {equipment.slice(0, 2).map((item, index) => (
              <StatusBadge key={index} variant="neutral">
                {item}
              </StatusBadge>
            ))}
            {equipment.length > 2 && (
              <StatusBadge variant="neutral">+{equipment.length - 2}</StatusBadge>
            )}
          </div>
        );
      },
    },
    {
      key: "availability",
      label: "Available Days",
      render: (room) => {
        const open = availableDays(room);
        const windows = room.availability || {};

        return (
          <div className="space-y-1.5">
            <div className="flex gap-1">
              {WEEK_DAYS.map((day) => {
                const slots = windows[day] || [];
                const isOpen = slots.length > 0;
                return (
                  <span
                    key={day}
                    title={
                      isOpen
                        ? `${prettyDay(day)}: ${slots
                            .map((slot) => `${slot.start} - ${slot.end}`)
                            .join(", ")}`
                        : `${prettyDay(day)}: no window set`
                    }
                    className={cn(
                      "flex size-6 items-center justify-center rounded-md text-[11px] font-medium",
                      isOpen
                        ? "bg-success/14 text-success"
                        : "bg-muted text-muted-foreground"
                    )}
                  >
                    {prettyDay(day).charAt(0)}
                  </span>
                );
              })}
            </div>
            <div className="text-xs text-muted-foreground">
              {open.length === 0
                ? "Not set"
                : `${open.length} day${open.length === 1 ? "" : "s"}`}
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <AppShell
      brand={brand}
      nav={nav}
      quickActions={quickActions}
      header={{ settingsPath: "/infrastructure" }}
      chatbot={{ context: { page: "rooms", rooms: rooms.length } }}
    >
      <PageHeader
        title="Rooms"
        description="Manage classrooms, labs and other facilities, with the availability windows the scheduler books against."
        actions={
          <Button
            variant={showForm ? "outline" : "default"}
            onClick={() => {
              resetForm();
              setShowForm((open) => !open);
            }}
          >
            {showForm ? <X className="size-4" /> : <Plus className="size-4" />}
            {showForm ? "Close form" : "Add room"}
          </Button>
        }
      />

      <div className="space-y-5">
        {error && (
          <Callout tone="destructive" title="Something went wrong">
            <div className="space-y-3">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={fetchRooms} disabled={loading}>
                <RefreshCw className="size-4" />
                {loading ? "Retrying…" : "Retry"}
              </Button>
            </div>
          </Callout>
        )}

        {/* ============ Band 1 — the estate at a glance ============ */}
        <div className="grid gap-5 xl:grid-cols-12">
          {/* ---- Capacity by room type ---- */}
          <SectionCard
            title="Capacity by room type"
            description="Share of total seats. Room type decides what the scheduler may place where."
            icon={Layers}
            className="xl:col-span-7"
          >
            {showSkeletons ? (
              <div className="space-y-5">
                {ROOM_TYPES.map((type) => (
                  <div key={type.value} className="space-y-2">
                    <Skeleton className="h-4 w-40" />
                    <Skeleton className="h-2 w-full rounded-full" />
                  </div>
                ))}
              </div>
            ) : error ? (
              <p className="text-sm text-muted-foreground">
                The room list could not be loaded, so capacity cannot be
                summarised.
              </p>
            ) : (
              <div className="space-y-5">
                {summary.byType.map((type) => (
                  <div key={type.value} className="space-y-2">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <span className="text-sm font-medium text-foreground">
                        {type.label}
                      </span>
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {type.count === 0
                          ? "None yet"
                          : `${type.count} room${type.count === 1 ? "" : "s"} · ${type.seats} seats · ${type.share}%`}
                      </span>
                    </div>
                    <Progress
                      value={type.share}
                      aria-label={`${type.label}: ${type.share}% of total seats`}
                    />
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* ---- Stat tiles + bookability ---- */}
          <div className="flex flex-col gap-5 xl:col-span-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <StatCard
                label="Rooms"
                value={error ? "—" : rooms.length}
                icon={Home}
                loading={showSkeletons}
              />
              <StatCard
                label="Total seats"
                value={error ? "—" : summary.seats}
                icon={Users}
                loading={showSkeletons}
              />
              <StatCard
                label="Laboratories"
                value={error ? "—" : summary.labs}
                icon={FlaskConical}
                loading={showSkeletons}
              />
              <StatCard
                label="Buildings"
                value={error ? "—" : summary.buildings}
                icon={Building2}
                loading={showSkeletons}
              />
            </div>

            <SectionCard
              title="Availability set"
              description="Only rooms with a window can be booked by the scheduler."
              icon={CalendarCheck}
            >
              {showSkeletons ? (
                <div className="space-y-3">
                  <Skeleton className="h-9 w-28" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ) : error ? (
                <p className="text-sm text-muted-foreground">
                  Availability cannot be summarised while the room list is
                  unavailable.
                </p>
              ) : rooms.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add a room and its availability windows to make it bookable.
                </p>
              ) : (
                <div className="space-y-3">
                  <p className="flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
                      {summary.bookable}
                    </span>
                    <span className="text-sm text-muted-foreground tabular-nums">
                      of {rooms.length} rooms
                    </span>
                  </p>
                  <Progress
                    value={summary.bookableShare}
                    aria-label={`${summary.bookableShare}% of rooms have availability set`}
                  />
                  <StatusBadge variant={summary.missing > 0 ? "warning" : "success"}>
                    {summary.missing > 0
                      ? `${summary.missing} without a window`
                      : "Every room is bookable"}
                  </StatusBadge>
                </div>
              )}
            </SectionCard>
          </div>
        </div>

        {/* ============ Band 2 — add / edit, only while open ============ */}
        {showForm && (
          <SectionCard
            title={editingRoom ? "Edit room" : "Add a new room"}
            description="Room details first, then the weekly windows the scheduler may book."
            icon={DoorOpen}
            className="animate-in fade-in duration-200"
          >
            <form onSubmit={handleSubmitRoom} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="room-name">Room name *</Label>
                  <Input
                    id="room-name"
                    placeholder="e.g. Room A101"
                    value={formData.name}
                    onChange={(event) =>
                      setFormData({ ...formData, name: event.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room-building">Building *</Label>
                  <Input
                    id="room-building"
                    placeholder="e.g. Main Building"
                    value={formData.building}
                    onChange={(event) =>
                      setFormData({ ...formData, building: event.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label htmlFor="room-floor">Floor *</Label>
                  <Input
                    id="room-floor"
                    type="number"
                    min="0"
                    value={formData.floor}
                    onChange={(event) =>
                      setFormData({ ...formData, floor: event.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room-capacity">Capacity *</Label>
                  <Input
                    id="room-capacity"
                    type="number"
                    min="1"
                    value={formData.capacity}
                    onChange={(event) =>
                      setFormData({ ...formData, capacity: event.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="room-type">Room type *</Label>
                  <Select
                    value={formData.type}
                    onValueChange={(value) => setFormData({ ...formData, type: value })}
                  >
                    <SelectTrigger id="room-type" className="w-full">
                      <SelectValue placeholder="Select room type" />
                    </SelectTrigger>
                    <SelectContent>
                      {ROOM_TYPES.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="room-equipment">Equipment (comma separated)</Label>
                <Textarea
                  id="room-equipment"
                  placeholder="e.g. Projector, Whiteboard, Sound System"
                  rows={2}
                  value={formData.equipment}
                  onChange={(event) =>
                    setFormData({ ...formData, equipment: event.target.value })
                  }
                />
              </div>

              <div className="space-y-3">
                <Label>Availability schedule</Label>

                <div className="rounded-lg border border-border bg-muted/40 p-4">
                  <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-4">
                    <div className="space-y-2">
                      <Label htmlFor="slot-day" className="text-xs text-muted-foreground">
                        Day
                      </Label>
                      <Select
                        value={newTimeSlot.day}
                        onValueChange={(value) =>
                          setNewTimeSlot({ ...newTimeSlot, day: value })
                        }
                      >
                        <SelectTrigger id="slot-day" className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WEEK_DAYS.map((day) => (
                            <SelectItem key={day} value={day} className="capitalize">
                              {day}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slot-start" className="text-xs text-muted-foreground">
                        Start time
                      </Label>
                      <Input
                        id="slot-start"
                        type="time"
                        value={newTimeSlot.start}
                        onChange={(event) =>
                          setNewTimeSlot({ ...newTimeSlot, start: event.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="slot-end" className="text-xs text-muted-foreground">
                        End time
                      </Label>
                      <Input
                        id="slot-end"
                        type="time"
                        value={newTimeSlot.end}
                        onChange={(event) =>
                          setNewTimeSlot({ ...newTimeSlot, end: event.target.value })
                        }
                      />
                    </div>
                    <Button type="button" variant="outline" onClick={addTimeSlot}>
                      <Plus className="size-4" />
                      Add slot
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {WEEK_DAYS.map(
                    (day) =>
                      formData.availability[day]?.length > 0 && (
                        <div
                          key={day}
                          className="rounded-lg border border-border bg-card p-3"
                        >
                          <div className="mb-2 text-sm font-medium text-foreground capitalize">
                            {day}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {formData.availability[day].map((slot, index) => (
                              <div
                                key={index}
                                className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-1"
                              >
                                <Clock className="size-3.5 text-muted-foreground" />
                                <span className="text-sm text-foreground">
                                  {slot.start} - {slot.end}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeTimeSlot(day, index)}
                                  aria-label={`Remove ${day} ${slot.start} to ${slot.end}`}
                                  className="text-muted-foreground transition-colors hover:text-destructive"
                                >
                                  <X className="size-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                  )}
                </div>
              </div>

              <div className="flex flex-wrap gap-3 border-t border-border pt-4">
                <Button type="submit" disabled={formLoading}>
                  {formLoading ? "Saving..." : editingRoom ? "Update room" : "Save room"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    resetForm();
                    setShowForm(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </form>
          </SectionCard>
        )}

        {/* ============ Band 3 — the table, full width ============ */}
        <SectionCard
          title="All rooms"
          description={
            error
              ? "The list could not be loaded."
              : `${rooms.length} room${rooms.length === 1 ? "" : "s"} · ${summary.seats} seats in total.`
          }
          icon={Building2}
        >
          <DataTable
            data={rooms}
            columns={columns}
            searchKey="name"
            loading={loading}
            entityName="rooms"
            onEdit={handleEditRoom}
            onDelete={(room) => setRoomToDelete(room)}
            empty={
              error
                ? {
                    icon: Building2,
                    title: "Rooms unavailable",
                    description:
                      "The room list could not be loaded. Retry above to try again.",
                  }
                : {
                    icon: Home,
                    title: "No rooms yet",
                    description:
                      "Add a classroom, lab or auditorium so the scheduler has somewhere to place classes.",
                  }
            }
          />
        </SectionCard>
      </div>

      <ConfirmDialog
        open={Boolean(roomToDelete)}
        onOpenChange={(open) => {
          if (!open) setRoomToDelete(null);
        }}
        title="Delete this room?"
        description={
          roomToDelete
            ? `"${roomToDelete.name}" will be removed permanently. Timetables that already book it will need regenerating.`
            : ""
        }
        confirmLabel="Delete room"
        destructive
        loading={deleting}
        onConfirm={confirmDeleteRoom}
      />
    </AppShell>
  );
}
