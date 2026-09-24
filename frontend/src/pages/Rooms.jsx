import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Clock,
  DoorOpen,
  FlaskConical,
  Home,
  Plus,
  Users,
  X,
} from "lucide-react";

import api from "@/lib/api";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

// =====================================================
// /rooms — admin room management (U9)
//
// Re-skin only: the data flow is unchanged from the previous version of this
// page. Rooms are read from `GET /api/rooms` and written back with
// `POST /api/rooms` / `PUT /api/rooms/:id` / `DELETE /api/rooms/:id`, with
// the same payload shape (capacity and floor coerced to numbers, equipment
// split on commas, availability kept as the lowercase day -> [{start,end}]
// map the Mongoose schema expects — see `backend/models/Room.js`).
//
// What did change is the chrome: the private nav array, the hand-rolled
// slate sidebar and the gradient header are gone in favour of `AppShell` +
// `navForRole("admin")`, and every colour now comes from a design token.
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

  const stats = useMemo(() => {
    const seats = rooms.reduce((total, room) => total + (Number(room.capacity) || 0), 0);
    const labs = rooms.filter((room) => room.type === "lab").length;
    const buildings = new Set(
      rooms.map((room) => room.building).filter(Boolean)
    ).size;
    return { seats, labs, buildings };
  }, [rooms]);

  const columns = [
    {
      key: "name",
      label: "Room",
      sortable: true,
      render: (room) => (
        <div className="space-y-1">
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
        <div className="flex items-center gap-2 text-foreground">
          <Users className="size-4 text-muted-foreground" />
          {room.capacity}
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
              <StatusBadge key={index} variant="info">
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
        const availableDays = room.availability
          ? Object.keys(room.availability).filter(
              (day) => room.availability[day]?.length > 0
            )
          : [];

        if (availableDays.length === 0) {
          return <span className="text-sm text-muted-foreground">Not set</span>;
        }

        return (
          <div className="flex flex-wrap gap-1">
            {availableDays.slice(0, 3).map((day) => (
              <StatusBadge key={day} variant="success" className="capitalize">
                {day.slice(0, 3)}
              </StatusBadge>
            ))}
            {availableDays.length > 3 && (
              <StatusBadge variant="neutral">
                +{availableDays.length - 3}
              </StatusBadge>
            )}
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
            onClick={() => {
              resetForm();
              setShowForm((open) => !open);
            }}
          >
            <Plus className="size-4" />
            Add Room
          </Button>
        }
      />

      <div className="space-y-6">
        {error && (
          <Callout tone="destructive" title="Something went wrong">
            {error}
          </Callout>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Rooms" value={rooms.length} icon={Home} loading={loading} />
          <StatCard
            label="Total seats"
            value={stats.seats}
            icon={Users}
            tone="success"
            loading={loading}
          />
          <StatCard
            label="Laboratories"
            value={stats.labs}
            icon={FlaskConical}
            tone="warning"
            loading={loading}
          />
          <StatCard
            label="Buildings"
            value={stats.buildings}
            icon={Building2}
            loading={loading}
          />
        </div>

        {showForm && (
          <SectionCard
            title={editingRoom ? "Edit room" : "Add a new room"}
            description="Fill in the room details and set the availability schedule."
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

              <div className="flex flex-wrap gap-3 pt-2">
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

        <SectionCard
          title="All rooms"
          description={`${rooms.length} room${rooms.length === 1 ? "" : "s"} available in the system.`}
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
            empty={{
              icon: Home,
              title: "No rooms yet",
              description:
                "Add a classroom, lab or auditorium so the scheduler has somewhere to place classes.",
            }}
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
