#!/usr/bin/env tsx
/**
 * CodeMode Branding Showcase
 * Displays all logo variations and color combinations
 *
 * Usage: npx tsx scripts/showcase-branding.ts
 */

import chalk from "chalk";
import gradient from "gradient-string";

// Import all logo variations
import {
  CODE_MODE_ASCII_ART,
  CODE_MODE_ICON,
  CODE_MODE_BADGE,
  CODE_MODE_ONELINE,
  CODE_MODE_MINIMAL,
  getDisplayableAsciiArt,
} from "../extensions/cli/src/asciiArt.js";

// Brand gradients
const limeGradient = gradient(["#00ff00", "#7fff00", "#32cd32", "#adff2f"]);
const limeTealGradient = gradient(["#00ff00", "#7fff00", "#00ced1", "#00ffff"]);
const blueTealGradient = gradient(["#1e90ff", "#00bfff", "#00ced1", "#20b2aa"]);
const energyGradient = gradient(["#adff2f", "#00ff00", "#00bfff", "#1e90ff"]);

function section(title: string) {
  console.log("\n");
  console.log(energyGradient("═".repeat(80)));
  console.log(limeTealGradient.multiline(`  ${title}`));
  console.log(energyGradient("═".repeat(80)));
  console.log();
}

function subsection(title: string) {
  console.log();
  console.log(chalk.cyan(`─── ${title} ───`));
  console.log();
}

console.clear();

section("CodeMode Branding Showcase");

subsection("1. Main CLI Banner (Full Width)");
console.log(CODE_MODE_ASCII_ART);

subsection("2. Adaptive Banner (Responsive)");
console.log(getDisplayableAsciiArt());

subsection("3. Icon - {} Lightning Bolt");
console.log(CODE_MODE_ICON);
console.log(chalk.dim("Use for: Favicons, app icons, loading indicators"));

subsection("4. Badge - Boxed Logo");
console.log(CODE_MODE_BADGE);
console.log(chalk.dim("Use for: Constrained spaces, badges, cards"));

subsection("5. One-Liner");
console.log(CODE_MODE_ONELINE);
console.log(chalk.dim("Use for: Status bars, footers, inline mentions"));

subsection("6. Minimal - Just Lightning");
console.log(CODE_MODE_MINIMAL);
console.log(chalk.dim("Use for: Tiny spaces, loading spinners, bullets"));

section("Color Palette");

subsection("Lime Green (Energy/Growth)");
console.log(limeGradient("███████████ #00ff00 → #7fff00 → #32cd32 → #adff2f"));
console.log(chalk.dim("Use for: Primary branding, success states, highlights"));

subsection("Lime → Teal (Primary Gradient)");
console.log(
  limeTealGradient("███████████ #00ff00 → #7fff00 → #00ced1 → #00ffff"),
);
console.log(chalk.dim("Use for: Main logo, headers, hero sections"));

subsection("Blue → Teal (Tech Gradient)");
console.log(
  blueTealGradient("███████████ #1e90ff → #00bfff → #00ced1 → #20b2aa"),
);
console.log(chalk.dim("Use for: Code snippets, technical diagrams"));

subsection("Energy Gradient (Lime → Blue)");
console.log(
  energyGradient("███████████ #adff2f → #00ff00 → #00bfff → #1e90ff"),
);
console.log(chalk.dim("Use for: CTAs, performance metrics, benchmarks"));

section("Usage Examples");

subsection("Success Message");
console.log(
  `${energyGradient("⚡")} ${chalk.green("Code executed successfully!")}`,
);
console.log(
  `${chalk.cyan("Token savings:")} ${chalk.white("98%")} ${chalk.dim("(450K → 8K tokens)")}`,
);

subsection("Loading State");
console.log(
  `${energyGradient("⚡")} ${chalk.cyan("Executing workflow...")} ${chalk.dim("[12s]")}`,
);

subsection("Error with Branding");
console.log(
  `${energyGradient("⚡")} ${chalk.red("Error:")} ${chalk.white("E2B sandbox timeout")}`,
);

subsection("Benchmark Display");
console.log(limeTealGradient("┌─────────────────────────────────┐"));
console.log(
  `${limeTealGradient("│")} ${chalk.white("Workflow Performance")}        ${limeTealGradient("│")}`,
);
console.log(limeTealGradient("├─────────────────────────────────┤"));
console.log(
  `${limeTealGradient("│")} Traditional: ${chalk.dim("450K tokens")}    ${limeTealGradient("│")}`,
);
console.log(
  `${limeTealGradient("│")} CodeMode:    ${energyGradient("8K tokens")}       ${limeTealGradient("│")}`,
);
console.log(
  `${limeTealGradient("│")} Reduction:   ${chalk.green("98.2%")}            ${limeTealGradient("│")}`,
);
console.log(limeTealGradient("└─────────────────────────────────┘"));

section("Brand Voice");
console.log(chalk.white("Shorthand:") + " " + chalk.cyan("CM / CodeMode"));
console.log();
console.log(chalk.white("Taglines:"));
console.log("  • " + energyGradient("Think Once, Execute Millions"));
console.log(
  "  • " + limeTealGradient("Lightning-Fast Code Execution for AI Agents"),
);
console.log(
  "  • " + blueTealGradient("98% Token Reduction. Zero Compromises."),
);
console.log("  • " + chalk.cyan("The Efficiency Layer for AI"));

section("Terminal Width Tests");

console.log(
  chalk.white("Current terminal width: ") +
    chalk.cyan(process.stdout.columns || "unknown"),
);
console.log();
console.log(chalk.dim("Resize your terminal to see adaptive behavior:"));
console.log(chalk.dim("  • Width >= 75: Full banner"));
console.log(chalk.dim("  • Width < 75: Compact CM banner"));

section("Social Media");
console.log(chalk.white("Handle:   ") + chalk.cyan("@codemode / @codemodeai"));
console.log(
  chalk.white("Hashtags: ") +
    chalk.cyan("#CodeMode #TokenEfficiency #AIAgents #MCP"),
);

console.log("\n");
console.log(energyGradient("═".repeat(80)));
console.log(chalk.dim("                        Created by Connor Belez"));
console.log(energyGradient("═".repeat(80)));
console.log("\n");
