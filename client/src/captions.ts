// Captions for a film, read from its .vtt file.
//
// The player shows them itself, in a strip under the picture (see
// FilmPlayer), not with a <track> element: on iPhones a video with one
// would not load at all, and the phone's own captions menu shows captions
// it makes up from the sound, not ours.

export interface CaptionLine {
  start: number;
  end: number;
  text: string;
}

// "01:02.500" or "00:01:02.500" → seconds
const seconds = (time: string): number =>
  time.split(":").reduce((total, part) => total * 60 + Number(part), 0);

export function readCaptions(vtt: string): CaptionLine[] {
  const lines: CaptionLine[] = [];
  for (const block of vtt.replace(/\r/g, "").split(/\n{2,}/)) {
    const rows = block.split("\n");
    const at = rows.findIndex((row) => row.includes("-->"));
    if (at < 0) continue;
    const [from, to] = rows[at].split("-->").map((part) => part.trim().split(/\s/)[0]);
    const start = seconds(from);
    const end = seconds(to);
    const text = rows.slice(at + 1).join("\n").trim();
    if (text && Number.isFinite(start) && Number.isFinite(end)) lines.push({ start, end, text });
  }
  return lines;
}

// Reads a film's captions file. An empty list if it can't be read: the
// film still plays.
export async function loadCaptions(url: string): Promise<CaptionLine[]> {
  try {
    const answer = await fetch(url);
    return answer.ok ? readCaptions(await answer.text()) : [];
  } catch {
    return [];
  }
}

// The line being said at this moment of the film, if any
export const lineAt = (lines: CaptionLine[], time: number): string =>
  lines.find((line) => time >= line.start && time < line.end)?.text ?? "";
