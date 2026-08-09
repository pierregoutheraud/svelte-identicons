import { describe, expect, it } from "vitest";
import {
	formatCentimetres,
	getPaintGridCellInfo,
	getPaintGridLayout,
	getPaintGridZoomMax
} from "./paint-grid.model.js";

describe("getPaintGridLayout", () => {
	it("centres the grid within the physical canvas", () => {
		expect(
			getPaintGridLayout({
				width: 10,
				height: 8,
				cellPx: 25,
				sheetWidthPx: 300,
				sheetHeightPx: 250,
				symetry: "axial"
			})
		).toEqual({ padX: 25, padY: 25, showSheet: true, foldColumn: 5 });
	});
});

describe("getPaintGridCellInfo", () => {
	it("measures a cell from the physical canvas top-left", () => {
		expect(
			getPaintGridCellInfo({
				index: 23,
				cellCount: 80,
				width: 10,
				squareCm: 2.5,
				canvasMarginXCm: 2.5,
				canvasMarginYCm: 2.5
			})
		).toEqual({ index: 23, row: 2, column: 3, leftCm: 10, topCm: 7.5 });
	});

	it("rejects indexes outside the grid", () => {
		expect(
			getPaintGridCellInfo({
				index: 12,
				cellCount: 12,
				width: 4,
				squareCm: 2,
				canvasMarginXCm: 0,
				canvasMarginYCm: 0
			})
		).toBeNull();
	});
});

it("formats centimetres to at most two decimal places", () => {
	expect(formatCentimetres(2.625)).toBe("2.63");
	expect(formatCentimetres(10)).toBe("10");
});

describe("getPaintGridZoomMax", () => {
	it("fits the physical canvas within both container dimensions", () => {
		expect(
			getPaintGridZoomMax({
				containerWidthPx: 996,
				containerHeightPx: 952,
				gridWidth: 10,
				gridHeight: 8,
				squareCm: 2.5,
				canvasWidthCm: 30,
				canvasHeightCm: 25,
				reservedWidthPx: 26,
				reservedHeightPx: 15
			})
		).toBe(80);
	});

	it("uses width only when the container has no height limit", () => {
		expect(
			getPaintGridZoomMax({
				containerWidthPx: 500,
				gridWidth: 5,
				gridHeight: 50,
				squareCm: 2,
				canvasWidthCm: 10,
				canvasHeightCm: 100
			})
		).toBe(100);
	});

	it("allows a fitted zoom below the normal 8px slider floor", () => {
		expect(
			getPaintGridZoomMax({
				containerWidthPx: 480,
				containerHeightPx: 500,
				gridWidth: 100,
				gridHeight: 100,
				squareCm: 2.5,
				canvasWidthCm: 250,
				canvasHeightCm: 250,
				reservedWidthPx: 26,
				reservedHeightPx: 15
			})
		).toBe(4.54);
	});

	it("uses the stable fallback before the container is measured", () => {
		expect(
			getPaintGridZoomMax({
				containerWidthPx: 0,
				gridWidth: 10,
				gridHeight: 10,
				squareCm: 2,
				canvasWidthCm: 20,
				canvasHeightCm: 20
			})
		).toBe(44);
	});
});
