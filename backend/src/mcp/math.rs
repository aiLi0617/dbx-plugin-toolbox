use dbx_plugin_sdk::PluginError;
use num_bigint::BigInt;
use num_rational::BigRational;
use num_traits::{One, Signed, Zero};
use serde_json::json;

use super::{text_result, Args, ToolResult};
use crate::helpers::bad;

const MAX_DIGITS: usize = 4096;

pub(super) fn radix(args: Args) -> ToolResult {
    let text = args.text("text").trim();
    let digits = text.strip_prefix(['+', '-']).unwrap_or(text);
    if digits.len() > MAX_DIGITS {
        return Err(bad("Integer exceeds 4,096 digits"));
    }
    let base = args.number("from") as u32;
    if digits.is_empty() || !digits.chars().all(|ch| ch.is_digit(base)) {
        return Err(bad("Integer contains digits outside the source base"));
    }
    let value = BigInt::parse_bytes(text.as_bytes(), base).ok_or_else(|| bad("Invalid integer"))?;
    text_result(value.to_str_radix(args.number("to") as u32))
}

pub(super) fn decimal(text: &str) -> Result<BigRational, PluginError> {
    let text = text.trim();
    let magnitude = text.strip_prefix(['+', '-']).unwrap_or(text);
    let (whole, fraction) = magnitude.split_once('.').unwrap_or((magnitude, ""));
    let len = whole.len() + fraction.len();
    if len == 0
        || len > MAX_DIGITS
        || !whole
            .bytes()
            .chain(fraction.bytes())
            .all(|ch| ch.is_ascii_digit())
    {
        return Err(bad("Expected a signed decimal with up to 4,096 digits"));
    }
    let magnitude =
        BigInt::parse_bytes(format!("{whole}{fraction}").as_bytes(), 10).expect("validated digits");
    let coefficient = if text.starts_with('-') {
        -magnitude
    } else {
        magnitude
    };
    Ok(BigRational::new(
        coefficient,
        BigInt::from(10).pow(fraction.len() as u32),
    ))
}

pub(super) fn exact(value: &BigRational) -> String {
    if value.is_integer() {
        return value.to_integer().to_string();
    }
    let mut reduced = value.denom().clone();
    let twos = reduced.trailing_zeros().unwrap_or(0) as usize;
    reduced >>= twos;
    let mut fives = 0;
    while (&reduced % 5_u8).is_zero() {
        reduced /= 5_u8;
        fives += 1;
    }
    if !reduced.is_one() {
        return format!("{}/{}", value.numer(), value.denom());
    }
    let scale = twos.max(fives);
    let coefficient = (value.numer().abs() * BigInt::from(10).pow(scale as u32)) / value.denom();
    let padded = format!("{:0>width$}", coefficient.to_string(), width = scale + 1);
    let sign = if value.is_negative() { "-" } else { "" };
    let split = padded.len() - scale;
    format!("{sign}{}.{}", &padded[..split], &padded[split..])
}

#[derive(PartialEq)]
enum UnitKind {
    Length,
    Mass,
    Storage,
}

fn unit(symbol: &str) -> Result<(UnitKind, BigRational), PluginError> {
    use UnitKind::{Length, Mass, Storage};
    let (category, numerator, denominator): (_, u64, u64) = match symbol {
        "mm" => (Length, 1, 1_000),
        "cm" => (Length, 1, 100),
        "m" => (Length, 1, 1),
        "km" => (Length, 1_000, 1),
        "in" => (Length, 127, 5_000),
        "ft" => (Length, 381, 1_250),
        "yd" => (Length, 1_143, 1_250),
        "mi" => (Length, 201_168, 125),
        "mg" => (Mass, 1, 1_000_000),
        "g" => (Mass, 1, 1_000),
        "kg" => (Mass, 1, 1),
        "t" => (Mass, 1_000, 1),
        "lb" => (Mass, 45_359_237, 100_000_000),
        "oz" => (Mass, 45_359_237, 1_600_000_000),
        "b" => (Storage, 1, 8),
        "B" => (Storage, 1, 1),
        "kB" => (Storage, 1_000, 1),
        "MB" => (Storage, 1_000_000, 1),
        "GB" => (Storage, 1_000_000_000, 1),
        "TB" => (Storage, 1_000_000_000_000, 1),
        "KiB" => (Storage, 1 << 10, 1),
        "MiB" => (Storage, 1 << 20, 1),
        "GiB" => (Storage, 1 << 30, 1),
        "TiB" => (Storage, 1 << 40, 1),
        _ => return Err(bad("Unsupported unit")),
    };
    Ok((
        category,
        BigRational::new(numerator.into(), denominator.into()),
    ))
}

pub(super) fn unit_convert(args: Args) -> ToolResult {
    let (source_kind, source) = unit(args.text("from"))?;
    let (target_kind, target) = unit(args.text("to"))?;
    if source_kind != target_kind {
        return Err(bad("Both units must belong to the same category"));
    }
    text_result(exact(&(decimal(args.text("value"))? * source / target)))
}

pub(super) fn percentage(args: Args) -> ToolResult {
    let x = decimal(args.text("x"))?;
    let y = decimal(args.text("y"))?;
    let hundred = BigRational::from_integer(100.into());
    let percent_of = exact(&(&x * &y / &hundred));
    let share = (!y.is_zero()).then(|| exact(&(&x / &y * &hundred)));
    let change = (!x.is_zero()).then(|| exact(&((&y - &x) / x.abs() * &hundred)));
    Ok(json!({ "percentOf": percent_of, "share": share, "change": change }))
}
