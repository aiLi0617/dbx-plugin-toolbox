# OCR model provenance

- `detection-ppocrv5.rten` is converted from PaddlePaddle's
  `PP-OCRv5_mobile_det_onnx/inference.onnx` (Apache-2.0). The verified source
  SHA-256 is `a431985659dc921974177a95adcfbb90fd9e51989a5e04d70d0b75f597b6e61d`.
  It was converted with `rten-convert 0.22.0 --no-infer-shapes`; the RTen file
  SHA-256 is `06ceb2a0cf56bcd340ace6bf5ac8eea90377fbed931e4ee80b99eb75ef2d090a`.
- The recognition RTen models and `ppocrv5-mobile-dict.txt` are PaddleOCR v5
  mobile/server recognition assets used with the dictionary generated into
  `backend/src/ocr_alphabet.rs`.

The original ONNX file is intentionally not committed because the Sidecar only
loads the converted RTen asset.
