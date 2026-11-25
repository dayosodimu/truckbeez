// Checks docs/data/events.schema.json (BR-57). No dependencies: run with `node --test "docs/data/*.test.mjs"`.
//
// 1. The file is valid JSON and lists every event in the tracking plan.
// 2. Every event extends the common envelope and pins its name and version.
// 3. Privacy guards: no banned property names (coordinates, PII, free text) anywhere,
//    closed property objects, and company_id only on events allowed to carry it.
// 4. Every x-examples payload validates against its event schema (small JSON Schema subset below).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const schemaPath = fileURLToPath(new URL("./events.schema.json", import.meta.url));
const raw = readFileSync(schemaPath, "utf8");

const REQUIRED_EVENTS = [
  "app_opened", "route_requested", "route_started", "no_safe_route", "reroute", "off_route",
  "navigation_ended", "report_created", "report_voted", "hazmat_warning_shown", "trip_completed",
  "duty_changed", "fleet_invite_accepted", "subscription_changed", "app_crash",
];
const ENVELOPE_FIELDS = [
  "event_id", "event_version", "ts", "user_id", "company_id", "app_version", "platform", "session_id",
];
const COMPANY_SCOPES = ["never", "on_duty", "fleet_admin"];
const LOCATION_LEVELS = ["none", "admin1", "h3_r5", "h3_r6"];
const FAMILIES = ["product", "routing_safety", "community", "fleet_admin", "billing", "reliability"];

// ---- minimal JSON Schema validator (the keywords this file uses) -------------------------
function resolveRef(root, ref) {
  assert.ok(ref.startsWith("#/"), `only local $ref supported: ${ref}`);
  return ref.slice(2).split("/").reduce((node, key) => {
    assert.ok(node && key in node, `unresolvable $ref ${ref}`);
    return node[key];
  }, root);
}

const typeOf = (v) =>
  v === null ? "null" : Array.isArray(v) ? "array" : Number.isInteger(v) ? "integer" : typeof v;
const matchesType = (v, t) => t === typeOf(v) || (t === "number" && typeof v === "number");

function validate(root, schema, value, path = "$", errors = []) {
  if (schema.$ref) validate(root, resolveRef(root, schema.$ref), value, path, errors);
  for (const sub of schema.allOf ?? []) validate(root, sub, value, path, errors);

  if (schema.type) {
    const types = [].concat(schema.type);
    if (!types.some((t) => matchesType(value, t))) {
      errors.push(`${path}: expected ${types.join("|")}, got ${typeOf(value)}`);
      return errors;
    }
  }
  if ("const" in schema && value !== schema.const) errors.push(`${path}: expected const ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: ${JSON.stringify(value)} not in enum`);

  if (typeof value === "string") {
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: "${value}" fails pattern`);
    if (schema.minLength != null && value.length < schema.minLength) errors.push(`${path}: too short`);
    if (schema.maxLength != null && value.length > schema.maxLength) errors.push(`${path}: too long`);
  }
  if (typeof value === "number") {
    if (schema.minimum != null && value < schema.minimum) errors.push(`${path}: below minimum`);
    if (schema.maximum != null && value > schema.maximum) errors.push(`${path}: above maximum`);
    if (schema.multipleOf != null && Math.abs(Math.round(value / schema.multipleOf) * schema.multipleOf - value) > 1e-9)
      errors.push(`${path}: not a multiple of ${schema.multipleOf}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems != null && value.length < schema.minItems) errors.push(`${path}: too few items`);
    if (schema.maxItems != null && value.length > schema.maxItems) errors.push(`${path}: too many items`);
    if (schema.uniqueItems && new Set(value.map((v) => JSON.stringify(v))).size !== value.length)
      errors.push(`${path}: items not unique`);
    if (schema.items) value.forEach((v, i) => validate(root, schema.items, v, `${path}[${i}]`, errors));
  }
  if (typeOf(value) === "object") {
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}: missing ${key}`);
    for (const [key, sub] of Object.entries(schema.properties ?? {})) {
      if (key in value) validate(root, sub, value[key], `${path}.${key}`, errors);
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (schema.properties ?? {}))) errors.push(`${path}: unexpected property ${key}`);
      }
    }
  }
  return errors;
}

/** Every property name declared anywhere under a schema node. */
function declaredPropertyNames(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => declaredPropertyNames(n, out));
  else if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (k === "properties" && v && typeof v === "object" && !Array.isArray(v)) {
        Object.keys(v).forEach((name) => out.add(name));
      }
      if (!k.startsWith("x-examples")) declaredPropertyNames(v, out);
    }
  }
  return out;
}

const eventPropertiesSchema = (event) => event.schema.allOf[1].properties.properties;

// ---- tests --------------------------------------------------------------------------------
test("events.schema.json is valid JSON", () => {
  assert.doesNotThrow(() => JSON.parse(raw));
});

const doc = JSON.parse(raw);
const events = Object.entries(doc.events);

test("every tracking-plan event is defined, and nothing else", () => {
  assert.deepEqual(Object.keys(doc.events).sort(), [...REQUIRED_EVENTS].sort());
});

test("envelope requires every common field", () => {
  const env = doc.$defs.envelope;
  for (const field of [...ENVELOPE_FIELDS, "event_name", "properties"]) {
    assert.ok(env.required.includes(field), `envelope.required is missing ${field}`);
    assert.ok(field in env.properties, `envelope.properties is missing ${field}`);
  }
  assert.equal(env.additionalProperties, false, "unknown top-level fields must be rejected");
  assert.ok([].concat(env.properties.company_id.type).includes("null"), "company_id must be nullable");
});

for (const [name, event] of events) {
  test(`${name}: extends the envelope and pins name and version`, () => {
    assert.match(name, /^[a-z][a-z0-9_]{2,47}$/);
    const [envRef, own] = event.schema.allOf;
    assert.equal(envRef.$ref, "#/$defs/envelope");
    assert.equal(own.properties.event_name.const, name);
    assert.ok(Number.isInteger(event["x-event-version"]) && event["x-event-version"] >= 1);
    assert.equal(own.properties.event_version.const, event["x-event-version"]);
  });

  test(`${name}: has metadata (owner, trigger, source, family, scopes)`, () => {
    for (const key of ["x-owner", "x-trigger"]) assert.ok(event[key]?.length > 10, `${key} missing`);
    assert.ok(["client", "server"].includes(event["x-source"]));
    assert.ok(FAMILIES.includes(event["x-family"]), `unknown family ${event["x-family"]}`);
    assert.ok(COMPANY_SCOPES.includes(event["x-company-scope"]));
    assert.ok(LOCATION_LEVELS.includes(event["x-location"]));
  });

  test(`${name}: properties object is closed and free of banned names`, () => {
    const props = eventPropertiesSchema(event);
    assert.equal(props.additionalProperties, false, "properties must set additionalProperties: false");
    const banned = new Set(doc["x-banned-property-names"]);
    const hits = [...declaredPropertyNames(event.schema)].filter((n) => banned.has(n));
    assert.deepEqual(hits, [], `banned property names: ${hits.join(", ")}`);
  });

  test(`${name}: location granularity matches x-location`, () => {
    const names = Object.keys(eventPropertiesSchema(event).properties);
    const geo = names.filter((n) => /h3_r\d|admin1/.test(n));
    const level = event["x-location"];
    if (level === "none") assert.deepEqual(geo, []);
    else assert.ok(geo.every((n) => n.includes(level)), `${geo} exceeds declared level ${level}`);
  });

  test(`${name}: examples validate and respect company scope`, () => {
    const examples = event["x-examples"] ?? [];
    assert.ok(examples.length > 0, "at least one example is required");
    for (const ex of examples) {
      assert.deepEqual(validate(doc, event.schema, ex), []);
      if (event["x-company-scope"] === "never") assert.equal(ex.company_id, null);
    }
  });
}

test("validator rejects raw coordinates and unknown fields (self-check)", () => {
  const [name, event] = events.find(([n]) => n === "report_created");
  const bad = structuredClone(event["x-examples"][0]);
  bad.properties.lat = 40.7128;
  bad.properties.lng = -74.006;
  const errors = validate(doc, event.schema, bad);
  assert.ok(errors.some((e) => e.includes("unexpected property lat")), `${name}: ${errors}`);
});

test("validator rejects company_id on a never-scoped event (self-check)", () => {
  const event = doc.events.app_crash;
  const bad = { ...structuredClone(event["x-examples"][0]), company_id: "c_fcde2b2edba56bf408601fb721fe9b5c" };
  assert.ok(validate(doc, event.schema, bad).length > 0);
});
