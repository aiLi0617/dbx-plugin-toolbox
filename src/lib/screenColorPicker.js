// Keep the browser call synchronous until open(): it needs the button's user activation.
export async function pickScreenColor({ EyeDropper = globalThis.EyeDropper, signal } = {}) {
  if (typeof EyeDropper !== "function") throw new Error("Screen color picking is unavailable");
  try {
    const result = await new EyeDropper().open({ signal });
    if (signal?.aborted) return null;
    if (!/^#[\da-f]{6}$/i.test(result?.sRGBHex ?? "")) throw new Error("Invalid screen color");
    return result.sRGBHex;
  } catch (error) {
    if (error?.name === "AbortError" || signal?.aborted) return null;
    throw error;
  }
}
