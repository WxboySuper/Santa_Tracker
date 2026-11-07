/** Read the server clock, with an opt-in local rehearsal instant for repeatable checks. */
export function currentTime(): Date {
  const rehearsalInstant = process.env.LOCAL_REHEARSAL_TIME;
  if (process.env.NODE_ENV !== "production" && rehearsalInstant) {
    const timestamp = Date.parse(rehearsalInstant);
    if (Number.isFinite(timestamp)) return new Date(timestamp);
  }
  return new Date();
}
