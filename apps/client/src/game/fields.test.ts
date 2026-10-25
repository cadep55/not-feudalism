import { FIELD_GROW_MS, type Field, fieldId, newField } from "@nf/shared";
import { describe, expect, it } from "vitest";
import {
  fieldAt,
  fieldLabel,
  fieldsIn,
  formatGrowTime,
  growTimeLeft,
  isGrowing,
} from "./fields.ts";

const NOW = 1_000_000;
const GROWN: Field = newField("heartland", 13, 14, 0);
const PLANTED: Field = newField("heartland", 4, 9, NOW + FIELD_GROW_MS);
const ELSEWHERE: Field = newField("marsh", 13, 14, 0);
const FIELDS = [GROWN, PLANTED, ELSEWHERE];

describe("fieldsIn and fieldAt", () => {
  it("lists only the region's fields", () => {
    expect(fieldsIn(FIELDS, "heartland")).toEqual([GROWN, PLANTED]);
    expect(fieldsIn(FIELDS, "nowhere")).toEqual([]);
  });

  it("finds the field on a clicked tile in the character's region, or null", () => {
    expect(fieldAt(FIELDS, { x: 13, y: 14 }, "heartland")).toBe(GROWN);
    expect(fieldAt(FIELDS, { x: 4, y: 9 }, "heartland")?.id).toBe(fieldId("heartland", 4, 9));
    expect(fieldAt(FIELDS, { x: 13, y: 14 }, "marsh")).toBe(ELSEWHERE);
    expect(fieldAt(FIELDS, { x: 12, y: 14 }, "heartland")).toBeNull();
    expect(fieldAt([], { x: 13, y: 14 }, "heartland")).toBeNull();
  });
});

describe("isGrowing and growTimeLeft", () => {
  it("grows until readyAt, then is ready", () => {
    expect(isGrowing(PLANTED, NOW)).toBe(true);
    expect(isGrowing(PLANTED, NOW + FIELD_GROW_MS - 1)).toBe(true);
    expect(isGrowing(PLANTED, NOW + FIELD_GROW_MS)).toBe(false);
    expect(isGrowing(GROWN, NOW)).toBe(false);
  });

  it("counts down to zero and never below", () => {
    expect(growTimeLeft(PLANTED, NOW)).toBe(FIELD_GROW_MS);
    expect(growTimeLeft(PLANTED, NOW + 60_000)).toBe(FIELD_GROW_MS - 60_000);
    expect(growTimeLeft(PLANTED, NOW + FIELD_GROW_MS + 5)).toBe(0);
  });
});

describe("formatGrowTime", () => {
  it("shows minutes and two-digit seconds", () => {
    expect(formatGrowTime(5 * 60_000)).toBe("5:00");
    expect(formatGrowTime(4 * 60_000 + 5_000)).toBe("4:05");
    expect(formatGrowTime(59_000)).toBe("0:59");
  });

  it("rounds up partial seconds so it only reads 0:00 when done", () => {
    expect(formatGrowTime(1)).toBe("0:01");
    expect(formatGrowTime(60_001)).toBe("1:01");
    expect(formatGrowTime(0)).toBe("0:00");
    expect(formatGrowTime(-500)).toBe("0:00");
  });
});

describe("fieldLabel", () => {
  it("shows time left while growing", () => {
    expect(fieldLabel(PLANTED, NOW)).toBe("5:00");
    expect(fieldLabel(PLANTED, NOW + FIELD_GROW_MS - 30_000)).toBe("0:30");
  });

  it("shows wheat left once grown", () => {
    expect(fieldLabel(GROWN, NOW)).toBe("50");
    expect(fieldLabel({ ...GROWN, wheat: 42 }, NOW)).toBe("42");
    expect(fieldLabel(PLANTED, NOW + FIELD_GROW_MS)).toBe("50");
  });
});
