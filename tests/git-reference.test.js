import assert from "node:assert/strict";
import test from "node:test";
import { GIT_REFERENCE, GIT_UI, filterGitReference, gitGroupCommands, gitText } from "../src/lib/gitReference.js";
import { SUPPORTED_LOCALES } from "../src/lib/locale.js";

test("Git reference covers every supported locale and has unique commands", () => {
  const commands = new Set();
  for (const map of Object.values(GIT_UI)) {
    for (const locale of SUPPORTED_LOCALES) assert.ok(gitText(map, locale).trim(), `Git UI ${locale}`);
  }
  assert.ok(GIT_REFERENCE.length >= 10);
  for (const group of GIT_REFERENCE) {
    assert.ok(group.commands.length >= 2, group.id);
    for (const locale of SUPPORTED_LOCALES) {
      assert.ok(gitText(group.title, locale).trim(), `${group.id} title ${locale}`);
      assert.ok(gitText(group.summary, locale).trim(), `${group.id} summary ${locale}`);
    }
    for (const entry of group.commands) {
      assert.equal(commands.has(entry.value), false, `duplicate ${entry.value}`);
      commands.add(entry.value);
      for (const locale of SUPPORTED_LOCALES) assert.ok(gitText(entry.hint, locale).trim(), `${entry.value} ${locale}`);
    }
  }
  assert.ok(commands.size >= 60);
  assert.ok(commands.has('git config --global user.name "<name>"'));
  assert.ok(commands.has('git config --global user.email "<email>"'));
  assert.ok(commands.has("git config --list --show-origin"));
  for (const expected of ["git add <file>", "git switch <branch>", "git merge --abort", "git remote add origin <url>", "git rebase --continue", "git cherry-pick --abort", "git bisect reset", "git worktree list"]) {
    assert.ok(commands.has(expected), expected);
  }
});

test("Git reference searches localized hints and filters categories", () => {
  const chinese = filterGitReference(GIT_REFERENCE, "丢弃", "zh-CN");
  assert.ok(chinese.some((group) => group.commands.some((entry) => entry.value === "git reset --hard <commit>")));
  const stash = filterGitReference(GIT_REFERENCE, "", "en", "stash");
  assert.deepEqual(stash.map((group) => group.id), ["stash"]);
  assert.match(gitGroupCommands(stash[0]), /git stash pop/);
});
