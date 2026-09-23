import { mount } from "svelte";
import App from "./App.svelte";
import { installFormNavigationGuard } from "./formGuard.js";
import { applyTheme } from "./lib/host.js";
import "./app.css";

applyTheme();

// DBX iframe is `sandbox="allow-scripts"` without `allow-forms`.
// Prevent native navigation while still allowing component submit handlers to run.
installFormNavigationGuard();

mount(App, { target: document.getElementById("app") });
