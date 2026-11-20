// Which day a student's sentence is for, and which day they write next.
// A sentence's day is in its title ("day1", "day2", ...), the same way the
// server reads it (tellForTitle in backend/public/tellList.ts); its place in
// the student's list is not the same thing: a student's list can have gaps
// (sample data, or old sentences tidied away) or, from before the server
// allowed one sentence a day, two for one day.

// The day a title names, or undefined for a title that isn't "day<N>"
// (some old sentences have other titles)
export const dayOf = (title: string): number | undefined => {
  const day = /^day([1-9][0-9]*)$/.exec(title);
  return day ? Number(day[1]) : undefined;
};

// The day after the latest day the student has written, or undefined once
// they've written the last of the `dayCount` days there are (all done).
// Titles that aren't days are left out.
export const nextDay = (
  sentences: readonly { title: string }[],
  dayCount: number
): number | undefined => {
  const latest = Math.max(0, ...sentences.map(({ title }) => dayOf(title) ?? 0));
  const next = latest + 1;
  return next <= dayCount ? next : undefined;
};
