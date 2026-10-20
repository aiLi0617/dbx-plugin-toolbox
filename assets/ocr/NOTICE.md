# OCR model assets

The Sidecar binary contains the OCR runtime and generated character dictionary,
but does not embed recognition or detection models. Users explicitly download
the pinned assets from the immutable `ocr-models-v1` GitHub Release.

- `detection-ppocrv5.rten`: PP-OCRv5 mobile detector, 4,877,120 bytes, SHA-256 `06ceb2a0cf56bcd340ace6bf5ac8eea90377fbed931e4ee80b99eb75ef2d090a`.
- `recognition-mobile-opset13.rten`: fast recognizer, 16,555,844 bytes, SHA-256 `19369953e95c4f376fb5310b2740c711b40a1fba6e311c6bb58baed949a85ba6`.
- `recognition-server-opset13.rten`: accurate recognizer, 84,552,004 bytes, SHA-256 `5dad41c89a41ae468a626affb91867b36fe067b54d032138862e61f50c312f6b`.
- The alphabet is generated from PaddleOCR's `recognition/ppocrv5_dict.txt`.

The PaddleOCR model repository declares Apache-2.0. The fixed HTTPS asset URLs,
sizes, hashes, license, and source are compiled into the Sidecar. No remote
manifest or user-provided download URL is accepted.
