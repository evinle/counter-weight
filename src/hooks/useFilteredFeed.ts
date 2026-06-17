import { useLiveQuery } from "dexie-react-hooks";
import { applyFilter } from "@cw/filters";
import { db } from "../db";
import { useViewStore } from "../store/viewStore";
import { sortTimers, SortModes, SortDirections } from "../lib/sort";
import type { SortMode, SortDirection } from "../lib/sort";

export function useFilteredFeed(
  mode: SortMode = SortModes.Smart,
  direction: SortDirection = SortDirections.Desc,
) {
  const selectedGroupId = useViewStore((s) => s.selectedGroupId);
  return (
    useLiveQuery(
      () => getFilteredFeed(selectedGroupId, mode, direction),
      [selectedGroupId, mode, direction],
      [],
    ) ?? []
  );
}

export async function getFilteredFeed(
  selectedGroupId: number | null,
  mode: SortMode = SortModes.Smart,
  direction: SortDirection = SortDirections.Desc,
) {
  const timers = await db.timers
    .where("status")
    .anyOf("active", "fired")
    .toArray();

  const filtered =
    selectedGroupId === null
      ? timers
      : await (async () => {
          const group = await db.groups.get(selectedGroupId);
          return group ? applyFilter(timers, group.conditions, new Date()) : timers;
        })();

  return sortTimers(filtered, mode, direction, new Date());
}
