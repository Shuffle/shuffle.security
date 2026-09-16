import { type IncidentTask, taskCategories } from "@/config/ocsfIncidentSchema";

export const UNCATEGORIZED_KEY = "general";
export const UNCATEGORIZED_LABEL = "General";
export const UNCATEGORIZED_COLOR = "#94a3b8";

export interface TaskCategoryGroup {
  categoryKey: string;
  label: string;
  color: string;
  tasks: IncidentTask[];
  completedCount: number;
  openCount: number;
  totalCount: number;
}

/**
 * Groups tasks by category in incident response lifecycle order:
 * 1. OCSF standard taskCategories (Triage, Investigation, Containment, Eradication, Recovery, Communication, Documentation)
 * 2. Any custom categories found on existing tasks
 * 3. Uncategorized / General tasks
 *
 * Empty standard categories are skipped if there are no tasks in them, UNLESS
 * all tasks are empty, in which case common categories can be offered.
 */
export function groupTasksByCategory(
  tasks: IncidentTask[],
): TaskCategoryGroup[] {
  // Filter out soft-deleted / disabled tasks
  const activeTasks = (tasks || []).filter((t) => !t.disabled);

  // Map known categories
  const categoryMap = new Map<string, { label: string; color: string }>();
  for (const cat of taskCategories) {
    categoryMap.set(cat.key.toLowerCase(), {
      label: cat.label,
      color: cat.color,
    });
  }

  // Find all category keys present in the tasks
  const taskBuckets = new Map<string, IncidentTask[]>();

  for (const task of activeTasks) {
    const rawCat = (task.category || "").trim().toLowerCase();
    const catKey = rawCat || UNCATEGORIZED_KEY;
    if (!taskBuckets.has(catKey)) {
      taskBuckets.set(catKey, []);
    }
    taskBuckets.get(catKey)!.push(task);
  }

  const groups: TaskCategoryGroup[] = [];

  // 1. Standard categories in predefined lifecycle order
  for (const cat of taskCategories) {
    const catKey = cat.key.toLowerCase();
    const catTasks = taskBuckets.get(catKey);
    if (catTasks && catTasks.length > 0) {
      const completedCount = catTasks.filter((t) => t.completed).length;
      groups.push({
        categoryKey: cat.key,
        label: cat.label,
        color: cat.color,
        tasks: catTasks,
        completedCount,
        openCount: catTasks.length - completedCount,
        totalCount: catTasks.length,
      });
      taskBuckets.delete(catKey);
    }
  }

  // 2. Custom categories present in tasks (alphabetical)
  const remainingKeys = Array.from(taskBuckets.keys()).filter(
    (k) => k !== UNCATEGORIZED_KEY,
  );
  remainingKeys.sort();
  for (const catKey of remainingKeys) {
    const catTasks = taskBuckets.get(catKey)!;
    const completedCount = catTasks.filter((t) => t.completed).length;
    // Format label: capitalize words
    const label = catKey
      .split(/[-_\s]+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    groups.push({
      categoryKey: catKey,
      label,
      color: "#06b6d4", // Distinct teal for custom categories
      tasks: catTasks,
      completedCount,
      openCount: catTasks.length - completedCount,
      totalCount: catTasks.length,
    });
    taskBuckets.delete(catKey);
  }

  // 3. Uncategorized / General tasks
  const generalTasks = taskBuckets.get(UNCATEGORIZED_KEY);
  if (generalTasks && generalTasks.length > 0) {
    const completedCount = generalTasks.filter((t) => t.completed).length;
    groups.push({
      categoryKey: UNCATEGORIZED_KEY,
      label: UNCATEGORIZED_LABEL,
      color: UNCATEGORIZED_COLOR,
      tasks: generalTasks,
      completedCount,
      openCount: generalTasks.length - completedCount,
      totalCount: generalTasks.length,
    });
  }

  return groups;
}
