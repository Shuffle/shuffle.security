// Background Service Worker for Firebase Cloud Messaging (Web Push)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Initialize Firebase in the service worker context
firebase.initializeApp({
  apiKey: "AIzaSyA9-yyCNGJDeNkg30WocUv5M9Tw5y-qJFw",
  authDomain: "shuffler.firebaseapp.com",
  projectId: "shuffler",
  storageBucket: "shuffler.firebasestorage.app",
  messagingSenderId: "253565968129",
  appId: "1:253565968129:web:c6cfc493e8fe28d960c500"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message:', payload);

  const title = payload.notification?.title || payload.data?.title || 'Shuffle Security Alert';
  const body = payload.notification?.body || payload.data?.body || 'New alert received';
  const data = payload.data || {};

  const notificationOptions = {
    body: body,
    icon: '/favicon.ico',
    badge: '/favicon.ico',
    tag: data.incidentId || data.executionId || 'shuffle-alert',
    data: data,
    requireInteraction: data.type === 'pager_alert' || data.severity === 'critical',
  };

  self.registration.showNotification(title, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = '';

  if (data.incidentId) {
    targetUrl = `/incidents/${data.incidentId}`;
  } else if (data.referenceUrl) {
    targetUrl = data.referenceUrl;
  }

  // No clear target: open the app on personal notifications and highlight this one.
  const notificationId = data.notificationId || data.notification_id || '';
  if (!targetUrl) {
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
        const client = windowClients.find((c) => 'focus' in c);
        if (client) {
          client.postMessage({ type: 'shuffle-open-notification', notificationId });
          return client.focus();
        }
        if (clients.openWindow) {
          return clients.openWindow('/dashboard?open_notification=' + encodeURIComponent(notificationId || 'personal'));
        }
      })
    );
    return;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          if (client.url.includes(targetUrl)) {
            return client.focus();
          }
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
