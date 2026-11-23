use base64::{engine::general_purpose::STANDARD, Engine};
use image::{GenericImageView, ImageFormat, ImageReader, Limits};
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, Zero};
use rand::{rngs::OsRng, Rng, RngCore};
use serde_json::json;
use std::{collections::BTreeSet, io::Cursor, net::Ipv6Addr};

use super::{
    math::{decimal, exact},
    text_result,
    text_tools::decode_base64,
    Args, ToolResult,
};
use crate::{helpers::bad, pdf};

fn rational(numerator: i64, denominator: i64) -> BigRational {
    BigRational::new(numerator.into(), denominator.into())
}

pub(super) fn exact_calculate(args: Args) -> ToolResult {
    let source = args.text("text").trim();
    let from = args.optional("from").unwrap_or("");
    let to = args.optional("to").unwrap_or("");
    if args.text("action") == "statistics" {
        let mut values = source
            .split([',', ' ', '\t', '\n', '\r'])
            .filter(|v| !v.is_empty())
            .take(257)
            .map(decimal)
            .collect::<Result<Vec<_>, _>>()?;
        if values.is_empty() || values.len() > 256 || source.len() > 4096 {
            return Err(bad(
                "Statistics require 1 to 256 decimals within 4,096 bytes",
            ));
        }
        values.sort();
        let count = values.len();
        let sum: BigRational = values.iter().sum();
        let mean = &sum / BigInt::from(count);
        let mid = count / 2;
        let median = if count.is_multiple_of(2) {
            (&values[mid - 1] + &values[mid]) / BigInt::from(2)
        } else {
            values[mid].clone()
        };
        return Ok(
            json!({ "count": count, "min": exact(&values[0]), "max": exact(&values[count - 1]),
            "sum": exact(&sum), "mean": exact(&mean), "median": exact(&median) }),
        );
    }
    let result = match args.text("action") {
        "temperature" => {
            let value = decimal(source)?;
            let kelvin_offset = rational(27315, 100);
            let celsius = match from.to_ascii_uppercase().as_str() {
                "C" => value,
                "F" => (value - BigInt::from(32)) * rational(5, 9),
                "K" => value - &kelvin_offset,
                _ => return Err(bad("Temperature units must be C, F or K")),
            };
            match to.to_ascii_uppercase().as_str() {
                "C" => celsius,
                "F" => celsius * rational(9, 5) + BigInt::from(32),
                "K" => celsius + kelvin_offset,
                _ => return Err(bad("Temperature units must be C, F or K")),
            }
        }
        "transfer" => {
            let bytes = decimal(source)?;
            let rate = decimal(from)?;
            if bytes < BigRational::zero() || rate <= BigRational::zero() {
                return Err(bad(
                    "Transfer requires nonnegative bytes and positive bytes per second",
                ));
            }
            bytes / rate
        }
        "compound-interest" => {
            if source.len() > 128 || from.len() > 32 {
                return Err(bad("Interest input is too long"));
            }
            let rate = decimal(from)? / BigInt::from(100);
            let periods = to
                .parse::<i32>()
                .ok()
                .filter(|n| (0..=120).contains(n))
                .ok_or_else(|| bad("Interest requires 0 to 120 whole periods"))?;
            if rate < -BigRational::one() {
                return Err(bad("Interest cannot be below -100 percent"));
            }
            decimal(source)? * (BigRational::one() + rate).pow(periods)
        }
        _ => return expression(source),
    };
    text_result(exact(&result))
}

fn expression(source: &str) -> ToolResult {
    if source.len() > 512 {
        return Err(bad("Expression exceeds 512 bytes"));
    }
    let mut parser = Arithmetic(source.as_bytes());
    let value = parser.expression(0, 0)?;
    if parser.peek().is_some() {
        return Err(bad("Expected an arithmetic operator"));
    }
    text_result(exact(&value))
}

struct Arithmetic<'a>(&'a [u8]);

impl Arithmetic<'_> {
    fn peek(&mut self) -> Option<u8> {
        self.0 = self.0.trim_ascii_start();
        self.0.first().copied()
    }

    fn expression(
        &mut self,
        precedence: u8,
        depth: u8,
    ) -> Result<BigRational, dbx_plugin_sdk::PluginError> {
        if depth >= 32 {
            return Err(bad("Expression nesting exceeds 32 levels"));
        }
        let mut value = match self.peek() {
            Some(sign @ (b'-' | b'+')) => {
                self.0 = &self.0[1..];
                let value = self.expression(3, depth + 1)?;
                if sign == b'-' {
                    -value
                } else {
                    value
                }
            }
            Some(b'(') => {
                self.0 = &self.0[1..];
                let value = self.expression(0, depth + 1)?;
                if self.peek() != Some(b')') {
                    return Err(bad("Expected closing parenthesis"));
                }
                self.0 = &self.0[1..];
                value
            }
            _ => {
                let size = self
                    .0
                    .iter()
                    .take_while(|b| b.is_ascii_digit() || **b == b'.')
                    .count();
                let (part, rest) = self.0.split_at(size);
                self.0 = rest;
                decimal(std::str::from_utf8(part).expect("ASCII digits"))?
            }
        };
        while let Some(operator @ (b'+' | b'-' | b'*' | b'/')) = self.peek() {
            let priority = if matches!(operator, b'+' | b'-') {
                1
            } else {
                2
            };
            if priority < precedence {
                break;
            }
            self.0 = &self.0[1..];
            let rhs = self.expression(priority + 1, depth + 1)?;
            value = match operator {
                b'+' => value + rhs,
                b'-' => value - rhs,
                b'*' => value * rhs,
                _ if rhs.is_zero() => return Err(bad("Division by zero")),
                _ => value / rhs,
            };
        }
        Ok(value)
    }
}

pub(super) fn random_values(args: Args) -> ToolResult {
    let kind = args.text("kind");
    if matches!(
        kind,
        "jwk" | "bcrypt-hash" | "bcrypt-verify" | "bip39-encode" | "bip39-decode"
    ) {
        return super::javascript::credential(args);
    }
    let count = args.number("count");
    let length = args.number("length");
    if matches!(kind, "password" | "bytes" | "nanoid") && count * length > 32_768 {
        return Err(bad("Total requested random bytes exceed 32 KiB"));
    }
    let alphabet = if kind == "nanoid" {
        b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-".as_slice()
    } else {
        b"0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!@#$%^&*_-+=".as_slice()
    };
    let mut rng = OsRng;
    let mut values = Vec::with_capacity(count);
    for _ in 0..count {
        values.push(match kind {
            "bytes" => {
                let mut bytes = vec![0_u8; length];
                rng.fill_bytes(&mut bytes);
                if args.text("encoding") == "base64" {
                    STANDARD.encode(bytes)
                } else {
                    hex::encode(bytes)
                }
            }
            "mac" => {
                let mut bytes = [0_u8; 6];
                rng.fill_bytes(&mut bytes);
                bytes[0] = (bytes[0] & 0xfc) | 2;
                bytes
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect::<Vec<_>>()
                    .join(":")
            }
            "ipv6-ula" => {
                let mut bytes = [0_u8; 16];
                bytes[0] = 0xfd;
                rng.fill_bytes(&mut bytes[1..6]);
                format!("{}/48", Ipv6Addr::from(bytes))
            }
            _ => (0..length)
                .map(|_| char::from(alphabet[rng.gen_range(0..alphabet.len())]))
                .collect(),
        });
    }
    Ok(json!({"values": values}))
}

fn image_format(name: &str) -> ImageFormat {
    match name {
        "jpeg" => ImageFormat::Jpeg,
        "webp" => ImageFormat::WebP,
        _ => ImageFormat::Png,
    }
}

pub(super) fn image_transform(args: Args) -> ToolResult {
    let bytes = decode_base64(args.text("text"))?;
    let mut reader = ImageReader::new(Cursor::new(&bytes))
        .with_guessed_format()
        .map_err(|_| bad("Invalid image"))?;
    let input_format = reader
        .format()
        .filter(|format| {
            matches!(
                format,
                ImageFormat::Png | ImageFormat::Jpeg | ImageFormat::WebP
            )
        })
        .ok_or_else(|| bad("Expected a PNG, JPEG or WebP image"))?;
    let mut limits = Limits::default();
    limits.max_image_width = Some(4096);
    limits.max_image_height = Some(4096);
    limits.max_alloc = Some(80 * 1024 * 1024);
    reader.limits(limits);
    let image = reader
        .decode()
        .map_err(|_| bad("Invalid image or image exceeds decode limits"))?;
    let (original_width, original_height) = image.dimensions();
    let width = args.number("width") as u32;
    let height = args.number("height") as u32;
    let action = args.text("action");
    let result = match action {
        "inspect" => {
            return Ok(
                json!({ "width": original_width, "height": original_height, "format": input_format.extensions_str()[0] }),
            )
        }
        "resize" if width > 0 && height > 0 => {
            image.resize_exact(width, height, image::imageops::FilterType::Triangle)
        }
        "crop" if width > 0 && height > 0 => {
            let x = args.number("x") as u32;
            let y = args.number("y") as u32;
            if x + width > original_width || y + height > original_height {
                return Err(bad("Crop rectangle is outside the image"));
            }
            image.crop_imm(x, y, width, height)
        }
        "resize" | "crop" => return Err(bad("Positive width and height are required")),
        "rotate-90" => image.rotate90(),
        "rotate-180" => image.rotate180(),
        "rotate-270" => image.rotate270(),
        "flip-horizontal" => image.fliph(),
        "flip-vertical" => image.flipv(),
        "pixelate" => {
            let block = args.number("block") as u32;
            use image::imageops::FilterType::{Nearest, Triangle};
            image
                .resize_exact(
                    original_width.div_ceil(block),
                    original_height.div_ceil(block),
                    Triangle,
                )
                .resize_exact(original_width, original_height, Nearest)
        }
        _ => image,
    };
    let (width, height) = result.dimensions();
    let format = args.text("format");
    let mut output = Cursor::new(Vec::new());
    let result = if format == "jpeg" {
        image::DynamicImage::ImageRgb8(result.to_rgb8())
    } else {
        result
    };
    result
        .write_to(&mut output, image_format(format))
        .map_err(|_| bad("Image encoding failed"))?;
    Ok(
        json!({ "width": width, "height": height, "format": format, "text": STANDARD.encode(output.into_inner()) }),
    )
}

pub(super) fn pdf_document(args: Args) -> ToolResult {
    let mut document = open_pdf(args.text("text"), args.optional("password"))?;
    let pages = document.get_pages();
    let count = pages.len() as u32;
    if count == 0 || count > 256 {
        return Err(bad("PDF must contain 1 to 256 pages"));
    }
    let action = args.text("action");
    if action == "inspect" {
        return Ok(
            json!({ "pages": count, "version": document.version, "hasSignature": pdf::document_has_signature(&document) }),
        );
    }
    let selected = || match args.optional("pages") {
        Some(spec) => pdf_pages(spec, count),
        None => Ok((1..=count).collect()),
    };
    match action {
        "extract" => {
            pdf::set_page_order(&mut document, &selected()?.into_iter().collect::<Vec<_>>())?
        }
        "delete" => {
            let removed: Vec<u32> = selected()?.into_iter().collect();
            if removed.len() == pages.len() {
                return Err(bad("At least one PDF page must remain"));
            }
            document.delete_pages(&removed);
            document.prune_objects();
        }
        "rotate" => {
            let angle = args.number("rotation") as i64;
            if !matches!(angle, 0 | 90 | 180 | 270) {
                return Err(bad("Rotation must be a multiple of 90"));
            }
            for number in selected()? {
                let id = pages[&number];
                let inherited = pdf::inherited(&document, id, b"Rotate")
                    .and_then(|value| value.as_i64().ok())
                    .unwrap_or(0)
                    .rem_euclid(360);
                let page = document
                    .get_object_mut(id)
                    .and_then(lopdf::Object::as_dict_mut)
                    .map_err(|_| bad("Invalid PDF page"))?;
                page.set("Rotate", (inherited + angle).rem_euclid(360));
            }
        }
        "merge" => {
            let second = args
                .optional("second")
                .ok_or_else(|| bad("A second Base64 PDF is required"))?;
            let second = open_pdf(second, args.optional("secondPassword"))?;
            pdf::set_page_order(&mut document, &(1..=count).collect::<Vec<_>>())?;
            pdf::append_pages(&mut document, second, 256, || Ok(()))?;
            document.prune_objects();
        }
        "encrypt" => {
            pdf::encrypt_document(&mut document, args.optional("newPassword").unwrap_or(""))?
        }
        "decrypt" => {}
        _ => {
            document.prune_objects();
            document.compress();
        }
    }
    let remaining = document.get_pages().len();
    let mut output = Vec::new();
    document
        .save_to(&mut output)
        .map_err(|_| bad("PDF encoding failed"))?;
    Ok(json!({ "pages": remaining, "text": STANDARD.encode(output) }))
}

fn open_pdf(
    text: &str,
    password: Option<&str>,
) -> Result<lopdf::Document, dbx_plugin_sdk::PluginError> {
    let bytes = decode_base64(text)?;
    let options = lopdf::LoadOptions {
        password: password.map(str::to_owned),
        max_decompressed_size: Some(2 * 1024 * 1024),
        ..Default::default()
    };
    let document = lopdf::Document::load_mem_with_options(&bytes, options)
        .map_err(|_| bad("Invalid PDF, invalid password, or PDF exceeds its decode limit"))?;
    if document.is_encrypted() {
        return Err(bad("Supply the opening password for this PDF"));
    }
    Ok(document)
}

fn pdf_pages(spec: &str, count: u32) -> Result<BTreeSet<u32>, dbx_plugin_sdk::PluginError> {
    let parse = |part: &str| {
        part.trim()
            .parse::<u32>()
            .ok()
            .filter(|page| (1..=count).contains(page))
            .ok_or_else(|| bad("PDF page number is outside the document"))
    };
    let mut pages = BTreeSet::new();
    for part in spec.split(',') {
        if let Some((first, last)) = part.split_once('-') {
            let (first, last) = (parse(first)?, parse(last)?);
            if first > last {
                return Err(bad("PDF page range is reversed"));
            }
            pages.extend(first..=last);
        } else {
            pages.insert(parse(part)?);
        }
    }
    Ok(pages)
}
