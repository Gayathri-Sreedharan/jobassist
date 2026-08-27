function isWithinLastDays(dateValue, days) {
  if (!dateValue) {
    return false;
  }

  const postedDate = new Date(dateValue);

  if (Number.isNaN(postedDate.getTime())) {
    return false;
  }

  const now = new Date();

  const cutoff = new Date();
  cutoff.setDate(now.getDate() - days);

  return postedDate >= cutoff;
}

module.exports = {
  isWithinLastDays
};