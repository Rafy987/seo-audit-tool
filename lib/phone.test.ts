import { describe, expect, it } from "vitest";
import { findPhonesInText, parsePhone, parseTelHref } from "./phone";

describe("parsePhone", () => {
  it("formats US numbers the same way whatever the input", () => {
    for (const raw of ["(214) 555-1234", "214-555-1234", "214.555.1234", "+1 214 555 1234", "+12145551234", "1-214-555-1234"]) {
      expect(parsePhone(raw)?.display).toBe("(214) 555-1234");
    }
  });
  it("gives Pakistan local and +92 versions the same key", () => {
    expect(parsePhone("0310-5521893")?.key).toBe(parsePhone("+92 310 5521893")?.key);
    expect(parsePhone("0310-5521893")?.display).toBe("0310-5521893");
  });
  it("gives UK local and +44 / 0044 versions the same key", () => {
    const local = parsePhone("020 7946 0958")?.key;
    expect(parsePhone("+44 20 7946 0958")?.key).toBe(local);
    expect(parsePhone("0044 20 7946 0958")?.key).toBe(local);
  });
  it("rejects things that aren't phone numbers", () => {
    expect(parsePhone("12345")).toBeNull();
    expect(parsePhone("0000000000")).toBeNull();
    expect(parsePhone("1234567890123456")).toBeNull(); // too long
  });
});

describe("findPhonesInText", () => {
  it("finds US, Pakistan and UK numbers in text", () => {
    const text = "Call (214) 555-1234 or 0310-5521893. UK office: +44 20 7946 0958. Karachi: 021 3456 7890";
    expect(findPhonesInText(text).map((p) => p.display)).toEqual([
      "(214) 555-1234",
      "+44 20 7946 0958",
      "0310-5521893",
      "021 3456 7890",
    ]);
  });
  it("does not treat prices, years or zip codes as phones", () => {
    expect(findPhonesInText("Rs3,000,000 and Rs490,500. Since 2005. Dallas, TX 75201. Model 2019 2020 2021.")).toEqual([]);
  });
  it("deduplicates the same number in two formats", () => {
    expect(findPhonesInText("0310-5521893 / +92 310 5521893")).toHaveLength(1);
  });
});

describe("parseTelHref", () => {
  it("splits several numbers in one tel: link", () => {
    expect(parseTelHref("tel:0310-5521893, 0336-5033448").map((p) => p.display)).toEqual(["0310-5521893", "0336-5033448"]);
  });
  it("handles URL-encoded spaces", () => {
    expect(parseTelHref("tel:+1%20214%20555%201234")[0].display).toBe("(214) 555-1234");
  });
});
