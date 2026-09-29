import { useState, useEffect, useCallback } from 'react';
import {
  PagerIncident,
  setupPushNotificationListeners,
  getActiveCallIncident,
} from '@/services/pagerNotificationService';
import { IncomingPagerCallModal } from './IncomingPagerCallModal';
import { toast } from '@/Shuffle-Core/toast';

export const GlobalPagerWatcher = () => {
  const [activeIncident, setActiveIncident] = useState<PagerIncident | null>(null);

  useEffect(() => {
    // Check if a call was already active
    const initial = getActiveCallIncident();
    if (initial) {
      setActiveIncident(initial);
    }

    // Initialize native push notification listeners
    setupPushNotificationListeners();

    // Listen for custom incoming call events
    const handleIncomingCall = (e: Event) => {
      const customEvent = e as CustomEvent<{ incident: PagerIncident }>;
      if (customEvent.detail?.incident) {
        setActiveIncident(customEvent.detail.incident);
      }
    };

    const handleDismissed = () => {
      setActiveIncident(null);
    };

    const handleEscalated = (e: Event) => {
      const customEvent = e as CustomEvent<{ incident: PagerIncident; reason?: string }>;
      setActiveIncident(null);
      toast({
        title: 'Incident Escalated',
        description: `Alert for "${customEvent.detail?.incident?.title || 'Incident'}" has been forwarded to the next on-call tier.`,
        variant: 'default',
      });
    };

    window.addEventListener('shuffle:incoming-pager-call', handleIncomingCall);
    window.addEventListener('shuffle:pager-call-dismissed', handleDismissed);
    window.addEventListener('shuffle:pager-call-escalated', handleEscalated);

    return () => {
      window.removeEventListener('shuffle:incoming-pager-call', handleIncomingCall);
      window.removeEventListener('shuffle:pager-call-dismissed', handleDismissed);
      window.removeEventListener('shuffle:pager-call-escalated', handleEscalated);
    };
  }, []);

  const handleDismiss = useCallback(() => {
    setActiveIncident(null);
  }, []);

  const handleEscalate = useCallback((incident: PagerIncident) => {
    toast({
      title: 'Alert Escalated',
      description: `Escalated "${incident.title}" to Tier 2 on-call schedule.`,
    });
  }, []);

  const handleHandoverAgent = useCallback((incident: PagerIncident) => {
    toast({
      title: 'Handed to AI Agent',
      description: `AI Agent has begun autonomous triage and log collection for "${incident.title}".`,
    });
  }, []);

  if (!activeIncident) return null;

  return (
    <IncomingPagerCallModal
      incident={activeIncident}
      onDismiss={handleDismiss}
      onEscalate={handleEscalate}
      onHandoverAgent={handleHandoverAgent}
    />
  );
};
