export function bytesEqual(left, right) {
  const a = left instanceof Uint8Array ? left : new Uint8Array(left || []);
  const b = right instanceof Uint8Array ? right : new Uint8Array(right || []);
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) if (a[index] !== b[index]) return false;
  return true;
}

export function classifyMd5Comparison(leftDigest, rightDigest, identicalBytes) {
  if (!leftDigest || !rightDigest) return "incomplete";
  if (leftDigest !== rightDigest) return "different-hash";
  return identicalBytes ? "identical" : "collision";
}
