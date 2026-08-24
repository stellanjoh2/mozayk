import {
  dataFieldLabel,
  resolveDataFieldsValueType,
} from "./dataFields";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function run(): void {
  assert(resolveDataFieldsValueType(undefined) === "grid", "omitted is grid");
  assert(resolveDataFieldsValueType("hex") === "hex", "known type passes through");
  assert(resolveDataFieldsValueType("nope") === "grid", "unknown type falls back");

  assert(
    dataFieldLabel("grid", 12, 4, 16, 9, 1) === "12,4",
    "grid is col,row",
  );
  assert(
    dataFieldLabel("index", 3, 2, 16, 9, 1) === "0035",
    "index is zero-padded row-major",
  );
  assert(
    dataFieldLabel("index", 191, 107, 192, 108, 1) === "20735",
    "index widens when the grid needs 5 digits",
  );

  const randomA = dataFieldLabel("random", 3, 2, 16, 9, 7);
  const randomB = dataFieldLabel("random", 3, 2, 16, 9, 8);
  assert(/^\d{3}$/.test(randomA), "random is three digits");
  assert(randomA === dataFieldLabel("random", 3, 2, 16, 9, 7), "random is stable");
  assert(randomA !== randomB, "random changes with seed");

  const decimal = dataFieldLabel("decimal", 3, 2, 16, 9, 7);
  assert(/^\d\.\d{2}$/.test(decimal), "decimal is n.nn");
  assert(
    decimal === dataFieldLabel("decimal", 3, 2, 16, 9, 7),
    "decimal is stable",
  );

  const hex = dataFieldLabel("hex", 3, 2, 16, 9, 7);
  assert(/^[0-9A-F]{3}$/.test(hex), "hex is three uppercase digits");
  assert(hex === dataFieldLabel("hex", 3, 2, 16, 9, 7), "hex is stable");
}

run();
console.log("dataFields value-type tests passed");
