import semver from "semver";

function versionTokens(input) {
  return String(input || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
}

export function analyzeSemver(input, range = "", options = {}) {
  const versions = versionTokens(input);
  const rangeInput = String(range || "").trim();
  const includePrerelease = Boolean(options.includePrerelease);
  const normalizedRange = rangeInput ? semver.validRange(rangeInput, { includePrerelease }) : "";
  const rangeError = rangeInput && normalizedRange === null ? `Invalid semantic version range: ${rangeInput}` : "";
  const rangeOptions = { includePrerelease };
  const entries = versions.map((version, index) => {
    const parsed = semver.parse(version);
    if (!parsed) {
      return {
        index,
        version,
        valid: false,
        normalized: "",
        prerelease: [],
        build: [],
        satisfies: null,
      };
    }
    return {
      index,
      version,
      valid: true,
      normalized: semver.clean(version),
      prerelease: parsed.prerelease,
      build: parsed.build,
      satisfies: rangeInput && !rangeError ? semver.satisfies(version, rangeInput, rangeOptions) : null,
    };
  });
  const validEntries = entries.filter((entry) => entry.valid);
  const invalidEntries = entries.filter((entry) => !entry.valid);
  const sortedEntries = [...validEntries].sort((a, b) => semver.compareBuild(a.version, b.version) || a.index - b.index);
  const sorted = sortedEntries.map((entry) => entry.version);
  const minimum = sorted[0] || "";
  const maximum = sorted.at(-1) || "";
  const minimumEquivalent = minimum ? sorted.filter((version) => semver.compare(version, minimum) === 0) : [];
  const maximumEquivalent = maximum ? sorted.filter((version) => semver.compare(version, maximum) === 0) : [];
  const matching = rangeInput && !rangeError
    ? sorted.filter((version) => semver.satisfies(version, rangeInput, rangeOptions))
    : [];
  return {
    versions: entries,
    sortedEntries,
    invalidEntries,
    sorted,
    minimum,
    maximum,
    minimumEquivalent,
    maximumEquivalent,
    matching,
    maximumSatisfying: matching.at(-1) || "",
    range: normalizedRange || "",
    rangeInput,
    rangeError,
    includePrerelease,
    validCount: validEntries.length,
    invalidCount: invalidEntries.length,
  };
}

export function inspectSemver(input, range = "", options = {}) {
  const result = analyzeSemver(input, range, options);
  const invalid = result.versions.find((item) => !item.valid);
  if (invalid) throw new Error(`Invalid semantic version: ${invalid.version}`);
  if (result.rangeError) throw new Error(result.rangeError);
  return result;
}
