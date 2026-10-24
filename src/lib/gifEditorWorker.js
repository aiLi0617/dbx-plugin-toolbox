import {
  decodeAnimation,
  transformFrames,
  encodeAnimation,
} from "./gifEditing.js";
let animation;
const progress = (value) => self.postMessage({ progress: value });
self.onmessage = ({ data }) => {
  try {
    if (data.action === "load") {
      animation = decodeAnimation(data.buffer, progress);
      self.postMessage({
        width: animation.width,
        height: animation.height,
        repeat: animation.repeat,
        delays: animation.frames.map((f) => f.delay),
      });
    } else if (data.action === "frame") {
      if (!animation) throw new Error("No GIF loaded");
      const a = transformFrames(animation, { indices: [data.index] });
      self.postMessage({
        frame: a.frames[0].data,
        width: a.width,
        height: a.height,
      });
    } else {
      if (!animation) throw new Error("No GIF loaded");
      const output = encodeAnimation(
        transformFrames(animation, data.options, progress),
        data.colors,
        progress,
      );
      self.postMessage({ output }, [output.buffer]);
    }
  } catch (e) {
    self.postMessage({ error: e.message });
  }
};
