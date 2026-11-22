import { createAlbertaSource } from "./alberta";
import { createBoardSource } from "./company-boards";
import { createGcJobsSource } from "./gcjobs";
import { createJobBankSource } from "./jobbank";
import { createJobSpySource } from "./jobspy";
import { registerSource } from "./registry";

/** Registers every built source. Imported once by the worker. */
export function registerAllSources() {
  registerSource("indeed", createJobSpySource("indeed"));
  registerSource("linkedin", createJobSpySource("linkedin"));
  registerSource("jobbank", createJobBankSource());
  registerSource("alberta", createAlbertaSource());
  registerSource("gcjobs", createGcJobsSource());
  registerSource("greenhouse", createBoardSource("greenhouse"));
  registerSource("lever", createBoardSource("lever"));
  registerSource("ashby", createBoardSource("ashby"));
}
