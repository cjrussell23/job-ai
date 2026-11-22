import { createAlbertaSource } from "./alberta";
import { createBoardSource } from "./company-boards";
import { createJobBankSource } from "./jobbank";
import { createJobSpySource } from "./jobspy";
import { registerSource } from "./registry";
import { createWorkdaySource } from "./workday";

/** Registers every built source. Imported once by the worker. */
export function registerAllSources() {
  registerSource("indeed", createJobSpySource("indeed"));
  registerSource("linkedin", createJobSpySource("linkedin"));
  registerSource("jobbank", createJobBankSource());
  registerSource("alberta", createAlbertaSource());
  registerSource("greenhouse", createBoardSource("greenhouse"));
  registerSource("lever", createBoardSource("lever"));
  registerSource("ashby", createBoardSource("ashby"));
  registerSource("workday", createWorkdaySource());
}
