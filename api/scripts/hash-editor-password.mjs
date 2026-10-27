import { randomBytes } from "node:crypto";
import { hashPassword } from "../dist/api/src/auth.js";

const chunks = [];
for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
const password = Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
try {
  const passwordHash = await hashPassword(password);
  process.stdout.write(JSON.stringify({ passwordHash, sessionSecret: randomBytes(32).toString("base64url") }));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Password hashing failed.");
  process.exitCode = 1;
} finally {
  for (const chunk of chunks) chunk.fill(0);
}
