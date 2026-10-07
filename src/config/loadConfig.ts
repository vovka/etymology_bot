import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { appConfigSchema, type AppConfig } from "./AppConfig.js";

const DEFAULT_PATH = path.join(process.cwd(), "config", "app.yaml");

export function loadConfig(filePath = DEFAULT_PATH): AppConfig {
  return parseConfig(readFileSync(filePath, "utf8"));
}

export function parseConfig(yamlText: string): AppConfig {
  return appConfigSchema.parse(parse(yamlText));
}
