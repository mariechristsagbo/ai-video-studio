import * as React from "react";
const MOBILE_BREAKPOINT = 768;
const query = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;
function subscribe(callback: () => void) {
  const list = window.matchMedia(query);
  list.addEventListener("change", callback);
  return () => list.removeEventListener("change", callback);
}
export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
