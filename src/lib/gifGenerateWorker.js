import { encodeGif } from './lazy/gif.js';
self.onmessage = ({ data }) => {
  try {
    const blob = encodeGif(data.frames, data.width, data.height, data.options);
    self.postMessage({ blob });
  } catch { self.postMessage({ error: 'GIF worker failed' }); }
};
