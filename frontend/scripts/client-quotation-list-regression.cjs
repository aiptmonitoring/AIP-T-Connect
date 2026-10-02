// Exercise the actual quotation list handler with an isolated database mock.
const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const ts = require("typescript");
const path = require("node:path");
const source = fs.readFileSync(
  path.resolve(
    __dirname,
    "../../backend/supabase/functions/quotations/index.ts",
  ),
  "utf8",
);
const start = source.lastIndexOf("    if (request.method === 'GET') {");
const end = source.indexOf("    if (profile.role !== 'administrator'", start);
assert.ok(start > 0 && end > start);
const sandbox = {
  exports: {},
  URL,
  json: (value) => value,
  listSelect: "fixture-select",
  withQuotationValidity: (value) => value,
  allRows: async (fn) => fn().range(0, 999),
};
vm.runInNewContext(
  ts.transpileModule(
    "async function list(profile,url,db){const request={method:'GET'};" +
      source.slice(start, end) +
      "}\nexports.list=list;",
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2020,
        module: ts.ModuleKind.CommonJS,
      },
    },
  ).outputText,
  sandbox,
);
const rows = [
  {
    id: "own-pending",
    client_id: "own",
    status: "Pending Approval",
    quotation_items: [{ country_id: "cy" }],
  },
  {
    id: "own-approved",
    client_id: "own",
    status: "Approved",
    quotation_items: [{ country_id: "cy" }],
  },
  {
    id: "other",
    client_id: "other",
    status: "Pending Approval",
    quotation_items: [{ country_id: "cy" }],
  },
];
function database() {
  const calls = [];
  return {
    calls,
    from() {
      let data = [...rows];
      return {
        select(fields, options) {
          calls.push(["select", options]);
          return this;
        },
        is() {
          return this;
        },
        order() {
          return this;
        },
        eq(field, value) {
          calls.push(["eq", field, value]);
          data = data.filter((row) => row[field] === value);
          return this;
        },
        async range(start, end) {
          calls.push(["range", start, end]);
          return {
            data: data.slice(start, end + 1),
            count: data.length,
            error: null,
          };
        },
      };
    },
  };
}
(async () => {
  let db = database();
  let result = await sandbox.exports.list(
    { role: "client", client_id: "own" },
    new URL("https://fixture.invalid/quotations?page=1&page_size=1"),
    db,
  );
  assert.equal(result.total, 2);
  assert.equal(result.data[0].id, "own-pending");
  assert.deepEqual(
    db.calls.find((call) => call[0] === "range"),
    ["range", 0, 0],
  );
  assert.ok(
    db.calls.some(
      (call) =>
        call[0] === "eq" && call[1] === "client_id" && call[2] === "own",
    ),
  );
  db = database();
  result = await sandbox.exports.list(
    { role: "client", client_id: "own" },
    new URL("https://fixture.invalid/quotations?status=Approved"),
    db,
  );
  assert.equal(result.total, 1);
  assert.equal(result.data[0].id, "own-approved");
  for (const filter of ["country_id=cy", "search=pending"]) {
    db = database();
    result = await sandbox.exports.list(
      { role: "client", client_id: "own" },
      new URL("https://fixture.invalid/quotations?" + filter),
      db,
    );
    assert.ok(result.data.every((row) => row.client_id === "own"));
    assert.ok(result.data.some((row) => row.id === "own-pending"));
  }
  db = database();
  result = await sandbox.exports.list(
    { role: "administrator" },
    new URL("https://fixture.invalid/quotations"),
    db,
  );
  assert.equal(result.total, 3);
  console.log(
    "Passed: actual list handler paginates in the database, returns all client statuses, filters statuses, and enforces ownership on both list paths.",
  );
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
