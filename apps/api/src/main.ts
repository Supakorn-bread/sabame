import { createApp } from "./app.js";

const app = await createApp();
app.enableShutdownHooks();
await app.listen(Number(process.env.PORT || 4000), "0.0.0.0");
