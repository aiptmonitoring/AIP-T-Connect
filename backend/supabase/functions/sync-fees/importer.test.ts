import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import { buildClassValueRows, importClassesSheet } from './importer.ts';

Deno.test('importClassesSheet parses the matrix-style Classes sheet', () => {
  const rows = [
    ['Country', 'Class 1', 'Class 2'],
    ['Afghanistan', '120', '200'],
    ['Albania', '300', '400'],
  ];

  const result = importClassesSheet(rows);

  assertEquals(result.records.length, 4);
  assertEquals(result.records[0].class_number, 1);
  assertEquals(result.records[0].country, 'Afghanistan');
  assertEquals(result.records[0].total_fee, 120);
  assertEquals(result.records[1].class_number, 2);
  assertEquals(result.records[1].total_fee, 200);
});

Deno.test('buildClassValueRows creates one row per country and class', () => {
  const countryMap = new Map([['afghanistan', 'country-1'], ['albania', 'country-2']]);
  const rows = [
    {
      class_number: 1,
      country: 'Afghanistan',
      total_fee: 120,
      currency: 'USD',
      source_row: 2,
      source_values: ['Afghanistan', '120'],
      name: 'Class 1',
    },
    {
      class_number: 2,
      country: 'Albania',
      total_fee: 400,
      currency: 'USD',
      source_row: 3,
      source_values: ['Albania', '400'],
      name: 'Class 2',
    },
  ] as any;

  const valueRows = buildClassValueRows(rows, countryMap, 'dataset-1');

  assertEquals(valueRows.length, 2);
  assertEquals(valueRows[0].country_id, 'country-1');
  assertEquals(valueRows[0].class_number, 1);
  assertEquals(valueRows[0].total_fee, 120);
  assertEquals(valueRows[1].country_id, 'country-2');
  assertEquals(valueRows[1].class_number, 2);
  assertEquals(valueRows[1].total_fee, 400);
});
