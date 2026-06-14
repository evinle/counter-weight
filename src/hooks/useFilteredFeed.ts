import { useLiveQuery } from "dexie-react-hooks";
import { applyFilter } from "@cw/filters";
import { db } from "../db";
import { useViewStore } from "../store/viewStore";

export function useFilteredFeed() {
  const selectedGroupId = useViewStore((s) => s.selectedGroupId);
  return (
    useLiveQuery(
      () => getFilteredFeed(selectedGroupId),
      [selectedGroupId],
      [],
    ) ?? []
  );
}

export async function getFilteredFeed(selectedGroupId: number | null) {
  const timers = await db.timers
    .where("status")
    .anyOf("active", "fired")
    .sortBy("targetDatetime");

  if (selectedGroupId === null) return timers;

  const group = await db.groups.get(selectedGroupId);
  if (!group) return timers;

  return applyFilter(timers, group.conditions, new Date());
}
