// Validates config.yaml against Envio's published JSON schema (works on any OS; the
// envio binary itself ships for Linux/macOS only).
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv/dist/2020.js";
import YAML from "yaml";

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(resolve(here, "../node_modules/envio/evm.schema.json"), "utf8"));
const cfg = YAML.parse(readFileSync(resolve(here, "../config.yaml"), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
const ok = ajv.validate(schema, cfg);
console.log(ok ? "config.yaml valid against envio evm.schema.json" : JSON.stringify(ajv.errors, null, 2));
process.exit(ok ? 0 : 1);
