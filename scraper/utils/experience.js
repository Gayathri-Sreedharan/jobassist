function extractExperience(text = "") {
  const value = text.toLowerCase();

  if (
    value.includes("fresher") ||
    value.includes("freshers") ||
    value.includes("entry level")
  ) {
    return "Fresher / Entry Level";
  }

  const range = value.match(
    /(\d+)\s*(?:-|to)\s*(\d+)\s*(?:years?|yrs?)/i
  );

  if (range) {
    return `${range[1]}-${range[2]} years`;
  }

  const minimum = value.match(
    /(\d+)\s*\+?\s*(?:years?|yrs?)\s*(?:of)?\s*experience/i
  );

  if (minimum) {
    return `${minimum[1]}+ years`;
  }

  return "Not specified";
}

module.exports = {
  extractExperience
};
