import express from "express";
import { dispatch } from "./handlers/http";
const app = express();
app.use(express.text({ type: "application/json", limit: "6mb" }));
app.use(async (req, res) => {
  const out = await dispatch({
    method: req.method,
    path: req.path,
    headers: req.headers as Record<string, string>,
    body: typeof req.body === "string" ? req.body : undefined,
  });
  res
    .status(out.statusCode)
    .set(out.headers)
    .send(out.isBase64Encoded ? Buffer.from(out.body, "base64") : out.body);
});
app.listen(4310, "127.0.0.1", () =>
  console.log("TradeLoop API and dashboard: http://127.0.0.1:4310"),
);
