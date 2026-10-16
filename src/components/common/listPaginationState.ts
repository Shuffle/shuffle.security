/** Keep list navigation and slicing within the currently available rows. */
export function getListPage(currentPage: number, totalItems: number, itemsPerPage: number): number {
  return Math.max(1, Math.min(currentPage, Math.max(1, Math.ceil(totalItems / itemsPerPage))));
}