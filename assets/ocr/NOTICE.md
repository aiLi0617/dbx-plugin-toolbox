# OCR model assets

The Sidecar binary embeds PP-OCRv5 mobile and server recognition models plus
the compact ocrs detection model:

- `detection.rten`: converted from `https://ocrs-models.s3-accelerate.amazonaws.com/text-detection.onnx`
- `recognition-mobile-opset13.rten`: converted from `pdfmarkdownapp/ppu-paddle-ocr-models/recognition/PP-OCRv5_mobile_rec_infer.onnx` after upgrading the ONNX graph from opset 9 to opset 13 so legacy `Slice` attributes become explicit inputs.
- `recognition-server-opset13.rten`: converted from the official `PaddlePaddle/PP-OCRv5_server_rec_onnx/inference.onnx` model after upgrading the ONNX graph from opset 10 to opset 13.
- The embedded alphabet is generated from that repository's `recognition/ppocrv5_dict.txt`.

The PaddleOCR model repository declares Apache-2.0. The detection model is
produced by the ocrs model project from open datasets; see the upstream model
documentation for its data attribution.

Pinned SHA-256 checksums:

- detection: `e580ac554e7d15812d4e5a020a41f7c96e19df41b7419ad8caadf91cb55e802a`
- recognition ONNX: `d253c3cbee6e507828a5271a30ab0ec8ae7c2a99d0cc8e6f844fe380809d22b3`
- recognition RTen: `19369953e95c4f376fb5310b2740c711b40a1fba6e311c6bb58baed949a85ba6`
- server recognition ONNX: `d9dc333c9c7b042c6dffb8e33d72b6f65c9c1d463d0a3c2f78174fea55e94752`
- server recognition RTen: `5dad41c89a41ae468a626affb91867b36fe067b54d032138862e61f50c312f6b`
