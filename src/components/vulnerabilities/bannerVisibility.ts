/**
 * Visibility rule for the Vulnerability Automation bar.
 *
 * The bar exists to explain and start an automation that is not running yet, so
 * once it is active there is nothing left to explain and the bar is dropped.
 * While the workflow list is still loading we also stay hidden — showing the bar
 * and then removing it a second later reads as a flash.
 */
export const shouldShowVulnerabilityAutomationBanner = ({
  active,
  isLoading,
}: {
  /** The Vulnerability Correlation automation is running. */
  active: boolean;
  /** The workflow list behind that answer has not arrived yet. */
  isLoading: boolean;
}): boolean => !active && !isLoading;

export default shouldShowVulnerabilityAutomationBanner;
