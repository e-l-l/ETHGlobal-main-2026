/**
 * Days-left estimates. The SDK returns 0 when there isn't a pace yet (fewer than 3 sales this week); anything past
 * ETA_MAX_DAYS is noise too ("~413 days to go" after one small sale). Screens show a plain line instead of a number.
 */
const ETA_MAX_DAYS = 180;

export const etaKnown = (days: number) => days > 0 && days <= ETA_MAX_DAYS;

export const ETA_PENDING = "An estimate shows after a few more sales";
