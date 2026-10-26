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
      // Send only small composited previews, never full-size frame copies.
      const scale = Math.min(1, 64 / animation.width, 64 / animation.height);
      const thumbnails = data.includeThumbnails ? transformFrames(animation, {
        width: Math.max(1, Math.round(animation.width * scale)),
        height: Math.max(1, Math.round(animation.height * scale)),
      }) : null;
      self.postMessage({
        width: animation.width,
        height: animation.height,
        repeat: animation.repeat,
        delays: animation.frames.map((f) => f.delay),
        thumbnails: thumbnails ? {
          width: thumbnails.width, height: thumbnails.height,
          frames: thumbnails.frames.map((f) => f.data),
        } : null,
      }, thumbnails ? thumbnails.frames.map((f) => f.data.buffer) : []);
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
