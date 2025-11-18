#!/usr/bin/env node
/**
 * CodeMode Branding Demo (Standalone)
 * Displays all logo variations and color combinations
 *
 * Usage: node scripts/demo-branding.mjs
 */

import chalk from "chalk";

// Simple gradient function for demo
function createGradient(colors, text) {
  return chalk.hex(colors[0])(text);
}

function section(title) {
  console.log("\n");
  console.log(chalk.hex("#00ff00")("═".repeat(80)));
  console.log(chalk.hex("#00ced1")(`  ${title}`));
  console.log(chalk.hex("#00ff00")("═".repeat(80)));
  console.log();
}

function subsection(title) {
  console.log();
  console.log(chalk.cyan(`─── ${title} ───`));
  console.log();
}

console.clear();

section("CodeMode Branding Showcase");

subsection("1. Main Logo - {} with Lightning Bolt");
console.log(chalk.hex("#00ff00")("     ██╗     ⚡     ██╗"));
console.log(chalk.hex("#7fff00")("    ██╔╝           ╚██╗"));
console.log(chalk.hex("#00ced1")("   ██╔╝             ╚██╗"));
console.log(chalk.hex("#00ffff")("  ██╔╝               ╚██╗"));
console.log(chalk.hex("#1e90ff")(" ██╔╝                 ╚██╗"));
console.log(chalk.hex("#00bfff")(" ╚═╝                   ╚═╝"));

subsection("2. Icon Variations");
console.log(chalk.hex("#00ff00")("{  ⚡  }") + " " + chalk.dim("← Full icon"));
console.log(chalk.hex("#00ff00")("{⚡}") + "     " + chalk.dim("← Compact"));
console.log(chalk.hex("#00ff00")("⚡") + "       " + chalk.dim("← Minimal"));

subsection("3. Boxed Badge");
console.log(chalk.hex("#1e90ff")("┌─────────────────────────┐"));
console.log(chalk.hex("#1e90ff")("│") + "    " + chalk.hex("#00ff00")("{  ⚡  }") + "  " + chalk.white("CodeMode") + "    " + chalk.hex("#1e90ff")("│"));
console.log(chalk.hex("#1e90ff")("│") + "  " + chalk.cyan("98% Token Reduction") + "  " + chalk.hex("#1e90ff")("│"));
console.log(chalk.hex("#1e90ff")("└─────────────────────────┘"));

subsection("4. One-Liner");
console.log(chalk.hex("#00ff00")("{⚡}") + " " + chalk.hex("#00ced1")("CodeMode") + " " + chalk.cyan("· Lightning-fast AI execution"));

section("Color Palette");

subsection("Lime Green (Energy/Growth)");
console.log(chalk.hex("#00ff00")("██") + chalk.hex("#7fff00")("██") + chalk.hex("#32cd32")("██") + chalk.hex("#adff2f")("██") + " " + chalk.dim("#00ff00 → #7fff00 → #32cd32 → #adff2f"));
console.log(chalk.dim("Use for: Primary branding, success states, highlights"));

subsection("Electric Blue (Technology/Trust)");
console.log(chalk.hex("#00bfff")("██") + chalk.hex("#1e90ff")("██") + chalk.hex("#4169e1")("██") + chalk.hex("#0080ff")("██") + " " + chalk.dim("#00bfff → #1e90ff → #4169e1 → #0080ff"));
console.log(chalk.dim("Use for: Interactive elements, links, tech imagery"));

subsection("Cyber Teal (Innovation/Efficiency)");
console.log(chalk.hex("#00ffff")("██") + chalk.hex("#00ced1")("██") + chalk.hex("#20b2aa")("██") + chalk.hex("#008b8b")("██") + " " + chalk.dim("#00ffff → #00ced1 → #20b2aa → #008b8b"));
console.log(chalk.dim("Use for: Accents, data visualization, secondary UI"));

section("Usage Examples");

subsection("Success Message");
console.log(chalk.hex("#00ff00")("⚡") + " " + chalk.green("Code executed successfully!"));
console.log(chalk.cyan("Token savings:") + " " + chalk.white("98%") + " " + chalk.dim("(450K → 8K tokens)"));

subsection("Loading State");
console.log(chalk.hex("#00ff00")("⚡") + " " + chalk.cyan("Executing workflow...") + " " + chalk.dim("[12s]"));

subsection("Error with Branding");
console.log(chalk.hex("#00ff00")("⚡") + " " + chalk.red("Error:") + " " + chalk.white("E2B sandbox timeout"));

subsection("Benchmark Display");
console.log(chalk.hex("#00ced1")("┌─────────────────────────────────┐"));
console.log(chalk.hex("#00ced1")("│") + " " + chalk.white("Workflow Performance") + "        " + chalk.hex("#00ced1")("│"));
console.log(chalk.hex("#00ced1")("├─────────────────────────────────┤"));
console.log(chalk.hex("#00ced1")("│") + " Traditional: " + chalk.dim("450K tokens") + "    " + chalk.hex("#00ced1")("│"));
console.log(chalk.hex("#00ced1")("│") + " CodeMode:    " + chalk.hex("#00ff00")("8K tokens") + "       " + chalk.hex("#00ced1")("│"));
console.log(chalk.hex("#00ced1")("│") + " Reduction:   " + chalk.green("98.2%") + "            " + chalk.hex("#00ced1")("│"));
console.log(chalk.hex("#00ced1")("└─────────────────────────────────┘"));

section("Brand Voice");
console.log(chalk.white("Shorthand:") + " " + chalk.cyan("CM / CodeMode (one word)"));
console.log();
console.log(chalk.white("Taglines:"));
console.log("  • " + chalk.hex("#00ff00")("Think Once, Execute Millions"));
console.log("  • " + chalk.hex("#00ced1")("Lightning-Fast Code Execution for AI Agents"));
console.log("  • " + chalk.hex("#1e90ff")("98% Token Reduction. Zero Compromises."));
console.log("  • " + chalk.cyan("The Efficiency Layer for AI"));

section("Terminal Width Information");

console.log(chalk.white("Current terminal width: ") + chalk.cyan(process.stdout.columns || "unknown"));
console.log();
console.log(chalk.dim("For adaptive display in actual CLI:"));
console.log(chalk.dim("  • Width >= 75: Full banner"));
console.log(chalk.dim("  • Width < 75: Compact CM banner"));

section("Social Media");
console.log(chalk.white("Handle:   ") + chalk.cyan("@codemode / @codemodeai"));
console.log(chalk.white("Hashtags: ") + chalk.cyan("#CodeMode #TokenEfficiency #AIAgents #MCP"));

console.log("\n");
console.log(chalk.hex("#00ff00")("═".repeat(80)));
console.log(chalk.dim("                        Created by Connor Belez"));
console.log(chalk.hex("#00ff00")("═".repeat(80)));
console.log("\n");

console.log(chalk.yellow("💡 Tip:") + " Run this from " + chalk.cyan("extensions/cli") + " directory to test with gradient-string:");
console.log(chalk.dim("   cd extensions/cli && npm install && npx tsx ../../scripts/showcase-branding.ts"));
console.log();
