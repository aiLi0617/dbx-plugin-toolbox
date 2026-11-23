use std::cmp::Ordering;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};

use chrono::{DateTime, Datelike, SecondsFormat, Utc};
use croner::Cron;
use dbx_plugin_sdk::PluginError;
use num_bigint::BigUint;
use serde_json::json;

use super::{text_result, Args, ToolResult};
use crate::helpers::bad;

fn read_datetime(input: &str) -> Result<DateTime<Utc>, PluginError> {
    // Chrono can truncate subseconds past nine digits. Check the given precision first.
    if let Some((_, fraction)) = input.split_once('.') {
        if fraction.bytes().take_while(u8::is_ascii_digit).count() > 9 {
            return Err(bad("RFC 3339 fraction exceeds nanosecond precision"));
        }
    }
    let datetime = DateTime::parse_from_rfc3339(input)
        .map_err(|_| bad("Expected an RFC 3339 date and time with an explicit offset"))?;
    if datetime.timestamp_subsec_nanos() >= 1_000_000_000 {
        return Err(bad("Leap seconds cannot be represented as Unix timestamps"));
    }
    Ok(datetime.with_timezone(&Utc))
}

fn write_datetime(date: DateTime<Utc>) -> Result<String, PluginError> {
    if !(0..=9999).contains(&date.year()) {
        return Err(bad("Date is outside the four-digit RFC 3339 year range"));
    }
    Ok(date.to_rfc3339_opts(SecondsFormat::AutoSi, true))
}

pub(super) fn timestamp(args: Args) -> ToolResult {
    const SECOND: i128 = 1_000_000_000;
    let scale = match args.text("unit") {
        "s" => SECOND,
        "ms" => 1_000_000,
        "us" => 1_000,
        _ => 1,
    };
    let text = args.text("text").trim();
    if args.text("action") == "to_rfc3339" {
        let value = text
            .parse::<i128>()
            .ok()
            .and_then(|value| value.checked_mul(scale))
            .ok_or_else(|| bad("Expected a signed integer timestamp in range"))?;
        let seconds = i64::try_from(value.div_euclid(SECOND))
            .map_err(|_| bad("Timestamp is out of range"))?;
        let nanos = value.rem_euclid(SECOND) as u32;
        let date = DateTime::from_timestamp(seconds, nanos)
            .ok_or_else(|| bad("Timestamp is out of range"))?;
        return text_result(write_datetime(date)?);
    }
    let datetime = read_datetime(text)?;
    let nanos =
        i128::from(datetime.timestamp()) * SECOND + i128::from(datetime.timestamp_subsec_nanos());
    if nanos % scale != 0 {
        return Err(bad("Target unit would lose timestamp precision"));
    }
    text_result((nanos / scale).to_string())
}

pub(super) fn cron(args: Args) -> ToolResult {
    let expression = args.text("expression");
    if expression.len() > 1024 || expression.split_whitespace().count() != 5 {
        return Err(bad("Expected a five-field cron expression"));
    }
    let scheduler: Cron = expression
        .parse()
        .map_err(|_| bad("Invalid cron expression"))?;
    let after = read_datetime(args.text("after"))?;
    let mut date =
        DateTime::from_timestamp(after.timestamp(), 0).expect("validated RFC 3339 instant");
    let mut values = Vec::with_capacity(args.number("count"));
    for _ in 0..args.number("count") {
        date = scheduler
            .find_next_occurrence(&date, false)
            .map_err(|_| bad("No next occurrence within the cron search range"))?;
        values.push(write_datetime(date)?);
    }
    Ok(json!({ "occurrences": values }))
}

pub(super) fn cidr(args: Args) -> ToolResult {
    let invalid = || bad("Expected an IPv4 or IPv6 address with a valid slash prefix");
    let (address, prefix) = args
        .text("text")
        .trim()
        .split_once('/')
        .ok_or_else(invalid)?;
    let address: IpAddr = address.parse().map_err(|_| invalid())?;
    let bits: u32 = if address.is_ipv4() { 32 } else { 128 };
    let prefix: u32 = prefix
        .parse()
        .ok()
        .filter(|prefix| *prefix <= bits)
        .ok_or_else(invalid)?;
    let hosts = bits - prefix;
    let all = u128::MAX >> (128 - bits);
    let wildcard = u128::MAX.checked_shr(128 - hosts).unwrap_or(0);
    let mask = all ^ wildcard;
    let ip = match address {
        IpAddr::V4(addr) => u128::from(u32::from(addr)),
        IpAddr::V6(addr) => u128::from(addr),
    };
    let network = ip & mask;
    let last = network | wildcard;
    let adjust = u128::from(address.is_ipv4() && prefix < 31);
    let pretty = |value| {
        if address.is_ipv4() {
            Ipv4Addr::from(value as u32).to_string()
        } else {
            Ipv6Addr::from(value).to_string()
        }
    };
    let total = BigUint::from(1_u8) << hosts;
    let usable = &total - BigUint::from(2 * adjust);
    Ok(json!({
        "address": address.to_string(), "prefix": prefix, "cidr": format!("{}/{prefix}", pretty(network)),
        "mask": pretty(mask), "wildcard": pretty(wildcard), "network": pretty(network),
        "firstHost": pretty(network + adjust), "lastHost": pretty(last - adjust),
        "broadcast": address.is_ipv4().then(|| pretty(last)),
        "addressCount": total.to_string(), "usableCount": usable.to_string()
    }))
}

pub(super) fn ipv4_range(args: Args) -> ToolResult {
    let parse = |value: &str| {
        value
            .parse::<Ipv4Addr>()
            .map(|ip| u64::from(u32::from(ip)))
            .map_err(|_| bad("Expected valid IPv4 addresses"))
    };
    let mut start = parse(args.text("start"))?;
    let end = parse(args.text("end"))?;
    if start > end {
        return Err(bad("Start address must not exceed end address"));
    }
    let count = end - start + 1;
    let mut blocks = Vec::new();
    while start <= end {
        let block_power = start.trailing_zeros().min((end - start + 1).ilog2());
        blocks.push(format!(
            "{}/{}",
            Ipv4Addr::from(start as u32),
            32 - block_power
        ));
        start += 1 << block_power;
    }
    Ok(json!({ "blocks": blocks, "addressCount": count.to_string() }))
}

pub(super) fn semver(args: Args) -> ToolResult {
    let version = semver::Version::parse(args.text("version").trim())
        .map_err(|_| bad("Invalid semantic version"))?;
    let other = args.text("other").trim();
    if args.text("action") == "matches" {
        let requirement =
            semver::VersionReq::parse(other).map_err(|_| bad("Invalid SemVer requirement"))?;
        return Ok(json!({ "matches": requirement.matches(&version) }));
    }
    let other =
        semver::Version::parse(other).map_err(|_| bad("Invalid second semantic version"))?;
    let order = match version.cmp_precedence(&other) {
        Ordering::Less => -1,
        Ordering::Equal => 0,
        Ordering::Greater => 1,
    };
    Ok(json!({ "order": order }))
}
