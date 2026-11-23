use std::time::{Duration, Instant};

use base64::{
    alphabet,
    engine::{DecodePaddingMode, GeneralPurpose, GeneralPurposeConfig},
    Engine,
};
use rand::{rngs::OsRng, RngCore};
use rquickjs::{function::Func, CatchResultExt, Context, Error, Function, Object, Runtime};
use serde_json::{json, Value};
use url::Url;

use super::{data, Args, ToolResult};
use crate::helpers::bad;

const BUNDLE: &str = include_str!(concat!(env!("OUT_DIR"), "/mcp-utilities.js"));
const SHIMS: &str = include_str!("../../js/globals.js");
const B64: GeneralPurpose = GeneralPurpose::new(
    &alphabet::STANDARD,
    GeneralPurposeConfig::new().with_decode_padding_mode(DecodePaddingMode::Indifferent),
);

fn invalid(message: &str) -> Error {
    Error::new_from_js_message("string", "input", message)
}

fn btoa(value: Vec<u8>) -> String {
    B64.encode(value)
}

fn atob(value: String) -> Result<Vec<u8>, Error> {
    let compact = value
        .chars()
        .filter(|character| !character.is_ascii_whitespace())
        .collect::<String>();
    B64.decode(compact).map_err(|_| invalid("Invalid Base64"))
}

fn parse_url(value: String, base: String) -> Result<String, Error> {
    let url = if base.is_empty() {
        Url::parse(&value)
    } else {
        Url::parse(&base).and_then(|base| base.join(&value))
    }
    .map_err(|_| invalid("Invalid URL"))?;
    let pairs: Vec<_> = url.query_pairs().collect();
    Ok(json!({
        "href": url.as_str(), "protocol": format!("{}:", url.scheme()),
        "hostname": url.host_str().unwrap_or(""), "port": url.port().map(|item| item.to_string()).unwrap_or_default(),
        "pathname": url.path(), "username": url.username(), "password": url.password().unwrap_or(""),
        "search": url.query().map(|value| format!("?{value}")).unwrap_or_default(),
        "hash": url.fragment().map(|value| format!("#{value}")).unwrap_or_default(),
        "origin": url.origin().ascii_serialization(), "query": pairs
    }).to_string())
}

fn run(name: &str, args: Args) -> ToolResult {
    let runtime = Runtime::new().map_err(|_| bad("Unable to initialize the MCP utility engine"))?;
    runtime.set_memory_limit(64 * 1024 * 1024);
    runtime.set_max_stack_size(256 * 1024);
    let deadline = Instant::now() + Duration::from_secs(3);
    runtime.set_interrupt_handler(Some(Box::new(move || Instant::now() >= deadline)));
    let context =
        Context::full(&runtime).map_err(|_| bad("Unable to create the MCP utility context"))?;
    let arguments = Value::Object(args.0).to_string();
    let response = context
        .with(|ctx| -> Result<String, Error> {
            let globals = ctx.globals();
            globals.set("__toolboxBtoa", Func::from(btoa))?;
            globals.set("__toolboxAtob", Func::from(atob))?;
            globals.set("__toolboxUrl", Func::from(parse_url))?;
            globals.set(
                "__toolboxRandom",
                Func::from(|size: usize| {
                    if size > 4096 {
                        return Err(invalid("Random request exceeds 4 KiB"));
                    }
                    let mut bytes = vec![0; size];
                    OsRng
                        .try_fill_bytes(&mut bytes)
                        .map_err(|_| invalid("OS randomness unavailable"))?;
                    Ok::<_, Error>(bytes)
                }),
            )?;
            globals.set(
                "__toolboxDecode",
                Func::from(|value: Vec<u8>| {
                    String::from_utf8(value).map_err(|_| invalid("Invalid UTF-8"))
                }),
            )?;
            for script in [SHIMS, BUNDLE] {
                if let Err(error) = ctx.eval::<(), _>(script).catch(&ctx) {
                    eprintln!("Could not load bundled Toolbox utilities: {error}");
                    return Err(Error::Exception);
                }
            }
            let module: Object = globals.get("toolbox")?;
            let callback: Function = module.get("run")?;
            callback.call((name, arguments))
        })
        .map_err(|_| bad("Utility exceeded its execution limit or could not be initialized"))?;
    if response.len() > super::MAX_RESULT_BYTES {
        return Err(bad(super::RESULT_LIMIT));
    }
    let mut response: Value =
        serde_json::from_str(&response).map_err(|_| bad("Invalid utility result"))?;
    if let Some(error) = response.get("error").and_then(Value::as_str) {
        return Err(bad(error));
    }
    response
        .as_object_mut()
        .and_then(|object| object.remove("result"))
        .ok_or_else(|| bad("Utility produced no result"))
}

pub(super) fn data_convert(args: Args) -> ToolResult {
    if args.text("from") == "json" {
        data::require_unique_json(args.text("text"))?;
    }
    run("data_convert", args)
}

pub(super) fn json_query(args: Args) -> ToolResult {
    data::require_unique_json(args.text("text"))?;
    if args.text("action") == "schema" {
        data::require_unique_json(args.text("query"))?;
    }
    run("json_query", args)
}

pub(super) fn json_generate(args: Args) -> ToolResult {
    data::require_unique_json(args.text("text"))?;
    run("json_generate", args)
}

pub(super) fn text_transform(args: Args) -> ToolResult {
    if args.text("action") == "regex-replace" {
        let pattern = args
            .optional("find")
            .filter(|value| !value.is_empty() && value.len() <= 4096)
            .ok_or_else(|| bad("A regex pattern of at most 4 KiB is required"))?;
        let regex = regex::RegexBuilder::new(pattern)
            .size_limit(256 * 1024)
            .dfa_size_limit(256 * 1024)
            .nest_limit(64)
            .build()
            .map_err(|_| bad("Invalid or unsupported Rust regex"))?;
        let replacement = args.optional("replacement").unwrap_or("");
        let source = args.text("text");
        let scratch = regex.replacen(source, 100, replacement);
        return super::text_result(scratch.into_owned());
    }
    run("text_transform", args)
}

pub(super) fn credential(args: Args) -> ToolResult {
    if args.text("kind") == "jwk" {
        data::require_unique_json(
            args.optional("text")
                .ok_or_else(|| bad("Input text is required"))?,
        )?;
    }
    run("credential", args)
}

macro_rules! javascript_tools {
    ($($name:ident),+ $(,)?) => {$(
        pub(super) fn $name(args: Args) -> ToolResult {
            run(stringify!($name), args)
        }
    )+};
}

javascript_tools!(
    code_format,
    base_codec,
    developer_helpers,
    network_helpers,
    calendar,
    fake_data,
    qr_code
);
