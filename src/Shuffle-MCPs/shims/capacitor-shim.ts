/**
 * Safe runtime fallback for Capacitor native plugins.
 * When running inside a native Capacitor container, delegates to window.Capacitor.Plugins.
 * In a standard browser / web app, provides safe no-op fallbacks.
 */
const getCapacitorPlugin = (name: string): any => {
  if (typeof window !== 'undefined' && (window as any).Capacitor?.Plugins?.[name]) {
    return (window as any).Capacitor.Plugins[name];
  }
  return {
    requestPermissions: async () => ({ receive: 'denied', display: 'denied' }),
    register: async () => {},
    addListener: () => ({ remove: () => {} }),
    removeAllListeners: async () => {},
    createChannel: async () => {},
    deleteChannel: async () => {},
    listChannels: async () => ({ channels: [] }),
    schedule: async () => ({ notifications: [] }),
    cancel: async () => {},
    getPending: async () => ({ notifications: [] }),
    vibrate: async () => {},
  };
};

const createPluginProxy = (pluginName: string) => {
  return new Proxy({}, {
    get: (_, prop: string | symbol) => {
      const plugin = getCapacitorPlugin(pluginName);
      const val = plugin[prop];
      return typeof val === 'function' ? val.bind(plugin) : val;
    },
  });
};

export const PushNotifications: any = createPluginProxy('PushNotifications');
export const LocalNotifications: any = createPluginProxy('LocalNotifications');
export const Haptics: any = createPluginProxy('Haptics');
