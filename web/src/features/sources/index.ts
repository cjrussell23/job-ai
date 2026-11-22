import { createAhsSource } from "./ahs";
import { createAlbertaSource } from "./alberta";
import { createCalgarySource } from "./calgary";
import { createBoardSource } from "./company-boards";
import { createGcJobsSource } from "./gcjobs";
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
  registerSource("gcjobs", createGcJobsSource());
  registerSource("calgary", createCalgarySource());
  registerSource("ahs", createAhsSource());
  registerSource("greenhouse", createBoardSource("greenhouse"));
  registerSource("lever", createBoardSource("lever"));
  registerSource("ashby", createBoardSource("ashby"));
  registerSource("workday", createWorkdaySource());
}
