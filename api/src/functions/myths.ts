import functions from "@azure/functions";
import { createCatalogueHandler } from "../handler.js";
import { createBlobStore } from "../store.js";

functions.app.http("myths", {
  route: "myths",
  methods: ["GET", "PUT"],
  authLevel: "anonymous",
  handler: createCatalogueHandler(createBlobStore()),
});
