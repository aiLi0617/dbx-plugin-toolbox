import { mount } from "svelte";
import App from "./App.svelte";
import { applyTheme } from "./lib/host.js";
import "./app.css";

applyTheme();

// DBX iframe is `sandbox="allow-scripts"` without `allow-forms`.
// Native form submit is blocked by Chromium and never reaches onsubmit.
document.addEventListener(
  "submit",
  (event) => {
    event.preventDefault();
    event.stopPropagation();
  },
  true,
);

mount(App, { target: document.getElementById("app") });
