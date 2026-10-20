/** Keep responsive collapse separate from the persisted, explicit user choice. */
export function createSidebarState() {
  let compact = false;
  let manuallyCollapsed = false;
  let touched = false;
  let collapsed = false;
  return {
    resize(nextCompact) {
      compact = Boolean(nextCompact);
      collapsed = compact || manuallyCollapsed;
      return collapsed;
    },
    restore(savedCollapsed) {
      // An asynchronous preference response must not undo a newer user action.
      if (!touched) {
        manuallyCollapsed = Boolean(savedCollapsed);
        collapsed = compact || manuallyCollapsed;
      }
      return collapsed;
    },
    select(nextCollapsed) {
      touched = true;
      manuallyCollapsed = Boolean(nextCollapsed);
      collapsed = manuallyCollapsed;
      return collapsed;
    },
  };
}
