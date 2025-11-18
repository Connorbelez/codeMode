import chalk from "chalk";
import gradient from "gradient-string";

import { getVersion } from "./version.js";

const d = chalk.dim;

// CodeMode Brand Gradients
const limeGradient = gradient(["#00ff00", "#7fff00", "#32cd32", "#adff2f"]);
const limeTealGradient = gradient(["#00ff00", "#7fff00", "#00ced1", "#00ffff"]);
const blueTealGradient = gradient(["#1e90ff", "#00bfff", "#00ced1", "#20b2aa"]);
const energyGradient = gradient(["#adff2f", "#00ff00", "#00bfff", "#1e90ff"]);

// Main banner with {} lightning bolt logo
export const CODE_MODE_ASCII_ART = `
${energyGradient.multiline(`     ██╗     ⚡     ██╗
    ██╔╝           ╚██╗
   ██╔╝             ╚██╗
  ██╔╝               ╚██╗
 ██╔╝                 ╚██╗
 ╚═╝                   ╚═╝`)}

${limeTealGradient.multiline(` ██████╗ ██████╗ ██████╗ ███████╗███╗   ███╗ ██████╗ ██████╗ ███████╗
██╔════╝██╔═══██╗██╔══██╗██╔════╝████╗ ████║██╔═══██╗██╔══██╗██╔════╝
██║     ██║   ██║██║  ██║█████╗  ██╔████╔██║██║   ██║██║  ██║█████╗
██║     ██║   ██║██║  ██║██╔══╝  ██║╚██╔╝██║██║   ██║██║  ██║██╔══╝
╚██████╗╚██████╔╝██████╔╝███████╗██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╗
 ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝`)}
                  ${chalk.cyan("Lightning-fast code execution for AI agents")}
                       ${d("by Connor Belez · v" + getVersion())}`;

// Compact "CM" mark with lightning bolt
const CM_ASCII_ART = `
${blueTealGradient.multiline(`   ╔═══╗ ⚡ ╔═══╗
   ║   ║   ║   ║
   ╚═══╝   ╚═══╝`)}

${limeGradient.multiline(` ██████╗███╗   ███╗
██╔════╝████╗ ████║
██║     ██╔████╔██║
██║     ██║╚██╔╝██║
╚██████╗██║ ╚═╝ ██║
 ╚═════╝╚═╝     ╚═╝`)}
  ${chalk.cyan("CodeMode")} ${d("v" + getVersion())}`;

// Minimum terminal width required to display ASCII art properly
const MIN_WIDTH_FOR_ASCII_ART = 75;

/**
 * Returns the ASCII art only if the terminal is wide enough to display it properly.
 * If terminal is too narrow, returns just the version string.
 */
export function getDisplayableAsciiArt(): string {
  const terminalWidth = process.stdout.columns || 80;

  if (terminalWidth >= MIN_WIDTH_FOR_ASCII_ART) {
    return CODE_MODE_ASCII_ART;
  }

  // If terminal is too narrow, show just "CM" ASCII art
  return CM_ASCII_ART;
}

// Minimal icon - just the {} lightning bolt
export const CODE_MODE_ICON = `${energyGradient("{  ⚡  }")}`;

// Boxed logo for badges and confined spaces
export const CODE_MODE_BADGE = `${blueTealGradient("┌─────────────────────────┐")}
${blueTealGradient("│")}    ${energyGradient("{  ⚡  }")}  ${chalk.white("CodeMode")}    ${blueTealGradient("│")}
${blueTealGradient("│")}  ${chalk.cyan("98% Token Reduction")}  ${blueTealGradient("│")}
${blueTealGradient("└─────────────────────────┘")}`;

// Simple one-liner
export const CODE_MODE_ONELINE = `${energyGradient("{⚡}")} ${limeTealGradient("CodeMode")} ${chalk.cyan("· Lightning-fast AI execution")}`;

// Super minimal - just the icon
export const CODE_MODE_MINIMAL = energyGradient("⚡");

// Legacy large logo art (kept for backwards compatibility)
export const CODE_MODE_LOGO_ASCII_ART = `
                   @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
                  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@  @@
                 @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@
               @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@@@
              @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ @@@@@@@@@
             @@@@@@@@@@@@                              @@@@@@@@@@@@
            @@@@@@@@@@@@    @@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@@@@@@@  @@@@@@@@@@@@
           @@@@@@@@@@@@  @@  @@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@@@@@  @@@@@@@@@@@   @
          @@@@@@@@@@@@  @@@@  @@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@@@  @@@@@@@@@@@  @@@@
         @@@@@@@@@@@@  @@@@@@  @@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@  @@@@@@@@@@@  @@@@@@@
        @@@@@@@@@@@@  @@@@@@@@  @@@@@@@@@@@@@@@@@@@@@@@@@@  @@ @@@@@@@@@@@@  @@@@@@@@@
       @@@@@@@@@@@@  @@@@@@@@@@  @@@@@@@@@@@@@@@@@@@@@@@@@@    @@@@@@@@@@@  @@@@@@@@@@@
      @@@@@@@@@@@@  @@@@@@@@@@@                                             @@@@@@@@@@@@
     @@@@@@@@@@@@  @@@@@@@@@@@                                 @@@@@@@@@@@@  @@@@@@@@@@@@
    @@@@@@@@@@@@  @@@@@@@@@@@                                   @@@@@@@@@@@@  @@@@@@@@@@@@
   @@@@@@@@@@@   @@@@@@@@@@@                                     @@@@@@@@@@@@  @@@@@@@@@@@@
  @@@@@@@@@@@  @@@@@@@@@@@@                                       @@@@@@@@@@@@  @@@@@@@@@@@@
 @@@@@@@@@@@  @@@@@@@@@@@@                                         @@@@@@@@@@@@  @@@@@@@@@@@@
@@@@@@@@@@@  @@@@@@@@@@@@                                           @@@@@@@@@@@@  @@@@@@@@@@@@
             @@@@@@@@@@@                                              @@@@@@@@@@@  @@@@@@@@@@@@
@@@@@@@@@@@@  @@@@@@@@@                                                @@@@@@@@@@@  @@@@@@@@@@@@
 @@@@@@@@@@@@  @@@@@@@                                                  @@@@@@@@@@@@ @@@@@@@@@@@@
  @@@@@@@@@@@@  @@@@@                                                    @@@@@@@@@@@@ @@@@@@@@@@@@
    @@@@@@@@@@@  @@@                                                      @@@@@@@@@@@@  @@@@@@@@@@@
     @@@@@@@@@@@                                                           @@@@@@@@@@@@  @@@@@@@@@@@
                                        CODE MODE                                        @@@@@@@@@@@@
     @@@@@@@@@@@                                                           @@@@@@@@@@@@  @@@@@@@@@@@
   @@@@@@@@@@@@  @@@                                                      @@@@@@@@@@@@  @@@@@@@@@@@
  @@@@@@@@@@@@  @@@@@                                                    @@@@@@@@@@@@ @@@@@@@@@@@@
 @@@@@@@@@@@@  @@@@@@@                                                  @@@@@@@@@@@  @@@@@@@@@@@@
@@@@@@@@@@@@  @@@@@@@@@                                                @@@@@@@@@@@  @@@@@@@@@@@@
             @@@@@@@@@@@                                              @@@@@@@@@@@  @@@@@@@@@@@@
@@@@@@@@@@@  @@@@@@@@@@@@                                           @@@@@@@@@@@@  @@@@@@@@@@@@
 @@@@@@@@@@@  @@@@@@@@@@@@                                         @@@@@@@@@@@@  @@@@@@@@@@@@
  @@@@@@@@@@@@ @@@@@@@@@@@@                                       @@@@@@@@@@@@  @@@@@@@@@@@@
   @@@@@@@@@@@   @@@@@@@@@@@                                     @@@@@@@@@@@@  @@@@@@@@@@@@
    @@@@@@@@@@@@  @@@@@@@@@@@                                   @@@@@@@@@@@@  @@@@@@@@@@@@
     @@@@@@@@@@@@  @@@@@@@@@@@                                 @@@@@@@@@@@@  @@@@@@@@@@@@
      @@@@@@@@@@@@  @@@@@@@@@@@@                                            @@@@@@@@@@@@
       @@@@@@@@@@@@  @@@@@@@@@@  @@@@@@@@@@@@@@@@@@@@@@@@@@    @@@@@@@@@@@  @@@@@@@@@@@
        @@@@@@@@@@@@  @@@@@@@@  @@@@@@@@@@@@@@@@@@@@@@@@@@  @@ @@@@@@@@@@@@  @@@@@@@@@
         @@@@@@@@@@@@  @@@@@@  @@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@  @@@@@@@@@@@  @@@@@@
          @@@@@@@@@@@@  @@@@  @@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@@@  @@@@@@@@@@@  @@@@
           @@@@@@@@@@@@  @@  @@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@@@@@  @@@@@@@@@@@   @
            @@@@@@@@@@@@    @@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@@@@@@@  @@@@@@@@@@@
             @@@@@@@@@@@@                              @@@@@@@@@@@@
              @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@ @@@@@@@@@
               @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@@@
                 @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@  @@@@
                  @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@  @@
                   @@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
`;
