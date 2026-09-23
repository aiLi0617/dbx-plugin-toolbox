export function installFormNavigationGuard(target = document) {
  const preventNativeSubmit = (event) => event.preventDefault();
  target.addEventListener("submit", preventNativeSubmit, true);
  return () => target.removeEventListener("submit", preventNativeSubmit, true);
}
