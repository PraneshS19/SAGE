// Compatibility endpoints sometimes put reasoning in tagged content instead of
// dedicated fields. Hold partial tags across stream chunks so analysis cannot leak.
export function answerFilter() {
  const openings = ["<think>", "<analysis>"];
  let buffer = "";
  let close: string | undefined;
  return {
    push(text: string) {
      buffer += text;
      let visible = "";
      while (buffer) {
        if (close) {
          const at = buffer.indexOf(close);
          if (at < 0) {
            buffer = buffer.slice(-close.length);
            break;
          }
          buffer = buffer.slice(at + close.length);
          close = undefined;
        } else {
          const match = openings
            .map((tag) => ({ tag, at: buffer.indexOf(tag) }))
            .filter((m) => m.at >= 0)
            .sort((a, b) => a.at - b.at)[0];
          if (match) {
            visible += buffer.slice(0, match.at);
            buffer = buffer.slice(match.at + match.tag.length);
            close = match.tag.replace("<", "</");
          } else {
            let held = 0;
            for (const tag of openings)
              for (let n = 1; n < tag.length; n++)
                if (buffer.endsWith(tag.slice(0, n))) held = Math.max(held, n);
            visible += buffer.slice(0, buffer.length - held);
            buffer = buffer.slice(buffer.length - held);
            break;
          }
        }
      }
      return visible;
    },
    finish() {
      if (close)
        throw new Error(
          "Provider ended inside a reasoning block without a final answer. Increase output capacity or check the endpoint response format.",
        );
      const remaining = buffer;
      buffer = "";
      return remaining;
    },
  };
}
