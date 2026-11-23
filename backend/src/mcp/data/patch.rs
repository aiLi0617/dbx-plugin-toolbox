use std::collections::HashSet;

use dbx_plugin_sdk::PluginError;
use serde_json::{json, value::RawValue};

use super::{items, members, pointer_token, read_json, same_scalar, MAX_DEPTH};
use crate::helpers::bad;
use crate::mcp::{append, Args, ToolResult};

#[derive(Clone)]
enum Node<'a> {
    Scalar(&'a str),
    Array(Vec<Self>),
    Object(Vec<(String, Self)>),
}

impl<'a> Node<'a> {
    fn parse(raw: &'a RawValue) -> Result<Self, PluginError> {
        Ok(match raw.get().as_bytes()[0] {
            b'[' => Self::Array(
                items(raw)?
                    .into_iter()
                    .map(Self::parse)
                    .collect::<Result<_, _>>()?,
            ),
            b'{' => {
                let mut names = HashSet::new();
                let entries = members(raw)?;
                for (name, _) in &entries {
                    if !names.insert(name) {
                        return Err(bad("JSON patch requires unique object keys"));
                    }
                }
                Self::Object(
                    entries
                        .into_iter()
                        .map(|(name, value)| Ok((name, Self::parse(value)?)))
                        .collect::<Result<_, PluginError>>()?,
                )
            }
            _ => Self::Scalar(raw.get()),
        })
    }

    fn get(&self, path: &[String]) -> Result<&Self, PluginError> {
        let Some((name, rest)) = path.split_first() else {
            return Ok(self);
        };
        let child = match self {
            Self::Object(fields) => fields
                .iter()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value),
            Self::Array(values) => values.get(array_index(name, values.len(), false)?),
            Self::Scalar(_) => None,
        }
        .ok_or_else(|| bad("JSON Pointer target does not exist"))?;
        child.get(rest)
    }

    fn get_mut(&mut self, path: &[String]) -> Result<&mut Self, PluginError> {
        let Some((name, rest)) = path.split_first() else {
            return Ok(self);
        };
        let child = match self {
            Self::Object(fields) => fields
                .iter_mut()
                .find(|(key, _)| key == name)
                .map(|(_, value)| value),
            Self::Array(values) => {
                let index = array_index(name, values.len(), false)?;
                values.get_mut(index)
            }
            Self::Scalar(_) => None,
        }
        .ok_or_else(|| bad("JSON Pointer target does not exist"))?;
        child.get_mut(rest)
    }

    fn edit(&mut self, path: &[String], change: Edit<'a>) -> Result<Option<Self>, PluginError> {
        let Some((key, parent)) = path.split_last() else {
            return match change {
                Edit::Add(value) | Edit::Replace(value) => Ok(Some(std::mem::replace(self, value))),
                Edit::Remove => Err(bad(
                    "Cannot remove the root JSON value. Replace it with null instead.",
                )),
            };
        };
        match self.get_mut(parent)? {
            Self::Object(fields) => {
                let existing = fields.iter().position(|(name, _)| name == key);
                match (change, existing) {
                    (Edit::Add(value), None) => {
                        fields.push((key.clone(), value));
                        Ok(None)
                    }
                    (Edit::Add(value) | Edit::Replace(value), Some(index)) => {
                        Ok(Some(std::mem::replace(&mut fields[index].1, value)))
                    }
                    (Edit::Remove, Some(index)) => Ok(Some(fields.remove(index).1)),
                    _ => Err(bad("JSON Pointer target does not exist")),
                }
            }
            Self::Array(values) => {
                let index = array_index(key, values.len(), matches!(change, Edit::Add(_)))?;
                match change {
                    Edit::Add(value) => {
                        values.insert(index, value);
                        Ok(None)
                    }
                    Edit::Remove => Ok(Some(values.remove(index))),
                    Edit::Replace(value) => Ok(Some(std::mem::replace(&mut values[index], value))),
                }
            }
            Self::Scalar(_) => Err(bad("JSON Pointer parent must be an object or array")),
        }
    }

    fn equals(&self, other: &Self) -> Result<bool, PluginError> {
        Ok(match (self, other) {
            (Self::Scalar(left), Self::Scalar(right)) => same_scalar(left, right)?,
            (Self::Array(left), Self::Array(right)) if left.len() == right.len() => {
                for (left, right) in left.iter().zip(right) {
                    if !left.equals(right)? {
                        return Ok(false);
                    }
                }
                true
            }
            (Self::Object(left), Self::Object(right)) if left.len() == right.len() => {
                let right: std::collections::HashMap<_, _> =
                    right.iter().map(|(key, value)| (key, value)).collect();
                for (name, value) in left {
                    let Some(candidate) = right.get(name) else {
                        return Ok(false);
                    };
                    if !value.equals(candidate)? {
                        return Ok(false);
                    }
                }
                true
            }
            _ => false,
        })
    }

    fn merge(&mut self, patch: Self) {
        let Self::Object(patch) = patch else {
            *self = patch;
            return;
        };
        if !matches!(self, Self::Object(_)) {
            *self = Self::Object(Vec::new());
        }
        let Self::Object(target) = self else {
            unreachable!()
        };
        for (name, value) in patch {
            let at = target.iter().position(|(key, _)| key == &name);
            match (at, value) {
                (Some(index), Self::Scalar("null")) => {
                    target.remove(index);
                }
                (None, Self::Scalar("null")) => {}
                (Some(index), value) => target[index].1.merge(value),
                (None, value) => {
                    let mut child = Self::Scalar("null");
                    child.merge(value);
                    target.push((name, child));
                }
            }
        }
    }

    fn write(&self, output: &mut String, depth: usize) -> Result<(), PluginError> {
        if depth >= MAX_DEPTH && !matches!(self, Self::Scalar(_)) {
            return Err(bad("JSON nesting exceeds 127 levels"));
        }
        match self {
            Self::Scalar(value) => append(output, value),
            Self::Array(values) => {
                append(output, "[")?;
                for (index, value) in values.iter().enumerate() {
                    if index != 0 {
                        append(output, ",")?;
                    }
                    value.write(output, depth + 1)?;
                }
                append(output, "]")
            }
            Self::Object(fields) => {
                append(output, "{")?;
                for (index, (key, value)) in fields.iter().enumerate() {
                    if index != 0 {
                        append(output, ",")?;
                    }
                    let key = serde_json::to_string(key).map_err(|error| bad(error.to_string()))?;
                    append(output, &key)?;
                    append(output, ":")?;
                    value.write(output, depth + 1)?;
                }
                append(output, "}")
            }
        }
    }
}

enum Edit<'a> {
    Add(Node<'a>),
    Replace(Node<'a>),
    Remove,
}

fn array_index(token: &str, len: usize, adding: bool) -> Result<usize, PluginError> {
    if adding && token == "-" {
        return Ok(len);
    }
    if token.is_empty()
        || (token.len() > 1 && token.starts_with('0'))
        || !token.bytes().all(|byte| byte.is_ascii_digit())
    {
        return Err(bad("Invalid JSON Pointer array index"));
    }
    token
        .parse::<usize>()
        .ok()
        .filter(|index| *index < len || (adding && *index == len))
        .ok_or_else(|| bad("JSON Pointer array index is out of bounds"))
}

fn pointer(text: &str) -> Result<Vec<String>, PluginError> {
    if text.is_empty() {
        return Ok(Vec::new());
    }
    let path = text
        .strip_prefix('/')
        .ok_or_else(|| bad("JSON Pointer must begin with /"))?;
    let tokens = path
        .split('/')
        .take(MAX_DEPTH + 2)
        .map(pointer_token)
        .collect::<Result<Vec<_>, _>>()?;
    if tokens.len() > MAX_DEPTH + 1 {
        return Err(bad("JSON Pointer path is too deep"));
    }
    Ok(tokens)
}

fn apply<'a>(target: &mut Node<'a>, instruction: &'a RawValue) -> Result<(), PluginError> {
    let fields = super::unique_object(instruction)?;
    let read = |key| {
        fields
            .get(key)
            .copied()
            .ok_or_else(|| bad(format!("Missing patch member {key}")))
    };
    let read_string = |key| {
        serde_json::from_str::<String>(read(key)?.get())
            .map_err(|_| bad(format!("Patch member {key} must be a string")))
    };
    let action = read_string("op")?;
    let path = pointer(&read_string("path")?)?;
    let value = || Node::parse(read("value")?);
    let change = match action.as_str() {
        "add" => Edit::Add(value()?),
        "replace" => Edit::Replace(value()?),
        "remove" => Edit::Remove,
        "test" => {
            if !target.get(&path)?.equals(&value()?)? {
                return Err(bad("JSON Patch test failed"));
            }
            return Ok(());
        }
        "copy" | "move" => {
            let from = pointer(&read_string("from")?)?;
            let node = if action == "move" {
                if path == from {
                    target.get(&path)?;
                    return Ok(());
                }
                if path.starts_with(&from) {
                    return Err(bad("Cannot move a JSON value into its own descendant"));
                }
                target
                    .edit(&from, Edit::Remove)?
                    .expect("remove returns value")
            } else {
                target.get(&from)?.clone()
            };
            Edit::Add(node)
        }
        _ => return Err(bad("Unknown JSON Patch operation")),
    };
    target.edit(&path, change)?;
    Ok(())
}

pub(in crate::mcp) fn json_patch(args: Args) -> ToolResult {
    let mut target = Node::parse(read_json(args.text("text"))?)?;
    let patch = read_json(args.text("patch"))?;
    let mut output = String::new();
    if args.text("action") == "merge" {
        target.merge(Node::parse(patch)?);
        target.write(&mut output, 0)?;
        return Ok(json!({ "text": output }));
    }
    let instructions = items(patch)?;
    if instructions.len() > 128 {
        return Err(bad("JSON Patch supports at most 128 operations"));
    }
    target.write(&mut output, 0)?;
    for (index, item) in instructions.iter().enumerate() {
        apply(&mut target, item)
            .map_err(|error| bad(format!("Patch operation {}: {}", index + 1, error.message)))?;
        // Check the byte and depth limits before a later operation can copy this result.
        output.clear();
        target.write(&mut output, 0)?;
    }
    Ok(json!({ "text": output }))
}
