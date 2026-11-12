export function visibleTranscript(doc: Document) {
  const segments = Array.from(
    doc.querySelectorAll("ytd-transcript-segment-renderer"),
  )
    .map((node) => {
      const time =
        node.querySelector(".segment-timestamp")?.textContent?.trim() ?? "";
      const text =
        node.querySelector(".segment-text")?.textContent?.trim() ?? "";
      if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(time)) return undefined;
      const parts = time.split(":").map(Number);
      if (parts.slice(1).some((n) => n >= 60)) return undefined;
      return { text, seconds: parts.reduce((n, v) => n * 60 + v, 0) };
    })
    .filter((s): s is { text: string; seconds: number } => !!s && !!s.text);
  if (!segments.length)
    throw new Error(
      "Transcript unavailable. Open YouTube’s “Show transcript” panel, then extract again. SAGE reads only accessible transcript text; it does not watch or listen to videos.",
    );
  return segments;
}
