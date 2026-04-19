/**
 * GPS stamping — shared across all capture flows.
 * On native iOS, Capacitor bridges navigator.geolocation to CoreLocation.
 * Never throws; returns null if unavailable or timed out.
 */
export async function stampGPS(timeoutMs = 6000) {
  return new Promise(resolve => {
    if (!navigator?.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      pos => {
        clearTimeout(timer);
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        });
      },
      () => { clearTimeout(timer); resolve(null); },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );
  });
}
