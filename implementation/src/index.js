import { createApp } from "./server/app.js";
const port = Number(process.env.PORT || 8787);
const app = createApp({
  dataDir: process.env.PDD_DATA_DIR || new URL("../data", import.meta.url).pathname,
  implVersion: process.env.PDD_IMPL_VERSION || "dev",
  ledgerDir: process.env.PDD_LEDGER_DIR || null,
});
app.listen(port, () => console.log(`pdd-typing listening on :${port}`));
