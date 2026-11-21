import { createAlbertaSource } from "./alberta";
import { createBoardSource } from "./company-boards";
import { createJobBankSource } from "./jobbank";
import { registerSource } from "./registry";

/** Registers every built source. Imported once by the worker. */
export function registerAllSources() {
  registerSource("jobbank", createJobBankSource());
  registerSource("alberta", createAlbertaSource());
  registerSource("greenhouse", createBoardSource("greenhouse"));
  registerSource("lever", createBoardSource("lever"));
  registerSource("ashby", createBoardSource("ashby"));
}
