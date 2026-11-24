// Captions for a film, read from its .vtt file.
//
// The player doesn't use a <track> element: on iPhones a video with one
// would not load at all. So the film's lines are read here and handed to
// the video once it is playing (see FilmPlayer).

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

// Adds the film's captions to a video, turned off until the viewer turns
// them on in the video's own controls. Does nothing, quietly, where the
// browser can't do it or the file can't be read: the film still plays.
export async function addCaptions(video: HTMLVideoElement, url: string): Promise<void> {
  if (typeof video.addTextTrack !== "function" || typeof VTTCue === "undefined") return;
  try {
    const answer = await fetch(url);
    if (!answer.ok) return;
    const lines = readCaptions(await answer.text());
    if (lines.length === 0) return;
    const track = video.addTextTrack("captions", "English", "en");
    track.mode = "disabled";
    for (const line of lines) track.addCue(new VTTCue(line.start, line.end, line.text));
  } catch {
    // no captions this time
  }
}
