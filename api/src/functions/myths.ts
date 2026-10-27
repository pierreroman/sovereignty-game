import functions from "@azure/functions";
import { createCatalogueHandler } from "../handler.js";
import { createBlobStore, createLoginLimiter } from "../store.js";
import { createSessionHandler } from "../session.js";

functions.app.http("myths", {
  route: "myths",
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  handler: createCatalogueHandler(createBlobStore()),
});

functions.app.http("session", {
  route: "session",
  methods: ["GET", "POST", "DELETE"],
  authLevel: "anonymous",
  handler: createSessionHandler(createLoginLimiter()),
});
