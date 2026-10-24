// Adds DOM matchers like toBeInTheDocument() to Vitest's expect, and unmounts after each test.
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);
