// client/src/utils/authSync.js

let _bc = null;
try {
  if (typeof BroadcastChannel !== 'undefined') {
    _bc = new BroadcastChannel('hms_auth_sync');
  }
} catch (_) {}

/**
 * Broadcasts an authentication event to all other open tabs.
 * Only triggers synchronization for manual logouts, force logouts, and password changes.
 */
export function broadcastAuthEvent(type, payload = {}) {
  // Enforce policy: synchronize ONLY manual actions/definitive administrative changes
  const allowedSyncTypes = ['LOGOUT', 'FORCED_LOGOUT', 'PASSWORD_CHANGED', 'SESSION_REVOKED'];
  window.__authLogger?.(`broadcastAuthEvent invoked: ${type}`, { payload, isAllowed: allowedSyncTypes.includes(type) });
  if (!allowedSyncTypes.includes(type)) return;

  const msg = { type, payload, ts: Date.now() };
  try {
    _bc?.postMessage(msg);
  } catch (_) {}

  // Fallback for browsers without BroadcastChannel
  try {
    localStorage.setItem('hms_auth_sync', JSON.stringify(msg));
    setTimeout(() => localStorage.removeItem('hms_auth_sync'), 100);
  } catch (_) {}
}

/**
 * Subscribes to authentication sync events from other tabs.
 */
export function subscribeToAuthSync(onSync) {
  const handleMessage = (event) => {
    if (event.data) onSync(event.data);
  };

  const handleStorage = (event) => {
    if (event.key === 'hms_auth_sync' && event.newValue) {
      try {
        const msg = JSON.parse(event.newValue);
        onSync(msg);
      } catch (_) {}
    }
  };

  if (_bc) {
    _bc.addEventListener('message', handleMessage);
  }
  window.addEventListener('storage', handleStorage);

  return () => {
    if (_bc) {
      _bc.removeEventListener('message', handleMessage);
    }
    window.removeEventListener('storage', handleStorage);
  };
}
