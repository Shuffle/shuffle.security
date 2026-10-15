/** Reject restricted actions before closing their popup or changing state. */
export function runSignedInAction(
  signedIn: boolean,
  action: () => void,
  onSignInRequired: () => void,
): boolean {
  if (!signedIn) {
    onSignInRequired();
    return false;
  }
  action();
  return true;
}