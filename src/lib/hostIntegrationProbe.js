// Read-only capability inventory. Context contents and file paths are excluded.
export function inspectHostIntegration(bridge) {
  const result = bridge?.context?.result;
  return {
    bridgeAvailable: Boolean(bridge),
    contextSubscription: typeof bridge?.onContext === 'function',
    binaryTransfer: typeof bridge?.sendBinary === 'function',
    workbenchNavigation: typeof bridge?.openWorkbench === 'function',
    assetAccess: typeof bridge?.readAssetUrl === 'function',
    resultSnapshotPresent: Boolean(result && Array.isArray(result.columns) && Array.isArray(result.rows)),
    resultRowCount: Array.isArray(result?.rows) ? result.rows.length : null,
    resultTruncated: typeof result?.truncated === 'boolean' ? result.truncated : null,
    desktopInteractionValidated: false,
  };
}
