/**
 * State chip used by the usecase card and detail view.
 *
 * The chip text describes the CURRENT state, not the click action, so it lines
 * up with the card's own colours: an active usecase is green ("Enabled"), an
 * inactive one is red ("Disabled"). The click action stays in the tooltip
 * ("Click to disable" / "Click to enable").
 */
export interface UsecaseToggleChip {
  /** Chip text — the state the usecase is in right now. */
  label: string;
  /** true = green (severity-low), false = red (destructive). */
  positive: boolean;
}

export function getUsecaseToggleChip(
  enabled: boolean,
  blocked = false,
  activeLabel = 'Enabled',
): UsecaseToggleChip {
  if (enabled) {
    // A blocked usecase is switched on but cannot execute — keep the warning
    // colour so the chip matches the card's red border.
    return { label: activeLabel, positive: !blocked };
  }
  return { label: 'Disabled', positive: false };
}
