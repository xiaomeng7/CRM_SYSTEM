const KEYWORD_PATTERN = /\b(TODO|UNKNOWN|QUESTION|MISSING)\b/gi;

function scanMarkers(value, pathPrefix = "", output = []) {
  if (typeof value === "string") {
    const matches = value.match(KEYWORD_PATTERN);
    if (matches) {
      output.push({
        path: pathPrefix || "$",
        value,
        keywords: [...new Set(matches.map((m) => m.toUpperCase()))]
      });
    }
    return output;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      scanMarkers(entry, `${pathPrefix}[${index}]`, output);
    });
    return output;
  }

  if (value && typeof value === "object") {
    for (const key of Object.keys(value)) {
      const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key;
      scanMarkers(value[key], nextPath, output);
    }
  }

  return output;
}

module.exports = {
  scanMarkers
};
