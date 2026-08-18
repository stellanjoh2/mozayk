import { draftJsonFromStoredValue } from "./draftStore";

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function run(): void {
  const json = '{"v":1,"mozayk":"project"}';
  assert(
    draftJsonFromStoredValue({ json, savedAt: 1 }) === json,
    "stored draft record yields json",
  );
  assert(draftJsonFromStoredValue(null) === null, "null storage is empty");
  assert(draftJsonFromStoredValue("raw") === null, "raw strings are rejected");
  assert(draftJsonFromStoredValue({}) === null, "empty object is rejected");
  assert(draftJsonFromStoredValue({ json: "" }) === null, "empty json is rejected");
  console.log("draftStore.test.ts: all passed");
}

run();
